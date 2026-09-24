CREATE TABLE public.commission_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  commission_pool_pct numeric(5,2) NOT NULL CHECK (commission_pool_pct > 0 AND commission_pool_pct <= 30),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  description text CHECK (description IS NULL OR char_length(description) <= 280),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_campaigns_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX commission_campaigns_acc_idx ON public.commission_campaigns(accommodation_id, starts_on, ends_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_campaigns TO authenticated;
GRANT ALL ON public.commission_campaigns TO service_role;
ALTER TABLE public.commission_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read campaigns" ON public.commission_campaigns FOR SELECT TO authenticated
  USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers insert campaigns" ON public.commission_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers update campaigns" ON public.commission_campaigns FOR UPDATE TO authenticated
  USING (public.can_manage_accommodation(accommodation_id)) WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers delete campaigns" ON public.commission_campaigns FOR DELETE TO authenticated
  USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Distribution partners read current campaigns" ON public.commission_campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'distribution_partner') AND public.is_distributable(accommodation_id)
         AND ends_on >= current_date);

CREATE OR REPLACE FUNCTION public.commission_campaigns_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _std numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.accommodation_id <> OLD.accommodation_id THEN
    RAISE EXCEPTION 'Campaign cannot move to another accommodation';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_demo := CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_demo ELSE false END;
  END IF;
  SELECT commission_pool_pct INTO _std FROM public.accommodation_distribution_settings
   WHERE accommodation_id = NEW.accommodation_id;
  IF _std IS NULL THEN
    RAISE EXCEPTION 'Set a standard commission before creating a campaign';
  END IF;
  IF NEW.commission_pool_pct <= _std THEN
    RAISE EXCEPTION 'Campaign commission must be higher than the standard commission of % percent', _std;
  END IF;
  IF EXISTS (SELECT 1 FROM public.commission_campaigns c
             WHERE c.accommodation_id = NEW.accommodation_id AND c.id <> NEW.id
               AND c.starts_on <= NEW.ends_on AND c.ends_on >= NEW.starts_on) THEN
    RAISE EXCEPTION 'Campaign dates overlap with another campaign for this stay';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_campaigns_guard BEFORE INSERT OR UPDATE ON public.commission_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.commission_campaigns_guard();

CREATE OR REPLACE FUNCTION public.effective_commission_pct(_accommodation_id uuid, _on_date date DEFAULT current_date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT c.commission_pool_pct FROM public.commission_campaigns c
      WHERE c.accommodation_id = _accommodation_id AND _on_date BETWEEN c.starts_on AND c.ends_on
      ORDER BY c.starts_on DESC LIMIT 1),
    (SELECT s.commission_pool_pct FROM public.accommodation_distribution_settings s
      WHERE s.accommodation_id = _accommodation_id))
$$;

CREATE OR REPLACE FUNCTION public.effective_pool_pct(public.accommodations)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.effective_commission_pct($1.id, current_date)
$$;

REVOKE EXECUTE ON FUNCTION public.effective_commission_pct(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_pool_pct(public.accommodations) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_commission_pct(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_pool_pct(public.accommodations) TO authenticated, service_role;