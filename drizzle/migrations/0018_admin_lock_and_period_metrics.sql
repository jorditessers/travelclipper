-- Admin changes to bookings / accommodation status only through logged RPCs (which set vellum.admin_change)
CREATE OR REPLACE FUNCTION public.admin_write_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')
     OR coalesce(current_setting('vellum.admin_change', true), '') = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'bookings' THEN
    RAISE EXCEPTION 'Admins change bookings only through the logged correction flow' USING ERRCODE = '42501';
  END IF;
  -- accommodations: status changes and deletes need the logged flow; other edits stay allowed
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status)
     OR (TG_OP = 'INSERT' AND NEW.status::text <> 'draft') THEN
    RAISE EXCEPTION 'Admins change accommodation status only through the logged status flow' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE TRIGGER bookings_admin_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.admin_write_guard();
CREATE TRIGGER accommodations_admin_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.accommodations
  FOR EACH ROW EXECUTE FUNCTION public.admin_write_guard();

CREATE OR REPLACE FUNCTION public.review_accommodation(_accommodation_id uuid, _approve boolean, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old accommodation_status;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  SELECT status INTO _old FROM accommodations WHERE id=_accommodation_id;
  IF _old IS NULL OR _old::text <> 'pending_review' THEN RAISE EXCEPTION 'Accommodation is not pending review'; END IF;
  PERFORM set_config('vellum.admin_change', '1', true);
  IF _approve THEN
    UPDATE accommodations SET status='active', review_note=NULL, first_published_at = coalesce(first_published_at, now()) WHERE id=_accommodation_id;
  ELSE
    IF length(trim(coalesce(_note,''))) < 3 THEN RAISE EXCEPTION 'A review note is required when rejecting'; END IF;
    UPDATE accommodations SET status='draft', review_note=trim(_note) WHERE id=_accommodation_id;
  END IF;
  PERFORM set_config('vellum.admin_change', '', true);
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
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE accommodations SET status = _status,
    first_published_at = CASE WHEN _status::text = 'active' THEN coalesce(first_published_at, now()) ELSE first_published_at END
  WHERE id = _accommodation_id;
  PERFORM set_config('vellum.admin_change', '', true);
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
  PERFORM set_config('vellum.admin_change', '1', true);
  UPDATE bookings SET status = _status, booking_value = coalesce(_booking_value, booking_value),
    rejection_reason = CASE WHEN _status IN ('cancelled','rejected') AND _o.status NOT IN ('cancelled','rejected') THEN btrim(_note) ELSE rejection_reason END
  WHERE id = _booking_id RETURNING * INTO _n;
  PERFORM set_config('vellum.admin_change', '', true);
  INSERT INTO admin_audit_log (admin_id, action, entity, entity_id, old_value, new_value, note)
  VALUES (auth.uid(), 'booking.correct', 'booking', _booking_id,
    jsonb_build_object('status', _o.status, 'booking_value', _o.booking_value, 'commission_total', _o.commission_total, 'partner_commission', _o.partner_commission),
    jsonb_build_object('status', _n.status, 'booking_value', _n.booking_value, 'commission_total', _n.commission_total, 'partner_commission', _n.partner_commission),
    btrim(_note));
END $function$;

-- Period metrics for AI analysis: current period vs. the equally long previous period
CREATE OR REPLACE FUNCTION public.admin_period_metrics(_from date, _to date, _exclude_demo boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _len int; _pf date; _pt date;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE='42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 366 THEN RAISE EXCEPTION 'Choose a period of at most one year'; END IF;
  _len := _to - _from + 1; _pt := _from - 1; _pf := _from - _len;
  RETURN jsonb_build_object('current', public.admin_metrics_window(_from, _to, _exclude_demo),
                            'previous', public.admin_metrics_window(_pf, _pt, _exclude_demo),
                            'current_period', jsonb_build_object('from', _from, 'to', _to),
                            'previous_period', jsonb_build_object('from', _pf, 'to', _pt));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_metrics_window(_from date, _to date, _exclude_demo boolean)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH r AS (SELECT _from::timestamptz AS f, (_to + 1)::timestamptz AS t),
  b AS (SELECT bk.* FROM bookings bk, r WHERE bk.created_at >= r.f AND bk.created_at < r.t AND NOT (_exclude_demo AND bk.is_demo)),
  bc AS (SELECT * FROM b WHERE status IN ('confirmed','completed'))
  SELECT jsonb_build_object(
    'new_users', (SELECT count(*) FROM profiles p, r WHERE p.created_at >= r.f AND p.created_at < r.t AND NOT (_exclude_demo AND p.is_demo)),
    'new_accommodations', (SELECT count(*) FROM accommodations a, r WHERE a.created_at >= r.f AND a.created_at < r.t AND NOT (_exclude_demo AND a.is_demo)),
    'accommodations_published', (SELECT count(*) FROM accommodations a, r WHERE a.first_published_at >= r.f AND a.first_published_at < r.t AND NOT (_exclude_demo AND a.is_demo)),
    'links_created', (SELECT count(*) FROM distribution_links l, r WHERE l.created_at >= r.f AND l.created_at < r.t AND NOT (_exclude_demo AND l.is_demo)),
    'active_partners_with_link', (SELECT count(DISTINCT l.partner_id) FROM distribution_links l, r WHERE l.created_at >= r.f AND l.created_at < r.t AND NOT (_exclude_demo AND l.is_demo)),
    'unique_clicks', (SELECT count(*) FROM distribution_clicks c, r WHERE c.clicked_at >= r.f AND c.clicked_at < r.t AND c.is_unique AND NOT c.is_bot AND NOT (_exclude_demo AND c.is_demo)),
    'bot_clicks', (SELECT count(*) FROM distribution_clicks c, r WHERE c.clicked_at >= r.f AND c.clicked_at < r.t AND c.is_bot AND NOT (_exclude_demo AND c.is_demo)),
    'saves', (SELECT count(*) FROM activity_events e, r WHERE e.event_type = 'opportunity_saved' AND e.created_at >= r.f AND e.created_at < r.t AND NOT (_exclude_demo AND e.is_demo)),
    'content_downloads', (SELECT count(*) FROM activity_events e, r WHERE e.event_type = 'content_downloaded' AND e.created_at >= r.f AND e.created_at < r.t AND NOT (_exclude_demo AND e.is_demo)),
    'bookings_created', (SELECT count(*) FROM b),
    'bookings_by_status', coalesce((SELECT jsonb_object_agg(s, n) FROM (SELECT status::text s, count(*) n FROM b GROUP BY 1) x), '{}'),
    'bookings_confirmed', (SELECT count(*) FROM bc),
    'booking_volume', (SELECT coalesce(sum(booking_value),0) FROM bc),
    'commission_total', (SELECT coalesce(sum(commission_total),0) FROM bc),
    'platform_revenue', (SELECT coalesce(sum(platform_commission),0) FROM bc),
    'avg_pool_pct', (SELECT round(avg(commission_pool_pct),2) FROM bc),
    'top_accommodations', coalesce((SELECT jsonb_agg(x) FROM (SELECT a.name, count(*) bookings, sum(bc.booking_value) value FROM bc JOIN accommodations a ON a.id = bc.accommodation_id GROUP BY a.name ORDER BY 3 DESC LIMIT 5) x), '[]'),
    'top_partner_types', coalesce((SELECT jsonb_agg(x) FROM (SELECT d.distribution_type::text type, count(*) bookings FROM bc JOIN distribution_partner_profiles d ON d.user_id = bc.partner_id GROUP BY 1 ORDER BY 2 DESC) x), '[]'),
    'campaigns_live', (SELECT count(*) FROM commission_campaigns cc WHERE cc.starts_on <= _to AND cc.ends_on >= _from AND NOT (_exclude_demo AND cc.is_demo)),
    'accommodations_paused_now', (SELECT count(*) FROM accommodations a WHERE a.status::text = 'paused' AND NOT (_exclude_demo AND a.is_demo))
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_metrics_window(date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_period_metrics(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_period_metrics(date, date, boolean) TO authenticated;