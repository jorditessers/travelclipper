-- Single rule-based scoring function. Weights are constants so this can later be replaced/augmented (e.g. AI).
-- Internal: not executable by clients; called by the definer wrappers below.
CREATE OR REPLACE FUNCTION public.score_accommodation_for_partner(_accommodation_id uuid, _partner_id uuid)
RETURNS TABLE(score integer, reasons text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  W_NICHE      CONSTANT numeric := 40;
  W_MARKET     CONSTANT numeric := 25;
  W_COMMISSION CONSTANT numeric := 15;
  W_CONTENT    CONSTANT numeric := 10;
  W_NEW        CONSTANT numeric := 10;
  COMMISSION_MIN CONSTANT numeric := 5;   -- pool % that scores 0
  COMMISSION_MAX CONSTANT numeric := 20;  -- pool % that scores full weight
  CONTENT_FULL   CONSTANT integer := 12;  -- approved assets for full weight
  NEW_DAYS       CONSTANT integer := 30;
  MAX_REASONS    CONSTANT integer := 2;

  p_niches niche[]; p_markets text[];
  a_niches niche[]; a_markets text[]; a_created timestamptz;
  std_pct numeric; eff_pct numeric; n_assets integer;
  ov_niches niche[]; ov_markets text[];
  s_niche numeric := 0; s_market numeric := 0; s_comm numeric := 0; s_content numeric := 0; s_new numeric := 0;
  cand jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_distributable(_accommodation_id) THEN RETURN; END IF;

  SELECT niches, markets INTO p_niches, p_markets FROM distribution_partner_profiles WHERE user_id = _partner_id;
  SELECT a.niches, a.created_at, coalesce(s.target_markets, '{}'), s.commission_pool_pct
    INTO a_niches, a_created, a_markets, std_pct
    FROM accommodations a LEFT JOIN accommodation_distribution_settings s ON s.accommodation_id = a.id
   WHERE a.id = _accommodation_id;
  eff_pct := effective_commission_pct(_accommodation_id, current_date);
  SELECT count(*) INTO n_assets FROM accommodation_assets WHERE accommodation_id = _accommodation_id AND approved_for_distribution;

  SELECT coalesce(array_agg(n ORDER BY n), '{}') INTO ov_niches FROM unnest(coalesce(p_niches,'{}')) n WHERE n = ANY(a_niches);
  SELECT coalesce(array_agg(m ORDER BY m), '{}') INTO ov_markets FROM unnest(coalesce(p_markets,'{}')) m WHERE m = ANY(a_markets);

  IF cardinality(p_niches) > 0 THEN s_niche := W_NICHE * cardinality(ov_niches) / cardinality(p_niches); END IF;
  IF cardinality(p_markets) > 0 THEN s_market := W_MARKET * cardinality(ov_markets) / cardinality(p_markets); END IF;
  s_comm := W_COMMISSION * greatest(0, least(1, (coalesce(eff_pct,0) - COMMISSION_MIN) / (COMMISSION_MAX - COMMISSION_MIN)));
  s_content := W_CONTENT * least(1, n_assets::numeric / CONTENT_FULL);
  IF a_created >= now() - make_interval(days => NEW_DAYS) THEN s_new := W_NEW; END IF;

  -- Reason candidates, ranked by the points they contributed
  IF cardinality(ov_niches) > 0 THEN
    cand := cand || jsonb_build_object('p', s_niche, 't', 'Matches your niches: ' || (
      SELECT string_agg(CASE x WHEN 'food_wine' THEN 'food & wine' WHEN 'slow_travel' THEN 'slow travel'
        WHEN 'lgbtq_friendly' THEN 'LGBTQ+ friendly' ELSE x::text END, ', ')
      FROM unnest(ov_niches[1:3]) x));
  END IF;
  IF cardinality(ov_markets) > 0 THEN
    cand := cand || jsonb_build_object('p', s_market, 't', 'Popular with travelers from ' || array_to_string(ov_markets[1:3], ', '));
  END IF;
  IF eff_pct > coalesce(std_pct, eff_pct) THEN
    cand := cand || jsonb_build_object('p', s_comm + 5, 't', 'Boosted commission this month');
  END IF;
  IF s_new > 0 THEN cand := cand || jsonb_build_object('p', s_new, 't', 'New on Vellum'); END IF;
  IF n_assets >= CONTENT_FULL / 2 THEN cand := cand || jsonb_build_object('p', s_content, 't', 'Rich content library'); END IF;

  score := round(s_niche + s_market + s_comm + s_content + s_new)::int;
  SELECT coalesce(array_agg(t), '{}') INTO reasons FROM (
    SELECT e->>'t' AS t FROM jsonb_array_elements(cand) e ORDER BY (e->>'p')::numeric DESC LIMIT MAX_REASONS) r;
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION public.score_accommodation_for_partner(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Top recommendations for a partner. Saved stays excluded unless _include_saved.
CREATE OR REPLACE FUNCTION public.recommend_accommodations(_partner_id uuid, _limit integer DEFAULT 6, _include_saved boolean DEFAULT false)
RETURNS TABLE(accommodation_id uuid, score integer, reasons text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (_partner_id <> auth.uid() AND NOT has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.id, s.score, s.reasons
    FROM accommodations a
    CROSS JOIN LATERAL score_accommodation_for_partner(a.id, _partner_id) s
    WHERE a.status = 'active'
      AND (_include_saved OR NOT EXISTS (SELECT 1 FROM saved_accommodations sa WHERE sa.user_id = _partner_id AND sa.accommodation_id = a.id))
    ORDER BY s.score DESC, a.created_at DESC
    LIMIT least(greatest(coalesce(_limit, 6), 1), 100);
END $$;
REVOKE EXECUTE ON FUNCTION public.recommend_accommodations(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recommend_accommodations(uuid, integer, boolean) TO authenticated;

-- Computed column for Discover "Recommended" sort (includes saved stays). Same scoring, for the caller.
CREATE OR REPLACE FUNCTION public.recommendation_score(accommodations)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN has_role(auth.uid(), 'distribution_partner')
    THEN coalesce((SELECT score FROM score_accommodation_for_partner($1.id, auth.uid())), 0) ELSE 0 END
$$;
REVOKE EXECUTE ON FUNCTION public.recommendation_score(accommodations) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recommendation_score(accommodations) TO authenticated;