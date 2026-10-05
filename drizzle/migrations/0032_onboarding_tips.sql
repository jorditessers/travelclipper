-- Onboarding tips: a short series of emails on day 2, 5 and 10 after onboarding, queued daily by
-- enqueue_tip_emails() (called from the /api/cron/daily route) and sent like the other outbox emails.
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_kind_check;
ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK (kind IN (
  'welcome','accommodation_submitted','accommodation_approved','accommodation_changes_requested',
  'booking_reported','booking_confirmed','booking_rejected','booking_cancelled','payout_details_changed',
  'tip_ap_day2','tip_ap_day5','tip_ap_day10','tip_dp_day2','tip_dp_day5','tip_dp_day10'));
-- Each tip goes to a user at most once.
CREATE UNIQUE INDEX email_outbox_tip_once ON public.email_outbox (user_id, kind) WHERE kind LIKE 'tip\_%';

-- Unsubscribing from tips; transactional emails (bookings, reviews, security) are always sent.
CREATE TABLE public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tips_opted_out_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.email_preferences FROM anon, authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- Queues the tips that are due. A tip is only sent within 3 days of its day, so people who joined
-- long ago don't get a burst of old tips, and is skipped when it no longer applies.
CREATE OR REPLACE FUNCTION public.enqueue_tip_emails() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  WITH users AS (
    SELECT p.id, r.role::text AS role, p.terms_accepted_at AS since
    FROM profiles p JOIN user_roles r ON r.user_id = p.id
    WHERE p.onboarding_completed AND NOT p.is_demo AND p.terms_accepted_at IS NOT NULL
      AND r.role::text IN ('accommodation_partner','distribution_partner')
      AND NOT EXISTS (SELECT 1 FROM email_preferences e WHERE e.user_id = p.id AND e.tips_opted_out_at IS NOT NULL)
  ),
  steps(role, day, kind) AS (VALUES
    ('accommodation_partner', 2, 'tip_ap_day2'), ('accommodation_partner', 5, 'tip_ap_day5'), ('accommodation_partner', 10, 'tip_ap_day10'),
    ('distribution_partner', 2, 'tip_dp_day2'), ('distribution_partner', 5, 'tip_dp_day5'), ('distribution_partner', 10, 'tip_dp_day10')
  ),
  due AS (
    SELECT u.id, s.kind FROM users u JOIN steps s ON s.role = u.role
    WHERE now() >= u.since + make_interval(days => s.day)
      AND now() < u.since + make_interval(days => s.day + 3)
      AND CASE s.kind
        WHEN 'tip_ap_day2' THEN NOT EXISTS (SELECT 1 FROM accommodations a WHERE a.owner_id = u.id AND a.status::text = 'active')
        WHEN 'tip_ap_day5' THEN NOT EXISTS (SELECT 1 FROM accommodations a WHERE a.owner_id = u.id AND a.status::text IN ('pending_review','active','paused'))
        WHEN 'tip_dp_day10' THEN NOT EXISTS (SELECT 1 FROM distribution_links l WHERE l.partner_id = u.id)
        ELSE true END
  )
  INSERT INTO email_outbox (kind, user_id)
  SELECT kind, id FROM due
  ON CONFLICT (user_id, kind) WHERE kind LIKE 'tip\_%' DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_tip_emails() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.enqueue_tip_emails() TO service_role;
