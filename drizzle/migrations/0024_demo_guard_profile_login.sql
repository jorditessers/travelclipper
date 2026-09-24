CREATE OR REPLACE FUNCTION public.demo_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ELSIF TG_TABLE_NAME = 'profiles' AND TG_OP = 'INSERT' THEN
    _ok := EXISTS (SELECT 1 FROM profiles WHERE id = NEW.id);
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
END $function$;
REVOKE ALL ON FUNCTION public.demo_write_guard() FROM PUBLIC, anon;