"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import { Infinity as InfinityIcon } from "lucide-react";

export default function QueueDrawer() {
  const {
    isQueueOpen,
    setIsQueueOpen,
    currentTrack,
    queue,
    playTrack,
    setQueue,
    formatTime,
    isAutoplayEnabled,
    isAutoplayLoading,
    toggleAutoplay,
  } = useMusic();

  if (!isQueueOpen) return null;

  const removeFromQueue = (trackId, e) => {
    e.stopPropagation();
    setQueue((prev) => prev.filter((t) => t.id !== trackId));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return (
    <aside className="w-80 border-l border-white/5 bg-surface-container-lowest/90 backdrop-blur-2xl flex flex-col z-30 flex-shrink-0 animate-in slide-in-from-right duration-300 shadow-2xl">
      {/* Header */}
      <div className="h-16 px-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">
            queue_music
          </span>
          <h2 className="font-bold text-white text-sm">Play Queue</h2>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-[11px] text-outline hover:text-white px-2 py-0.5 rounded hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsQueueOpen(false)}
            className="p-1.5 rounded-lg text-outline hover:text-white hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Now Playing */}
        {currentTrack && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-outline font-bold">
              Now Playing
            </span>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 relative">
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-primary truncate">
                  {currentTrack.title}
                </span>
                <span className="text-[11px] text-outline truncate">
                  {currentTrack.artist}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-outline">
                  {formatTime(currentTrack.duration)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Up Next List */}
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-outline font-bold">
              Next Up ({queue.length})
            </span>
            <button
              onClick={toggleAutoplay}
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all duration-200 ${
                isAutoplayEnabled
                  ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                  : "bg-surface-container text-outline hover:text-white hover:border-white/10 border border-transparent"
              }`}
              title="Toggle infinite smart queue"
            >
              <InfinityIcon size={13} className={isAutoplayLoading ? "animate-pulse" : ""} />
              <span>Autoplay {isAutoplayEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-outline gap-2.5">
              <InfinityIcon size={32} className="text-primary/70 animate-pulse" />
              <p className="text-xs text-white/90 font-medium max-w-[200px] leading-relaxed">
                {isAutoplayEnabled
                  ? "Infinite Smart Queue active — similar tracks will play automatically."
                  : "Queue is empty. Select songs to enqueue them."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {queue.map((track, idx) => (
                <div
                  key={track.id + "-" + idx}
                  onClick={() => playTrack(track)}
                  className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container transition-all cursor-pointer border border-transparent hover:border-white/5"
                >
                  <span className="text-xs font-mono text-outline w-4 text-center">
                    {idx + 1}
                  </span>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                      {track.title}
                    </span>
                    <span className="text-[11px] text-outline truncate">
                      {track.artist}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-outline">
                    {track.durationFormatted}
                  </span>
                  <button
                    onClick={(e) => removeFromQueue(track.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-outline hover:text-error transition-all"
                    title="Remove from queue"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}

              {isAutoplayEnabled && (
                <div className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-surface-container/30 border border-dashed border-white/10 text-outline text-[11px] mt-2 select-none">
                  <InfinityIcon size={13} className="text-primary flex-shrink-0" />
                  <span>Autoplay is on. Similar songs will play next.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
