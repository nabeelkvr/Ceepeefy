-- ==============================================================================
-- CEEPEEFY: MIGRATION UP_A (ADDITIVE ONLY)
-- Safe, idempotent schema expansion without breaking existing running clients.
-- Does NOT touch or restrict RLS policies.
-- Can be run immediately while the old or new app version is running.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXPAND: public.user_playlists
-- Add missing columns that caused code inserts to fail with 42703
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_playlists
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Mixed',
  ADD COLUMN IF NOT EXISTS tracks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS source_meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'user'
    CHECK (kind IN ('user', 'mix', 'cloud_archive')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Ensure default timestamp columns exist if not already present
ALTER TABLE public.user_playlists
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Classify existing rows
UPDATE public.user_playlists
SET kind = 'cloud_archive'
WHERE id = 'cloud-archive-playlist' AND kind != 'cloud_archive';

UPDATE public.user_playlists
SET kind = 'mix'
WHERE id LIKE 'mix-%' AND kind != 'mix';

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_playlists_cloud_archive
  ON public.user_playlists (auth_user_id)
  WHERE kind = 'cloud_archive';

CREATE INDEX IF NOT EXISTS idx_user_playlists_auth_active
  ON public.user_playlists (auth_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. EXPAND: public.playlist_tracks
-- Add deterministic track_key and unique constraint
-- ------------------------------------------------------------------------------
ALTER TABLE public.playlist_tracks
  ADD COLUMN IF NOT EXISTS track_key TEXT;

-- Backfill track_key from track_data JSONB snapshot or track_id
UPDATE public.playlist_tracks
SET track_key = COALESCE(
  track_data->>'track_key',
  track_data->>'id',
  track_data->>'audio_url',
  track_id
)
WHERE track_key IS NULL;

-- Set track_key NOT NULL after backfill
ALTER TABLE public.playlist_tracks
  ALTER COLUMN track_key SET NOT NULL;

-- Unique constraint on (playlist_id, track_key) for atomic upserting
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
-- Add auth_user_id referencing auth.users(id)
-- ------------------------------------------------------------------------------
ALTER TABLE public.liked_songs
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recently_played
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.self_mixes
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_liked_songs_auth_user ON public.liked_songs (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_recently_played_auth_user ON public.recently_played (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_self_mixes_auth_user ON public.self_mixes (auth_user_id);

-- ------------------------------------------------------------------------------
-- 4. BACKFILL DATA (Link existing 'nabeeyl' data to your new Supabase Auth UID)
-- Replace the placeholder UUID below with your actual User UID from the dashboard
-- ------------------------------------------------------------------------------
-- DO $$
-- DECLARE
--   v_auth_uid UUID := 'YOUR_AUTH_USER_UUID_HERE'::uuid;
-- BEGIN
--   UPDATE public.user_playlists SET auth_user_id = v_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.liked_songs SET auth_user_id = v_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.recently_played SET auth_user_id = v_auth_uid WHERE user_id = 'nabeeyl' AND auth_user_id IS NULL;
--   UPDATE public.self_mixes SET auth_user_id = v_auth_uid WHERE owner = 'nabeeyl' AND auth_user_id IS NULL;
-- END $$;

COMMIT;

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERY (Run to confirm columns added)
-- ------------------------------------------------------------------------------
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name IN ('user_playlists', 'playlist_tracks', 'liked_songs', 'recently_played', 'self_mixes')
-- ORDER BY table_name, ordinal_position;
