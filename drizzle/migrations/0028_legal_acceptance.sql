-- Terms of use + privacy statement: acceptance is required to create an account and recorded as proof
-- (document, version, date/time, source, browser).

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('terms', 'privacy')),
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('signup', 'in_app')),
  user_agent text,
  UNIQUE (user_id, document, version)
);
COMMENT ON TABLE public.legal_acceptances IS 'Proof of acceptance of the terms and privacy statement. Written only by triggers/RPC.';
REVOKE ALL ON public.legal_acceptances FROM anon, authenticated;
GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own legal acceptances read" ON public.legal_acceptances FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read legal acceptances" ON public.legal_acceptances FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Email sign-ups must carry the accepted versions (sent by the sign-up form as user metadata).
-- Other providers (e.g. Google) accept in the app before choosing a role, see choose_role.
CREATE OR REPLACE FUNCTION public.auth_user_legal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.raw_app_meta_data ->> 'provider', 'email') = 'email'
     AND (coalesce(NEW.raw_user_meta_data ->> 'terms_version', '') = '' OR coalesce(NEW.raw_user_meta_data ->> 'privacy_version', '') = '') THEN
    RAISE EXCEPTION 'Accept the terms and the privacy statement to create an account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.auth_user_record_legal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ua text := left(NEW.raw_user_meta_data ->> 'legal_user_agent', 400);
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'terms_version', '') <> '' THEN
    INSERT INTO legal_acceptances (user_id, document, version, source, user_agent)
    VALUES (NEW.id, 'terms', left(NEW.raw_user_meta_data ->> 'terms_version', 40), 'signup', _ua) ON CONFLICT DO NOTHING;
  END IF;
  IF coalesce(NEW.raw_user_meta_data ->> 'privacy_version', '') <> '' THEN
    INSERT INTO legal_acceptances (user_id, document, version, source, user_agent)
    VALUES (NEW.id, 'privacy', left(NEW.raw_user_meta_data ->> 'privacy_version', 40), 'signup', _ua) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.auth_user_legal_guard(), public.auth_user_record_legal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auth_users_legal_guard ON auth.users;
CREATE TRIGGER auth_users_legal_guard BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.auth_user_legal_guard();
DROP TRIGGER IF EXISTS auth_users_record_legal ON auth.users;
CREATE TRIGGER auth_users_record_legal AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.auth_user_record_legal();

CREATE OR REPLACE FUNCTION public.has_accepted_legal(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM legal_acceptances WHERE user_id = _uid AND document = 'terms')
     AND EXISTS (SELECT 1 FROM legal_acceptances WHERE user_id = _uid AND document = 'privacy')
$$;
REVOKE ALL ON FUNCTION public.has_accepted_legal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_accepted_legal(uuid) TO authenticated;

-- In-app acceptance (accounts created via another provider, or before acceptance existed).
CREATE OR REPLACE FUNCTION public.accept_legal_documents(_terms_version text, _privacy_version text, _user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(_terms_version), '') = '' OR coalesce(btrim(_privacy_version), '') = '' THEN
    RAISE EXCEPTION 'Accept the terms and the privacy statement';
  END IF;
  INSERT INTO legal_acceptances (user_id, document, version, source, user_agent) VALUES
    (_uid, 'terms', left(btrim(_terms_version), 40), 'in_app', left(_user_agent, 400)),
    (_uid, 'privacy', left(btrim(_privacy_version), 40), 'in_app', left(_user_agent, 400))
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.accept_legal_documents(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_documents(text, text, text) TO authenticated;

-- Choosing a role (the first step on the platform) now requires the accepted terms.
CREATE OR REPLACE FUNCTION public.choose_role(_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _role NOT IN ('accommodation_partner', 'distribution_partner') THEN
    RAISE EXCEPTION 'Role not allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'Role already chosen' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_accepted_legal(_uid) THEN
    RAISE EXCEPTION 'Accept the terms and the privacy statement first';
  END IF;
  PERFORM public.ensure_my_profile();
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);
END $$;
REVOKE ALL ON FUNCTION public.choose_role(public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.choose_role(public.app_role) TO authenticated;
