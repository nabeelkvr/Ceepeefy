import React from "react";
import { Play, Heart, Music } from "lucide-react";
import { useMusic } from "../context/MusicContext";
import SongOptionsMenu from "./SongOptionsMenu";

export default function SongRow({ song, index, tracklist }) {
  const {
    currentSong,
    isPlaying,
    playSong,
    togglePlay,
    toggleLike,
    isLiked,
    formatTime,
  } = useMusic();

  const isCurrent = currentSong?.id === song.id;
  const isPlayingThis = isCurrent && isPlaying;
  const liked = isLiked(song.id);

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playSong(song, tracklist);
    }
  };

  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center justify-between gap-3 px-3 md:px-4 py-2.5 sm:py-3 rounded-xl hover:bg-white/10 cursor-pointer transition-colors text-sm ${
        isCurrent ? "bg-white/10" : ""
      }`}
    >
      {/* Left: Thumbnail & Info */}
      <div className="flex items-center gap-3 md:gap-3.5 min-w-0 flex-1">
        {/* Thumbnail (Larger square with rounded corners) */}
        <div className="w-12 h-12 sm:w-[50px] sm:h-[50px] rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800 relative shadow-sm">
          <img
            src={song.coverUrl || song.image || song.thumbnail}
            alt={song.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {isPlayingThis ? (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="flex items-end gap-[2px] h-4">
                <span className="w-1 bg-spotify-green animate-bounce rounded-full h-full" style={{ animationDelay: "0ms" }}></span>
                <span className="w-1 bg-spotify-green animate-bounce rounded-full h-3/4" style={{ animationDelay: "150ms" }}></span>
                <span className="w-1 bg-spotify-green animate-bounce rounded-full h-1/2" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Play className="w-5 h-5 fill-white text-white" />
            </div>
          )}
        </div>

        {/* Info (Title on line 1, Artist on line 2) */}
        <div className="min-w-0 flex-1 truncate pr-2">
          <p className={`font-semibold truncate text-[14px] sm:text-[15px] leading-snug ${isCurrent ? "text-spotify-green" : "text-white group-hover:text-spotify-green"}`}>
            {song.title}
          </p>
          <p className="text-xs sm:text-[13px] text-neutral-400 truncate leading-tight group-hover:text-neutral-300 transition-colors">
            {song.artist}
          </p>
        </div>
      </div>

      {/* Right: Like & Three-dot menu */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(song);
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer hover:bg-white/10 active:scale-95 ${
            liked ? "text-spotify-green" : "text-neutral-400 hover:text-white"
          }`}
          title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-spotify-green" : ""}`} />
        </button>

        <SongOptionsMenu
          track={song}
          iconName="more_horiz"
          buttonClassName="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          iconClassName="text-[20px]"
        />
      </div>
    </div>
  );
}
