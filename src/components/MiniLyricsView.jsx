"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import { useSynchronizedLyrics } from "../hooks/useSynchronizedLyrics";

export default function MiniLyricsView() {
  const {
    currentTime,
    seekTo,
    syncedLyrics,
    isLoadingLyrics,
    setLyricsMode,
  } = useMusic();

  const {
    activeLineIndex,
    containerRef,
    lineRefs,
    handleUserScroll,
    handleLineClick,
  } = useSynchronizedLyrics(syncedLyrics, currentTime, seekTo);

  if (isLoadingLyrics) {
    return (
      <div className="relative w-full h-full flex-1 md:aspect-[4/3] md:max-h-48 rounded-2xl md:rounded-xl overflow-hidden bg-surface-container-highest/95 border border-white/10 p-4 flex flex-col items-center justify-center gap-2 shadow-inner">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-[11px] text-outline font-mono animate-pulse">
          Loading lyrics...
        </p>
      </div>
    );
  }

  if (!syncedLyrics || syncedLyrics.length === 0) {
    return (
      <div className="relative w-full h-full flex-1 md:aspect-[4/3] md:max-h-48 rounded-2xl md:rounded-xl overflow-hidden bg-surface-container-highest/95 border border-white/10 p-4 flex flex-col items-center justify-center text-center gap-1.5 shadow-inner">
        <span className="material-symbols-outlined text-[24px] text-outline">music_off</span>
        <p className="text-xs font-bold text-white">No Synced Lyrics</p>
        <p className="text-[10px] text-outline">Instrumental audio playback</p>
        <button
          onClick={() => setLyricsMode("hidden")}
          className="mt-1 px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-[10px] text-primary border border-white/10 transition-colors cursor-pointer"
        >
          View Artwork
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex-1 md:aspect-[4/3] md:max-h-48 rounded-2xl md:rounded-xl overflow-hidden bg-surface-container-lowest/90 backdrop-blur-md border border-white/15 shadow-inner group flex flex-col">
      {/* Top Tag */}
      <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-primary text-[8px] font-mono font-bold tracking-wider uppercase flex items-center gap-1 shadow-md pointer-events-none">
        <span className="material-symbols-outlined text-[10px] animate-pulse">graphic_eq</span>
        Live
      </div>

      {/* Synchronized Lyrics Container with Auto-Centering */}
      <div
        ref={containerRef}
        onScroll={handleUserScroll}
        className="h-full w-full flex-1 overflow-y-auto px-4 py-8 space-y-4 scroll-smooth no-scrollbar"
      >
        {syncedLyrics.map((line, idx) => {
          const isActive = idx === activeLineIndex;
          const isPassed = activeLineIndex >= 0 && idx < activeLineIndex;

          return (
            <div
              key={`${line.time}-${idx}`}
              ref={(el) => (lineRefs.current[idx] = el)}
              onClick={() => handleLineClick(line.time)}
              className={`cursor-pointer transition-all duration-300 origin-center text-center px-1 py-1 select-none ${isActive
                  ? "font-extrabold text-white scale-105 drop-shadow-[0_0_14px_rgba(76,215,246,0.6)] text-primary"
                  : isPassed
                    ? "font-medium text-white/40 hover:text-white/75"
                    : "font-medium text-white/25 hover:text-white/60"
                }`}
            >
              <p
                className={`leading-relaxed transition-colors ${isActive
                    ? "text-sm sm:text-base md:text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-primary"
                    : "text-xs sm:text-sm md:text-xs"
                  }`}
              >
                {line.text}
              </p>
            </div>
          );
        })}
        {/* Spacer for bottom centering */}
        <div className="h-28 md:h-16" />
      </div>
    </div>
  );
}
