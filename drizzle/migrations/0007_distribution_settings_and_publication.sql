CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  partner_share_of_pool numeric(5,4) NOT NULL DEFAULT 0.70 CHECK (partner_share_of_pool >= 0 AND partner_share_of_pool <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read platform settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update platform settings" ON public.platform_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.platform_settings (id) VALUES (true);
CREATE TRIGGER platform_settings_set_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.accommodation_distribution_settings (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodations(id) ON DELETE CASCADE,
  commission_pool_pct numeric(5,2) CHECK (commission_pool_pct IS NULL OR (commission_pool_pct >= 5 AND commission_pool_pct <= 30)),
  distribution_enabled boolean NOT NULL DEFAULT true,
  target_markets text[] NOT NULL DEFAULT '{}',
  content_usage_terms text CHECK (content_usage_terms IS NULL OR length(content_usage_terms) <= 1000),
  content_approval_required boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_distribution_settings TO authenticated;
GRANT ALL ON public.accommodation_distribution_settings TO service_role;
ALTER TABLE public.accommodation_distribution_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read distribution settings" ON public.accommodation_distribution_settings FOR SELECT TO authenticated USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers insert distribution settings" ON public.accommodation_distribution_settings FOR INSERT TO authenticated WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers update distribution settings" ON public.accommodation_distribution_settings FOR UPDATE TO authenticated USING (public.can_manage_accommodation(accommodation_id)) WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers delete distribution settings" ON public.accommodation_distribution_settings FOR DELETE TO authenticated USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Distribution partners read distributable settings" ON public.accommodation_distribution_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'distribution_partner') AND public.is_distributable(accommodation_id));
CREATE TRIGGER ads_set_updated_at BEFORE UPDATE ON public.accommodation_distribution_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ads_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.target_markets) m WHERE m !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'Invalid market'; END IF;
  NEW.target_markets := ARRAY(SELECT DISTINCT unnest(NEW.target_markets));
  NEW.content_usage_terms := NULLIF(trim(NEW.content_usage_terms),'');
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.is_demo := CASE WHEN TG_OP='UPDATE' THEN OLD.is_demo ELSE false END;
  END IF;
  IF TG_OP='UPDATE' THEN NEW.accommodation_id := OLD.accommodation_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ads_guard BEFORE INSERT OR UPDATE ON public.accommodation_distribution_settings FOR EACH ROW EXECUTE FUNCTION public.ads_guard();

CREATE OR REPLACE FUNCTION public.is_distributable(_accommodation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM accommodations a JOIN accommodation_distribution_settings s ON s.accommodation_id = a.id
    WHERE a.id = _accommodation_id AND a.status::text = 'active' AND s.distribution_enabled AND s.commission_pool_pct IS NOT NULL)
$$;

-- Readiness: single source of truth for "can submit"
CREATE OR REPLACE FUNCTION public.accommodation_submission_blockers(_accommodation_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a accommodations; _b text[] := '{}';
BEGIN
  IF NOT public.can_manage_accommodation(_accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM accommodations WHERE id = _accommodation_id;
  IF NOT (a.name IS NOT NULL AND a.accommodation_type IS NOT NULL AND a.country IS NOT NULL AND a.region IS NOT NULL
      AND a.city IS NOT NULL AND a.max_guests IS NOT NULL AND a.starting_price_per_night IS NOT NULL
      AND a.short_description IS NOT NULL AND (a.website_url IS NOT NULL OR a.booking_url IS NOT NULL)) THEN
    _b := _b || 'details'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodation_distribution_settings WHERE accommodation_id=_accommodation_id AND commission_pool_pct IS NOT NULL) THEN
    _b := _b || 'commission'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodation_assets WHERE accommodation_id=_accommodation_id AND is_cover) THEN
    _b := _b || 'cover'; END IF;
  IF (SELECT count(*) FROM accommodation_assets WHERE accommodation_id=_accommodation_id AND asset_type='photo' AND approved_for_distribution) < 3 THEN
    _b := _b || 'photos'; END IF;
  RETURN _b;
END $$;

CREATE OR REPLACE FUNCTION public.submit_accommodation_for_review(_accommodation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b text[]; _s text;
BEGIN
  _b := public.accommodation_submission_blockers(_accommodation_id);
  IF array_length(_b,1) > 0 THEN RAISE EXCEPTION 'Not ready for review: %', array_to_string(_b, ', '); END IF;
  SELECT status::text INTO _s FROM accommodations WHERE id=_accommodation_id;
  IF _s <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be submitted'; END IF;
  PERFORM set_config('vellum.transition','submit',true);
  UPDATE accommodations SET status='pending_review', review_note=NULL WHERE id=_accommodation_id;
  PERFORM set_config('vellum.transition','',true);
END $$;

CREATE OR REPLACE FUNCTION public.review_accommodation(_accommodation_id uuid, _approve boolean, _note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodations WHERE id=_accommodation_id AND status::text='pending_review') THEN
    RAISE EXCEPTION 'Accommodation is not pending review'; END IF;
  IF _approve THEN
    UPDATE accommodations SET status='active', review_note=NULL WHERE id=_accommodation_id;
  ELSE
    IF length(trim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A review note is required when rejecting'; END IF;
    UPDATE accommodations SET status='draft', review_note=trim(_note) WHERE id=_accommodation_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.accommodations_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t text := coalesce(current_setting('vellum.transition', true),'');
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'draft' THEN
      RAISE EXCEPTION 'New accommodations start as draft' USING ERRCODE='42501';
    END IF;
    NEW.review_note := NULL;
    NEW.is_demo := false;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status::text = 'pending_review' AND _t = 'submit' THEN NULL;
      ELSIF NEW.status::text = 'paused' AND OLD.status::text = 'active' THEN NULL;
      ELSIF NEW.status::text = 'active' AND OLD.status::text = 'paused' THEN NULL;
      ELSIF NEW.status::text = 'draft' THEN NULL;
      ELSE RAISE EXCEPTION 'Status change not allowed' USING ERRCODE='42501';
      END IF;
    END IF;
    IF _t <> 'submit' THEN NEW.review_note := OLD.review_note; END IF;
    NEW.is_demo := OLD.is_demo;
    NEW.owner_id := OLD.owner_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_accommodation_for_review(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_accommodation(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accommodation_submission_blockers(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_accommodation_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_accommodation(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accommodation_submission_blockers(uuid) TO authenticated;