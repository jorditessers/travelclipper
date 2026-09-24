CREATE TYPE public.activity_event_type AS ENUM ('opportunity_viewed','opportunity_saved','content_viewed','content_downloaded','link_created','link_clicked','booking_reported','booking_registered','booking_confirmed','booking_cancelled');

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  accommodation_id uuid REFERENCES public.accommodations(id) ON DELETE CASCADE,
  event_type public.activity_event_type NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_acc_idx ON public.activity_events (accommodation_id, event_type, created_at);
CREATE INDEX activity_events_actor_idx ON public.activity_events (actor_id, created_at);
CREATE UNIQUE INDEX activity_events_view_daily ON public.activity_events (actor_id, accommodation_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE event_type = 'opportunity_viewed';
GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Actors read own events" ON public.activity_events FOR SELECT TO authenticated USING (actor_id = auth.uid());
CREATE POLICY "Owners read events on own accommodations" ON public.activity_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id = accommodation_id AND a.owner_id = auth.uid()));
CREATE POLICY "Admins read all events" ON public.activity_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_event(_event_type public.activity_event_type, _accommodation_id uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF _event_type IN ('opportunity_viewed','opportunity_saved','content_viewed','content_downloaded','link_created','booking_reported') THEN
    IF NOT public.has_role(_uid,'distribution_partner') THEN RAISE EXCEPTION 'Not allowed for your role' USING ERRCODE='42501'; END IF;
    IF NOT public.is_distributable(_accommodation_id) THEN RAISE EXCEPTION 'Accommodation is not available' USING ERRCODE='42501'; END IF;
  ELSE
    -- link_clicked / booking_registered / booking_confirmed / booking_cancelled are written by server-side flows later
    RAISE EXCEPTION 'Event type cannot be logged from the app' USING ERRCODE='42501';
  END IF;
  IF pg_column_size(coalesce(_metadata,'{}'::jsonb)) > 4096 THEN RAISE EXCEPTION 'Metadata too large'; END IF;
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (_uid, _accommodation_id, _event_type, coalesce(_metadata,'{}'::jsonb))
  ON CONFLICT DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_event(public.activity_event_type, uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_event(public.activity_event_type, uuid, jsonb) TO authenticated;

CREATE TABLE public.saved_accommodations (
  user_id uuid NOT NULL,
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, accommodation_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_accommodations TO authenticated;
GRANT ALL ON public.saved_accommodations TO service_role;
ALTER TABLE public.saved_accommodations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own saves read" ON public.saved_accommodations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own saves insert" ON public.saved_accommodations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(),'distribution_partner') AND public.is_distributable(accommodation_id));
CREATE POLICY "Own saves delete" ON public.saved_accommodations FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Saved list incl. items that are no longer distributable (minimal public fields only)
CREATE OR REPLACE FUNCTION public.get_my_saved_accommodations()
RETURNS TABLE(accommodation_id uuid, name text, city text, country text, saved_at timestamptz, is_available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.accommodation_id, a.name, a.city, a.country, s.created_at, public.is_distributable(s.accommodation_id)
  FROM saved_accommodations s JOIN accommodations a ON a.id = s.accommodation_id
  WHERE s.user_id = auth.uid()
  ORDER BY s.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_saved_accommodations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_saved_accommodations() TO authenticated;