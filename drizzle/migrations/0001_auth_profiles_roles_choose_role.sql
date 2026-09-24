-- Profiles: new columns (display_name/distribution_type kept for compatibility)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.profiles ALTER COLUMN display_name SET DEFAULT '';
COMMENT ON COLUMN public.profiles.display_name IS 'DEPRECATED: replaced by first_name/last_name';

-- Column-level write control: email, id, is_demo, timestamps not writable by clients
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (first_name, last_name, company_name, country, avatar_url, onboarding_completed,
              terms_accepted_at, distribution_type, display_name) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: one role per user, no client writes
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Ensure profile row for the signed-in user (idempotent)
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  _email := auth.jwt() ->> 'email';
  INSERT INTO public.profiles (id, email) VALUES (_uid, _email)
  ON CONFLICT (id) DO UPDATE SET email = COALESCE(public.profiles.email, EXCLUDED.email);
END $$;
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- choose_role: only partner roles, only once
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
  PERFORM public.ensure_my_profile();
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);
END $$;
REVOKE ALL ON FUNCTION public.choose_role(public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.choose_role(public.app_role) TO authenticated;

-- Retire old onboarding RPC
REVOKE ALL ON FUNCTION public.complete_onboarding FROM public, anon, authenticated;
COMMENT ON FUNCTION public.complete_onboarding IS 'DEPRECATED: replaced by choose_role + profile update';

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;