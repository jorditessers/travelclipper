-- ===== distribution_links =====
CREATE TABLE public.distribution_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  label text CHECK (label IS NULL OR char_length(label) <= 60),
  tracking_code text NOT NULL UNIQUE CHECK (tracking_code ~ '^[A-Z]{3}-[A-HJ-NP-Z2-9]{5}$'),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX distribution_links_partner_idx ON public.distribution_links(partner_id, created_at DESC);
CREATE INDEX distribution_links_acc_idx ON public.distribution_links(accommodation_id);

GRANT SELECT ON public.distribution_links TO authenticated;
GRANT ALL ON public.distribution_links TO service_role;
ALTER TABLE public.distribution_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read own links" ON public.distribution_links FOR SELECT TO authenticated
  USING (partner_id = auth.uid());
CREATE POLICY "Admins read all links" ON public.distribution_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- Writes only via create_distribution_link / archive_distribution_link. Owners read via get_accommodation_links().

CREATE OR REPLACE FUNCTION public.generate_tracking_code(_name text)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _prefix text; _code text; _i int; _try int := 0;
BEGIN
  _prefix := upper(regexp_replace(translate(coalesce(_name,''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'), '[^A-Za-z]', '', 'g'));
  _prefix := rpad(left(_prefix, 3), 3, 'X');
  LOOP
    _code := _prefix || '-';
    FOR _i IN 1..5 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM distribution_links WHERE tracking_code = _code);
    _try := _try + 1;
    IF _try > 20 THEN RAISE EXCEPTION 'Could not generate a unique tracking code'; END IF;
  END LOOP;
  RETURN _code;
END $$;

CREATE OR REPLACE FUNCTION public.distribution_links_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tracking_code IS NULL THEN
      NEW.tracking_code := public.generate_tracking_code((SELECT name FROM accommodations WHERE id = NEW.accommodation_id));
    END IF;
  ELSE
    IF NEW.tracking_code <> OLD.tracking_code OR NEW.partner_id <> OLD.partner_id OR NEW.accommodation_id <> OLD.accommodation_id THEN
      RAISE EXCEPTION 'Tracking code, partner and accommodation cannot change';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER distribution_links_guard BEFORE INSERT OR UPDATE ON public.distribution_links
  FOR EACH ROW EXECUTE FUNCTION public.distribution_links_guard();

CREATE OR REPLACE FUNCTION public.create_distribution_link(_accommodation_id uuid, _label text DEFAULT NULL)
RETURNS TABLE(id uuid, tracking_code text, label text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row distribution_links;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT has_role(_uid, 'distribution_partner') THEN RAISE EXCEPTION 'Only Distribution Partners can create links' USING ERRCODE='42501'; END IF;
  IF NOT is_distributable(_accommodation_id) THEN RAISE EXCEPTION 'This stay is not available for distribution' USING ERRCODE='42501'; END IF;
  INSERT INTO distribution_links (partner_id, accommodation_id, label)
  VALUES (_uid, _accommodation_id, nullif(btrim(coalesce(_label,'')), ''))
  RETURNING * INTO _row;
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (_uid, _accommodation_id, 'link_created', jsonb_build_object('link_id', _row.id, 'code', _row.tracking_code));
  RETURN QUERY SELECT _row.id, _row.tracking_code, _row.label, _row.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.archive_distribution_link(_link_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE distribution_links SET archived_at = now()
   WHERE id = _link_id AND partner_id = auth.uid() AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='42501'; END IF;
END $$;

-- ===== distribution_clicks =====
CREATE TABLE public.distribution_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.distribution_links(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  referrer text,
  user_agent text,
  ip_hash text NOT NULL,
  is_unique boolean NOT NULL DEFAULT true,
  is_bot boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX distribution_clicks_link_idx ON public.distribution_clicks(link_id, clicked_at DESC);
CREATE INDEX distribution_clicks_ip_idx ON public.distribution_clicks(ip_hash, clicked_at DESC);

GRANT SELECT ON public.distribution_clicks TO authenticated;
GRANT ALL ON public.distribution_clicks TO service_role;
ALTER TABLE public.distribution_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read own clicks" ON public.distribution_clicks FOR SELECT TO authenticated
  USING (partner_id = auth.uid());
CREATE POLICY "Admins read all clicks" ON public.distribution_clicks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Daily salts (server only, never exposed)
CREATE TABLE public.tracking_salts (
  day date PRIMARY KEY,
  salt text NOT NULL
);
GRANT ALL ON public.tracking_salts TO service_role;
ALTER TABLE public.tracking_salts ENABLE ROW LEVEL SECURITY;

-- Called only by the server with the service role. Never stores the raw IP.
CREATE OR REPLACE FUNCTION public.record_click(_code text, _ip text, _referrer text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _link distribution_links; _acc accommodations; _salt text; _hash text;
  _bot boolean; _unique boolean; _dist boolean; _url text;
BEGIN
  SELECT * INTO _link FROM distribution_links WHERE tracking_code = upper(btrim(_code)) AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'inactive'); END IF;
  SELECT * INTO _acc FROM accommodations WHERE id = _link.accommodation_id;

  INSERT INTO tracking_salts (day, salt) VALUES (current_date, encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (day) DO NOTHING;
  SELECT salt INTO _salt FROM tracking_salts WHERE day = current_date;
  DELETE FROM tracking_salts WHERE day < current_date - 2;
  _hash := encode(sha256(convert_to(coalesce(_ip, 'unknown') || _salt, 'UTF8')), 'hex');

  -- Rate limit: max 30 clicks per ip_hash per minute
  IF (SELECT count(*) FROM distribution_clicks WHERE ip_hash = _hash AND clicked_at > now() - interval '1 minute') >= 30 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  _bot := coalesce(_user_agent, '') = '' OR _user_agent ~* '(bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|curl|wget|python|httpclient|okhttp|go-http|java/|headless|lighthouse|pingdom|monitor|whatsapp|telegram|discord|slack|skype)';
  _unique := NOT EXISTS (SELECT 1 FROM distribution_clicks
    WHERE link_id = _link.id AND ip_hash = _hash AND clicked_at > now() - interval '30 minutes');
  _dist := is_distributable(_link.accommodation_id);

  INSERT INTO distribution_clicks (link_id, accommodation_id, partner_id, referrer, user_agent, ip_hash, is_unique, is_bot)
  VALUES (_link.id, _link.accommodation_id, _link.partner_id, left(_referrer, 500), left(_user_agent, 500), _hash, _unique, _bot);
  INSERT INTO activity_events (actor_id, accommodation_id, event_type, metadata)
  VALUES (_link.partner_id, _link.accommodation_id, 'link_clicked',
          jsonb_build_object('link_id', _link.id, 'code', _link.tracking_code, 'unique', _unique, 'bot', _bot, 'distributable', _dist));

  IF _dist THEN
    _url := coalesce(nullif(_acc.booking_url, ''), nullif(_acc.website_url, ''));
  ELSE
    _url := coalesce(nullif(_acc.website_url, ''), nullif(_acc.booking_url, ''));
  END IF;
  IF _url IS NULL OR _url !~ '^https://' THEN RETURN jsonb_build_object('status', 'inactive'); END IF;
  RETURN jsonb_build_object('status', 'ok', 'url', _url, 'code', _link.tracking_code, 'attributed', _dist);
END $$;

-- ===== read RPCs =====
CREATE OR REPLACE FUNCTION public.get_my_links()
RETURNS TABLE(id uuid, accommodation_id uuid, accommodation_name text, label text, tracking_code text,
              created_at timestamptz, archived_at timestamptz, clicks bigint, is_available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.accommodation_id, a.name, l.label, l.tracking_code, l.created_at, l.archived_at,
         (SELECT count(*) FROM distribution_clicks c WHERE c.link_id = l.id AND c.is_unique AND NOT c.is_bot),
         is_distributable(l.accommodation_id)
  FROM distribution_links l JOIN accommodations a ON a.id = l.accommodation_id
  WHERE l.partner_id = auth.uid() AND has_role(auth.uid(), 'distribution_partner')
  ORDER BY l.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.get_accommodation_links(_accommodation_id uuid)
RETURNS TABLE(tracking_code text, label text, partner_id uuid, created_at timestamptz, archived_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.tracking_code, l.label, l.partner_id, l.created_at, l.archived_at
  FROM distribution_links l
  WHERE l.accommodation_id = _accommodation_id AND can_manage_accommodation(_accommodation_id)
  ORDER BY l.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tracking_code(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_click(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_click(text, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_distribution_link(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_distribution_link(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_links() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_accommodation_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_distribution_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_distribution_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accommodation_links(uuid) TO authenticated;