CREATE TYPE public.booking_status AS ENUM ('reported','confirmed','completed','cancelled','rejected');
CREATE TYPE public.booking_source AS ENUM ('partner_reported','accommodation_registered');

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  link_id uuid REFERENCES public.distribution_links(id) ON DELETE SET NULL,
  tracking_code text,
  source public.booking_source NOT NULL,
  traveler_reference text CHECK (traveler_reference IS NULL OR (char_length(traveler_reference) <= 40
    AND traveler_reference !~ '@' AND traveler_reference !~ '[0-9]{4,}')),
  booking_date date NOT NULL DEFAULT current_date,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guests integer NOT NULL CHECK (guests >= 1 AND guests <= 100),
  booking_value numeric(12,2) NOT NULL CHECK (booking_value > 0),
  status public.booking_status NOT NULL DEFAULT 'reported',
  commission_pool_pct numeric(5,2),
  partner_share_of_pool numeric(5,4),
  commission_total numeric(12,2),
  partner_commission numeric(12,2),
  platform_commission numeric(12,2),
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT bookings_dates CHECK (check_out >= check_in)
);
CREATE INDEX bookings_acc_idx ON public.bookings(accommodation_id, created_at DESC);
CREATE INDEX bookings_partner_idx ON public.bookings(partner_id, created_at DESC);
CREATE INDEX bookings_status_idx ON public.bookings(status, check_out);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
-- Owners read bookings on own accommodations; admins manage everything (corrections).
-- Distribution Partners read their own bookings only via get_my_bookings() (limited columns).
-- All non-admin writes go through the security definer RPCs below.
CREATE POLICY "Owners read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id = bookings.accommodation_id AND a.owner_id = auth.uid()));
CREATE POLICY "Admins manage bookings" ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Commission snapshot: taken once when a booking becomes confirmed; never re-read from settings afterwards.
CREATE OR REPLACE FUNCTION public.bookings_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _was_counted boolean := TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','completed');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.accommodation_id := OLD.accommodation_id;
    NEW.partner_id := OLD.partner_id;
    NEW.source := OLD.source;
    NEW.created_at := OLD.created_at;
    -- snapshot fields are never taken from the client
    NEW.commission_pool_pct := OLD.commission_pool_pct;
    NEW.partner_share_of_pool := OLD.partner_share_of_pool;
  ELSE
    NEW.commission_pool_pct := NULL;
    NEW.partner_share_of_pool := NULL;
  END IF;

  IF NEW.status IN ('confirmed','completed') THEN
    IF NOT _was_counted AND (TG_OP = 'INSERT' OR NEW.commission_pool_pct IS NULL) THEN
      NEW.commission_pool_pct := public.effective_commission_pct(NEW.accommodation_id, NEW.booking_date);
      SELECT partner_share_of_pool INTO NEW.partner_share_of_pool FROM platform_settings LIMIT 1;
    END IF;
    IF NEW.commission_pool_pct IS NULL OR NEW.partner_share_of_pool IS NULL THEN
      RAISE EXCEPTION 'No commission is set for this accommodation';
    END IF;
    NEW.confirmed_at := CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.confirmed_at, now()) ELSE coalesce(NEW.confirmed_at, now()) END;
    NEW.commission_total := round(NEW.booking_value * NEW.commission_pool_pct / 100, 2);
    NEW.partner_commission := round(NEW.commission_total * NEW.partner_share_of_pool, 2);
    NEW.platform_commission := NEW.commission_total - NEW.partner_commission;
  ELSIF NEW.status IN ('cancelled','rejected') THEN
    NEW.commission_total := 0; NEW.partner_commission := 0; NEW.platform_commission := 0;
  ELSE
    NEW.commission_total := NULL; NEW.partner_commission := NULL; NEW.platform_commission := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_commission BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_commission();

CREATE OR REPLACE FUNCTION public.clean_traveler_ref(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(btrim(coalesce(_t,'')), '') $$;

-- ===== Route A: Distribution Partner reports =====
CREATE OR REPLACE FUNCTION public.report_booking(_accommodation_id uuid, _check_in date, _check_out date, _guests int,
  _booking_value numeric, _traveler_reference text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _link distribution_links; _id uuid;
BEGIN
  IF _uid IS NULL OR NOT has_role(_uid,'distribution_partner') THEN RAISE EXCEPTION 'Only Distribution Partners can report bookings' USING ERRCODE='42501'; END IF;
  IF NOT is_distributable(_accommodation_id) THEN RAISE EXCEPTION 'This stay is not available for distribution' USING ERRCODE='42501'; END IF;
  SELECT * INTO _link FROM distribution_links WHERE partner_id = _uid AND accommodation_id = _accommodation_id AND archived_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
  INSERT INTO bookings (accommodation_id, partner_id, link_id, tracking_code, source, traveler_reference,
    check_in, check_out, guests, booking_value, status, notes)
  VALUES (_accommodation_id, _uid, _link.id, _link.tracking_code, 'partner_reported', clean_traveler_ref(_traveler_reference),
    _check_in, _check_out, _guests, _booking_value, 'reported', nullif(btrim(coalesce(_notes,'')), ''))
  RETURNING id INTO _id;
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (_uid, _accommodation_id, 'booking_reported', jsonb_build_object('booking_id', _id));
  RETURN _id;
END $$;

-- ===== Route B helpers =====
CREATE OR REPLACE FUNCTION public.lookup_tracking_code(_accommodation_id uuid, _code text)
RETURNS TABLE(link_id uuid, partner_id uuid, tracking_code text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.partner_id, l.tracking_code, l.label FROM distribution_links l
  WHERE l.accommodation_id = _accommodation_id AND l.tracking_code = upper(btrim(_code))
    AND can_manage_accommodation(_accommodation_id)
$$;

CREATE OR REPLACE FUNCTION public.get_interacting_partners(_accommodation_id uuid)
RETURNS TABLE(partner_id uuid, brand_name text, last_interaction timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (
    SELECT e.actor_id AS pid, e.created_at AS at FROM activity_events e
      WHERE e.accommodation_id = _accommodation_id AND e.actor_id IS NOT NULL
    UNION ALL
    SELECT l.partner_id, l.created_at FROM distribution_links l WHERE l.accommodation_id = _accommodation_id
  )
  SELECT t.pid, d.brand_name, max(t.at) FROM t
  JOIN distribution_partner_profiles d ON d.user_id = t.pid
  WHERE can_manage_accommodation(_accommodation_id) AND has_role(t.pid,'distribution_partner')
  GROUP BY t.pid, d.brand_name ORDER BY max(t.at) DESC
$$;

-- ===== Route B: Accommodation Partner registers =====
CREATE OR REPLACE FUNCTION public.register_booking(_accommodation_id uuid, _partner_id uuid, _tracking_code text,
  _check_in date, _check_out date, _guests int, _booking_value numeric,
  _traveler_reference text DEFAULT NULL, _notes text DEFAULT NULL, _booking_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _link distribution_links; _id uuid;
BEGIN
  IF NOT can_manage_accommodation(_accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  IF _booking_date > current_date THEN RAISE EXCEPTION 'Booking date cannot be in the future'; END IF;
  IF nullif(btrim(coalesce(_tracking_code,'')),'') IS NOT NULL THEN
    SELECT * INTO _link FROM distribution_links WHERE accommodation_id = _accommodation_id AND tracking_code = upper(btrim(_tracking_code));
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown tracking code for this stay'; END IF;
    _partner_id := _link.partner_id;
  ELSE
    IF _partner_id IS NULL OR NOT has_role(_partner_id,'distribution_partner') THEN RAISE EXCEPTION 'Choose a Distribution Partner'; END IF;
    IF NOT EXISTS (SELECT 1 FROM get_interacting_partners(_accommodation_id) p WHERE p.partner_id = _partner_id) THEN
      RAISE EXCEPTION 'This partner has not interacted with this stay';
    END IF;
  END IF;
  INSERT INTO bookings (accommodation_id, partner_id, link_id, tracking_code, source, traveler_reference, booking_date,
    check_in, check_out, guests, booking_value, status, notes)
  VALUES (_accommodation_id, _partner_id, _link.id, _link.tracking_code, 'accommodation_registered', clean_traveler_ref(_traveler_reference),
    _booking_date, _check_in, _check_out, _guests, _booking_value, 'confirmed', nullif(btrim(coalesce(_notes,'')), ''))
  RETURNING id INTO _id;
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (_uid, _accommodation_id, 'booking_registered', jsonb_build_object('booking_id', _id, 'partner_id', _partner_id));
  RETURN _id;
END $$;

-- ===== Review inbox =====
CREATE OR REPLACE FUNCTION public.review_booking(_booking_id uuid, _confirm boolean, _final_value numeric DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b bookings;
BEGIN
  SELECT * INTO _b FROM bookings WHERE id = _booking_id;
  IF NOT FOUND OR NOT can_manage_accommodation(_b.accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  IF _b.status <> 'reported' THEN RAISE EXCEPTION 'This booking has already been reviewed'; END IF;
  IF _confirm THEN
    IF _final_value IS NULL OR _final_value <= 0 THEN RAISE EXCEPTION 'Enter the final booking value'; END IF;
    UPDATE bookings SET status = 'confirmed', booking_value = _final_value WHERE id = _booking_id;
    INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
    VALUES (auth.uid(), _b.accommodation_id, 'booking_confirmed', jsonb_build_object('booking_id', _booking_id));
  ELSE
    IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
    UPDATE bookings SET status = 'rejected', rejection_reason = btrim(_reason) WHERE id = _booking_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b bookings;
BEGIN
  SELECT * INTO _b FROM bookings WHERE id = _booking_id;
  IF NOT FOUND OR NOT can_manage_accommodation(_b.accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  IF _b.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed bookings can be cancelled'; END IF;
  IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE bookings SET status = 'cancelled', rejection_reason = btrim(_reason) WHERE id = _booking_id;
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (auth.uid(), _b.accommodation_id, 'booking_cancelled', jsonb_build_object('booking_id', _booking_id));
END $$;

-- ===== Distribution Partner view (own commission only) =====
CREATE OR REPLACE FUNCTION public.get_my_bookings()
RETURNS TABLE(id uuid, accommodation_id uuid, accommodation_name text, tracking_code text, source booking_source,
  traveler_reference text, booking_date date, check_in date, check_out date, guests int, booking_value numeric,
  status booking_status, partner_commission numeric, rejection_reason text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.accommodation_id, a.name, b.tracking_code, b.source, b.traveler_reference, b.booking_date,
         b.check_in, b.check_out, b.guests, b.booking_value, b.status, b.partner_commission, b.rejection_reason, b.created_at
  FROM bookings b JOIN accommodations a ON a.id = b.accommodation_id
  WHERE b.partner_id = auth.uid() AND has_role(auth.uid(),'distribution_partner')
  ORDER BY b.created_at DESC
$$;

-- ===== Daily: confirmed -> completed after check-out =====
CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND check_out < current_date;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_past_bookings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_booking(uuid, date, date, int, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_booking(uuid, uuid, text, date, date, int, numeric, text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_booking(uuid, boolean, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_bookings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lookup_tracking_code(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_interacting_partners(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_booking(uuid, date, date, int, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_booking(uuid, uuid, text, date, date, int, numeric, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_booking(uuid, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_tracking_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_interacting_partners(uuid) TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('complete-past-bookings', '15 0 * * *', 'SELECT public.complete_past_bookings()');