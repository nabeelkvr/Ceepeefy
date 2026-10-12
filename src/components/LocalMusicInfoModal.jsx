"use client";

import React from "react";

export default function LocalMusicInfoModal({
  isOpen,
  onClose,
  onTriggerImport,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#181818] border border-[#282828] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#282828] bg-surface-container-high/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">info</span>
            </div>
            <h2 className="text-sm font-bold text-white">Supported Formats &amp; Device Guide</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-outline hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs text-outline leading-relaxed max-h-[75vh] overflow-y-auto no-scrollbar">
          {/* Supported Audio Formats */}
          <div className="flex flex-col gap-2">
            <span className="font-bold text-white uppercase tracking-wider text-[10px]">
              Supported Audio Formats
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { format: "MP3", desc: "MPEG Audio" },
                { format: "M4A", desc: "Apple AAC" },
                { format: "FLAC", desc: "Hi-Res Lossless" },
                { format: "WAV", desc: "Uncompressed" },
                { format: "AAC", desc: "Advanced Audio" },
                { format: "OGG", desc: "Vorbis Audio" },
                { format: "OPUS", desc: "Interactive Audio" },
                { format: "WEBM", desc: "Web Audio" },
              ].map((item) => (
                <div
                  key={item.format}
                  className="p-2 rounded-xl bg-surface-container/60 border border-white/5 flex flex-col items-center text-center"
                >
                  <span className="font-mono font-bold text-primary text-[11px]">
                    {item.format}
                  </span>
                  <span className="text-[9px] text-outline truncate w-full">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile & PWA Device Import Guide */}
          <div className="p-3.5 rounded-2xl bg-surface-container-high/40 border border-white/10 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-white font-semibold">
              <span className="material-symbols-outlined text-primary text-[18px]">smartphone</span>
              <span>Importing on Mobile Devices (PWA)</span>
            </div>
            <p className="text-[11px] text-outline">
              On mobile operating systems (Android &amp; iOS), web applications run within a secure sandbox and cannot automatically scan arbitrary folders on your phone.
            </p>
            <div className="space-y-1.5 text-[11px] text-on-surface-variant pt-1">
              <div className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>Android:</strong> Tap &ldquo;Import Songs&rdquo; and select files from your <em>Downloads</em>, <em>Music</em>, or internal storage. You can select multiple songs at once.
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong>iPhone / iPad:</strong> Tap &ldquo;Import Songs&rdquo; and choose files from your <em>Files</em> app, iCloud Drive, or local storage.
                </span>
              </div>
            </div>
          </div>

          {/* 100% Offline & Private Guarantee */}
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2.5 text-[11px] text-emerald-200">
            <span className="material-symbols-outlined text-emerald-400 text-[18px] shrink-0 mt-0.5">
              lock
            </span>
            <div>
              <strong className="text-white">100% Offline &amp; Private:</strong> All imported songs are stored securely in your device&rsquo;s local IndexedDB storage. Your files are never uploaded to any remote server and can be played with zero data usage.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-surface-container-high/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onTriggerImport();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(76,215,246,0.35)] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            <span>Select Audio Files</span>
          </button>
        </div>
      </div>
    </div>
  );
}
