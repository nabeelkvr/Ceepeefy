"use client";

import React, { useState, useEffect } from "react";
import { useMusic } from "../context/MusicContext";

export default function SettingsModal() {
  const {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    settings,
    updateSetting,
    isAutoplayEnabled,
    setIsAutoplayEnabled,
    currentDevice,
    setIsDeviceModalOpen,
  } = useMusic();

  const [activeTab, setActiveTab] = useState("audio");
  const [cacheCleared, setCacheCleared] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isSettingsModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsSettingsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsModalOpen, setIsSettingsModalOpen]);

  if (!isSettingsModalOpen) return null;

  const qualityOptions = [
    {
      id: "lossless",
      label: "Lossless Studio Master",
      spec: "24-Bit / 192kHz FLAC",
      badge: "Hi-Res",
      desc: "Uncompressed bit-perfect audiophile stream directly from master tapes.",
    },
    {
      id: "high",
      label: "High Quality",
      spec: "320 kbps AAC",
      badge: "Pro",
      desc: "Crisp highs and punchy bass with low latency.",
    },
    {
      id: "normal",
      label: "Normal / Balanced",
      spec: "160 kbps AAC",
      badge: "Standard",
      desc: "Great fidelity with modest network bandwidth consumption.",
    },
    {
      id: "saver",
      label: "Data Saver",
      spec: "96 kbps Opus",
      badge: "Eco",
      desc: "Optimized for mobile cellular data and weak connections.",
    },
  ];

  const handleClearCache = () => {
    try {
      // Clear non-essential cached media items in localStorage
      const keysToKeep = ["ceepeefy_user", "ceepeefy_settings", "nocturne_liked_songs", "nocturne_custom_playlists"];
      Object.keys(localStorage).forEach((key) => {
        if (!keysToKeep.includes(key) && key.startsWith("ceepeefy_cache_")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {}
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0c1424]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Subtle ambient blur glow */}
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-container-lowest/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[22px]">settings</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Settings
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 border border-primary/20 text-primary">
                  Studio v2.4
                </span>
              </h2>
              <p className="text-xs text-outline">
                Configure audiophile streaming, playback transitions, and interface
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(false)}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Category Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-white/5 bg-surface-container/40 overflow-x-auto scrollbar-none flex-shrink-0">
          {[
            { id: "audio", label: "Audio & Hi-Fi", icon: "graphic_eq" },
            { id: "playback", label: "Playback", icon: "tune" },
            { id: "appearance", label: "Appearance", icon: "palette" },
            { id: "storage", label: "Storage", icon: "database" },
            { id: "about", label: "About", icon: "info" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)]"
                    : "text-outline hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: AUDIO & HI-FI */}
          {activeTab === "audio" && (
            <div className="space-y-6">
              {/* Streaming Quality Selector */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">
                      Streaming Audio Quality
                    </h4>
                    <p className="text-xs text-outline">
                      Select playback bitrate and encoding fidelity
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    Active: {settings.audioQuality?.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {qualityOptions.map((opt) => {
                    const isSelected = settings.audioQuality === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => updateSetting("audioQuality", opt.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-primary/15 border-primary shadow-[0_0_18px_rgba(76,215,246,0.2)]"
                            : "bg-surface-container/60 border-white/5 hover:bg-surface-container hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{opt.label}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected
                                ? "bg-primary text-surface-container-lowest font-bold"
                                : "bg-white/10 text-outline"
                            }`}
                          >
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-outline leading-tight">{opt.desc}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <span className="text-[10px] font-mono text-primary font-medium">
                            {opt.spec}
                          </span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-primary text-[16px]">
                              check_circle
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hardware & Equalization Toggles */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  Studio Sound Processing
                </h4>

                {/* Normalize volume */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                  <div className="flex flex-col gap-0.5 max-w-[80%]">
                    <span className="text-xs font-semibold text-white">
                      Volume Normalization
                    </span>
                    <span className="text-[11px] text-outline">
                      Maintains uniform loudness (-14 LUFS) to prevent abrupt volume shifts between tracks.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("normalizeVolume", !settings.normalizeVolume)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.normalizeVolume ? "bg-primary" : "bg-surface-container-high"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.normalizeVolume ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Spatial Audio */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                  <div className="flex flex-col gap-0.5 max-w-[80%]">
                    <span className="text-xs font-semibold text-white">
                      3D Spatial Audio & Holographic Soundstage
                    </span>
                    <span className="text-[11px] text-outline">
                      Simulates acoustic depth and panoramic multichannel surround separation.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("spatialAudio", !settings.spatialAudio)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.spatialAudio ? "bg-primary" : "bg-surface-container-high"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.spatialAudio ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Bit-Perfect DAC */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                  <div className="flex flex-col gap-0.5 max-w-[80%]">
                    <span className="text-xs font-semibold text-white">
                      Bit-Perfect Direct Output (Exclusive Mode)
                    </span>
                    <span className="text-[11px] text-outline">
                      Bypasses OS audio mixing drivers for pure analog conversion.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("bitPerfect", !settings.bitPerfect)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.bitPerfect ? "bg-primary" : "bg-surface-container-high"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.bitPerfect ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Audio Output Device Link */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-[22px]">
                      speaker_group
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-white">
                        Connected Audio Output Device
                      </span>
                      <span className="text-[11px] text-outline">{currentDevice}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsModalOpen(false);
                      setIsDeviceModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-white/10 text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer"
                  >
                    Change Device
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLAYBACK */}
          {activeTab === "playback" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white tracking-tight">
                Playback Experience
              </h4>

              {/* Autoplay Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">
                    Autoplay Similar Tracks
                  </span>
                  <span className="text-[11px] text-outline">
                    Keep the music going — automatically queues similar songs when your track or playlist finishes.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAutoplayEnabled(!isAutoplayEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isAutoplayEnabled ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      isAutoplayEnabled ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Crossfade duration */}
              <div className="p-3.5 rounded-xl bg-surface-container/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white">
                      Track Crossfade
                    </span>
                    <span className="text-[11px] text-outline">
                      Crossfades the audio between songs for continuous mix flow.
                    </span>
                  </div>
                  <span className="text-xs font-mono text-primary font-bold">
                    {settings.crossfade === 0 ? "Off" : `${settings.crossfade}s`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {[0, 2, 4, 6, 8, 12].map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      onClick={() => updateSetting("crossfade", secs)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                        settings.crossfade === secs
                          ? "bg-primary text-surface-container-lowest shadow-[0_0_10px_rgba(76,215,246,0.3)]"
                          : "bg-surface-container hover:bg-white/10 text-outline hover:text-white border border-white/5"
                      }`}
                    >
                      {secs === 0 ? "Off" : `${secs}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gapless Playback */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">
                    Gapless Playback
                  </span>
                  <span className="text-[11px] text-outline">
                    Removes silent pauses between sequential tracks on continuous live sets and concept albums.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("gapless", !settings.gapless)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.gapless ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.gapless ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* AI Automix */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">
                    Harmonic Beat-matched Automix
                  </span>
                  <span className="text-[11px] text-outline">
                    Smart BPM and key matching when shifting from track to track in DJ mixes.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("automix", !settings.automix)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.automix ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.automix ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === "appearance" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white tracking-tight">
                Atmosphere & Display
              </h4>

              {/* Theme Accent Glow */}
              <div className="p-3.5 rounded-xl bg-surface-container/60 border border-white/5 space-y-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-white">
                    Studio Accent Glow Color
                  </span>
                  <span className="text-[11px] text-outline">
                    Pick your preferred studio neon illumination
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { id: "cyan", label: "Cyan Nocturne", color: "#4cd7f6" },
                    { id: "purple", label: "Cyber Violet", color: "#c4abff" },
                    { id: "emerald", label: "Emerald Pulse", color: "#4edea3" },
                  ].map((thm) => {
                    const isSelected = settings.themeAccent === thm.id;
                    return (
                      <button
                        key={thm.id}
                        type="button"
                        onClick={() => updateSetting("themeAccent", thm.id)}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-white/10 border-primary shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                            : "bg-surface-container/50 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shadow-sm flex-shrink-0"
                          style={{ backgroundColor: thm.color }}
                        />
                        <span className="text-xs font-medium text-white truncate">
                          {thm.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ambient Glow */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">
                    Atmospheric Album Art Glow
                  </span>
                  <span className="text-[11px] text-outline">
                    Projects blurred dynamic color glows based on the current album artwork.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("ambientGlow", !settings.ambientGlow)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.ambientGlow ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.ambientGlow ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Dynamic Live Lyrics */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/60 border border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">
                    Synchronized Lyrics Glow & Highlighting
                  </span>
                  <span className="text-[11px] text-outline">
                    Highlights karaoke lines with smooth active line auto-scrolling.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("showLiveLyrics", !settings.showLiveLyrics)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.showLiveLyrics ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.showLiveLyrics ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: STORAGE & CACHE */}
          {activeTab === "storage" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white tracking-tight">
                Storage & Local Audio Cache
              </h4>

              <div className="p-4 rounded-xl bg-surface-container/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      database
                    </span>
                    <span className="text-xs font-semibold text-white">Audio Stream Cache</span>
                  </div>
                  <span className="text-xs font-mono text-outline">~48.2 MB Used</span>
                </div>

                <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full w-[24%]" />
                </div>

                <p className="text-[11px] text-outline leading-relaxed">
                  Cached chunks accelerate track preloading and eliminate stutter during slow network conditions.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-red-500/15 hover:text-red-300 text-xs font-semibold text-white border border-white/10 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                    Clear Stream Cache
                  </button>
                  {cacheCleared && (
                    <span className="text-xs text-primary font-medium mt-2 flex items-center gap-1 animate-in fade-in">
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      Cache purged successfully!
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ABOUT & SHORTCUTS */}
          {activeTab === "about" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface-container/60 border border-white/5 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-cyan-500 to-secondary-container flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.45)]">
                  <span className="material-symbols-outlined text-surface-container-lowest text-[26px] font-bold">
                    graphic_eq
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Ceepeefy Studio Edition
                  </h3>
                  <p className="text-xs text-outline">
                    Version 2.4.0 (Studio Mode) • Nocturne Core Audio Engine
                  </p>
                  <p className="text-[11px] text-primary mt-0.5">
                    Lossless bit-perfect architecture • HTML5 WebAudio
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5">
                  Studio Keyboard Shortcuts
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-surface-container/50 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Search</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-surface-container-highest text-white rounded">
                      ⌘K / Ctrl+K
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container/50 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Play / Pause</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-surface-container-highest text-white rounded">
                      Space
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container/50 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Mute Toggle</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-surface-container-highest text-white rounded">
                      M
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container/50 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Close Modals</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-surface-container-highest text-white rounded">
                      Esc
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-surface-container-lowest/80 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-outline">
            All settings are saved automatically to local storage.
          </span>
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_12px_rgba(76,215,246,0.3)] hover:brightness-110 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
