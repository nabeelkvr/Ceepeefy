-- ==============================================================================
-- CEEPEEFY: PERMANENT CROSS-DEVICE PLAYLIST SYNC MIGRATION (UP)
-- Non-destructive Expand/Contract Schema Upgrade
-- ==============================================================================
-- IMPORTANT: DO NOT RUN WITHOUT EXPLICIT APPROVAL.
--
-- This script:
-- 1. Adds missing metadata columns to public.user_playlists
-- 2. Adds kind and soft-delete columns (kind, deleted_at)
-- 3. Adds stable track_key and unique constraint to public.playlist_tracks
-- 4. Adds auth_user_id (UUID references auth.users) beside existing user_id
-- 5. Backfills placeholder :new_auth_uid for existing user 'nabeeyl'
-- 6. Configures strict RLS for authenticated users only, revoking anon access
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXPAND: public.user_playlists
-- ------------------------------------------------------------------------------
-- Add metadata columns that were previously missing and causing inserts to fail
ALTER TABLE public.user_playlists 
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Mixed',
  ADD COLUMN IF NOT EXISTS curator TEXT DEFAULT 'You',
  ADD COLUMN IF NOT EXISTS curator_avatar TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS badge TEXT DEFAULT 'CUSTOM',
  ADD COLUMN IF NOT EXISTS badge_variant TEXT DEFAULT 'purple',
  ADD COLUMN IF NOT EXISTS fidelity TEXT DEFAULT 'Personal Playlist • Hi-Res Lossless',
  ADD COLUMN IF NOT EXISTS spec TEXT DEFAULT '24-Bit • 192kHz',
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'user' 
    CHECK (kind IN ('user', 'mix', 'cloud_archive')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Classification of existing rows based on id prefix
UPDATE public.user_playlists
SET kind = 'cloud_archive'
WHERE id = 'cloud-archive-playlist' AND kind != 'cloud_archive';

UPDATE public.user_playlists
SET kind = 'mix'
WHERE id LIKE 'mix-%' AND kind != 'mix';

-- Partial unique index ensuring exactly 1 cloud-archive playlist per user (D4)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_playlists_cloud_archive_legacy
  ON public.user_playlists (user_id) 
  WHERE kind = 'cloud_archive';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_playlists_cloud_archive_auth
  ON public.user_playlists (auth_user_id) 
  WHERE kind = 'cloud_archive';

-- Performance index for active (non-deleted) playlists ordered by recency
CREATE INDEX IF NOT EXISTS idx_user_playlists_auth_active 
  ON public.user_playlists (auth_user_id, updated_at DESC) 
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. EXPAND: public.playlist_tracks
-- ------------------------------------------------------------------------------
-- Add stable track_key for deterministic upserts without wiping (D3, D4)
ALTER TABLE public.playlist_tracks
  ADD COLUMN IF NOT EXISTS track_key TEXT;

-- Backfill track_key from track_data or track_id
UPDATE public.playlist_tracks
SET track_key = COALESCE(
  track_data->>'id',
  track_data->>'audio_url',
  track_id
)
WHERE track_key IS NULL;

-- Alter track_key to NOT NULL after backfill
ALTER TABLE public.playlist_tracks
  ALTER COLUMN track_key SET NOT NULL;

-- Unique constraint enabling atomic upsert on (playlist_id, track_key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_playlist_tracks_key'
  ) THEN
    ALTER TABLE public.playlist_tracks 
      ADD CONSTRAINT uq_playlist_tracks_key UNIQUE (playlist_id, track_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position 
  ON public.playlist_tracks (playlist_id, position ASC);

-- ------------------------------------------------------------------------------
-- 3. EXPAND: liked_songs, recently_played, self_mixes
-- ------------------------------------------------------------------------------
ALTER TABLE public.liked_songs
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recently_played
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.self_mixes
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------------------
-- 4. BACKFILL PLACEHOLDER (Replace '00000000-0000-0000-0000-000000000000' with actual Auth UID)
-- ------------------------------------------------------------------------------
-- DO $$
-- DECLARE
--   target_auth_uid UUID := 'PASTE_YOUR_AUTH_USER_UUID_HERE'::uuid;
-- BEGIN
--   UPDATE public.user_playlists SET auth_user_id = target_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.liked_songs SET auth_user_id = target_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.recently_played SET auth_user_id = target_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.self_mixes SET auth_user_id = target_auth_uid WHERE owner = 'nabeeyl' AND auth_user_id IS NULL;
-- END $$;

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES (D5)
-- Strict authenticated-only policies with auth.uid() check
-- ------------------------------------------------------------------------------

-- Revoke anon access from all operational tables
REVOKE ALL ON public.user_playlists FROM anon;
REVOKE ALL ON public.playlist_tracks FROM anon;
REVOKE ALL ON public.liked_songs FROM anon;
REVOKE ALL ON public.recently_played FROM anon;
REVOKE ALL ON public.self_mixes FROM anon;

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liked_songs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_played TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_mixes TO authenticated;

-- Enable RLS
ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_played ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_mixes ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies if they exist
DROP POLICY IF EXISTS "Allow all on user_playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Allow all on playlist_tracks" ON public.playlist_tracks;
DROP POLICY IF EXISTS "Allow all on liked_songs" ON public.liked_songs;
DROP POLICY IF EXISTS "Allow all on recently_played" ON public.recently_played;
DROP POLICY IF EXISTS "Allow all on self_mixes" ON public.self_mixes;

-- user_playlists: Owner access via auth_user_id OR legacy user_id match
DROP POLICY IF EXISTS "user_playlists_authenticated_policy" ON public.user_playlists;
CREATE POLICY "user_playlists_authenticated_policy" ON public.user_playlists
  FOR ALL
  TO authenticated
  USING (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  )
  WITH CHECK (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  );

-- playlist_tracks: Permitted if user owns the parent playlist
DROP POLICY IF EXISTS "playlist_tracks_authenticated_policy" ON public.playlist_tracks;
CREATE POLICY "playlist_tracks_authenticated_policy" ON public.playlist_tracks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND ((p.auth_user_id = auth.uid()) OR (p.user_id = auth.uid()::text))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND ((p.auth_user_id = auth.uid()) OR (p.user_id = auth.uid()::text))
    )
  );

-- liked_songs: Owner access
DROP POLICY IF EXISTS "liked_songs_authenticated_policy" ON public.liked_songs;
CREATE POLICY "liked_songs_authenticated_policy" ON public.liked_songs
  FOR ALL
  TO authenticated
  USING (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  )
  WITH CHECK (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  );

-- recently_played: Owner access
DROP POLICY IF EXISTS "recently_played_authenticated_policy" ON public.recently_played;
CREATE POLICY "recently_played_authenticated_policy" ON public.recently_played
  FOR ALL
  TO authenticated
  USING (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  )
  WITH CHECK (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (user_id = auth.uid()::text)
  );

-- self_mixes: Owner access
DROP POLICY IF EXISTS "self_mixes_authenticated_policy" ON public.self_mixes;
CREATE POLICY "self_mixes_authenticated_policy" ON public.self_mixes
  FOR ALL
  TO authenticated
  USING (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (owner = auth.uid()::text)
  )
  WITH CHECK (
    (auth_user_id IS NOT NULL AND auth_user_id = auth.uid()) OR
    (owner = auth.uid()::text)
  );

COMMIT;

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERIES (Run these after migration)
-- ------------------------------------------------------------------------------
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name IN ('user_playlists', 'playlist_tracks')
-- ORDER BY table_name, ordinal_position;

-- SELECT schemaname, tablename, policyname, roles, cmd 
-- FROM pg_policies 
-- WHERE schemaname = 'public';

