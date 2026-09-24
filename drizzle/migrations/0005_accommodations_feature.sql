ALTER TABLE public.accommodations
  ADD COLUMN accommodation_type public.accommodation_type,
  ADD COLUMN short_description text,
  ADD COLUMN long_description text,
  ADD COLUMN country text,
  ADD COLUMN region text,
  ADD COLUMN city text,
  ADD COLUMN address text,
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD COLUMN max_guests integer,
  ADD COLUMN bedrooms integer,
  ADD COLUMN bathrooms integer,
  ADD COLUMN starting_price_per_night numeric(12,2),
  ADD COLUMN best_suited_for text[] NOT NULL DEFAULT '{}',
  ADD COLUMN website_url text,
  ADD COLUMN booking_url text,
  ADD COLUMN review_note text;

ALTER TABLE public.accommodations ALTER COLUMN location_name DROP NOT NULL;
ALTER TABLE public.accommodations ALTER COLUMN country_code DROP NOT NULL;
COMMENT ON COLUMN public.accommodations.location_name IS 'DEPRECATED: replaced by region/city';
COMMENT ON COLUMN public.accommodations.country_code IS 'DEPRECATED: replaced by country';
COMMENT ON COLUMN public.accommodations.description IS 'DEPRECATED: replaced by short_description/long_description';
COMMENT ON COLUMN public.accommodations.markets IS 'DEPRECATED: not used by accommodations';

ALTER TABLE public.accommodations
  ADD CONSTRAINT acc_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT acc_short_desc_len CHECK (short_description IS NULL OR char_length(short_description) <= 160),
  ADD CONSTRAINT acc_long_desc_len CHECK (long_description IS NULL OR char_length(long_description) <= 5000),
  ADD CONSTRAINT acc_country_iso CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT acc_max_guests CHECK (max_guests IS NULL OR max_guests >= 1),
  ADD CONSTRAINT acc_bedrooms CHECK (bedrooms IS NULL OR bedrooms >= 0),
  ADD CONSTRAINT acc_bathrooms CHECK (bathrooms IS NULL OR bathrooms >= 0),
  ADD CONSTRAINT acc_price_pos CHECK (starting_price_per_night IS NULL OR starting_price_per_night > 0),
  ADD CONSTRAINT acc_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT acc_lng CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT acc_niches_max5 CHECK (coalesce(array_length(niches,1),0) <= 5),
  ADD CONSTRAINT acc_best_suited_max CHECK (coalesce(array_length(best_suited_for,1),0) <= 8),
  ADD CONSTRAINT acc_website_https CHECK (website_url IS NULL OR website_url ~* '^https://[^\s/$.?#].[^\s]*$'),
  ADD CONSTRAINT acc_booking_https CHECK (booking_url IS NULL OR booking_url ~* '^https://[^\s/$.?#].[^\s]*$'),
  -- Beyond draft, the listing must be complete.
  ADD CONSTRAINT acc_complete_when_submitted CHECK (
    status = 'draft' OR (
      accommodation_type IS NOT NULL AND country IS NOT NULL AND region IS NOT NULL AND city IS NOT NULL
      AND max_guests IS NOT NULL AND starting_price_per_night IS NOT NULL
      AND short_description IS NOT NULL AND (website_url IS NOT NULL OR booking_url IS NOT NULL)
    ));

-- Owners may never set 'active' (or legacy 'published'), nor edit review_note; admins may.
CREATE OR REPLACE FUNCTION public.accommodations_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text NOT IN ('draft','pending_review') THEN
      RAISE EXCEPTION 'New accommodations start as draft or pending_review' USING ERRCODE='42501';
    END IF;
    NEW.review_note := NULL;
    NEW.is_demo := false;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text NOT IN ('draft','pending_review','paused') THEN
      RAISE EXCEPTION 'You can only set status to draft, pending_review or paused' USING ERRCODE='42501';
    END IF;
    IF NEW.status::text = 'paused' AND OLD.status::text NOT IN ('active','paused') THEN
      RAISE EXCEPTION 'Only active accommodations can be paused' USING ERRCODE='42501';
    END IF;
    NEW.review_note := OLD.review_note;
    NEW.is_demo := OLD.is_demo;
    NEW.owner_id := OLD.owner_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accommodations_guard BEFORE INSERT OR UPDATE ON public.accommodations
  FOR EACH ROW EXECUTE FUNCTION public.accommodations_guard();

CREATE OR REPLACE FUNCTION public.is_distributable(_accommodation_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM accommodations WHERE id = _accommodation_id AND status::text = 'active');
END $$;
REVOKE ALL ON FUNCTION public.is_distributable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_distributable(uuid) TO authenticated;

DROP POLICY IF EXISTS "Distribution partners read published accommodations" ON public.accommodations;
DROP POLICY IF EXISTS "Admins read all accommodations" ON public.accommodations;
CREATE POLICY "Distribution partners read distributable accommodations" ON public.accommodations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'distribution_partner') AND public.is_distributable(id));
CREATE POLICY "Admins manage all accommodations" ON public.accommodations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodations TO authenticated;
GRANT ALL ON public.accommodations TO service_role;