# Music Player 🎵

A clean, modern, personal-use web music player inspired by Spotify, built with **React**, **Vite**, and **Tailwind CSS**. Designed for desktop and mobile responsiveness, and ready to deploy to Vercel.

---

## ✨ Features

- **Spotify-Inspired Dark Interface**: Deep charcoal & black surfaces, neon green highlights, and sleek typography.
- **Persistent Bottom Music Player**:
  - Play, Pause, Next, Previous
  - Interactive Seek / Progress bar with formatted `mm:ss` timers
  - Volume control with click-to-mute
  - Shuffle and Repeat (off, all, one) modes
  - Up-Next Playback Queue drawer
  - Like / Favorite toggle (synced with Liked Songs)
- **Multi-Page Navigation**:
  - **Home**: Time-based greeting (morning/afternoon/evening), quick-access tiles, recently played tracks, featured playlists, and trending songs.
  - **Search**: Real-time filtering by song title, artist, album, or genre, Spotify-style "Top Result" card, and colorful genre browse cards.
  - **Your Library**: Playlists, saved songs count, view toggle (Grid / List), and search filter.
  - **Playlist Views**: Dynamic hero banners with gradients, track count, total duration, and songs table with play indicators.
  - **Liked Songs**: Dedicated playlist tracking your favorite songs with persistence in `localStorage`.
- **Mobile Responsive**: Collapses into a clean mobile layout with a slide-over navigation drawer, mobile bottom tab bar, and an expandable full-screen Now Playing modal.
- **Audio Playback Engine**: Real-time HTML5 audio playback with Web Audio fallback support.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have Node.js (v18 or higher) and npm installed.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

Open your browser at `http://localhost:5173` to experience the player!

### 3. Build for Production
```bash
npm run build
```

---

## 🌐 Deploy to Vercel

1. Push this project to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Music Player"
   git remote add origin https://github.com/<your-username>/music-player.git
   git push -u origin main
   ```
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Framework Preset will automatically detect **Vite**.
5. Click **Deploy**. Your Music Player will be live on the web in seconds!

---

## 📁 Project Structure

```
Music_Player/
├── public/
│   └── favicon.svg           # Music note application icon
├── src/
│   ├── components/
│   │   ├── MobileNav.jsx     # Bottom navigation tabs for mobile screens
│   │   ├── Navbar.jsx        # History buttons, profile pill, and search
│   │   ├── Player.jsx        # Persistent bottom music player & mobile player
│   │   ├── QueueDrawer.jsx   # Up-Next queue slide-over panel
│   │   ├── Sidebar.jsx       # Desktop navigation sidebar & playlists
│   │   ├── SongCard.jsx      # Grid card with hover play button
│   │   └── SongRow.jsx       # Track listing row with duration & like button
│   ├── context/
│   │   └── MusicContext.jsx  # Centralized playback and audio state
│   ├── data/
│   │   └── mockData.js       # Curated mock songs, playlists, and genres
│   ├── pages/
│   │   ├── HomePage.jsx      # Greeting, quick jump tiles, and featured mixes
│   │   ├── LibraryPage.jsx   # Playlists, liked collection, grid/list view
│   │   ├── PlaylistPage.jsx  # Playlist header, tracklist, and duration
│   │   └── SearchPage.jsx    # Real-time search, top result card, and genre tags
│   ├── App.jsx               # Layout shell & dynamic page routing
│   ├── index.css             # Tailwind CSS directives & custom sliders
│   └── main.jsx              # React DOM root mounting
├── index.html                # HTML entry point with Inter font & metadata
├── package.json              # Project dependencies and scripts
├── postcss.config.js         # PostCSS configuration
├── tailwind.config.js        # Spotify color palette & configuration
└── vite.config.js            # Vite configuration
```
