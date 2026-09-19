"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";

export default function LyricsModal() {
  const { isLyricsOpen, setIsLyricsOpen, currentTrack } = useMusic();

  if (!isLyricsOpen || !currentTrack) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-surface-container-low/95 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-container shadow-md">
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
                {currentTrack.title}
              </h3>
              <span className="text-xs text-on-surface-variant">
                {currentTrack.artist} • {currentTrack.album}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsLyricsOpen(false)}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Lyrics Body */}
        <div className="flex-1 overflow-y-auto py-6 pr-2">
          <pre className="font-sans text-sm md:text-base leading-relaxed text-slate-200 whitespace-pre-wrap selection:bg-primary selection:text-black">
            {currentTrack.lyrics || "Instrumental track — No vocal lyrics recorded for this session."}
          </pre>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-outline font-mono">
          <span>Lossless Stream • Hi-Res 192kHz</span>
          <span>Nocturne Audio Studio</span>
        </div>
      </div>
    </div>
  );
}
