-- Booking and payout emails, queued in email_outbox like the onboarding and review emails (0030).
ALTER TABLE public.email_outbox ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_kind_check;
ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK (kind IN (
  'welcome','accommodation_submitted','accommodation_approved','accommodation_changes_requested',
  'booking_reported','booking_confirmed','booking_rejected','booking_cancelled','payout_details_changed'));

-- user_id is the main recipient: the stay's owner for a reported booking, otherwise the distribution partner.
CREATE OR REPLACE FUNCTION public.enqueue_booking_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NEW.is_demo THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'reported' THEN
      SELECT owner_id INTO _owner FROM accommodations WHERE id = NEW.accommodation_id;
      IF _owner IS NOT NULL THEN
        INSERT INTO email_outbox (kind, user_id, accommodation_id, booking_id) VALUES ('booking_reported', _owner, NEW.accommodation_id, NEW.id);
      END IF;
    ELSIF NEW.status::text = 'confirmed' THEN
      INSERT INTO email_outbox (kind, user_id, accommodation_id, booking_id) VALUES ('booking_confirmed', NEW.partner_id, NEW.accommodation_id, NEW.id);
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'confirmed' AND OLD.status::text = 'reported' THEN
      INSERT INTO email_outbox (kind, user_id, accommodation_id, booking_id) VALUES ('booking_confirmed', NEW.partner_id, NEW.accommodation_id, NEW.id);
    ELSIF NEW.status::text = 'rejected' THEN
      INSERT INTO email_outbox (kind, user_id, accommodation_id, booking_id, note) VALUES ('booking_rejected', NEW.partner_id, NEW.accommodation_id, NEW.id, NEW.rejection_reason);
    ELSIF NEW.status::text = 'cancelled' THEN
      INSERT INTO email_outbox (kind, user_id, accommodation_id, booking_id, note) VALUES ('booking_cancelled', NEW.partner_id, NEW.accommodation_id, NEW.id, NEW.rejection_reason);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_enqueue_email AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_email();

-- Security notice when existing bank details change (not when they are added for the first time).
CREATE OR REPLACE FUNCTION public.enqueue_payout_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.iban IS NOT NULL AND (NEW.iban IS DISTINCT FROM OLD.iban OR NEW.account_holder IS DISTINCT FROM OLD.account_holder)
     AND NOT public.is_demo_user(NEW.user_id) THEN
    INSERT INTO email_outbox (kind, user_id) VALUES ('payout_details_changed', NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_details_enqueue_payout_email AFTER UPDATE OF iban, account_holder ON public.billing_details
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_payout_email();

REVOKE EXECUTE ON FUNCTION public.enqueue_booking_email() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_payout_email() FROM anon, authenticated, public;
