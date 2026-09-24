
CREATE OR REPLACE FUNCTION public.demo_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tour uuid; _base timestamptz; _ok boolean := false;
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('vellum.demo_reset', true), '') = '1'
     OR NOT public.is_demo_user(auth.uid()) THEN
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
REVOKE ALL ON FUNCTION public.demo_write_guard() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.demo_reset_state()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tour uuid; _base timestamptz; _pending uuid;
BEGIN
  PERFORM set_config('vellum.demo_reset', '1', true);
  SELECT demo_tour_accommodation_id, demo_baseline_at INTO _tour, _base FROM platform_settings LIMIT 1;
  IF _base IS NOT NULL THEN
    DELETE FROM bookings WHERE is_demo AND created_at > _base;
    DELETE FROM distribution_clicks WHERE link_id IN (SELECT id FROM distribution_links WHERE is_demo AND created_at > _base);
    DELETE FROM distribution_links WHERE is_demo AND created_at > _base;
    DELETE FROM activity_events WHERE is_demo AND created_at > _base;
  END IF;
  IF _tour IS NOT NULL THEN
    UPDATE accommodation_distribution_settings SET commission_pool_pct = NULL, distribution_enabled = true WHERE accommodation_id = _tour;
    UPDATE accommodation_assets SET approved_for_distribution = true WHERE accommodation_id = _tour;
    SELECT id INTO _pending FROM accommodation_assets WHERE accommodation_id = _tour AND NOT is_cover ORDER BY sort_order DESC LIMIT 1;
    IF _pending IS NOT NULL THEN UPDATE accommodation_assets SET approved_for_distribution = false WHERE id = _pending; END IF;
  END IF;
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE platform_settings SET demo_baseline_at = now(), demo_last_reset_at = now();
  PERFORM set_config('vellum.admin_change', '', true);
  PERFORM set_config('vellum.demo_reset', '', true);
END $$;
REVOKE ALL ON FUNCTION public.demo_reset_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_reset_state() TO service_role;
