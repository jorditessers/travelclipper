-- F1: accommodation with bookings or tracking links cannot be deleted by users (cascade would erase commission history)
CREATE OR REPLACE FUNCTION public.accommodations_delete_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN OLD; END IF; -- server-side maintenance (e.g. demo removal)
  IF EXISTS (SELECT 1 FROM bookings WHERE accommodation_id = OLD.id)
     OR EXISTS (SELECT 1 FROM distribution_links WHERE accommodation_id = OLD.id) THEN
    RAISE EXCEPTION 'This stay has tracking links or bookings and cannot be deleted. Pause this stay instead.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER accommodations_delete_guard BEFORE DELETE ON public.accommodations
  FOR EACH ROW EXECUTE FUNCTION public.accommodations_delete_guard();

-- F2: no anonymous table access; RPC-only tables get no client writes
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log, public.distribution_clicks FROM authenticated;

-- F3: platform_settings only through the logged admin function
CREATE OR REPLACE FUNCTION public.admin_write_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')
     OR coalesce(current_setting('vellum.admin_change', true), '') = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'bookings' THEN
    RAISE EXCEPTION 'Admins change bookings only through the logged correction flow' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'platform_settings' THEN
    RAISE EXCEPTION 'Platform settings change only through the logged settings flow' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status)
     OR (TG_OP = 'INSERT' AND NEW.status::text <> 'draft') THEN
    RAISE EXCEPTION 'Admins change accommodation status only through the logged status flow' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;
CREATE TRIGGER platform_settings_admin_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.admin_write_guard();

CREATE OR REPLACE FUNCTION public.admin_set_partner_share(_value numeric, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF _value IS NULL OR _value <= 0 OR _value >= 1 THEN RAISE EXCEPTION 'Partner share must be between 0 and 100 percent'; END IF;
  SELECT partner_share_of_pool INTO _old FROM platform_settings LIMIT 1;
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE platform_settings SET partner_share_of_pool = round(_value, 4), updated_at = now();
  PERFORM set_config('vellum.admin_change', '', true);
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'platform.partner_share', 'platform_settings', NULL,
    jsonb_build_object('partner_share_of_pool', _old), jsonb_build_object('partner_share_of_pool', round(_value,4)), nullif(btrim(coalesce(_note,'')),''));
END $function$;

-- F4
ALTER FUNCTION public.asset_folder_uuid(text) SET search_path = public;
ALTER FUNCTION public.clean_traveler_ref(text) SET search_path = public;