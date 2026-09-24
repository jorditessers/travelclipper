CREATE TYPE public.reach_band AS ENUM ('lt_1k','1k_10k','10k_50k','50k_250k','250k_plus');

CREATE TABLE public.distribution_partner_profiles (
  user_id uuid PRIMARY KEY,
  distribution_type public.distribution_type NOT NULL,
  brand_name text NOT NULL,
  website text NOT NULL,
  social_links text[] NOT NULL DEFAULT '{}',
  markets text[] NOT NULL DEFAULT '{}',
  niches public.niche[] NOT NULL DEFAULT '{}',
  reach_band public.reach_band NOT NULL,
  bio text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_website_https CHECK (website ~* '^https://[^\s/$.?#].[^\s]*$'),
  CONSTRAINT dp_social_max3 CHECK (coalesce(array_length(social_links,1),0) <= 3),
  CONSTRAINT dp_niches_max5 CHECK (coalesce(array_length(niches,1),0) BETWEEN 1 AND 5),
  CONSTRAINT dp_markets_min1 CHECK (coalesce(array_length(markets,1),0) >= 1),
  CONSTRAINT dp_bio_len CHECK (bio IS NULL OR char_length(bio) <= 280),
  CONSTRAINT dp_brand_len CHECK (char_length(trim(brand_name)) BETWEEN 1 AND 120)
);
GRANT SELECT ON public.distribution_partner_profiles TO authenticated;
GRANT ALL ON public.distribution_partner_profiles TO service_role;
ALTER TABLE public.distribution_partner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own DP profile read" ON public.distribution_partner_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read DP profiles" ON public.distribution_partner_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER dp_profiles_set_updated_at BEFORE UPDATE ON public.distribution_partner_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.complete_distribution_onboarding(
  _distribution_type public.distribution_type, _brand_name text, _website text,
  _social_links text[], _markets text[], _niches public.niche[],
  _reach_band public.reach_band, _bio text, _accept_terms boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _links text[]; _l text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(_uid,'distribution_partner') THEN RAISE EXCEPTION 'Not a distribution partner' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id=_uid AND onboarding_completed) THEN RAISE EXCEPTION 'Onboarding already completed'; END IF;
  IF NOT coalesce(_accept_terms,false) THEN RAISE EXCEPTION 'Terms must be accepted'; END IF;
  SELECT coalesce(array_agg(trim(x)),'{}') INTO _links FROM unnest(coalesce(_social_links,'{}')) x WHERE trim(x) <> '';
  FOREACH _l IN ARRAY _links LOOP
    IF _l !~* '^https://[^\s/$.?#].[^\s]*$' THEN RAISE EXCEPTION 'Social links must be https URLs'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(_markets,'{}')) m WHERE m !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'Invalid market'; END IF;
  PERFORM public.ensure_my_profile();
  INSERT INTO distribution_partner_profiles (user_id, distribution_type, brand_name, website, social_links, markets, niches, reach_band, bio)
  VALUES (_uid, _distribution_type, trim(_brand_name), trim(_website), _links,
          ARRAY(SELECT DISTINCT unnest(_markets)), ARRAY(SELECT DISTINCT unnest(_niches)), _reach_band, NULLIF(trim(_bio),''))
  ON CONFLICT (user_id) DO UPDATE SET distribution_type=EXCLUDED.distribution_type, brand_name=EXCLUDED.brand_name,
    website=EXCLUDED.website, social_links=EXCLUDED.social_links, markets=EXCLUDED.markets, niches=EXCLUDED.niches,
    reach_band=EXCLUDED.reach_band, bio=EXCLUDED.bio;
  UPDATE profiles SET company_name=trim(_brand_name), distribution_type=_distribution_type,
    terms_accepted_at=now(), onboarding_completed=true WHERE id=_uid;
END $$;
REVOKE ALL ON FUNCTION public.complete_distribution_onboarding(public.distribution_type,text,text,text[],text[],public.niche[],public.reach_band,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_distribution_onboarding(public.distribution_type,text,text,text[],text[],public.niche[],public.reach_band,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_partner_public_profile(_partner_id uuid)
RETURNS TABLE (brand_name text, distribution_type public.distribution_type, website text, social_links text[],
               markets text[], niches public.niche[], reach_band public.reach_band, bio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.brand_name, d.distribution_type, d.website, d.social_links, d.markets, d.niches, d.reach_band, d.bio
  FROM distribution_partner_profiles d
  WHERE d.user_id = _partner_id
    AND auth.uid() IS NOT NULL
    AND (auth.uid() = _partner_id
         OR public.has_role(auth.uid(),'accommodation_partner')
         OR public.has_role(auth.uid(),'admin'))
$$;
REVOKE ALL ON FUNCTION public.get_partner_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_public_profile(uuid) TO authenticated;