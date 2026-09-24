-- Account settings: editable partner profiles after onboarding, plus invoicing (accommodation partners)
-- and payout (distribution partners) details. All writes go through validating security definer RPCs.

-- ISO 13616 IBAN checksum (mod 97). Pure helper.
CREATE OR REPLACE FUNCTION public.iban_is_valid(_iban text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s text; r int := 0; v int; i int;
BEGIN
  IF _iban IS NULL THEN RETURN false; END IF;
  s := upper(regexp_replace(_iban, '\s', '', 'g'));
  IF s !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN RETURN false; END IF;
  s := substr(s, 5) || substr(s, 1, 4);
  FOR i IN 1..length(s) LOOP
    v := CASE WHEN substr(s, i, 1) ~ '[A-Z]' THEN ascii(substr(s, i, 1)) - 55 ELSE substr(s, i, 1)::int END;
    r := CASE WHEN v >= 10 THEN (r * 100 + v) % 97 ELSE (r * 10 + v) % 97 END;
  END LOOP;
  RETURN r = 1;
END $$;

CREATE TABLE public.billing_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  is_business boolean NOT NULL DEFAULT true,
  address_line1 text NOT NULL,
  address_line2 text,
  postal_code text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  vat_number text,
  coc_number text,
  invoice_email text,
  account_holder text,
  iban text,
  payout_details_updated_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bd_legal_name_len CHECK (char_length(btrim(legal_name)) BETWEEN 1 AND 160),
  CONSTRAINT bd_address_len CHECK (char_length(btrim(address_line1)) BETWEEN 1 AND 200 AND (address_line2 IS NULL OR char_length(address_line2) <= 200)),
  CONSTRAINT bd_postal_len CHECK (char_length(btrim(postal_code)) BETWEEN 2 AND 16),
  CONSTRAINT bd_city_len CHECK (char_length(btrim(city)) BETWEEN 1 AND 120),
  CONSTRAINT bd_country CHECK (country ~ '^[A-Z]{2}$'),
  CONSTRAINT bd_vat CHECK (vat_number IS NULL OR vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  CONSTRAINT bd_coc_len CHECK (coc_number IS NULL OR char_length(coc_number) BETWEEN 2 AND 32),
  CONSTRAINT bd_invoice_email CHECK (invoice_email IS NULL OR invoice_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT bd_account_holder_len CHECK (account_holder IS NULL OR char_length(btrim(account_holder)) BETWEEN 1 AND 160),
  CONSTRAINT bd_iban CHECK (iban IS NULL OR public.iban_is_valid(iban))
);
COMMENT ON TABLE public.billing_details IS 'Invoicing (accommodation partners) and payout (distribution partners) details. Own row + admin read; writes only via save_my_billing_details.';

REVOKE ALL ON public.billing_details FROM anon, authenticated;
GRANT SELECT ON public.billing_details TO authenticated;
GRANT ALL ON public.billing_details TO service_role;
ALTER TABLE public.billing_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own billing details read" ON public.billing_details FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read billing details" ON public.billing_details FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Demo sessions read demo rows only" ON public.billing_details AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_demo_user(auth.uid()) OR is_demo);
CREATE TRIGGER billing_details_set_updated_at BEFORE UPDATE ON public.billing_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER zz_demo_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.billing_details
  FOR EACH ROW EXECUTE FUNCTION public.demo_write_guard();

CREATE OR REPLACE FUNCTION public.save_my_billing_details(
  _legal_name text, _is_business boolean, _address_line1 text, _address_line2 text, _postal_code text,
  _city text, _country text, _vat_number text, _coc_number text, _invoice_email text,
  _account_holder text, _iban text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _dp boolean; _vat text; _iban_n text; _holder text; _old public.billing_details;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF public.is_demo_user(_uid) THEN RAISE EXCEPTION 'Not available in demo mode' USING ERRCODE='42501'; END IF;
  _dp := public.has_role(_uid, 'distribution_partner');
  IF NOT (_dp OR public.has_role(_uid, 'accommodation_partner')) THEN
    RAISE EXCEPTION 'Only partners can add billing details' USING ERRCODE='42501';
  END IF;

  IF length(btrim(coalesce(_legal_name, ''))) < 1 THEN RAISE EXCEPTION 'Enter the legal name'; END IF;
  IF length(btrim(coalesce(_address_line1, ''))) < 1 OR length(btrim(coalesce(_postal_code, ''))) < 2
     OR length(btrim(coalesce(_city, ''))) < 1 THEN RAISE EXCEPTION 'Enter the full address'; END IF;
  IF _country IS NULL OR _country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Choose a country'; END IF;

  _vat := NULLIF(upper(regexp_replace(coalesce(_vat_number, ''), '[\s.\-]', '', 'g')), '');
  IF _vat IS NOT NULL AND _vat !~ '^[A-Z]{2}[A-Z0-9]{2,13}$' THEN
    RAISE EXCEPTION 'Enter the VAT number with its country prefix, for example NL123456789B01';
  END IF;
  IF NULLIF(btrim(coalesce(_invoice_email, '')), '') IS NOT NULL AND btrim(_invoice_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid invoice email address';
  END IF;

  _iban_n := NULLIF(upper(regexp_replace(coalesce(_iban, ''), '\s', '', 'g')), '');
  _holder := NULLIF(btrim(coalesce(_account_holder, '')), '');
  IF _iban_n IS NOT NULL AND NOT public.iban_is_valid(_iban_n) THEN RAISE EXCEPTION 'This IBAN is not valid. Check it for typos.'; END IF;
  IF _dp AND (_iban_n IS NULL OR _holder IS NULL) THEN
    RAISE EXCEPTION 'Enter the account holder and IBAN so we can pay your commission';
  END IF;
  IF (_iban_n IS NULL) <> (_holder IS NULL) THEN RAISE EXCEPTION 'Enter both the account holder and the IBAN'; END IF;

  SELECT * INTO _old FROM billing_details WHERE user_id = _uid;
  INSERT INTO billing_details (user_id, legal_name, is_business, address_line1, address_line2, postal_code, city, country,
    vat_number, coc_number, invoice_email, account_holder, iban, payout_details_updated_at)
  VALUES (_uid, btrim(_legal_name), coalesce(_is_business, true), btrim(_address_line1), NULLIF(btrim(coalesce(_address_line2, '')), ''),
    upper(btrim(_postal_code)), btrim(_city), _country, _vat, NULLIF(btrim(coalesce(_coc_number, '')), ''),
    NULLIF(lower(btrim(coalesce(_invoice_email, ''))), ''), _holder, _iban_n,
    CASE WHEN _iban_n IS NOT NULL THEN now() END)
  ON CONFLICT (user_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, is_business = EXCLUDED.is_business,
    address_line1 = EXCLUDED.address_line1, address_line2 = EXCLUDED.address_line2, postal_code = EXCLUDED.postal_code,
    city = EXCLUDED.city, country = EXCLUDED.country, vat_number = EXCLUDED.vat_number, coc_number = EXCLUDED.coc_number,
    invoice_email = EXCLUDED.invoice_email, account_holder = EXCLUDED.account_holder, iban = EXCLUDED.iban,
    -- Payout changes are timestamped so admins can double-check a recently changed IBAN before paying out.
    payout_details_updated_at = CASE
      WHEN EXCLUDED.iban IS DISTINCT FROM _old.iban OR EXCLUDED.account_holder IS DISTINCT FROM _old.account_holder
      THEN now() ELSE billing_details.payout_details_updated_at END;
END $$;
REVOKE ALL ON FUNCTION public.save_my_billing_details(text,boolean,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_billing_details(text,boolean,text,text,text,text,text,text,text,text,text,text) TO authenticated;

-- Accommodation Partner: edit the onboarding answers later (same validation as onboarding).
CREATE OR REPLACE FUNCTION public.update_accommodation_partner_profile(
  _first_name text, _last_name text, _company_name text, _country text,
  _business_type public.ap_business_type, _website text,
  _count_band public.accommodation_count_band, _goals public.ap_goal[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(_uid,'accommodation_partner') THEN RAISE EXCEPTION 'Not an accommodation partner' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accommodation_partner_profiles WHERE user_id = _uid) THEN RAISE EXCEPTION 'Complete onboarding first'; END IF;
  IF length(btrim(coalesce(_first_name,''))) < 1 OR length(btrim(coalesce(_last_name,''))) < 1 THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF length(btrim(coalesce(_company_name,''))) < 1 THEN RAISE EXCEPTION 'Company is required'; END IF;
  IF _country IS NULL OR _country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Invalid country'; END IF;
  IF _business_type IS NULL OR _count_band IS NULL THEN RAISE EXCEPTION 'Complete your business details'; END IF;
  IF NULLIF(btrim(coalesce(_website,'')),'') IS NOT NULL AND btrim(_website) !~* '^https://[^\s/$.?#].[^\s]*$' THEN
    RAISE EXCEPTION 'Website must be a valid https:// URL';
  END IF;
  IF coalesce(array_length(_goals,1),0) = 0 THEN RAISE EXCEPTION 'Select at least one goal'; END IF;
  UPDATE accommodation_partner_profiles SET business_type = _business_type, website = NULLIF(btrim(_website),''),
    accommodation_count_band = _count_band, goals = ARRAY(SELECT DISTINCT unnest(_goals))
  WHERE user_id = _uid;
  UPDATE profiles SET first_name = btrim(_first_name), last_name = btrim(_last_name),
    display_name = btrim(_first_name)||' '||btrim(_last_name), company_name = btrim(_company_name), country = _country
  WHERE id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.update_accommodation_partner_profile(text,text,text,text,public.ap_business_type,text,public.accommodation_count_band,public.ap_goal[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accommodation_partner_profile(text,text,text,text,public.ap_business_type,text,public.accommodation_count_band,public.ap_goal[]) TO authenticated;

-- Distribution Partner: edit the public partner profile plus an optional (private) contact name.
CREATE OR REPLACE FUNCTION public.update_distribution_partner_profile(
  _first_name text, _last_name text, _distribution_type public.distribution_type, _brand_name text, _website text,
  _social_links text[], _markets text[], _niches public.niche[], _reach_band public.reach_band, _bio text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _links text[]; _l text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(_uid,'distribution_partner') THEN RAISE EXCEPTION 'Not a distribution partner' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM distribution_partner_profiles WHERE user_id = _uid) THEN RAISE EXCEPTION 'Complete onboarding first'; END IF;
  IF _distribution_type IS NULL OR _reach_band IS NULL THEN RAISE EXCEPTION 'Complete your distribution profile'; END IF;
  IF length(btrim(coalesce(_brand_name,''))) < 1 THEN RAISE EXCEPTION 'Enter your brand or company name'; END IF;
  IF btrim(coalesce(_website,'')) !~* '^https://[^\s/$.?#].[^\s]*$' THEN RAISE EXCEPTION 'Website or main channel must be a valid https:// URL'; END IF;
  SELECT coalesce(array_agg(btrim(x)),'{}') INTO _links FROM unnest(coalesce(_social_links,'{}')) x WHERE btrim(x) <> '';
  IF coalesce(array_length(_links,1),0) > 3 THEN RAISE EXCEPTION 'Add up to 3 social links'; END IF;
  FOREACH _l IN ARRAY _links LOOP
    IF _l !~* '^https://[^\s/$.?#].[^\s]*$' THEN RAISE EXCEPTION 'Social links must be https URLs'; END IF;
  END LOOP;
  IF coalesce(array_length(_markets,1),0) = 0 THEN RAISE EXCEPTION 'Select at least one primary market'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_markets) m WHERE m !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'Invalid market'; END IF;
  IF coalesce(array_length(_niches,1),0) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Select 1 to 5 niches'; END IF;
  IF char_length(coalesce(_bio,'')) > 280 THEN RAISE EXCEPTION 'Bio can be at most 280 characters'; END IF;
  UPDATE distribution_partner_profiles SET distribution_type = _distribution_type, brand_name = btrim(_brand_name),
    website = btrim(_website), social_links = _links, markets = ARRAY(SELECT DISTINCT unnest(_markets)),
    niches = ARRAY(SELECT DISTINCT unnest(_niches)), reach_band = _reach_band, bio = NULLIF(btrim(_bio),'')
  WHERE user_id = _uid;
  UPDATE profiles SET first_name = NULLIF(btrim(coalesce(_first_name,'')),''), last_name = NULLIF(btrim(coalesce(_last_name,'')),''),
    company_name = btrim(_brand_name), distribution_type = _distribution_type
  WHERE id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.update_distribution_partner_profile(text,text,public.distribution_type,text,text,text[],text[],public.niche[],public.reach_band,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_distribution_partner_profile(text,text,public.distribution_type,text,text,text[],text[],public.niche[],public.reach_band,text) TO authenticated;
