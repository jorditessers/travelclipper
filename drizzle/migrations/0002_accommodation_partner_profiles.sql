CREATE TYPE public.ap_business_type AS ENUM ('individual_owner','boutique_hotel','independent_hotel','villa_management','bnb','resort','other');
CREATE TYPE public.accommodation_count_band AS ENUM ('1','2_5','6_20','21_plus');
CREATE TYPE public.ap_goal AS ENUM ('direct_bookings','reduce_ota_dependency','new_audiences','travel_seller_relationships','fill_low_demand');

CREATE TABLE public.accommodation_partner_profiles (
  user_id uuid PRIMARY KEY,
  business_type public.ap_business_type NOT NULL,
  website text,
  accommodation_count_band public.accommodation_count_band NOT NULL,
  goals public.ap_goal[] NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_https CHECK (website IS NULL OR website ~* '^https://[^\s/$.?#].[^\s]*$')
);
GRANT SELECT ON public.accommodation_partner_profiles TO authenticated;
GRANT ALL ON public.accommodation_partner_profiles TO service_role;
ALTER TABLE public.accommodation_partner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own AP profile read" ON public.accommodation_partner_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read AP profiles" ON public.accommodation_partner_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ap_profiles_set_updated_at BEFORE UPDATE ON public.accommodation_partner_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.complete_accommodation_onboarding(
  _first_name text, _last_name text, _company_name text, _country text,
  _business_type public.ap_business_type, _website text,
  _count_band public.accommodation_count_band, _goals public.ap_goal[], _accept_terms boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(_uid,'accommodation_partner') THEN RAISE EXCEPTION 'Not an accommodation partner' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id=_uid AND onboarding_completed) THEN RAISE EXCEPTION 'Onboarding already completed'; END IF;
  IF NOT coalesce(_accept_terms,false) THEN RAISE EXCEPTION 'Terms must be accepted'; END IF;
  IF length(trim(coalesce(_first_name,''))) < 1 OR length(trim(coalesce(_last_name,''))) < 1 THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF length(trim(coalesce(_company_name,''))) < 1 THEN RAISE EXCEPTION 'Company is required'; END IF;
  IF _country IS NULL OR _country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Invalid country'; END IF;
  IF coalesce(array_length(_goals,1),0) = 0 THEN RAISE EXCEPTION 'Select at least one goal'; END IF;
  PERFORM public.ensure_my_profile();
  INSERT INTO accommodation_partner_profiles (user_id, business_type, website, accommodation_count_band, goals)
  VALUES (_uid, _business_type, NULLIF(trim(_website),''), _count_band, _goals)
  ON CONFLICT (user_id) DO UPDATE SET business_type=EXCLUDED.business_type, website=EXCLUDED.website,
    accommodation_count_band=EXCLUDED.accommodation_count_band, goals=EXCLUDED.goals;
  UPDATE profiles SET first_name=trim(_first_name), last_name=trim(_last_name),
    display_name=trim(_first_name)||' '||trim(_last_name), company_name=trim(_company_name),
    country=_country, terms_accepted_at=now(), onboarding_completed=true
  WHERE id=_uid;
END $$;
REVOKE ALL ON FUNCTION public.complete_accommodation_onboarding(text,text,text,text,public.ap_business_type,text,public.accommodation_count_band,public.ap_goal[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_accommodation_onboarding(text,text,text,text,public.ap_business_type,text,public.accommodation_count_band,public.ap_goal[],boolean) TO authenticated;