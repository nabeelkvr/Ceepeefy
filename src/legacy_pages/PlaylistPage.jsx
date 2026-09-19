import React from "react";
import { Play, Pause, Heart, Clock, Shuffle, Music, Sparkles } from "lucide-react";
import { useMusic } from "../context/MusicContext";
import { MOCK_SONGS, MOCK_PLAYLISTS } from "../data/mockData";
import SongRow from "../components/SongRow";

export default function PlaylistPage({ playlistId }) {
  const {
    playlists,
    likedSongIds,
    playSong,
    currentSong,
    isPlaying,
    togglePlay,
    isShuffle,
    toggleShuffle,
    formatTime
  } = useMusic();

  const isLikedView = playlistId === "liked";

  // Find playlist or create liked songs collection
  let playlistData = null;
  let songs = [];

  if (isLikedView) {
    songs = likedSongIds
      .map((id) => MOCK_SONGS.find((s) => s.id === id))
      .filter(Boolean);

    playlistData = {
      id: "liked",
      name: "Liked Songs",
      description: "All of your favorite tracks in one personal collection.",
      coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=80",
      gradient: "from-indigo-900 via-purple-950 to-black",
      isLikedCollection: true
    };
  } else {
    playlistData = playlists.find((p) => p.id === playlistId) || MOCK_PLAYLISTS[0];
    songs = playlistData.songIds
      ? playlistData.songIds.map((id) => MOCK_SONGS.find((s) => s.id === id)).filter(Boolean)
      : MOCK_SONGS.slice(0, 5);
  }

  // Calculate total playlist duration
  const totalDurationSecs = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutes = Math.floor(totalDurationSecs / 60);

  const isCurrentPlaylistPlaying =
    isPlaying && songs.some((s) => s.id === currentSong?.id);

  const handlePlayPlaylist = () => {
    if (songs.length === 0) return;
    if (isCurrentPlaylistPlaying) {
      togglePlay();
    } else {
      playSong(songs[0], songs);
    }
  };

  return (
    <div className="flex flex-col pb-12 select-none">
      {/* Header Banner with Rich Gradient */}
      <div
        className={`bg-gradient-to-b ${playlistData.gradient || "from-neutral-800 to-black"} p-6 md:p-8 -mx-4 md:-mx-8 -mt-6 rounded-b-2xl mb-6 shadow-2xl flex flex-col md:flex-row items-start md:items-end gap-6`}
      >
        {/* Playlist Cover Art */}
        <div className="w-44 h-44 md:w-52 md:h-52 rounded-lg overflow-hidden shadow-2xl flex-shrink-0 bg-neutral-900 group relative">
          <img
            src={playlistData.coverUrl}
            alt={playlistData.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Playlist Metadata */}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="text-xs uppercase font-extrabold tracking-wider text-white/80">
            {isLikedView ? "Collection" : "Playlist"}
          </span>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none drop-shadow-md truncate">
            {playlistData.name}
          </h1>

          <p className="text-xs sm:text-sm text-white/70 mt-1 line-clamp-2 max-w-2xl leading-relaxed">
            {playlistData.description}
          </p>

          <div className="flex items-center gap-2 text-xs text-white/90 font-medium mt-2">
            <span className="font-bold text-white">Music Player</span>
            <span>•</span>
            <span>{songs.length} {songs.length === 1 ? "song" : "songs"}</span>
            {totalMinutes > 0 && (
              <>
                <span>•</span>
                <span className="text-white/70">about {totalMinutes} min</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Controls Bar */}
      <div className="flex items-center gap-5 mb-6">
        <button
          onClick={handlePlayPlaylist}
          disabled={songs.length === 0}
          className="w-14 h-14 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black flex items-center justify-center shadow-xl shadow-spotify-green/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
          title={isCurrentPlaylistPlaying ? "Pause" : "Play Playlist"}
        >
          {isCurrentPlaylistPlaying ? (
            <Pause className="w-6 h-6 fill-black" />
          ) : (
            <Play className="w-6 h-6 fill-black translate-x-0.5" />
          )}
        </button>

        <button
          onClick={toggleShuffle}
          className={`p-2 transition-colors ${
            isShuffle ? "text-spotify-green" : "text-neutral-400 hover:text-white"
          }`}
          title="Shuffle Playlist"
        >
          <Shuffle className="w-6 h-6" />
        </button>
      </div>

      {/* Songs Table Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-[#242424] text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
        <div className="flex items-center gap-3 md:gap-4 flex-1">
          <span className="w-5 text-center">#</span>
          <span>Title</span>
        </div>
        <div className="flex items-center justify-end w-20">
          <Clock className="w-4 h-4" />
        </div>
      </div>

      {/* Songs List */}
      {songs.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {songs.map((song, idx) => (
            <SongRow
              key={song.id}
              song={song}
              index={idx}
              tracklist={songs}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-[#181818]/40 rounded-xl border border-white/5 my-4">
          <Music className="w-10 h-10 text-neutral-600" />
          <h3 className="text-base font-bold text-white">No songs in this collection yet</h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            Browse trending tracks or search for your favorite songs to add them to your collection.
          </p>
        </div>
      )}
    </div>
  );
}
