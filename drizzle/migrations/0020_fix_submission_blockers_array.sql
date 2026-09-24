CREATE OR REPLACE FUNCTION public.accommodation_submission_blockers(_accommodation_id uuid)
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a accommodations; _b text[] := '{}';
BEGIN
  IF NOT public.can_manage_accommodation(_accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM accommodations WHERE id = _accommodation_id;
  IF NOT (a.name IS NOT NULL AND a.accommodation_type IS NOT NULL AND a.country IS NOT NULL AND a.region IS NOT NULL
      AND a.city IS NOT NULL AND a.max_guests IS NOT NULL AND a.starting_price_per_night IS NOT NULL
      AND a.short_description IS NOT NULL AND (a.website_url IS NOT NULL OR a.booking_url IS NOT NULL)) THEN
    _b := array_append(_b, 'details'::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodation_distribution_settings WHERE accommodation_id=_accommodation_id AND commission_pool_pct IS NOT NULL) THEN
    _b := array_append(_b, 'commission'::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodation_assets WHERE accommodation_id=_accommodation_id AND is_cover) THEN
    _b := array_append(_b, 'cover'::text); END IF;
  IF (SELECT count(*) FROM accommodation_assets WHERE accommodation_id=_accommodation_id AND asset_type='photo' AND approved_for_distribution) < 3 THEN
    _b := array_append(_b, 'photos'::text); END IF;
  RETURN _b;
END $function$;