DROP POLICY IF EXISTS "Authenticated read platform settings" ON public.platform_settings;
CREATE POLICY "Admins read platform settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_partner_share_of_pool()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_share_of_pool FROM public.platform_settings WHERE auth.uid() IS NOT NULL LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.get_demo_tour_accommodation_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT demo_tour_accommodation_id FROM public.platform_settings
  WHERE public.is_demo_user(auth.uid()) OR public.has_role(auth.uid(), 'admin') LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_partner_share_of_pool() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_demo_tour_accommodation_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_share_of_pool() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_tour_accommodation_id() TO authenticated;