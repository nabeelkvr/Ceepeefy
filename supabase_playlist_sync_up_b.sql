-- ==============================================================================
-- CEEPEEFY: MIGRATION UP_B (STRICT RLS & REVOKE ANON ACCESS)
-- Run ONLY AFTER the application code using Supabase Auth is deployed.
-- Closes all anon write/read access and enforces strict auth.uid() = auth_user_id.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. REVOKE ALL PRIVILEGES FROM ANON ROLE
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.user_playlists FROM anon;
REVOKE ALL ON public.playlist_tracks FROM anon;
REVOKE ALL ON public.liked_songs FROM anon;
REVOKE ALL ON public.recently_played FROM anon;
REVOKE ALL ON public.self_mixes FROM anon;

-- ------------------------------------------------------------------------------
-- 2. GRANT OPERATIONAL PRIVILEGES TO AUTHENTICATED USERS
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liked_songs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_played TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_mixes TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY (RLS) ON ALL 5 TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_played ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_mixes ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. DROP ALL OLD PERMISSIVE POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all on user_playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Allow all on playlist_tracks" ON public.playlist_tracks;
DROP POLICY IF EXISTS "Allow all on liked_songs" ON public.liked_songs;
DROP POLICY IF EXISTS "Allow all on recently_played" ON public.recently_played;
DROP POLICY IF EXISTS "Allow all on self_mixes" ON public.self_mixes;

DROP POLICY IF EXISTS "user_playlists_authenticated_policy" ON public.user_playlists;
DROP POLICY IF EXISTS "playlist_tracks_authenticated_policy" ON public.playlist_tracks;
DROP POLICY IF EXISTS "liked_songs_authenticated_policy" ON public.liked_songs;
DROP POLICY IF EXISTS "recently_played_authenticated_policy" ON public.recently_played;
DROP POLICY IF EXISTS "self_mixes_authenticated_policy" ON public.self_mixes;

-- ------------------------------------------------------------------------------
-- 5. CREATE STRICT AUTHENTICATED POLICIES (Using ONLY auth.uid() = auth_user_id)
-- ------------------------------------------------------------------------------

-- (a) user_playlists: Strict UUID owner check with WITH CHECK on mutations
CREATE POLICY "user_playlists_auth_policy" ON public.user_playlists
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- (b) playlist_tracks: Verified ownership through parent user_playlists record
CREATE POLICY "playlist_tracks_auth_policy" ON public.playlist_tracks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND p.auth_user_id = auth.uid()
    )
  );

-- (c) liked_songs: Strict UUID owner check
CREATE POLICY "liked_songs_auth_policy" ON public.liked_songs
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- (d) recently_played: Strict UUID owner check
CREATE POLICY "recently_played_auth_policy" ON public.recently_played
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- (e) self_mixes: Strict UUID owner check
CREATE POLICY "self_mixes_auth_policy" ON public.self_mixes
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

COMMIT;

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERY
-- ------------------------------------------------------------------------------
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public';

