-- ==============================================================================
-- CEEPEEFY: MIGRATION DOWN_B (ROLLBACK STRICT RLS TO ANON ACCESS)
-- Reverts strict RLS policies from up_b.sql and re-enables anon access if needed.
-- ==============================================================================

BEGIN;

-- Drop strict authenticated policies
DROP POLICY IF EXISTS "user_playlists_auth_policy" ON public.user_playlists;
DROP POLICY IF EXISTS "playlist_tracks_auth_policy" ON public.playlist_tracks;
DROP POLICY IF EXISTS "liked_songs_auth_policy" ON public.liked_songs;
DROP POLICY IF EXISTS "recently_played_auth_policy" ON public.recently_played;
DROP POLICY IF EXISTS "self_mixes_auth_policy" ON public.self_mixes;

-- Re-grant access to anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liked_songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_played TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_mixes TO anon;

-- Recreate permissive open policies
CREATE POLICY "Allow all on user_playlists" ON public.user_playlists FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on playlist_tracks" ON public.playlist_tracks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on liked_songs" ON public.liked_songs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on recently_played" ON public.recently_played FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on self_mixes" ON public.self_mixes FOR ALL TO anon USING (true) WITH CHECK (true);

COMMIT;
