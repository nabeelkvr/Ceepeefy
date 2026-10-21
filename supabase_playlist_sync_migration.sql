-- ==============================================================================
-- CEEPEEFY — PERMANENT CROSS-DEVICE PLAYLIST SYNCHRONIZATION MIGRATION
-- ==============================================================================
-- Idempotent, safe migration for Supabase PostgreSQL and Supabase Storage.
-- Preserves existing playlists and tables without data loss.
-- Can be executed directly in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Ensure user_playlists table exists with all required columns
CREATE TABLE IF NOT EXISTS public.user_playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    category TEXT DEFAULT 'Mixed',
    source TEXT DEFAULT 'custom',
    source_meta JSONB DEFAULT '{}'::jsonb,
    tracks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Safely add missing columns if user_playlists already existed from earlier schema
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Mixed';
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'custom';
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS source_meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS tracks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.user_playlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Indexes for lightning-fast user query retrieval
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_id ON public.user_playlists (user_id);
CREATE INDEX IF NOT EXISTS idx_user_playlists_updated_at ON public.user_playlists (updated_at DESC);

-- 2. Ensure playlist_tracks table exists with all required columns
CREATE TABLE IF NOT EXISTS public.playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES public.user_playlists(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    duration NUMERIC,
    duration_formatted TEXT,
    audio_url TEXT,
    cover_url TEXT,
    source TEXT DEFAULT 'jiosaavn',
    source_entry_id TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (playlist_id, track_id)
);

-- Safely add missing columns if playlist_tracks already existed
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled';
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS artist TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS album TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS duration NUMERIC;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS duration_formatted TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'jiosaavn';
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS source_entry_id TEXT;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Index for ordered playlist track retrieval (vital for 464+ song playlists)
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position ON public.playlist_tracks (playlist_id, position ASC);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Allow read access for application client
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_playlists' AND policyname = 'Allow public select on user_playlists'
    ) THEN
        CREATE POLICY "Allow public select on user_playlists"
            ON public.user_playlists FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_playlists' AND policyname = 'Allow public insert on user_playlists'
    ) THEN
        CREATE POLICY "Allow public insert on user_playlists"
            ON public.user_playlists FOR INSERT
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_playlists' AND policyname = 'Allow public update on user_playlists'
    ) THEN
        CREATE POLICY "Allow public update on user_playlists"
            ON public.user_playlists FOR UPDATE
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_playlists' AND policyname = 'Allow public delete on user_playlists'
    ) THEN
        CREATE POLICY "Allow public delete on user_playlists"
            ON public.user_playlists FOR DELETE
            USING (true);
    END IF;

    -- playlist_tracks policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'playlist_tracks' AND policyname = 'Allow public select on playlist_tracks'
    ) THEN
        CREATE POLICY "Allow public select on playlist_tracks"
            ON public.playlist_tracks FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'playlist_tracks' AND policyname = 'Allow public insert on playlist_tracks'
    ) THEN
        CREATE POLICY "Allow public insert on playlist_tracks"
            ON public.playlist_tracks FOR INSERT
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'playlist_tracks' AND policyname = 'Allow public update on playlist_tracks'
    ) THEN
        CREATE POLICY "Allow public update on playlist_tracks"
            ON public.playlist_tracks FOR UPDATE
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'playlist_tracks' AND policyname = 'Allow public delete on playlist_tracks'
    ) THEN
        CREATE POLICY "Allow public delete on playlist_tracks"
            ON public.playlist_tracks FOR DELETE
            USING (true);
    END IF;
END $$;

-- 4. Enable Supabase Realtime for instant cross-device updates
-- (Add user_playlists and playlist_tracks to supabase_realtime publication)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_playlists'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_playlists;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'playlist_tracks'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.playlist_tracks;
        END IF;
    END IF;
END $$;

-- 5. Supabase Storage Bucket Configuration
-- Ensure the 'self-mixes' bucket exists and is public for fast image streaming
INSERT INTO storage.buckets (id, name, public)
VALUES ('self-mixes', 'self-mixes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage object policies for 'self-mixes'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow public read on self-mixes'
    ) THEN
        CREATE POLICY "Allow public read on self-mixes"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'self-mixes');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow public upload on self-mixes'
    ) THEN
        CREATE POLICY "Allow public upload on self-mixes"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'self-mixes');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow public update on self-mixes'
    ) THEN
        CREATE POLICY "Allow public update on self-mixes"
            ON storage.objects FOR UPDATE
            USING (bucket_id = 'self-mixes')
            WITH CHECK (bucket_id = 'self-mixes');
    END IF;
END $$;

-- 6. User Account Data (Full central account snapshot for playlists, mixes & categories)
CREATE TABLE IF NOT EXISTS public.user_account_data (
    user_id TEXT PRIMARY KEY,
    account_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_account_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_account_data' AND policyname = 'Allow public select on user_account_data'
    ) THEN
        CREATE POLICY "Allow public select on user_account_data"
            ON public.user_account_data FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_account_data' AND policyname = 'Allow public insert on user_account_data'
    ) THEN
        CREATE POLICY "Allow public insert on user_account_data"
            ON public.user_account_data FOR INSERT
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_account_data' AND policyname = 'Allow public update on user_account_data'
    ) THEN
        CREATE POLICY "Allow public update on user_account_data"
            ON public.user_account_data FOR UPDATE
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_account_data' AND policyname = 'Allow public delete on user_account_data'
    ) THEN
        CREATE POLICY "Allow public delete on user_account_data"
            ON public.user_account_data FOR DELETE
            USING (true);
    END IF;
END $$;

