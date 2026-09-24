-- Audit log: admin-only read, writes only from security definer functions
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX admin_audit_log_entity_idx ON public.admin_audit_log (entity, entity_id, created_at DESC);

-- First publication moment (for the 14-day hypothesis metric)
ALTER TABLE public.accommodations ADD COLUMN first_published_at timestamptz;
UPDATE public.accommodations SET first_published_at = updated_at WHERE status::text IN ('active','paused') AND first_published_at IS NULL;

CREATE OR REPLACE FUNCTION public.accommodations_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _t text := coalesce(current_setting('vellum.transition', true),'');
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'draft' THEN
      RAISE EXCEPTION 'New accommodations start as draft' USING ERRCODE='42501';
    END IF;
    NEW.review_note := NULL;
    NEW.is_demo := false;
    NEW.first_published_at := NULL;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status::text = 'pending_review' AND _t = 'submit' THEN NULL;
      ELSIF NEW.status::text = 'paused' AND OLD.status::text = 'active' THEN NULL;
      ELSIF NEW.status::text = 'active' AND OLD.status::text = 'paused' THEN NULL;
      ELSIF NEW.status::text = 'draft' THEN NULL;
      ELSE RAISE EXCEPTION 'Status change not allowed' USING ERRCODE='42501';
      END IF;
    END IF;
    IF _t <> 'submit' THEN NEW.review_note := OLD.review_note; END IF;
    NEW.is_demo := OLD.is_demo;
    NEW.owner_id := OLD.owner_id;
    NEW.first_published_at := OLD.first_published_at;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.review_accommodation(_accommodation_id uuid, _approve boolean, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old accommodation_status;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  SELECT status INTO _old FROM accommodations WHERE id=_accommodation_id;
  IF _old IS NULL OR _old::text <> 'pending_review' THEN RAISE EXCEPTION 'Accommodation is not pending review'; END IF;
  IF _approve THEN
    UPDATE accommodations SET status='active', review_note=NULL, first_published_at = coalesce(first_published_at, now()) WHERE id=_accommodation_id;
  ELSE
    IF length(trim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A review note is required when rejecting'; END IF;
    UPDATE accommodations SET status='draft', review_note=trim(_note) WHERE id=_accommodation_id;
  END IF;
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), CASE WHEN _approve THEN 'accommodation.approve' ELSE 'accommodation.reject' END, 'accommodation', _accommodation_id,
    jsonb_build_object('status', _old), jsonb_build_object('status', CASE WHEN _approve THEN 'active' ELSE 'draft' END), nullif(trim(coalesce(_note,'')),''));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_accommodation_status(_accommodation_id uuid, _status accommodation_status, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old accommodation_status;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF _status::text NOT IN ('draft','pending_review','active','paused') THEN RAISE EXCEPTION 'Status not allowed'; END IF;
  IF length(btrim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A note is required'; END IF;
  SELECT status INTO _old FROM accommodations WHERE id = _accommodation_id;
  IF _old IS NULL THEN RAISE EXCEPTION 'Accommodation not found'; END IF;
  IF _old = _status THEN RAISE EXCEPTION 'Status is already %', _status; END IF;
  UPDATE accommodations SET status = _status,
    first_published_at = CASE WHEN _status::text = 'active' THEN coalesce(first_published_at, now()) ELSE first_published_at END
  WHERE id = _accommodation_id;
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'accommodation.status', 'accommodation', _accommodation_id,
    jsonb_build_object('status', _old), jsonb_build_object('status', _status), btrim(_note));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_correct_booking(_booking_id uuid, _status booking_status, _booking_value numeric, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _o bookings; _n bookings;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A note is required'; END IF;
  IF _booking_value IS NOT NULL AND _booking_value <= 0 THEN RAISE EXCEPTION 'Booking value must be above 0'; END IF;
  SELECT * INTO _o FROM bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF _o.status = _status AND (_booking_value IS NULL OR _booking_value = _o.booking_value) THEN RAISE EXCEPTION 'Nothing to change'; END IF;
  UPDATE bookings SET status = _status, booking_value = coalesce(_booking_value, booking_value),
    rejection_reason = CASE WHEN _status IN ('cancelled','rejected') AND _o.status NOT IN ('cancelled','rejected') THEN btrim(_note) ELSE rejection_reason END
  WHERE id = _booking_id RETURNING * INTO _n;
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'booking.correct', 'booking', _booking_id,
    jsonb_build_object('status', _o.status, 'booking_value', _o.booking_value, 'commission_total', _o.commission_total, 'partner_commission', _o.partner_commission),
    jsonb_build_object('status', _n.status, 'booking_value', _n.booking_value, 'commission_total', _n.commission_total, 'partner_commission', _n.partner_commission),
    btrim(_note));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_partner_share(_value numeric, _note text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF _value IS NULL OR _value <= 0 OR _value >= 1 THEN RAISE EXCEPTION 'Partner share must be between 0 and 100 percent'; END IF;
  SELECT partner_share_of_pool INTO _old FROM platform_settings LIMIT 1;
  UPDATE platform_settings SET partner_share_of_pool = round(_value, 4), updated_at = now();
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'platform.partner_share', 'platform_settings', NULL,
    jsonb_build_object('partner_share_of_pool', _old), jsonb_build_object('partner_share_of_pool', round(_value,4)), nullif(btrim(coalesce(_note,'')),''));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_overview(_exclude_demo boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  WITH p AS (SELECT * FROM profiles WHERE NOT (_exclude_demo AND is_demo)),
  ur AS (SELECT ur.* FROM user_roles ur JOIN p ON p.id = ur.user_id),
  a AS (SELECT * FROM accommodations WHERE NOT (_exclude_demo AND is_demo)),
  l AS (SELECT * FROM distribution_links WHERE NOT (_exclude_demo AND is_demo)),
  b AS (SELECT * FROM bookings WHERE NOT (_exclude_demo AND is_demo)),
  bc AS (SELECT * FROM b WHERE status IN ('confirmed','completed')),
  a_elig AS (SELECT * FROM a WHERE created_at <= now() - interval '14 days' OR first_published_at <= created_at + interval '14 days'),
  dp AS (SELECT p.* FROM p JOIN ur ON ur.user_id = p.id AND ur.role = 'distribution_partner'),
  dp_elig AS (SELECT dp.* FROM dp WHERE dp.created_at <= now() - interval '14 days'
     OR EXISTS (SELECT 1 FROM l WHERE l.partner_id = dp.id AND l.created_at <= dp.created_at + interval '14 days'))
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM p),
    'accommodation_partners', (SELECT count(*) FROM ur WHERE role = 'accommodation_partner'),
    'distribution_partners', (SELECT count(*) FROM ur WHERE role = 'distribution_partner'),
    'admins', (SELECT count(*) FROM ur WHERE role = 'admin'),
    'dp_by_type', coalesce((SELECT jsonb_object_agg(t, n) FROM (SELECT d.distribution_type::text t, count(*) n
        FROM distribution_partner_profiles d JOIN dp ON dp.id = d.user_id GROUP BY 1) x), '{}'),
    'accommodations_by_status', coalesce((SELECT jsonb_object_agg(s, n) FROM (SELECT status::text s, count(*) n FROM a GROUP BY 1) x), '{}'),
    'accommodations', (SELECT count(*) FROM a),
    'links', (SELECT count(*) FROM l),
    'active_links', (SELECT count(*) FROM l WHERE archived_at IS NULL),
    'unique_clicks', (SELECT count(*) FROM distribution_clicks c WHERE c.is_unique AND NOT c.is_bot AND NOT (_exclude_demo AND c.is_demo)),
    'bookings', (SELECT count(*) FROM b),
    'bookings_by_status', coalesce((SELECT jsonb_object_agg(s, n) FROM (SELECT status::text s, count(*) n FROM b GROUP BY 1) x), '{}'),
    'booking_volume', (SELECT coalesce(sum(booking_value),0) FROM bc),
    'commission_total', (SELECT coalesce(sum(commission_total),0) FROM bc),
    'partner_commission', (SELECT coalesce(sum(partner_commission),0) FROM bc),
    'platform_revenue', (SELECT coalesce(sum(platform_commission),0) FROM bc),
    'h_acc_eligible', (SELECT count(*) FROM a_elig),
    'h_acc_published_14d', (SELECT count(*) FROM a_elig WHERE first_published_at <= created_at + interval '14 days'),
    'h_dp_eligible', (SELECT count(*) FROM dp_elig),
    'h_dp_link_14d', (SELECT count(*) FROM dp_elig WHERE EXISTS (SELECT 1 FROM l WHERE l.partner_id = dp_elig.id AND l.created_at <= dp_elig.created_at + interval '14 days')),
    'h_partners_with_confirmed', (SELECT count(DISTINCT partner_id) FROM bc)
  ) INTO r;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_list_users(_exclude_demo boolean DEFAULT false)
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, display_name text, company_name text, country text,
   role app_role, onboarding_completed boolean, terms_accepted_at timestamptz, is_demo boolean, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.first_name, p.last_name, p.display_name, p.company_name, p.country,
    (SELECT r.role FROM user_roles r WHERE r.user_id = p.id ORDER BY (r.role = 'admin') DESC LIMIT 1),
    p.onboarding_completed, p.terms_accepted_at, p.is_demo, p.created_at
  FROM profiles p WHERE NOT (_exclude_demo AND p.is_demo)
  ORDER BY p.created_at DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_partner_performance(_exclude_demo boolean DEFAULT true)
 RETURNS TABLE(partner_id uuid, brand_name text, distribution_type distribution_type, reach_band reach_band, markets text[],
   is_demo boolean, joined_at timestamptz, links bigint, unique_clicks bigint, bookings bigint, booking_value numeric, partner_commission numeric, first_link_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT d.user_id, d.brand_name, d.distribution_type, d.reach_band, d.markets, d.is_demo, d.created_at,
    (SELECT count(*) FROM distribution_links l WHERE l.partner_id = d.user_id),
    (SELECT count(*) FROM distribution_clicks c WHERE c.partner_id = d.user_id AND c.is_unique AND NOT c.is_bot),
    (SELECT count(*) FROM bookings b WHERE b.partner_id = d.user_id AND b.status IN ('confirmed','completed')),
    (SELECT coalesce(sum(b.booking_value),0) FROM bookings b WHERE b.partner_id = d.user_id AND b.status IN ('confirmed','completed')),
    (SELECT coalesce(sum(b.partner_commission),0) FROM bookings b WHERE b.partner_id = d.user_id AND b.status IN ('confirmed','completed')),
    (SELECT min(l.created_at) FROM distribution_links l WHERE l.partner_id = d.user_id)
  FROM distribution_partner_profiles d
  WHERE NOT (_exclude_demo AND d.is_demo)
  ORDER BY 12 DESC, 9 DESC;
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_accommodation_status(uuid, accommodation_status, text), public.admin_correct_booking(uuid, booking_status, numeric, text),
  public.admin_set_partner_share(numeric, text), public.admin_overview(boolean), public.admin_list_users(boolean), public.admin_partner_performance(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_accommodation_status(uuid, accommodation_status, text), public.admin_correct_booking(uuid, booking_status, numeric, text),
  public.admin_set_partner_share(numeric, text), public.admin_overview(boolean), public.admin_list_users(boolean), public.admin_partner_performance(boolean) TO authenticated;