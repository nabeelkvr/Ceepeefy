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
    user,
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
      label: "Studio Master",
      spec: "24-Bit / 192kHz FLAC",
      desc: "Pure lossless studio tape master fidelity",
      icon: "graphic_eq",
    },
    {
      id: "high",
      label: "Hi-Fi Pro",
      spec: "320 kbps AAC",
      desc: "Crisp highs and deep dynamic response",
      icon: "headphones",
    },
    {
      id: "normal",
      label: "Balanced",
      spec: "160 kbps AAC",
      desc: "Great clarity optimized for fast loading",
      icon: "speed",
    },
  ];

  const themeOptions = [
    { id: "cyan", label: "Cyan Nocturne", color: "#4cd7f6", glow: "rgba(76,215,246,0.3)" },
    { id: "purple", label: "Cyber Violet", color: "#c4abff", glow: "rgba(196,171,255,0.3)" },
    { id: "emerald", label: "Emerald Pulse", color: "#4edea3", glow: "rgba(78,222,163,0.3)" },
    { id: "amber", label: "Sunset Gold", color: "#f59e0b", glow: "rgba(245,158,11,0.3)" },
  ];

  const handleClearCache = () => {
    try {
      const keysToKeep = [
        "ceepeefy_user",
        "ceepeefy_settings",
        "nocturne_liked_songs",
        "nocturne_custom_playlists",
      ];
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-fade-in"
      onClick={() => setIsSettingsModalOpen(false)}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] bg-[#090d16]/95 border border-white/10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dynamic Ambient Blur Glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-secondary/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/10 bg-surface-container-lowest/80 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_16px_rgba(76,215,246,0.25)]">
              <span className="material-symbols-outlined text-[22px]">settings</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Settings
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary font-bold">
                  Studio v2.4
                </span>
              </div>
              <p className="text-xs text-outline">
                Personalize your audio engine, appearance &amp; playback
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(false)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-outline hover:text-white transition-all cursor-pointer"
            title="Close Settings"
          >
            <span className="material-symbols-outlined text-[19px]">close</span>
          </button>
        </div>

        {/* User Profile Mini Banner */}
        <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-primary/10 via-surface-container/60 to-surface-container/30 border border-white/10 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-cyan-300 p-0.5 shadow-[0_0_12px_rgba(76,215,246,0.4)] flex-shrink-0">
              <div className="w-full h-full rounded-full bg-[#0c1424] flex items-center justify-center text-primary font-bold text-sm">
                {(user?.name || "N")[0].toUpperCase()}
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white truncate">
                  {user?.name || "Studio Master"}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  @{user?.username || "nabeeyl"}
                </span>
              </div>
              <span className="text-[11px] text-outline flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                Cloud Audio Sync Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline-block text-[11px] font-mono text-outline">
              Device: {currentDevice || "Default Audio"}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsSettingsModalOpen(false);
                setIsDeviceModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-xl bg-surface-container hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-white transition-all cursor-pointer"
            >
              Output
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-white/5 bg-transparent overflow-x-auto no-scrollbar flex-shrink-0 relative z-10">
          {[
            { id: "audio", label: "Audio & Hi-Fi", icon: "graphic_eq" },
            { id: "playback", label: "Playback", icon: "tune" },
            { id: "appearance", label: "Appearance", icon: "palette" },
            { id: "storage", label: "Storage & System", icon: "database" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-primary text-surface-container-lowest font-bold shadow-[0_0_16px_rgba(76,215,246,0.35)]"
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 relative z-10 no-scrollbar">
          {/* TAB 1: AUDIO & SOUND */}
          {activeTab === "audio" && (
            <div className="space-y-5 animate-fade-in">
              {/* Streaming Quality */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Streaming Fidelity
                    </h3>
                    <p className="text-[11px] text-outline">
                      Select audio decoding resolution for streaming playback
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40">
                    {settings.audioQuality?.toUpperCase() || "LOSSLESS"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {qualityOptions.map((opt) => {
                    const isSelected = settings.audioQuality === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => updateSetting("audioQuality", opt.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                          isSelected
                            ? "bg-primary/15 border-primary shadow-[0_0_20px_rgba(76,215,246,0.25)] ring-1 ring-primary/40"
                            : "bg-surface-container/50 border-white/5 hover:bg-surface-container/80 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-[18px]">
                              {opt.icon}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-primary text-[18px]">
                              check_circle
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-bold text-white">{opt.label}</div>
                          <div className="text-[10px] text-outline mt-0.5">{opt.desc}</div>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-primary font-bold">
                            {opt.spec}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sound Processing Switches */}
              <div className="space-y-3 pt-3 border-t border-white/5">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Studio Audio Enhancement
                </h3>

                {/* Volume Normalization */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                      <span className="material-symbols-outlined text-[18px]">equalizer</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">
                        Loudness Normalization
                      </span>
                      <span className="text-[11px] text-outline">
                        Standardizes volume levels across all tracks to avoid sudden loudness shifts
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("normalizeVolume", !settings.normalizeVolume)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                      <span className="material-symbols-outlined text-[18px]">surround_sound</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">
                        3D Spatial Soundstage
                      </span>
                      <span className="text-[11px] text-outline">
                        Expands stereo imaging for an acoustic panoramic listening experience
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("spatialAudio", !settings.spatialAudio)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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

                {/* Bit-Perfect DAC Mode */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                      <span className="material-symbols-outlined text-[18px]">album</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">
                        Bit-Perfect Direct Audio Stream
                      </span>
                      <span className="text-[11px] text-outline">
                        Bypasses OS sound resampling for unadulterated high-resolution DAC output
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("bitPerfect", !settings.bitPerfect)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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
              </div>
            </div>
          )}

          {/* TAB 2: PLAYBACK */}
          {activeTab === "playback" && (
            <div className="space-y-4 animate-fade-in">
              {/* Autoplay Similar Tracks */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5">
                <div className="flex items-center gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]">queue_music</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      Autoplay Similar Tracks
                    </span>
                    <span className="text-[11px] text-outline">
                      Continuously queues recommended songs when your current playlist ends
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAutoplayEnabled(!isAutoplayEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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

              {/* Crossfade Duration */}
              <div className="p-4 rounded-2xl bg-surface-container/50 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      linear_scale
                    </span>
                    <span className="text-xs font-bold text-white">Track Crossfade</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {settings.crossfade === 0 ? "Off" : `${settings.crossfade}s`}
                  </span>
                </div>
                <p className="text-[11px] text-outline">
                  Blends audio seamlessly between consecutive tracks for a continuous DJ-style transition
                </p>
                <div className="flex items-center gap-2 pt-1">
                  {[0, 2, 4, 6, 8, 12].map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      onClick={() => updateSetting("crossfade", secs)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                        settings.crossfade === secs
                          ? "bg-primary text-surface-container-lowest font-bold shadow-[0_0_12px_rgba(76,215,246,0.3)]"
                          : "bg-surface-container hover:bg-white/10 text-outline hover:text-white border border-white/5"
                      }`}
                    >
                      {secs === 0 ? "Off" : `${secs}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gapless Playback */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5">
                <div className="flex items-center gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]">motion_photos_on</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      Gapless Playback
                    </span>
                    <span className="text-[11px] text-outline">
                      Eliminates silent pauses between tracks on concept albums and live concerts
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("gapless", !settings.gapless)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === "appearance" && (
            <div className="space-y-4 animate-fade-in">
              {/* Neon Theme Selector */}
              <div className="p-4 rounded-2xl bg-surface-container/50 border border-white/5 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Studio Accent Illumination
                  </h3>
                  <p className="text-[11px] text-outline mt-0.5">
                    Customize your studio visual neon glow color
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {themeOptions.map((thm) => {
                    const isSelected = settings.themeAccent === thm.id;
                    return (
                      <button
                        key={thm.id}
                        type="button"
                        onClick={() => updateSetting("themeAccent", thm.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-white/10 border-primary shadow-[0_0_16px_rgba(76,215,246,0.3)]"
                            : "bg-surface-container/50 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full shadow-md"
                          style={{
                            backgroundColor: thm.color,
                            boxShadow: `0 0 10px ${thm.glow}`,
                          }}
                        />
                        <span className="text-xs font-semibold text-white truncate">
                          {thm.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Artwork Ambient Glow */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5">
                <div className="flex items-center gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]">flare</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      Atmospheric Album Glow
                    </span>
                    <span className="text-[11px] text-outline">
                      Projects dynamic ambient color lighting inspired by current track artwork
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("ambientGlow", !settings.ambientGlow)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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

              {/* Synchronized Live Lyrics */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container/50 border border-white/5">
                <div className="flex items-center gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <span className="material-symbols-outlined text-[18px]">lyrics</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      Synchronized Karaoke Lyrics
                    </span>
                    <span className="text-[11px] text-outline">
                      Live line-by-line glowing lyric auto-scrolling during song playback
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("showLiveLyrics", !settings.showLiveLyrics)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
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

          {/* TAB 4: STORAGE & SYSTEM */}
          {activeTab === "storage" && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-surface-container/50 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      database
                    </span>
                    <span className="text-xs font-bold text-white">Local Audio Stream Cache</span>
                  </div>
                  <span className="text-xs font-mono text-outline">~48.2 MB Used</span>
                </div>

                <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full w-[28%] rounded-full shadow-[0_0_8px_rgba(76,215,246,0.6)]" />
                </div>

                <p className="text-[11px] text-outline leading-relaxed">
                  Cached audio segments accelerate instant playback and avoid buffering during mobile and spotty connections.
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
                    <span className="text-xs text-primary font-medium mt-2 flex items-center gap-1 animate-fade-in">
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      Cache purged successfully!
                    </span>
                  )}
                </div>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="p-4 rounded-2xl bg-surface-container/50 border border-white/5 space-y-2.5">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Quick Shortcuts
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-surface-container/60 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Play / Pause</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-white/10 text-white rounded">
                      Space
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-container/60 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Search</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-white/10 text-white rounded">
                      ⌘K / Ctrl+K
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-container/60 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Mute</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-white/10 text-white rounded">
                      M
                    </kbd>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-container/60 border border-white/5 flex items-center justify-between">
                    <span className="text-outline">Close</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10px] bg-white/10 text-white rounded">
                      Esc
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-surface-container-lowest/80 flex items-center justify-between relative z-10">
          <span className="text-[11px] text-outline font-mono">
            Preferences auto-saved to device
          </span>
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(false)}
            className="px-5 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_14px_rgba(76,215,246,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
