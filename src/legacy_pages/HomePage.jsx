import React from "react";
import { Play, Sparkles } from "lucide-react";
import { useMusic } from "../context/MusicContext";
import { MOCK_SONGS, MOCK_PLAYLISTS } from "../data/mockData";
import SongCard from "../components/SongCard";
import SongRow from "../components/SongRow";

export default function HomePage() {
  const { recentlyPlayed, playSong, navigateToPlaylist, currentSong, isPlaying } = useMusic();

  // Dynamic greeting based on current local hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Resolve recently played songs
  const recentSongs = recentlyPlayed
    .map((id) => MOCK_SONGS.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 6);

  const quickJumpItems = [
    {
      title: "Liked Songs",
      coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=200&auto=format&fit=crop&q=80",
      action: () => navigateToPlaylist("liked"),
      isPlaylist: false,
    },
    ...MOCK_PLAYLISTS.slice(0, 5).map((pl) => ({
      title: pl.name,
      coverUrl: pl.coverUrl,
      action: () => navigateToPlaylist(pl.id),
      isPlaylist: true,
      playlist: pl
    }))
  ];

  return (
    <div className="flex flex-col gap-8 pb-12 select-none">
      {/* Dynamic Header & Greeting */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {getGreeting()}
          </h1>
          <div className="hidden sm:flex items-center gap-2 text-xs text-spotify-green bg-spotify-green/10 px-3 py-1 rounded-full border border-spotify-green/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>High Quality Audio Engine</span>
          </div>
        </div>

        {/* Spotify Quick Access 6-Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickJumpItems.map((item, idx) => (
            <div
              key={idx}
              onClick={item.action}
              className="bg-[#242424]/70 hover:bg-[#303030] rounded-md overflow-hidden flex items-center gap-3 cursor-pointer group transition-all duration-200 shadow-md hover:shadow-lg relative"
            >
              <img
                src={item.coverUrl}
                alt={item.title}
                className="w-16 h-16 object-cover flex-shrink-0"
              />
              <span className="font-bold text-sm text-white truncate flex-1 pr-2">
                {item.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                }}
                className="w-10 h-10 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black flex items-center justify-center shadow-lg mr-3 opacity-0 group-hover:opacity-100 transition-all duration-200 transform group-hover:scale-105"
              >
                <Play className="w-4 h-4 fill-black translate-x-0.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Played / Recommended Tracks */}
      {recentSongs.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Recently Played</h2>
              <p className="text-xs text-neutral-400">Jump right back into your favorites</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recentSongs.map((song) => (
              <SongCard key={song.id} item={song} type="song" />
            ))}
          </div>
        </section>
      )}

      {/* Featured Playlists */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Featured Playlists</h2>
            <p className="text-xs text-neutral-400">Curated playlists for every mood and moment</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {MOCK_PLAYLISTS.map((pl) => (
            <SongCard key={pl.id} item={pl} type="playlist" />
          ))}
        </div>
      </section>

      {/* Today's Trending Songs Table */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Trending Right Now</h2>
            <p className="text-xs text-neutral-400">Top tracks across all genres</p>
          </div>
          <button
            onClick={() => playSong(MOCK_SONGS[0], MOCK_SONGS)}
            className="text-xs font-semibold text-spotify-green hover:underline"
          >
            Play All
          </button>
        </div>

        <div className="bg-[#181818]/40 rounded-xl p-2 md:p-3 border border-white/5 flex flex-col">
          {MOCK_SONGS.slice(0, 8).map((song, idx) => (
            <SongRow
              key={song.id}
              song={song}
              index={idx}
              tracklist={MOCK_SONGS}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
