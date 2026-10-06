"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import { Infinity as InfinityIcon } from "lucide-react";

export default function QueueDrawer() {
  const {
    isQueueOpen,
    setIsQueueOpen,
    currentTrack,
    queue = [],
    manualQueue = [],
    autoQueue = [],
    playFromQueue,
    clearQueue,
    removeFromQueue,
    formatTime,
    isAutoplayEnabled,
    isAutoplayLoading,
    toggleAutoplay,
  } = useMusic();

  // Lock body scroll on mobile while Queue Drawer is open to prevent background scroll chaining & accidental back navigation
  React.useEffect(() => {
    if (typeof window === "undefined" || !isQueueOpen) return;
    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;
    };
  }, [isQueueOpen]);

  if (!isQueueOpen) return null;

  const renderTrackItem = (track, displayIndex, isManual = false) => {
    return (
      <div
        key={`${track.id}-${displayIndex}-${isManual ? "m" : "a"}`}
        onClick={() => playFromQueue(track, displayIndex)}
        className="group flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container/70 transition-all cursor-pointer border border-transparent hover:border-white/5"
      >
        <span className="text-xs font-mono text-outline w-5 text-center flex-shrink-0">
          {displayIndex + 1}
        </span>
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high relative">
          <img
            src={track.coverUrl || track.thumbnail || track.image || "/icon-192.png"}
            alt={track.title}
            className="w-full h-full object-cover"
          />
          {track.isManual && (
            <span
              className="absolute bottom-0 right-0 w-2 h-2 rounded-tl bg-cyan-400"
              title="Manually queued"
            />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
            {track.title}
          </span>
          <span className="text-[11px] text-outline truncate">
            {track.artist}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {track.isManual && (
            <span
              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 select-none"
              title="Manually added to queue"
            >
              Manual
            </span>
          )}
          <span className="text-[11px] font-mono text-outline">
            {track.durationFormatted || formatTime(track.duration)}
          </span>
        </div>
        <button
          onClick={(e) => removeFromQueue(track.id, e)}
          className="opacity-0 group-hover:opacity-100 p-1 text-outline hover:text-red-400 rounded-md transition-all flex-shrink-0"
          title="Remove from queue"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={() => setIsQueueOpen(false)}
        className="md:hidden fixed inset-0 bg-black/75 backdrop-blur-md z-[75] transition-opacity touch-none overscroll-none"
      />
      {/* Compact Right-Side Panel: strictly 360px-400px wide, docked to the right edge */}
      <aside 
        onTouchMove={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-[80] w-full sm:w-[380px] md:static md:w-[380px] lg:w-[400px] flex-shrink-0 md:z-30 border-l border-white/10 bg-[#07131d]/98 backdrop-blur-2xl flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:pb-0 overscroll-contain touch-pan-y select-none"
        style={{ overscrollBehavior: "contain", overscrollBehaviorY: "contain" }}
      >
        {/* Header matching Image 1 */}
        <div className="h-16 px-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[24px]">
              playlist_play
            </span>
            <h2 className="font-extrabold text-white text-base tracking-tight">Play Queue</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={clearQueue}
              disabled={queue.length === 0}
              className="text-xs font-semibold text-outline hover:text-white disabled:opacity-40 disabled:hover:text-outline transition-colors px-2 py-1 rounded hover:bg-white/5 cursor-pointer disabled:cursor-not-allowed"
              title="Clear upcoming songs"
            >
              Clear
            </button>
            <button
              onClick={() => setIsQueueOpen(false)}
              className="p-1 rounded-lg text-outline hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Close queue"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div 
          onTouchMove={(e) => e.stopPropagation()}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: "contain", overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}
        >
          {/* NOW PLAYING card matching Image 1 */}
          {currentTrack && (
            <div className="flex flex-col gap-2 flex-shrink-0">
              <span className="text-[11px] uppercase tracking-wider text-outline font-bold">
                NOW PLAYING
              </span>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#091b29] border border-[#144759] shadow-[0_0_20px_rgba(76,215,246,0.15)]">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative bg-surface-container-high shadow-md">
                  <img
                    src={currentTrack.coverUrl || currentTrack.thumbnail || currentTrack.image || "/icon-192.png"}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-primary truncate leading-snug">
                    {currentTrack.title}
                  </span>
                  <span className="text-[11px] text-outline truncate mt-0.5">
                    {currentTrack.artist}
                  </span>
                </div>
                <div className="flex items-center text-xs font-mono text-outline/80 flex-shrink-0">
                  {formatTime(currentTrack.duration)}
                </div>
              </div>
            </div>
          )}

          {/* Empty Queue State */}
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-outline gap-2.5 flex-1">
              <InfinityIcon size={32} className="text-primary/70 animate-pulse" />
              <p className="text-xs text-white/90 font-medium max-w-[220px] leading-relaxed">
                {isAutoplayEnabled
                  ? "Infinite Smart Queue active — similar tracks will play automatically."
                  : "Queue is empty. Select songs or click 'Add to Queue' to queue them."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 flex-1">
              {/* SECTION 1: MANUAL QUEUE (Always has highest priority) */}
              {manualQueue.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold">
                        MANUAL QUEUE ({manualQueue.length})
                      </span>
                      <span className="text-[10px] text-outline/70">Plays next</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {manualQueue.map((track, idx) => renderTrackItem(track, idx, true))}
                  </div>
                </div>
              )}

              {/* SECTION 2: AUTOMATIC QUEUE (Ranked via 6-tier priority algorithm) */}
              {autoQueue.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-outline font-bold">
                      {manualQueue.length > 0 ? `AUTOMATIC QUEUE (${autoQueue.length})` : `NEXT UP (${autoQueue.length})`}
                    </span>
                    <button
                      onClick={toggleAutoplay}
                      className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border transition-all duration-200 cursor-pointer ${
                        isAutoplayEnabled
                          ? "bg-[#092233] text-primary border-[#1a556d] shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                          : "bg-surface-container/60 text-outline hover:text-white border-white/10"
                      }`}
                      title="Toggle intelligent autoplay recommendations"
                    >
                      <InfinityIcon
                        size={14}
                        className={isAutoplayLoading ? "animate-pulse text-primary" : "text-primary"}
                      />
                      <span>Autoplay {isAutoplayEnabled ? "ON" : "OFF"}</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    {autoQueue.map((track, idx) =>
                      renderTrackItem(track, manualQueue.length + idx, false)
                    )}
                  </div>
                </div>
              )}

              {isAutoplayEnabled && (
                <div className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-surface-container/30 border border-dashed border-white/10 text-outline text-[11px] mt-2 select-none">
                  <InfinityIcon size={13} className="text-primary flex-shrink-0" />
                  <span>Autoplay is on. Similar songs will play next.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
