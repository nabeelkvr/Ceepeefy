-- ==============================================================================
-- CEEPEEFY: MIGRATION DOWN_A (ROLLBACK ADDITIVE COLUMNS & INDEXES)
-- Reverts changes made in up_a.sql.
-- ==============================================================================

BEGIN;

-- Drop constraints & indexes
ALTER TABLE public.playlist_tracks DROP CONSTRAINT IF EXISTS uq_playlist_tracks_key;
DROP INDEX IF EXISTS idx_playlist_tracks_position;
DROP INDEX IF EXISTS idx_user_playlists_cloud_archive;
DROP INDEX IF EXISTS idx_user_playlists_auth_active;
DROP INDEX IF EXISTS idx_liked_songs_auth_user;
DROP INDEX IF EXISTS idx_recently_played_auth_user;
DROP INDEX IF EXISTS idx_self_mixes_auth_user;

-- Drop newly added columns
ALTER TABLE public.user_playlists
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS tracks,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS source_meta,
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS auth_user_id;

ALTER TABLE public.playlist_tracks
  DROP COLUMN IF EXISTS track_key;

ALTER TABLE public.liked_songs
  DROP COLUMN IF EXISTS auth_user_id;

ALTER TABLE public.recently_played
  DROP COLUMN IF EXISTS auth_user_id;

ALTER TABLE public.self_mixes
  DROP COLUMN IF EXISTS auth_user_id;

COMMIT;
