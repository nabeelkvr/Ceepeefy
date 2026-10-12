# Supabase Setup Guide for Ceepeefy Cloud Self Mix

Follow these 5 simple steps to enable cross-device cloud audio uploads and playback for your account (`nabeeyl`).

---

## 1. Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in with GitHub.
2. Click **"New project"**.
3. Set:
   - **Name**: `ceepeefy-cloud`
   - **Database Password**: (choose any secure password)
   - **Region**: Choose the region closest to you.
   - **Pricing Plan**: **Free** ($0/month — includes 1 GB storage & 500 MB database).
4. Click **"Create new project"** (takes ~1 minute to spin up).

---

## 2. Create the Database Tables

1. In your Supabase dashboard, click **SQL Editor** from the left navigation.
2. Click **"New query"**, paste the complete SQL script below, and click **"Run"** (Ctrl+Enter):

```sql
-- ============================================================================
-- 1. SELF MIXES (Cloud Audio Storage & Playback)
-- ============================================================================
create table if not exists public.self_mixes (
  id text primary key,
  title text not null,
  audio_url text not null,
  owner text not null default 'nabeeyl',
  duration integer default 180,
  duration_formatted text default '3:00',
  file_name text,
  file_size bigint,
  cover_url text,
  created_at timestamptz default now()
);

alter table public.self_mixes enable row level security;
create policy "Allow all on self_mixes" on public.self_mixes for all using (true) with check (true);

-- ============================================================================
-- 2. USER PLAYLISTS (Imported & Custom Playlists with full tracks JSONB)
-- ============================================================================
create table if not exists public.user_playlists (
  id text primary key,
  user_id text not null default 'nabeeyl',
  title text not null,
  description text default '',
  cover_url text,
  curator text default 'You',
  curator_avatar text default '',
  badge text default 'CUSTOM',
  badge_variant text default 'purple',
  fidelity text default 'Personal Playlist • Hi-Res Lossless',
  spec text default '24-Bit • 192kHz',
  tracks jsonb default '[]'::jsonb,
  source text default 'custom',
  source_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist for existing tables
alter table public.user_playlists add column if not exists tracks jsonb default '[]'::jsonb;
alter table public.user_playlists add column if not exists source text default 'custom';
alter table public.user_playlists add column if not exists source_meta jsonb;

alter table public.user_playlists enable row level security;
create policy "Allow all on user_playlists" on public.user_playlists for all using (true) with check (true);

-- ============================================================================
-- 3. PLAYLIST TRACKS (Relational track store for playlists)
-- ============================================================================
create table if not exists public.playlist_tracks (
  playlist_id text not null,
  track_id text not null,
  position integer default 0,
  track_data jsonb not null,
  added_at timestamptz default now(),
  primary key (playlist_id, track_id)
);

alter table public.playlist_tracks enable row level security;
create policy "Allow all on playlist_tracks" on public.playlist_tracks for all using (true) with check (true);

-- ============================================================================
-- 4. USER ACCOUNT DATA (Full cross-device sync for playlists, mixes & likes)
-- ============================================================================
create table if not exists public.user_account_data (
  user_id text primary key,
  account_data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.user_account_data enable row level security;
create policy "Allow all on user_account_data" on public.user_account_data for all using (true) with check (true);

-- ============================================================================
-- 5. LIKED SONGS & RECENTLY PLAYED
-- ============================================================================
create table if not exists public.liked_songs (
  user_id text not null default 'nabeeyl',
  track_id text not null,
  track_data jsonb not null,
  created_at timestamptz default now(),
  primary key (user_id, track_id)
);

alter table public.liked_songs enable row level security;
create policy "Allow all on liked_songs" on public.liked_songs for all using (true) with check (true);

create table if not exists public.recently_played (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'nabeeyl',
  track_id text not null,
  track_data jsonb not null,
  played_at timestamptz default now()
);

alter table public.recently_played enable row level security;
create policy "Allow all on recently_played" on public.recently_played for all using (true) with check (true);
```

---

## 3. Create the Storage Bucket (`self-mixes`)
1. Click **Storage** from the left navigation menu.
2. Click **"New bucket"**.
3. Set the configuration:
   - **Bucket name**: `self-mixes` *(exact name)*
   - **Public bucket**: **Toggle ON** (Must be public so audio files can stream on your web player)
4. Click **"Save"**.
5. *(Optional configuration)*: Under Bucket Policies, you can add an upload policy:
   - Click the 3 dots next to `self-mixes` -> **Policies** -> **New policy** -> **For full customization**:
     - Name: `Allow public audio uploads and downloads`
     - Allowed operations: Check `SELECT`, `INSERT`, `DELETE`
     - Target roles: `anon`, `authenticated`
     - Click **Review** and **Save Policy**.

---

## 4. Get Your Project API Credentials
1. Go to **Project Settings** (gear icon at the bottom of the left sidebar).
2. Click **API** under Configuration.
3. Copy the following two values:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **Project API Keys**: Copy the **`anon` `public`** key (starts with `eyJ...`)

---

## 5. Add Keys to Your Project & Vercel

### For Local Development:
Add these to your `.env.local` file in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### For Vercel Production:
1. Go to your [Vercel Dashboard](https://vercel.com).
2. Select your `Music_Player` (Ceepeefy) project.
3. Navigate to **Settings** -> **Environment Variables**.
4. Add:
   - **Key**: `NEXT_PUBLIC_SUPABASE_URL` -> **Value**: `https://your-project-id.supabase.co`
   - **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> **Value**: `eyJ...`
5. Click **Save** and trigger a **Redeploy** (or push to main).

---

## Done!
Once added, any `.mp3` or `.wav` file you upload into **New Self Mix** will automatically upload directly to the Supabase Cloud Storage bucket and be saved under your `nabeeyl` account. When you open your Vercel URL on another device, all your tracks will load and play instantly!
