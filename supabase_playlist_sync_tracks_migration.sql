-- ==============================================================================
-- CEEPEEFY: PERMANENT LEGACY TRACK MIGRATION & OWNERSHIP BACKFILL
-- Scope: ALL normal custom playlists in Ceepeefy (kind = 'user' / non-mix / non-archive)
-- Legacy Owner: nabeeyl -> Supabase Auth: nabeelek3603@gmail.com
-- ==============================================================================
-- IMPORTANT EXECUTION RESTRICTIONS:
-- 1. DO NOT EXECUTE AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- 2. Preserves user_playlists.tracks JSONB column intact (does NOT nullify or drop).
-- 3. Preserves all existing playlists and Self Mix / Cloud Archive records untouched.
-- 4. Idempotent: safe to run multiple times without creating duplicate tracks.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: RESOLVE AUTH UUID & BACKFILL PLAYLIST OWNERSHIP
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_uid UUID;
BEGIN
  -- Retrieve the authoritative Supabase Auth UUID for nabeelek3603@gmail.com directly from auth.users
  SELECT id INTO v_auth_uid
  FROM auth.users
  WHERE lower(email) = 'nabeelek3603@gmail.com'
  LIMIT 1;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth user nabeelek3603@gmail.com not found in auth.users. Cannot proceed with ownership backfill.';
  END IF;

  RAISE NOTICE 'Found Supabase Auth UUID % for nabeelek3603@gmail.com', v_auth_uid;

  -- Backfill auth_user_id on ALL normal custom playlists owned by legacy user 'nabeeyl'
  -- Excludes Self Mixes (kind = 'mix') and Cloud Archive (kind = 'cloud_archive')
  UPDATE public.user_playlists
  SET 
    auth_user_id = v_auth_uid,
    updated_at = timezone('utc'::text, now())
  WHERE user_id = 'nabeeyl'
    AND auth_user_id IS NULL
    AND (kind IS NULL OR kind = 'user')
    AND id NOT LIKE 'mix-%'
    AND id != 'cloud-archive-playlist';

  RAISE NOTICE 'Successfully updated ownership for legacy custom playlists owned by nabeeyl to %', v_auth_uid;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: ENSURE TABLE COLUMNS EXIST IN public.playlist_tracks
-- ------------------------------------------------------------------------------
ALTER TABLE public.playlist_tracks
  ADD COLUMN IF NOT EXISTS track_key TEXT,
  ADD COLUMN IF NOT EXISTS track_data JSONB,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled Track',
  ADD COLUMN IF NOT EXISTS artist TEXT DEFAULT 'Unknown Artist',
  ADD COLUMN IF NOT EXISTS album TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_formatted TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- ------------------------------------------------------------------------------
-- STEP 3: MIGRATE ALL TRACKS FROM user_playlists.tracks JSONB INTO playlist_tracks
-- Preserves original ordering, metadata, URLs, and handles duplicate keys safely.
-- ------------------------------------------------------------------------------
WITH raw_tracks AS (
  SELECT 
    p.id AS playlist_id,
    (ord - 1)::integer AS track_position,
    elem AS track_obj,
    -- Extract base track key
    COALESCE(
      NULLIF(elem->>'track_key', ''),
      NULLIF(elem->>'id', ''),
      NULLIF(elem->>'track_id', ''),
      NULLIF(elem->>'spotifyId', ''),
      'track_' || (ord - 1)::text
    ) AS base_key,
    COALESCE(NULLIF(elem->>'title', ''), NULLIF(elem->>'name', ''), 'Untitled Track') AS track_title,
    COALESCE(NULLIF(elem->>'artist', ''), NULLIF(elem->>'subtitle', ''), NULLIF(elem->>'artistName', ''), 'Unknown Artist') AS track_artist,
    COALESCE(elem->>'album', elem->>'albumName', '') AS track_album,
    CASE 
      WHEN (elem->>'duration') ~ '^[0-9]+(\.[0-9]+)?$' THEN (elem->>'duration')::numeric 
      ELSE 0 
    END AS track_duration,
    elem->>'durationFormatted' AS track_duration_formatted,
    COALESCE(NULLIF(elem->>'audioUrl', ''), NULLIF(elem->>'audio_url', '')) AS track_audio_url,
    COALESCE(NULLIF(elem->>'coverUrl', ''), NULLIF(elem->>'cover_url', ''), NULLIF(elem->>'thumbnail', '')) AS track_cover_url,
    COALESCE(NULLIF(elem->>'source', ''), 'custom') AS track_source
  FROM public.user_playlists p,
       jsonb_array_elements(p.tracks) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(p.tracks) = 'array'
    AND jsonb_array_length(p.tracks) > 0
    AND (p.kind IS NULL OR p.kind = 'user')
    AND p.id NOT LIKE 'mix-%'
    AND p.id != 'cloud-archive-playlist'
),
ranked_tracks AS (
  -- Handle repeated track keys within the same playlist:
  -- 1st occurrence keeps base_key
  -- Subsequent occurrences append __pos_<position> to guarantee uniqueness without dropping songs
  SELECT 
    playlist_id,
    track_position,
    track_obj,
    base_key,
    CASE 
      WHEN ROW_NUMBER() OVER (PARTITION BY playlist_id, base_key ORDER BY track_position) = 1 
      THEN base_key
      ELSE base_key || '__pos_' || track_position::text
    END AS safe_track_key,
    track_title,
    track_artist,
    track_album,
    track_duration,
    track_duration_formatted,
    track_audio_url,
    track_cover_url,
    track_source
  FROM raw_tracks
)
INSERT INTO public.playlist_tracks (
  playlist_id,
  track_id,
  track_key,
  position,
  title,
  artist,
  album,
  duration,
  duration_formatted,
  audio_url,
  cover_url,
  source,
  track_data,
  created_at
)
SELECT 
  playlist_id,
  safe_track_key AS track_id,
  safe_track_key AS track_key,
  track_position AS position,
  track_title AS title,
  track_artist AS artist,
  track_album AS album,
  track_duration AS duration,
  track_duration_formatted AS duration_formatted,
  track_audio_url AS audio_url,
  track_cover_url AS cover_url,
  track_source AS source,
  track_obj AS track_data,
  timezone('utc'::text, now()) AS created_at
FROM ranked_tracks
ON CONFLICT (playlist_id, track_key) 
DO UPDATE SET
  position = EXCLUDED.position,
  title = EXCLUDED.title,
  artist = EXCLUDED.artist,
  album = EXCLUDED.album,
  duration = EXCLUDED.duration,
  duration_formatted = EXCLUDED.duration_formatted,
  audio_url = EXCLUDED.audio_url,
  cover_url = EXCLUDED.cover_url,
  source = EXCLUDED.source,
  track_data = EXCLUDED.track_data;

-- ------------------------------------------------------------------------------
-- STEP 4: VERIFY NO DUPLICATE (playlist_id, track_key) GROUPS EXIST
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT playlist_id, track_key
    FROM public.playlist_tracks
    GROUP BY playlist_id, track_key
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Detected % duplicate (playlist_id, track_key) entries across playlists! Aborting before creating unique index.', v_dup_count;
  END IF;

  RAISE NOTICE 'Zero duplicates found in playlist_tracks across all migrated playlists.';
END $$;

-- ------------------------------------------------------------------------------
-- STEP 5: CREATE UNIQUE CONSTRAINT / INDEX FOR ATOMIC UPSERTS
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_tracks_key
  ON public.playlist_tracks (playlist_id, track_key);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
  ON public.playlist_tracks (playlist_id, position ASC);

COMMIT;

