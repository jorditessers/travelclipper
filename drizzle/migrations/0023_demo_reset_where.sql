
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
  UPDATE platform_settings SET demo_baseline_at = now(), demo_last_reset_at = now() WHERE id IS NOT NULL;
  PERFORM set_config('vellum.admin_change', '', true);
  PERFORM set_config('vellum.demo_reset', '', true);
END $$;
REVOKE ALL ON FUNCTION public.demo_reset_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_reset_state() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_demo_mode(_enabled boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  SELECT demo_mode_enabled INTO _old FROM platform_settings LIMIT 1;
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE platform_settings SET demo_mode_enabled = coalesce(_enabled,false), updated_at = now() WHERE id IS NOT NULL;
  PERFORM set_config('vellum.admin_change', '', true);
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'platform.demo_mode', 'platform_settings', NULL,
    jsonb_build_object('demo_mode_enabled', _old), jsonb_build_object('demo_mode_enabled', coalesce(_enabled,false)),
    nullif(btrim(coalesce(_note,'')),''));
END $$;
