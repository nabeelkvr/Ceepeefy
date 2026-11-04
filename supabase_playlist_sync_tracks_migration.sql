-- ==============================================================================
-- CEEPEEFY: PERMANENT LEGACY TRACK MIGRATION & OWNERSHIP BACKFILL
-- Scope: ALL normal custom playlists in Ceepeefy (kind = 'user' / non-mix / non-archive)
-- Legacy Owner: nabeeyl -> Supabase Auth: nabeelek3603@gmail.com
-- ==============================================================================
-- IMPORTANT EXECUTION RESTRICTIONS:
-- 1. DO NOT EXECUTE AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- 2. Preserves user_playlists.tracks JSONB column intact (does NOT nullify or drop).
-- 3. Preserves all existing playlists and Self Mix / Cloud Archive records untouched.
-- 4. Safe insert-only conflict handling: does NOT overwrite existing normalized rows.
-- 5. Preserves original track identifiers in track_id while generating safe track_key.
-- 6. Preserves existing legacy user_id ('nabeeyl') without converting it to UUID.
-- 7. Restricts ownership backfill to user_id = 'nabeeyl' or verified auth UUID.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: RESOLVE AUTH UUID & BACKFILL PLAYLIST OWNERSHIP
-- Strict ownership backfill: only backfills records whose existing user_id is
-- 'nabeeyl' or the verified auth UUID. Never claims unrelated unassigned playlists.
-- Preserves existing user_id value ('nabeeyl') for backward query compatibility.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_uid UUID;
BEGIN
  SELECT id INTO v_auth_uid
  FROM auth.users
  WHERE lower(email) = 'nabeelek3603@gmail.com'
  LIMIT 1;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth user nabeelek3603@gmail.com not found in auth.users. Cannot proceed with ownership backfill.';
  END IF;

  RAISE NOTICE 'Found Supabase Auth UUID % for nabeelek3603@gmail.com', v_auth_uid;

  -- Backfill auth_user_id on normal custom playlists owned by legacy user 'nabeeyl'
  -- Excludes Self Mixes (kind = 'mix') and Cloud Archive (kind = 'cloud_archive')
  -- Strictly restricted to user_id = 'nabeeyl' OR user_id = v_auth_uid::text
  -- Preserves existing user_id ('nabeeyl') untouched
  UPDATE public.user_playlists
  SET 
    auth_user_id = v_auth_uid,
    updated_at = timezone('utc'::text, now())
  WHERE (user_id = 'nabeeyl' OR user_id = v_auth_uid::text)
    AND auth_user_id IS NULL
    AND (kind IS NULL OR kind = 'user')
    AND id NOT LIKE 'mix-%'
    AND id != 'cloud-archive-playlist';

  RAISE NOTICE 'Successfully updated auth ownership for legacy custom playlists to % while preserving user_id.', v_auth_uid;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: ENSURE TABLE COLUMNS & UUID-GENERATING DEFAULT IN public.playlist_tracks
-- ------------------------------------------------------------------------------
ALTER TABLE public.playlist_tracks
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
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

-- Verify that playlist_tracks.id has a UUID-generating default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'playlist_tracks' 
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.playlist_tracks ALTER COLUMN id SET DEFAULT gen_random_uuid();
    RAISE NOTICE 'Verified public.playlist_tracks.id has UUID-generating default gen_random_uuid().';
  END IF;
END $$;

-- Non-destructive backfill of track_key on any pre-existing rows in playlist_tracks
UPDATE public.playlist_tracks
SET track_key = COALESCE(
  NULLIF(track_data->>'track_key', ''),
  NULLIF(track_data->>'id', ''),
  NULLIF(track_data->>'audio_url', ''),
  NULLIF(track_id, ''),
  id::text
)
WHERE track_key IS NULL OR track_key = '';

-- ------------------------------------------------------------------------------
-- STEP 3: CHECK DUPLICATES & VERIFY EXISTING UNIQUE INDEX
-- Verifies the existing unique index rather than attempting to blindly recreate it
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count INTEGER;
  v_index_exists BOOLEAN;
  r RECORD;
BEGIN
  -- 1. Check for existing duplicate (playlist_id, track_key) across the entire table
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT playlist_id, track_key
    FROM public.playlist_tracks
    GROUP BY playlist_id, track_key
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    FOR r IN (
      SELECT playlist_id, track_key, COUNT(*) AS count
      FROM public.playlist_tracks
      GROUP BY playlist_id, track_key
      HAVING COUNT(*) > 1
    ) LOOP
      RAISE WARNING 'Duplicate found in playlist_tracks before migration: playlist_id=%, track_key=%, count=%',
        r.playlist_id, r.track_key, r.count;
    END LOOP;
    RAISE EXCEPTION 'Detected % duplicate (playlist_id, track_key) entries in playlist_tracks! Resolve before verifying unique index.', v_dup_count;
  END IF;

  RAISE NOTICE 'Zero duplicates in playlist_tracks.';

  -- 2. Verify existing unique index / constraint uq_playlist_tracks_key
  SELECT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'playlist_tracks' 
      AND indexname = 'uq_playlist_tracks_key'
  ) OR EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.playlist_tracks'::regclass 
      AND conname = 'uq_playlist_tracks_key'
  ) INTO v_index_exists;

  IF v_index_exists THEN
    RAISE NOTICE 'Verified: Unique index/constraint uq_playlist_tracks_key exists on public.playlist_tracks (playlist_id, track_key).';
  ELSE
    RAISE NOTICE 'Unique index uq_playlist_tracks_key not found; creating unique index on public.playlist_tracks (playlist_id, track_key)...';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_tracks_key ON public.playlist_tracks (playlist_id, track_key)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
  ON public.playlist_tracks (playlist_id, position ASC);

-- ------------------------------------------------------------------------------
-- STEP 4: REPORT EXISTING CONFLICTING RECORDS (FOR INSPECTION)
-- Reports existing normalized rows matching incoming tracks without overwriting them
-- Uses safe CASE expression inside jsonb_array_elements for non-array JSONB safety
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_existing_conflicts INTEGER := 0;
BEGIN
  FOR r IN (
    SELECT 
      pt.playlist_id,
      pt.track_key,
      pt.track_id AS existing_track_id,
      pt.title AS existing_title,
      pt.position AS existing_position
    FROM public.playlist_tracks pt
    JOIN (
      SELECT 
        p.id AS playlist_id,
        CASE 
          WHEN ROW_NUMBER() OVER (
            PARTITION BY p.id, 
            COALESCE(NULLIF(elem->>'track_key', ''), NULLIF(elem->>'id', ''), NULLIF(elem->>'track_id', ''), NULLIF(elem->>'spotifyId', ''), 'track_' || (ord - 1)::text) 
            ORDER BY (ord - 1)::integer
          ) = 1 
          THEN COALESCE(NULLIF(elem->>'track_key', ''), NULLIF(elem->>'id', ''), NULLIF(elem->>'track_id', ''), NULLIF(elem->>'spotifyId', ''), 'track_' || (ord - 1)::text)
          ELSE COALESCE(NULLIF(elem->>'track_key', ''), NULLIF(elem->>'id', ''), NULLIF(elem->>'track_id', ''), NULLIF(elem->>'spotifyId', ''), 'track_' || (ord - 1)::text) || '__pos_' || (ord - 1)::text
        END AS incoming_track_key
      FROM public.user_playlists p,
           jsonb_array_elements(
             CASE 
               WHEN jsonb_typeof(p.tracks) = 'array' THEN p.tracks 
               ELSE '[]'::jsonb 
             END
           ) WITH ORDINALITY AS t(elem, ord)
      WHERE jsonb_typeof(p.tracks) = 'array'
        AND jsonb_array_length(p.tracks) > 0
        AND (p.kind IS NULL OR p.kind = 'user')
        AND p.id NOT LIKE 'mix-%'
        AND p.id != 'cloud-archive-playlist'
    ) incoming ON pt.playlist_id = incoming.playlist_id AND pt.track_key = incoming.incoming_track_key
  ) LOOP
    v_existing_conflicts := v_existing_conflicts + 1;
    RAISE NOTICE 'Existing normalized record preserved (not overwritten): playlist_id=%, track_key=%, track_id=%, title=%, position=%',
      r.playlist_id, r.track_key, r.existing_track_id, r.existing_title, r.existing_position;
  END LOOP;

  IF v_existing_conflicts > 0 THEN
    RAISE NOTICE 'Total existing records found and preserved: %', v_existing_conflicts;
  ELSE
    RAISE NOTICE 'Zero existing conflicts. All incoming tracks will be cleanly inserted.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 5: MIGRATE ALL TRACKS SAFELY (INSERT-ONLY CONFLICT HANDLING)
-- Preserves original music track identifier in track_id
-- Uses separate deterministic track_key for per-occurrence uniqueness
-- Uses ON CONFLICT DO NOTHING to protect existing normalized data
-- Uses safe CASE expression inside jsonb_array_elements for non-array JSONB safety
-- ------------------------------------------------------------------------------
WITH raw_tracks AS (
  SELECT 
    p.id AS playlist_id,
    (ord - 1)::integer AS track_position,
    elem AS track_obj,
    -- Original music track identifier (preserved as track_id)
    COALESCE(
      NULLIF(elem->>'id', ''),
      NULLIF(elem->>'track_id', ''),
      NULLIF(elem->>'spotifyId', ''),
      'track_' || (ord - 1)::text
    ) AS original_track_id,
    -- Base key for occurrence derivation
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
       jsonb_array_elements(
         CASE 
           WHEN jsonb_typeof(p.tracks) = 'array' THEN p.tracks 
           ELSE '[]'::jsonb 
         END
       ) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(p.tracks) = 'array'
    AND jsonb_array_length(p.tracks) > 0
    AND (p.kind IS NULL OR p.kind = 'user')
    AND p.id NOT LIKE 'mix-%'
    AND p.id != 'cloud-archive-playlist'
),
ranked_tracks AS (
  SELECT 
    playlist_id,
    track_position,
    track_obj,
    original_track_id,
    base_key,
    -- Occurrence differentiator in track_key only: original_track_id is never changed
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
  original_track_id AS track_id,
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
ON CONFLICT (playlist_id, track_key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- STEP 6: FINAL MIGRATION SUMMARY & VALIDATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_migrated_count INTEGER;
  v_total_custom_playlists INTEGER;
BEGIN
  SELECT COUNT(DISTINCT playlist_id), COUNT(*) 
  INTO v_total_custom_playlists, v_migrated_count
  FROM public.playlist_tracks;

  RAISE NOTICE 'Migration Complete: % total normalized tracks across % playlists in playlist_tracks.',
    v_migrated_count, v_total_custom_playlists;
END $$;

COMMIT;
