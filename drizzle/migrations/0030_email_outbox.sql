-- Transactional email outbox. Triggers record which emails are due; the server sends them via Resend
-- (src/lib/email.functions.ts) and marks them sent, so each email goes out once.
CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('welcome','accommodation_submitted','accommodation_approved','accommodation_changes_requested')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accommodation_id uuid REFERENCES public.accommodations(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX email_outbox_unsent ON public.email_outbox (created_at) WHERE sent_at IS NULL;
COMMENT ON TABLE public.email_outbox IS 'Emails due to be sent. Written by triggers, read and updated by the server (service role) only.';
REVOKE ALL ON public.email_outbox FROM anon, authenticated;
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enqueue_onboarding_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.onboarding_completed AND NOT coalesce(OLD.onboarding_completed, false) AND NOT NEW.is_demo THEN
    INSERT INTO email_outbox (kind, user_id) VALUES ('welcome', NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_enqueue_welcome AFTER UPDATE OF onboarding_completed ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_onboarding_email();

CREATE OR REPLACE FUNCTION public.enqueue_accommodation_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.is_demo THEN RETURN NEW; END IF;
  IF NEW.status::text = 'pending_review' THEN
    INSERT INTO email_outbox (kind, user_id, accommodation_id) VALUES ('accommodation_submitted', NEW.owner_id, NEW.id);
  ELSIF OLD.status::text = 'pending_review' AND NEW.status::text = 'active' THEN
    INSERT INTO email_outbox (kind, user_id, accommodation_id) VALUES ('accommodation_approved', NEW.owner_id, NEW.id);
  ELSIF OLD.status::text = 'pending_review' AND NEW.status::text = 'draft' THEN
    INSERT INTO email_outbox (kind, user_id, accommodation_id, note) VALUES ('accommodation_changes_requested', NEW.owner_id, NEW.id, NEW.review_note);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accommodations_enqueue_email AFTER UPDATE OF status ON public.accommodations
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_accommodation_email();

-- Hands out unsent emails to one sender at a time; a claim older than 5 minutes is retried, up to 5 attempts.
CREATE OR REPLACE FUNCTION public.claim_email_outbox(_limit int DEFAULT 20) RETURNS SETOF public.email_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE email_outbox SET claimed_at = now(), attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM email_outbox
    WHERE sent_at IS NULL AND attempts < 5 AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
    ORDER BY created_at LIMIT least(greatest(_limit, 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE EXECUTE ON FUNCTION public.claim_email_outbox(int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.enqueue_onboarding_email() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_accommodation_email() FROM anon, authenticated, public;
