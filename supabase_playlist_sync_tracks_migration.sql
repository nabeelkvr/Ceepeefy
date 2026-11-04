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
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: RESOLVE AUTH UUID & BACKFILL PLAYLIST OWNERSHIP
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

  -- Backfill auth_user_id on ALL normal custom playlists owned by legacy user 'nabeeyl'
  -- Excludes Self Mixes (kind = 'mix') and Cloud Archive (kind = 'cloud_archive')
  UPDATE public.user_playlists
  SET 
    auth_user_id = v_auth_uid,
    user_id = v_auth_uid::text,
    updated_at = timezone('utc'::text, now())
  WHERE (user_id = 'nabeeyl' OR user_id = v_auth_uid::text OR auth_user_id IS NULL)
    AND auth_user_id IS NULL
    AND (kind IS NULL OR kind = 'user')
    AND id NOT LIKE 'mix-%'
    AND id != 'cloud-archive-playlist';

  -- Normalize user_id to UUID on any custom playlists that already had auth_user_id set
  UPDATE public.user_playlists
  SET 
    user_id = v_auth_uid::text,
    updated_at = timezone('utc'::text, now())
  WHERE auth_user_id = v_auth_uid
    AND user_id = 'nabeeyl'
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
-- STEP 3: CHECK DUPLICATES & CREATE UNIQUE INDEX BEFORE ANY INSERT WITH ON CONFLICT
-- Guarantees the unique index exists before INSERT ON CONFLICT (Issue 1)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count INTEGER;
  r RECORD;
BEGIN
  -- Check for existing duplicate (playlist_id, track_key) across the entire table
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
    RAISE EXCEPTION 'Detected % duplicate (playlist_id, track_key) entries in playlist_tracks! Resolve before creating unique index.', v_dup_count;
  END IF;

  RAISE NOTICE 'Zero duplicates in playlist_tracks. Safe to verify/create unique index.';
END $$;

-- Create unique index on (playlist_id, track_key) so ON CONFLICT can safely target it
CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_tracks_key
  ON public.playlist_tracks (playlist_id, track_key);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
  ON public.playlist_tracks (playlist_id, position ASC);

-- ------------------------------------------------------------------------------
-- STEP 4: REPORT EXISTING CONFLICTING RECORDS (FOR INSPECTION)
-- Reports existing normalized rows matching incoming tracks without overwriting them (Issue 3)
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
           jsonb_array_elements(p.tracks) WITH ORDINALITY AS t(elem, ord)
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
-- Preserves original music track identifier in track_id (Issue 2)
-- Uses separate deterministic track_key for per-occurrence uniqueness (Issue 2)
-- Uses ON CONFLICT DO NOTHING to protect existing normalized data (Issue 3)
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
       jsonb_array_elements(p.tracks) WITH ORDINALITY AS t(elem, ord)
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
