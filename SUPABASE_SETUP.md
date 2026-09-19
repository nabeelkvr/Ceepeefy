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

## 2. Create the Database Table (`self_mixes`)
1. In your Supabase dashboard, click **SQL Editor** from the left navigation.
2. Click **"New query"**, paste the SQL script below, and click **"Run"** (Ctrl+Enter):

```sql
-- Create the self_mixes table for cloud-stored audio tracks
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

-- Enable Row Level Security (RLS)
alter table public.self_mixes enable row level security;

-- Allow reading all public self mixes
create policy "Allow public read of self mixes"
  on public.self_mixes for select
  using (true);

-- Allow insert of self mixes
create policy "Allow insert of self mixes"
  on public.self_mixes for insert
  with check (true);

-- Allow delete of self mixes
create policy "Allow delete of self mixes"
  on public.self_mixes for delete
  using (true);
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
