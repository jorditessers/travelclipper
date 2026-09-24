CREATE OR REPLACE FUNCTION public.record_click(_code text, _ip text, _referrer text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _link distribution_links; _acc accommodations; _salt text; _hash text;
  _bot boolean; _unique boolean; _dist boolean; _url text;
BEGIN
  SELECT * INTO _link FROM distribution_links WHERE tracking_code = upper(btrim(_code)) AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'inactive'); END IF;
  SELECT * INTO _acc FROM accommodations WHERE id = _link.accommodation_id;

  INSERT INTO tracking_salts (day, salt) VALUES (current_date, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))
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
REVOKE EXECUTE ON FUNCTION public.record_click(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_click(text, text, text, text) TO service_role;