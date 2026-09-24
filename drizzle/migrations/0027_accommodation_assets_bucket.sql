-- The private storage bucket for accommodation content. Lovable Cloud created it outside the migrations;
-- a fresh Supabase project (or the browser demo) needs it here. Limits mirror the storage policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('accommodation-assets', 'accommodation-assets', false, 52428800,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
