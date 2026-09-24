-- ===== Roles =====
CREATE TYPE public.app_role AS ENUM ('accommodation_partner', 'distribution_partner', 'admin');
CREATE TYPE public.niche AS ENUM ('luxury','boutique','family','couples','wellness','food_wine','adventure','design','sustainable','slow_travel','beach','city','romantic','lgbtq_friendly','cycling');
CREATE TYPE public.distribution_type AS ENUM ('creator','travel_advisor','boutique_agency','curator','publisher','niche_community');
CREATE TYPE public.accommodation_status AS ENUM ('draft','published');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ===== Profiles (no role column!) =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  company_name text,
  distribution_type public.distribution_type,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Onboarding: creates profile + role once. Admin can never be self-assigned.
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  _role public.app_role,
  _display_name text,
  _company_name text DEFAULT NULL,
  _distribution_type public.distribution_type DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role = 'admin' THEN RAISE EXCEPTION 'Role not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Onboarding already completed';
  END IF;
  IF length(trim(_display_name)) < 2 THEN RAISE EXCEPTION 'Display name too short'; END IF;
  INSERT INTO public.profiles (id, display_name, company_name, distribution_type)
  VALUES (auth.uid(), trim(_display_name), NULLIF(trim(_company_name), ''),
          CASE WHEN _role = 'distribution_partner' THEN _distribution_type ELSE NULL END);
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _role);
END; $$;
REVOKE ALL ON FUNCTION public.complete_onboarding(public.app_role, text, text, public.distribution_type) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(public.app_role, text, text, public.distribution_type) TO authenticated;

-- ===== Accommodations (Supply) =====
CREATE TABLE public.accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  location_name text NOT NULL,
  country_code char(2) NOT NULL,
  description text,
  niches public.niche[] NOT NULL DEFAULT '{}',
  markets text[] NOT NULL DEFAULT '{}',
  currency char(3) NOT NULL DEFAULT 'EUR',
  commission_pool_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  partner_share_pct numeric(5,2) NOT NULL DEFAULT 70.00,
  -- money math lives in the database
  partner_commission_pct numeric(5,2) GENERATED ALWAYS AS (round(commission_pool_pct * partner_share_pct / 100, 2)) STORED,
  platform_commission_pct numeric(5,2) GENERATED ALWAYS AS (round(commission_pool_pct - round(commission_pool_pct * partner_share_pct / 100, 2), 2)) STORED,
  status public.accommodation_status NOT NULL DEFAULT 'draft',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_pool_range CHECK (commission_pool_pct >= 0 AND commission_pool_pct <= 50),
  CONSTRAINT partner_share_range CHECK (partner_share_pct >= 0 AND partner_share_pct <= 100),
  CONSTRAINT currency_eur_only CHECK (currency = 'EUR'),
  CONSTRAINT country_code_upper CHECK (country_code = upper(country_code))
);
CREATE INDEX accommodations_owner_idx ON public.accommodations(owner_id);
CREATE INDEX accommodations_status_idx ON public.accommodations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodations TO authenticated;
GRANT ALL ON public.accommodations TO service_role;
ALTER TABLE public.accommodations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own accommodations" ON public.accommodations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Distribution partners read published accommodations" ON public.accommodations
  FOR SELECT TO authenticated
  USING (status = 'published' AND public.has_role(auth.uid(), 'distribution_partner'));
CREATE POLICY "Admins read all accommodations" ON public.accommodations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accommodation partners insert own" ON public.accommodations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'accommodation_partner'));
CREATE POLICY "Owners update own accommodations" ON public.accommodations
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete own accommodations" ON public.accommodations
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER accommodations_set_updated_at BEFORE UPDATE ON public.accommodations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();