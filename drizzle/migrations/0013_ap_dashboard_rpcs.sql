-- All AP dashboard RPCs are scoped to accommodations owned by auth.uid(). _since NULL = all time.

CREATE OR REPLACE FUNCTION public.ap_dashboard_kpis(_since timestamptz DEFAULT NULL)
RETURNS TABLE(active_accommodations bigint, partners_engaged bigint, unique_clicks bigint,
  confirmed_bookings bigint, booking_value numeric, commission_owed numeric, pending_reviews bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (SELECT id, status FROM accommodations WHERE owner_id = auth.uid()),
  b AS (SELECT * FROM bookings WHERE accommodation_id IN (SELECT id FROM mine)
          AND (_since IS NULL OR created_at >= _since)),
  engaged AS (
    SELECT actor_id AS pid FROM activity_events
     WHERE accommodation_id IN (SELECT id FROM mine) AND actor_id IS NOT NULL
       AND event_type IN ('opportunity_saved','content_downloaded','link_created')
       AND (_since IS NULL OR created_at >= _since)
    UNION SELECT partner_id FROM b
  )
  SELECT
    (SELECT count(*) FROM mine WHERE status::text = 'active'),
    (SELECT count(DISTINCT pid) FROM engaged e WHERE has_role(e.pid,'distribution_partner')),
    (SELECT count(*) FROM distribution_clicks c WHERE c.accommodation_id IN (SELECT id FROM mine)
       AND c.is_unique AND NOT c.is_bot AND (_since IS NULL OR c.clicked_at >= _since)),
    (SELECT count(*) FROM b WHERE status IN ('confirmed','completed')),
    (SELECT coalesce(sum(booking_value),0) FROM b WHERE status IN ('confirmed','completed')),
    (SELECT coalesce(sum(commission_total),0) FROM b WHERE status IN ('confirmed','completed')),
    (SELECT count(*) FROM bookings WHERE accommodation_id IN (SELECT id FROM mine) AND status = 'reported')
$$;

CREATE OR REPLACE FUNCTION public.ap_dashboard_accommodations(_since timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, name text, status accommodation_status, standard_pct numeric, effective_pct numeric,
  campaign_name text, campaign_ends_on date, partners_engaged bigint, clicks bigint, bookings bigint, booking_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.status, s.commission_pool_pct, effective_commission_pct(a.id, current_date),
    cc.name, cc.ends_on,
    (SELECT count(DISTINCT pid) FROM (
       SELECT e.actor_id pid FROM activity_events e WHERE e.accommodation_id = a.id AND e.actor_id IS NOT NULL
         AND e.event_type IN ('opportunity_saved','content_downloaded','link_created') AND (_since IS NULL OR e.created_at >= _since)
       UNION SELECT bk.partner_id FROM bookings bk WHERE bk.accommodation_id = a.id AND (_since IS NULL OR bk.created_at >= _since)
     ) x WHERE has_role(x.pid,'distribution_partner')),
    (SELECT count(*) FROM distribution_clicks c WHERE c.accommodation_id = a.id AND c.is_unique AND NOT c.is_bot
       AND (_since IS NULL OR c.clicked_at >= _since)),
    (SELECT count(*) FROM bookings bk WHERE bk.accommodation_id = a.id AND bk.status IN ('confirmed','completed')
       AND (_since IS NULL OR bk.created_at >= _since)),
    (SELECT coalesce(sum(bk.booking_value),0) FROM bookings bk WHERE bk.accommodation_id = a.id AND bk.status IN ('confirmed','completed')
       AND (_since IS NULL OR bk.created_at >= _since))
  FROM accommodations a
  LEFT JOIN accommodation_distribution_settings s ON s.accommodation_id = a.id
  LEFT JOIN LATERAL (SELECT c.name, c.ends_on FROM commission_campaigns c WHERE c.accommodation_id = a.id
      AND current_date BETWEEN c.starts_on AND c.ends_on LIMIT 1) cc ON true
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC
$$;

-- Returns partner ids + counts only; the client resolves public profile fields via get_partner_public_profile.
CREATE OR REPLACE FUNCTION public.ap_dashboard_partners(_since timestamptz DEFAULT NULL)
RETURNS TABLE(partner_id uuid, clicks bigint, bookings bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (SELECT id FROM accommodations WHERE owner_id = auth.uid()),
  p AS (
    SELECT actor_id pid FROM activity_events WHERE accommodation_id IN (SELECT id FROM mine) AND actor_id IS NOT NULL
      AND event_type IN ('opportunity_saved','content_downloaded','link_created') AND (_since IS NULL OR created_at >= _since)
    UNION SELECT partner_id FROM bookings WHERE accommodation_id IN (SELECT id FROM mine) AND (_since IS NULL OR created_at >= _since)
    UNION SELECT partner_id FROM distribution_clicks WHERE accommodation_id IN (SELECT id FROM mine) AND (_since IS NULL OR clicked_at >= _since)
  )
  SELECT p.pid,
    (SELECT count(*) FROM distribution_clicks c WHERE c.partner_id = p.pid AND c.accommodation_id IN (SELECT id FROM mine)
       AND c.is_unique AND NOT c.is_bot AND (_since IS NULL OR c.clicked_at >= _since)) AS clicks,
    (SELECT count(*) FROM bookings b WHERE b.partner_id = p.pid AND b.accommodation_id IN (SELECT id FROM mine)
       AND b.status IN ('confirmed','completed') AND (_since IS NULL OR b.created_at >= _since)) AS bookings
  FROM p WHERE has_role(p.pid,'distribution_partner')
  ORDER BY bookings DESC, clicks DESC
  LIMIT 50
$$;

-- Activity feed: partner type only, never partner identity. Excludes bot clicks and views.
CREATE OR REPLACE FUNCTION public.ap_recent_activity(_limit int DEFAULT 20)
RETURNS TABLE(id uuid, event_type activity_event_type, accommodation_id uuid, accommodation_name text,
  partner_type distribution_type, metadata jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.event_type, a.id, a.name, d.distribution_type,
    jsonb_strip_nulls(jsonb_build_object('count', CASE WHEN jsonb_typeof(e.metadata->'asset_ids') = 'array'
       THEN jsonb_array_length(e.metadata->'asset_ids') END, 'booking_id', e.metadata->>'booking_id')),
    e.created_at
  FROM activity_events e
  JOIN accommodations a ON a.id = e.accommodation_id AND a.owner_id = auth.uid()
  LEFT JOIN distribution_partner_profiles d ON d.user_id = e.actor_id
  WHERE e.event_type IN ('opportunity_saved','content_downloaded','link_created','booking_reported','booking_registered','booking_confirmed','booking_cancelled')
  ORDER BY e.created_at DESC
  LIMIT least(greatest(_limit,1),100)
$$;

REVOKE EXECUTE ON FUNCTION public.ap_dashboard_kpis(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ap_dashboard_accommodations(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ap_dashboard_partners(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ap_recent_activity(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ap_dashboard_kpis(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ap_dashboard_accommodations(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ap_dashboard_partners(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ap_recent_activity(int) TO authenticated;