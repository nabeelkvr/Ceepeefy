import React from "react";
import { Play, Pause } from "lucide-react";
import { useMusic } from "../context/MusicContext";

export default function SongCard({ item, type = "song", onClick }) {
  const { currentSong, isPlaying, playSong, togglePlay, navigateToPlaylist } = useMusic();

  const isCurrentSong = type === "song" && currentSong?.id === item.id;
  const isCurrentlyPlaying = isCurrentSong && isPlaying;

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    if (type === "playlist") {
      navigateToPlaylist(item.id);
    } else {
      if (isCurrentSong) {
        togglePlay();
      } else {
        playSong(item);
      }
    }
  };

  const handlePlayButtonClick = (e) => {
    e.stopPropagation();
    if (type === "playlist") {
      navigateToPlaylist(item.id);
    } else {
      if (isCurrentSong) {
        togglePlay();
      } else {
        playSong(item);
      }
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-[#181818] hover:bg-[#282828] p-3.5 rounded-lg cursor-pointer transition-all duration-300 group flex flex-col relative select-none hover:shadow-xl hover:shadow-black/50"
    >
      {/* Artwork container */}
      <div className="relative aspect-square w-full rounded-md overflow-hidden mb-3 bg-[#242424] shadow-md">
        <img
          src={item.coverUrl}
          alt={item.title || item.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Floating green play button on hover */}
        <button
          onClick={handlePlayButtonClick}
          className={`absolute bottom-2 right-2 w-11 h-11 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black flex items-center justify-center shadow-xl shadow-black/60 transition-all duration-300 transform ${
            isCurrentlyPlaying
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-105"
          }`}
          aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
        >
          {isCurrentlyPlaying ? (
            <Pause className="w-5 h-5 fill-black" />
          ) : (
            <Play className="w-5 h-5 fill-black translate-x-0.5" />
          )}
        </button>
      </div>

      {/* Details */}
      <h3 className={`font-bold text-sm truncate mb-1 ${isCurrentSong ? "text-spotify-green" : "text-white"}`}>
        {item.title || item.name}
      </h3>
      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
        {item.artist || item.description || (type === "playlist" ? "Playlist" : "Single")}
      </p>
    </div>
  );
}
