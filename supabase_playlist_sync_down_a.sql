-- ==============================================================================
-- CEEPEEFY: MIGRATION DOWN_A (ROLLBACK ADDITIVE COLUMNS & INDEXES)
-- Reverts changes made in up_a.sql.
--
-- CAUTION / DATA LOSS WARNING:
-- Running this script DROPS columns (category, tracks, source, source_meta,
-- kind, deleted_at, auth_user_id, track_key). Any data populated in these
-- columns after application deployment will be IRREVERSIBLY DESTROYED.
--
-- RECOMMENDED OPERATIONAL PRACTICE:
-- If rolling back after application deployment, prefer rolling back the
-- application code while RETAINING this additive schema. Only run DOWN_A
-- if completely tearing down the environment or aborting migration before deployment.
-- ==============================================================================

BEGIN;

-- Drop standalone indexes (including unique index uq_playlist_tracks_key)
DROP INDEX IF EXISTS public.uq_playlist_tracks_key;
DROP INDEX IF EXISTS public.idx_playlist_tracks_key;
DROP INDEX IF EXISTS public.idx_playlist_tracks_position;
DROP INDEX IF EXISTS public.idx_user_playlists_cloud_archive;
DROP INDEX IF EXISTS public.idx_user_playlists_auth_active;
DROP INDEX IF EXISTS public.idx_liked_songs_auth_user;
DROP INDEX IF EXISTS public.idx_recently_played_auth_user;
DROP INDEX IF EXISTS public.idx_self_mixes_auth_user;

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

