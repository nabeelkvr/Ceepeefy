import React from "react";
import { Play, Heart, Plus, Music } from "lucide-react";
import { useMusic } from "../context/MusicContext";
import DownloadButton from "./DownloadButton";

export default function SongRow({ song, index, tracklist }) {
  const {
    currentSong,
    isPlaying,
    playSong,
    togglePlay,
    toggleLike,
    isLiked,
    addToQueue,
    formatTime
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
      className={`group flex items-center justify-between px-3 md:px-4 py-2.5 rounded-md hover:bg-white/10 cursor-pointer transition-colors text-sm ${isCurrent ? "bg-white/10" : ""
        }`}
    >
      {/* Left: Index / Play Icon + Cover + Title & Artist */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        {/* Index or Play button indicator */}
        <div className="w-5 text-center flex-shrink-0 flex items-center justify-center">
          {isPlayingThis ? (
            <div className="flex items-end gap-[2px] h-3.5">
              <span className="w-1 bg-spotify-green animate-bounce rounded-full h-full" style={{ animationDelay: "0ms" }}></span>
              <span className="w-1 bg-spotify-green animate-bounce rounded-full h-3/4" style={{ animationDelay: "150ms" }}></span>
              <span className="w-1 bg-spotify-green animate-bounce rounded-full h-1/2" style={{ animationDelay: "300ms" }}></span>
            </div>
          ) : (
            <>
              <span className={`text-xs font-mono group-hover:hidden ${isCurrent ? "text-spotify-green font-bold" : "text-neutral-400"}`}>
                {index !== undefined ? index + 1 : <Music className="w-3.5 h-3.5" />}
              </span>
              <button
                className="hidden group-hover:flex text-white items-center justify-center"
                aria-label="Play song"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail */}
        <img
          src={song.coverUrl}
          alt={song.title}
          className="w-10 h-10 rounded object-cover flex-shrink-0 shadow-sm"
          loading="lazy"
        />

        {/* Info */}
        <div className="min-w-0 flex-1 truncate pr-2">
          <p className={`font-medium truncate text-sm ${isCurrent ? "text-spotify-green" : "text-white"}`}>
            {song.title}
          </p>
          <p className="text-xs text-neutral-400 truncate group-hover:text-white transition-colors">
            {song.artist}
          </p>
        </div>
      </div>


      {/* Right: Actions & Duration */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Download Button */}
        <DownloadButton
          track={song}
          buttonSize="p-1"
          iconSize="text-[16px]"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />

        {/* Add to Queue Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            addToQueue(song);
          }}
          className="p-1 text-neutral-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add to queue"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(song);
          }}
          className={`p-1 transition-transform active:scale-125 ${liked ? "text-spotify-green opacity-100" : "text-neutral-400 hover:text-white opacity-0 group-hover:opacity-100"
            }`}
          title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-spotify-green" : ""}`} />
        </button>

        {/* Duration */}
        <span className="text-xs text-neutral-400 font-mono w-10 text-right">
          {song.durationFormatted || formatTime(song.duration)}
        </span>
      </div>
    </div>
  );
}
