CREATE TYPE public.asset_type AS ENUM ('photo','video','vertical_video','drone','document','brand_asset');

CREATE TABLE public.accommodation_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  uploaded_by uuid,
  asset_type public.asset_type NOT NULL,
  storage_path text,
  external_url text,
  title text NOT NULL DEFAULT '',
  description text,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  approved_for_distribution boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_source CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL),
  CONSTRAINT asset_path_format CHECK (storage_path IS NULL OR storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|pdf)$'),
  CONSTRAINT asset_path_in_folder CHECK (storage_path IS NULL OR split_part(storage_path,'/',1) = accommodation_id::text),
  CONSTRAINT asset_external_https CHECK (external_url IS NULL OR external_url ~* '^https://'),
  CONSTRAINT asset_title_len CHECK (char_length(title) <= 120),
  CONSTRAINT asset_desc_len CHECK (description IS NULL OR char_length(description) <= 1000)
);
CREATE UNIQUE INDEX accommodation_assets_one_cover ON public.accommodation_assets (accommodation_id) WHERE is_cover;
CREATE UNIQUE INDEX accommodation_assets_path ON public.accommodation_assets (storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX accommodation_assets_acc ON public.accommodation_assets (accommodation_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_assets TO authenticated;
GRANT ALL ON public.accommodation_assets TO service_role;
ALTER TABLE public.accommodation_assets ENABLE ROW LEVEL SECURITY;

-- Owner-or-admin check for an accommodation.
CREATE OR REPLACE FUNCTION public.can_manage_accommodation(_accommodation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM accommodations WHERE id = _accommodation_id AND owner_id = auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.can_manage_accommodation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_accommodation(uuid) TO authenticated;

CREATE POLICY "Managers read assets" ON public.accommodation_assets FOR SELECT TO authenticated
  USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers insert assets" ON public.accommodation_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers update assets" ON public.accommodation_assets FOR UPDATE TO authenticated
  USING (public.can_manage_accommodation(accommodation_id)) WITH CHECK (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Managers delete assets" ON public.accommodation_assets FOR DELETE TO authenticated
  USING (public.can_manage_accommodation(accommodation_id));
CREATE POLICY "Distribution partners read approved assets" ON public.accommodation_assets FOR SELECT TO authenticated
  USING (approved_for_distribution AND public.has_role(auth.uid(),'distribution_partner') AND public.is_distributable(accommodation_id));

-- Integrity + server-side size check against the stored object.
CREATE OR REPLACE FUNCTION public.accommodation_assets_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE _size bigint; _ext text; _max bigint; _admin boolean := auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.accommodation_id := OLD.accommodation_id;
    NEW.storage_path := OLD.storage_path;
    NEW.uploaded_by := OLD.uploaded_by;
    NEW.created_at := OLD.created_at;
    IF NOT _admin THEN NEW.is_demo := OLD.is_demo; NEW.external_url := OLD.external_url; END IF;
    RETURN NEW;
  END IF;
  NEW.uploaded_by := coalesce(auth.uid(), NEW.uploaded_by);
  IF auth.uid() IS NOT NULL AND NOT _admin THEN
    NEW.is_demo := false;
    NEW.external_url := NULL;
  END IF;
  IF NEW.storage_path IS NOT NULL AND auth.uid() IS NOT NULL THEN
    SELECT (metadata->>'size')::bigint INTO _size FROM storage.objects
      WHERE bucket_id = 'accommodation-assets' AND name = NEW.storage_path;
    IF _size IS NULL THEN RAISE EXCEPTION 'File not found in storage'; END IF;
    _ext := lower(substring(NEW.storage_path from '\.([a-z0-9]+)$'));
    _max := CASE WHEN _ext IN ('jpg','png','webp') THEN 15728640
                 WHEN _ext IN ('mp4','mov') THEN 52428800
                 WHEN _ext = 'pdf' THEN 10485760 END;
    IF _max IS NULL OR _size > _max THEN RAISE EXCEPTION 'File too large for its type'; END IF;
    IF (_ext IN ('mp4','mov') AND NEW.asset_type NOT IN ('video','vertical_video','drone'))
       OR (_ext = 'pdf' AND NEW.asset_type NOT IN ('document','brand_asset'))
       OR (_ext IN ('jpg','png','webp') AND NEW.asset_type NOT IN ('photo','drone','brand_asset')) THEN
      RAISE EXCEPTION 'Asset type does not match file';
    END IF;
  END IF;
  NEW.is_cover := false; -- cover only via set_asset_cover
  SELECT coalesce(max(sort_order),-1)+1 INTO NEW.sort_order FROM accommodation_assets WHERE accommodation_id = NEW.accommodation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER accommodation_assets_guard BEFORE INSERT OR UPDATE ON public.accommodation_assets
  FOR EACH ROW EXECUTE FUNCTION public.accommodation_assets_guard();

CREATE OR REPLACE FUNCTION public.set_asset_cover(_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _acc uuid; _path text; _ext text;
BEGIN
  SELECT accommodation_id, storage_path INTO _acc, _path FROM accommodation_assets WHERE id = _asset_id;
  IF _acc IS NULL OR NOT public.can_manage_accommodation(_acc) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  _ext := lower(substring(_path from '\.([a-z0-9]+)$'));
  IF _path IS NOT NULL AND _ext NOT IN ('jpg','png','webp') THEN RAISE EXCEPTION 'Cover must be an image'; END IF;
  UPDATE accommodation_assets SET is_cover = false WHERE accommodation_id = _acc AND is_cover AND id <> _asset_id;
  UPDATE accommodation_assets SET is_cover = true WHERE id = _asset_id;
END $$;
REVOKE ALL ON FUNCTION public.set_asset_cover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_asset_cover(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_assets(_accommodation_id uuid, _ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_accommodation(_accommodation_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  UPDATE accommodation_assets a SET sort_order = o.ord - 1
  FROM unnest(_ids) WITH ORDINALITY AS o(id, ord)
  WHERE a.id = o.id AND a.accommodation_id = _accommodation_id;
END $$;
REVOKE ALL ON FUNCTION public.reorder_assets(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_assets(uuid, uuid[]) TO authenticated;

-- Storage helpers
CREATE OR REPLACE FUNCTION public.asset_folder_uuid(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN split_part(_name,'/',1)::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.can_read_asset_object(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_accommodation(public.asset_folder_uuid(_name))
    OR (public.has_role(auth.uid(),'distribution_partner') AND EXISTS (
      SELECT 1 FROM accommodation_assets a
      WHERE a.storage_path = _name AND a.approved_for_distribution AND public.is_distributable(a.accommodation_id)))
$$;
REVOKE ALL ON FUNCTION public.can_read_asset_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_asset_object(text) TO authenticated;

CREATE POLICY "Asset objects read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'accommodation-assets' AND public.can_read_asset_object(name));
CREATE POLICY "Asset objects upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'accommodation-assets'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|pdf)$'
    AND public.can_manage_accommodation(public.asset_folder_uuid(name))
    AND (metadata IS NULL OR metadata->>'size' IS NULL OR (metadata->>'size')::bigint <= CASE
          WHEN name ~ '\.(jpg|png|webp)$' THEN 15728640
          WHEN name ~ '\.pdf$' THEN 10485760
          ELSE 52428800 END)
  );
CREATE POLICY "Asset objects delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'accommodation-assets' AND public.can_manage_accommodation(public.asset_folder_uuid(name)));