-- Onboarding answers saved after every step, so admins also see people who stop halfway.
-- The final profile is still written by complete_*_onboarding; this table is the step-by-step trail.
CREATE TABLE public.onboarding_drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('accommodation_partner','distribution_partner')),
  step smallint NOT NULL CHECK (step BETWEEN 1 AND 4),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 16384),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.onboarding_drafts IS 'Latest onboarding answers per user, saved after each step.';
GRANT SELECT, INSERT, UPDATE ON public.onboarding_drafts TO authenticated;
GRANT ALL ON public.onboarding_drafts TO service_role;
ALTER TABLE public.onboarding_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own onboarding draft read" ON public.onboarding_drafts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own onboarding draft insert" ON public.onboarding_drafts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), role::public.app_role));
CREATE POLICY "Own onboarding draft update" ON public.onboarding_drafts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), role::public.app_role));
CREATE POLICY "Admins read onboarding drafts" ON public.onboarding_drafts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER onboarding_drafts_updated_at BEFORE UPDATE ON public.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
