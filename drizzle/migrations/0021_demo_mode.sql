
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS demo_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_tour_accommodation_id uuid REFERENCES public.accommodations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demo_baseline_at timestamptz,
  ADD COLUMN IF NOT EXISTS demo_last_reset_at timestamptz;

CREATE TABLE IF NOT EXISTS public.demo_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('accommodation','distribution')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.demo_accounts TO service_role;
ALTER TABLE public.demo_accounts ENABLE ROW LEVEL SECURITY;
-- no client policies: read only through security definer functions

CREATE OR REPLACE FUNCTION public.is_demo_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM demo_accounts WHERE user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.my_demo_side()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT side FROM demo_accounts WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_demo_mode()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT demo_mode_enabled FROM platform_settings LIMIT 1), false)
$$;

CREATE OR REPLACE FUNCTION public.admin_set_demo_mode(_enabled boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  SELECT demo_mode_enabled INTO _old FROM platform_settings LIMIT 1;
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE platform_settings SET demo_mode_enabled = coalesce(_enabled,false), updated_at = now();
  PERFORM set_config('vellum.admin_change', '', true);
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'platform.demo_mode', 'platform_settings', NULL,
    jsonb_build_object('demo_mode_enabled', _old), jsonb_build_object('demo_mode_enabled', coalesce(_enabled,false)),
    nullif(btrim(coalesce(_note,'')),''));
END $$;

-- Demo users: only is_demo stays are distributable to them; real users no longer see demo stays.
CREATE OR REPLACE FUNCTION public.is_distributable(_accommodation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM accommodations a JOIN accommodation_distribution_settings s ON s.accommodation_id = a.id
    WHERE a.id = _accommodation_id AND a.status::text = 'active' AND s.distribution_enabled AND s.commission_pool_pct IS NOT NULL
      AND (auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR a.is_demo = public.is_demo_user(auth.uid())))
$$;

-- Write guard: demo sessions are read-only except the tour actions
CREATE OR REPLACE FUNCTION public.demo_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tour uuid; _base timestamptz; _ok boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_demo_user(auth.uid()) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT demo_tour_accommodation_id, coalesce(demo_baseline_at, now()) INTO _tour, _base FROM platform_settings LIMIT 1;

  IF TG_TABLE_NAME = 'accommodation_distribution_settings' AND TG_OP IN ('INSERT','UPDATE') THEN
    _ok := NEW.accommodation_id = _tour;
  ELSIF TG_TABLE_NAME = 'accommodation_assets' AND TG_OP = 'UPDATE' THEN
    _ok := OLD.accommodation_id = _tour
      AND NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.asset_type IS NOT DISTINCT FROM OLD.asset_type;
  ELSIF TG_TABLE_NAME IN ('distribution_links','bookings','activity_events') AND TG_OP = 'INSERT' THEN
    _ok := true;
  ELSIF TG_TABLE_NAME = 'bookings' AND TG_OP = 'UPDATE' THEN
    _ok := OLD.is_demo AND OLD.created_at > _base;
  ELSIF TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' THEN
    _ok := (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at');
  END IF;

  IF NOT _ok THEN
    RAISE EXCEPTION 'Not available in demo mode' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('distribution_links','bookings','activity_events','accommodation_distribution_settings') THEN
    NEW.is_demo := true;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accommodations','accommodation_distribution_settings','accommodation_assets','commission_campaigns',
    'bookings','distribution_links','activity_events','saved_accommodations','accommodation_partner_profiles',
    'distribution_partner_profiles','profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_demo_write_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER zz_demo_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.demo_write_guard()', t);
  END LOOP;
  -- demo sessions read only demo rows
  FOREACH t IN ARRAY ARRAY['accommodations','accommodation_distribution_settings','accommodation_assets','commission_campaigns',
    'bookings','distribution_links','distribution_clicks','activity_events','accommodation_partner_profiles','distribution_partner_profiles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Demo sessions read demo rows only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Demo sessions read demo rows only" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.is_demo_user(auth.uid()) OR is_demo)', t);
  END LOOP;
END $$;

-- Restore the tour starting state (server-side seed + reset_demo)
CREATE OR REPLACE FUNCTION public.demo_reset_state()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tour uuid; _base timestamptz; _pending uuid;
BEGIN
  SELECT demo_tour_accommodation_id, demo_baseline_at INTO _tour, _base FROM platform_settings LIMIT 1;
  IF _base IS NOT NULL THEN
    DELETE FROM bookings WHERE is_demo AND created_at > _base;
    DELETE FROM distribution_clicks WHERE link_id IN (SELECT id FROM distribution_links WHERE is_demo AND created_at > _base);
    DELETE FROM distribution_links WHERE is_demo AND created_at > _base;
    DELETE FROM activity_events WHERE is_demo AND created_at > _base;
  END IF;
  IF _tour IS NOT NULL THEN
    UPDATE accommodation_distribution_settings SET commission_pool_pct = NULL, distribution_enabled = true WHERE accommodation_id = _tour;
    UPDATE accommodations SET first_published_at = now() WHERE id = _tour;
    UPDATE accommodation_assets SET approved_for_distribution = true WHERE accommodation_id = _tour;
    SELECT id INTO _pending FROM accommodation_assets WHERE accommodation_id = _tour AND NOT is_cover ORDER BY sort_order DESC LIMIT 1;
    IF _pending IS NOT NULL THEN UPDATE accommodation_assets SET approved_for_distribution = false WHERE id = _pending; END IF;
  END IF;
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE platform_settings SET demo_baseline_at = now(), demo_last_reset_at = now();
  PERFORM set_config('vellum.admin_change', '', true);
END $$;
REVOKE ALL ON FUNCTION public.demo_reset_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_reset_state() TO service_role;

CREATE OR REPLACE FUNCTION public.reset_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _last timestamptz;
BEGIN
  IF NOT public.is_demo_user(auth.uid()) THEN RAISE EXCEPTION 'Only demo sessions can reset the demo' USING ERRCODE='42501'; END IF;
  SELECT demo_last_reset_at INTO _last FROM platform_settings LIMIT 1;
  IF _last IS NOT NULL AND _last > now() - interval '10 seconds' THEN
    RAISE EXCEPTION 'The demo was just reset. Try again in a few seconds.';
  END IF;
  PERFORM public.demo_reset_state();
END $$;

CREATE OR REPLACE FUNCTION public.demo_tour_summary()
RETURNS TABLE (accommodation_name text, partner_brand text, booking_value numeric, commission_pool_pct numeric,
  commission_total numeric, partner_commission numeric, platform_commission numeric, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.name, dp.brand_name, b.booking_value, b.commission_pool_pct, b.commission_total, b.partner_commission, b.platform_commission, b.status::text
  FROM bookings b
  JOIN accommodations a ON a.id = b.accommodation_id
  LEFT JOIN distribution_partner_profiles dp ON dp.user_id = b.partner_id
  WHERE public.is_demo_user(auth.uid()) AND b.is_demo
    AND b.created_at > coalesce((SELECT demo_baseline_at FROM platform_settings LIMIT 1), '-infinity')
  ORDER BY (b.status::text IN ('confirmed','completed')) DESC, b.created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.is_demo_user(uuid), public.my_demo_side(), public.admin_set_demo_mode(boolean, text),
  public.reset_demo(), public.demo_tour_summary(), public.demo_write_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_demo_user(uuid), public.my_demo_side(), public.admin_set_demo_mode(boolean, text),
  public.reset_demo(), public.demo_tour_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_mode() TO anon, authenticated;
