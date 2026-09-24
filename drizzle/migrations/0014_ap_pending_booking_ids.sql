CREATE OR REPLACE FUNCTION public.ap_pending_booking_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id FROM bookings b JOIN accommodations a ON a.id = b.accommodation_id
  WHERE a.owner_id = auth.uid() AND b.status = 'reported'
$$;
REVOKE EXECUTE ON FUNCTION public.ap_pending_booking_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ap_pending_booking_ids() TO authenticated;