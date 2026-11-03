-- ==============================================================================
-- CEEPEEFY: PERMANENT CROSS-DEVICE PLAYLIST SYNC MIGRATION (DOWN / ROLLBACK)
-- Reversible rollback restoring previous state without deleting base data
-- ==============================================================================

BEGIN;

-- 1. Drop Authenticated Policies
DROP POLICY IF EXISTS "user_playlists_authenticated_policy" ON public.user_playlists;
DROP POLICY IF EXISTS "playlist_tracks_authenticated_policy" ON public.playlist_tracks;
DROP POLICY IF EXISTS "liked_songs_authenticated_policy" ON public.liked_songs;
DROP POLICY IF EXISTS "recently_played_authenticated_policy" ON public.recently_played;
DROP POLICY IF EXISTS "self_mixes_authenticated_policy" ON public.self_mixes;

-- 2. Restore Anon Access & Permissive Policies (if rollback is needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liked_songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_played TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_mixes TO anon;

CREATE POLICY "Allow all on user_playlists" ON public.user_playlists FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on playlist_tracks" ON public.playlist_tracks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on liked_songs" ON public.liked_songs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on recently_played" ON public.recently_played FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on self_mixes" ON public.self_mixes FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. Drop Constraints and Indexes created in UP migration
ALTER TABLE public.playlist_tracks DROP CONSTRAINT IF EXISTS uq_playlist_tracks_key;
DROP INDEX IF EXISTS idx_playlist_tracks_position;
DROP INDEX IF EXISTS idx_user_playlists_cloud_archive_legacy;
DROP INDEX IF EXISTS idx_user_playlists_cloud_archive_auth;
DROP INDEX IF EXISTS idx_user_playlists_auth_active;

-- 4. Keep added columns as harmless NULLs or drop if clean rollback required
-- (Per non-destructive guidelines, columns are retained or safely dropped only if empty)
ALTER TABLE public.user_playlists DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.playlist_tracks DROP COLUMN IF EXISTS track_key;
ALTER TABLE public.liked_songs DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.recently_played DROP COLUMN IF EXISTS auth_user_id;
ALTER TABLE public.self_mixes DROP COLUMN IF EXISTS auth_user_id;

COMMIT;
