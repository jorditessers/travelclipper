CREATE OR REPLACE FUNCTION public.dp_dashboard_kpis(_since timestamptz DEFAULT NULL)
RETURNS TABLE(saved bigint, active_links bigint, unique_clicks bigint, confirmed_bookings bigint,
  booking_value numeric, commission_earned numeric, pending_commission numeric, pending_count bigint,
  confirmed_commission numeric, confirmed_count bigint, earned_commission numeric, earned_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (SELECT * FROM bookings WHERE partner_id = auth.uid() AND (_since IS NULL OR created_at >= _since))
  SELECT
    (SELECT count(*) FROM saved_accommodations WHERE user_id = auth.uid() AND (_since IS NULL OR created_at >= _since)),
    (SELECT count(*) FROM distribution_links WHERE partner_id = auth.uid() AND archived_at IS NULL),
    (SELECT count(*) FROM distribution_clicks WHERE partner_id = auth.uid() AND is_unique AND NOT is_bot AND (_since IS NULL OR clicked_at >= _since)),
    (SELECT count(*) FROM b WHERE status IN ('confirmed','completed')),
    (SELECT coalesce(sum(booking_value),0) FROM b WHERE status IN ('confirmed','completed')),
    (SELECT coalesce(sum(partner_commission),0) FROM b WHERE status IN ('confirmed','completed')),
    -- reported bookings have no snapshot yet: estimate with effective pool x partner share
    (SELECT coalesce(sum(round(booking_value * effective_commission_pct(accommodation_id, booking_date) / 100
        * (SELECT partner_share_of_pool FROM platform_settings LIMIT 1), 2)),0) FROM b WHERE status = 'reported'),
    (SELECT count(*) FROM b WHERE status = 'reported'),
    (SELECT coalesce(sum(partner_commission),0) FROM b WHERE status = 'confirmed'),
    (SELECT count(*) FROM b WHERE status = 'confirmed'),
    (SELECT coalesce(sum(partner_commission),0) FROM b WHERE status = 'completed'),
    (SELECT count(*) FROM b WHERE status = 'completed')
$$;

CREATE OR REPLACE FUNCTION public.dp_earnings_by_month(_since timestamptz DEFAULT NULL)
RETURNS TABLE(month date, confirmed numeric, earned numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('month', booking_date)::date,
    coalesce(sum(partner_commission) FILTER (WHERE status = 'confirmed'),0),
    coalesce(sum(partner_commission) FILTER (WHERE status = 'completed'),0)
  FROM bookings
  WHERE partner_id = auth.uid() AND status IN ('confirmed','completed') AND (_since IS NULL OR created_at >= _since)
  GROUP BY 1 ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.dp_top_links(_since timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, accommodation_id uuid, accommodation_name text, label text, tracking_code text,
  clicks bigint, bookings bigint, commission numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT l.id, a.id AS aid, a.name, l.label, l.tracking_code,
      (SELECT count(*) FROM distribution_clicks c WHERE c.link_id = l.id AND c.is_unique AND NOT c.is_bot AND (_since IS NULL OR c.clicked_at >= _since)) AS clicks,
      (SELECT count(*) FROM bookings b WHERE b.link_id = l.id AND b.status IN ('confirmed','completed') AND (_since IS NULL OR b.created_at >= _since)) AS bookings,
      (SELECT coalesce(sum(b.partner_commission),0) FROM bookings b WHERE b.link_id = l.id AND b.status IN ('confirmed','completed') AND (_since IS NULL OR b.created_at >= _since)) AS commission
    FROM distribution_links l JOIN accommodations a ON a.id = l.accommodation_id
    WHERE l.partner_id = auth.uid()
  ) t
  ORDER BY t.commission DESC, t.clicks DESC
  LIMIT 5
$$;

CREATE OR REPLACE FUNCTION public.dp_recent_activity(_limit int DEFAULT 15)
RETURNS TABLE(id uuid, event_type activity_event_type, accommodation_id uuid, accommodation_name text, metadata jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT e.id, e.event_type, a.id AS aid, a.name,
      jsonb_strip_nulls(jsonb_build_object('count', CASE WHEN jsonb_typeof(e.metadata->'asset_ids') = 'array'
         THEN jsonb_array_length(e.metadata->'asset_ids') END)) AS md, e.created_at AS at
    FROM activity_events e JOIN accommodations a ON a.id = e.accommodation_id
    WHERE e.actor_id = auth.uid()
      AND e.event_type IN ('opportunity_saved','content_downloaded','link_created','booking_reported')
    UNION ALL
    SELECT b.id, (CASE WHEN b.status IN ('confirmed','completed') THEN 'booking_confirmed' ELSE 'booking_cancelled' END)::activity_event_type,
      a.id, a.name, jsonb_build_object('status', b.status, 'commission', b.partner_commission), coalesce(b.confirmed_at, b.updated_at)
    FROM bookings b JOIN accommodations a ON a.id = b.accommodation_id
    WHERE b.partner_id = auth.uid() AND b.status IN ('confirmed','completed','cancelled','rejected')
  ) t
  ORDER BY t.at DESC
  LIMIT least(greatest(_limit,1),100)
$$;

REVOKE EXECUTE ON FUNCTION public.dp_dashboard_kpis(timestamptz), public.dp_earnings_by_month(timestamptz), public.dp_top_links(timestamptz), public.dp_recent_activity(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_dashboard_kpis(timestamptz), public.dp_earnings_by_month(timestamptz), public.dp_top_links(timestamptz), public.dp_recent_activity(int) TO authenticated;