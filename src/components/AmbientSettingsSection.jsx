"use client";

import React, { useRef, useState } from "react";
import { useMusic } from "../context/MusicContext";
import {
  BACKGROUND_PRESETS,
  INTENSITY_PRESETS,
  MANUAL_ACCENT_PALETTES,
  extractPaletteFromImage,
} from "../data/themeData";

export default function AmbientSettingsSection() {
  const { settings, updateSetting, updateSettings, resetAppearance } = useMusic();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [previewPreset, setPreviewPreset] = useState(null);

  const activeBgId = settings.backgroundId || "sunset-mountains";
  const activeIntensity = settings.intensityPreset || "cinematic";
  const accentMode = settings.accentMode || "auto";
  const isCustomActive = activeBgId === "custom" && Boolean(settings.customBackgroundUrl);

  const activePresetObj =
    BACKGROUND_PRESETS.find((p) => p.id === activeBgId) || BACKGROUND_PRESETS[0];

  const handleSelectPreset = (preset) => {
    setPreviewPreset(null);
    updateSettings({
      backgroundId: preset.id,
      customBackgroundUrl: null,
      accentMode: accentMode, // keep current accent mode
    });
  };

  const handleIntensityChange = (presetKey) => {
    const config = INTENSITY_PRESETS[presetKey];
    if (!config) return;
    updateSettings({
      intensityPreset: presetKey,
      bgOpacity: config.bgOpacity,
      overlayOpacity: config.overlayOpacity,
      ambientGlowIntensity: config.ambientGlowIntensity,
      bgBlur: config.bgBlur,
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setUploadError("Please upload a valid image (JPG, PNG, or WebP).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image size must be less than 10MB.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result;
        if (!dataUrl) {
          setIsUploading(false);
          return;
        }

        // Automatically extract adaptive color palette from uploaded image
        const extracted = await extractPaletteFromImage(dataUrl);

        updateSettings({
          backgroundId: "custom",
          customBackgroundUrl: dataUrl,
          customPalette: extracted,
        });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Failed to process background image.");
      setIsUploading(false);
    }
  };

  const handleRemoveCustom = () => {
    updateSettings({
      backgroundId: "sunset-mountains",
      customBackgroundUrl: null,
      customPalette: null,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in text-on-surface">
      {/* 1. Header & Quick Intensity Presets */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                wallpaper
              </span>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Ambient Background Studio
              </h3>
            </div>
            <p className="text-xs text-outline mt-0.5">
              Cinematic photographic wallpapers with dynamic adaptive lighting &amp; color harmony
            </p>
          </div>

          <button
            type="button"
            onClick={resetAppearance}
            className="self-start sm:self-auto text-[11px] font-semibold text-outline hover:text-white px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Reset background and colors to default"
          >
            <span className="material-symbols-outlined text-[15px]">restart_alt</span>
            <span>Reset Appearance</span>
          </button>
        </div>

        {/* 3 Intensity Presets: Chill, Cinematic, Immersive */}
        <div>
          <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-2">
            Atmospheric Intensity Presets
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {Object.values(INTENSITY_PRESETS).map((preset) => {
              const isSelected = activeIntensity === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleIntensityChange(preset.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${isSelected
                      ? "bg-primary/15 border-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.25)] ring-1 ring-primary/40"
                      : "bg-surface-container/50 border-white/5 hover:bg-surface-container hover:border-white/15"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{preset.label}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-primary text-[17px]">
                        check_circle
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-outline leading-tight">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Curated Background Gallery (10 Presets) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Curated Visual Library</span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-white/10 text-outline">
                10 Themes
              </span>
            </h4>
            <p className="text-[11px] text-outline mt-0.5">
              Select a dark cinematic landscape to illuminate your player
            </p>
          </div>
        </div>

        {/* Grid of 10 Thumbnails */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
          {BACKGROUND_PRESETS.map((preset) => {
            const isSelected = activeBgId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`group relative rounded-2xl overflow-hidden border cursor-pointer transition-all duration-300 flex flex-col ${isSelected
                    ? "border-primary shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.35)] ring-2 ring-primary/40 scale-[1.02]"
                    : "border-white/10 hover:border-white/30 hover:scale-[1.01]"
                  }`}
              >
                {/* Visual Thumbnail Image */}
                <div className="relative aspect-[16/10] w-full bg-[#0a0f1d] overflow-hidden">
                  {preset.imageUrl ? (
                    <img
                      src={preset.thumbnailUrl || preset.imageUrl}
                      alt={preset.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 filter brightness-90 group-hover:brightness-100"
                      loading="lazy"
                    />
                  ) : (
                    /* Minimal Dark preview gradient */
                    <div className="w-full h-full bg-gradient-to-br from-[#0c1424] via-[#090d18] to-[#04060c] flex items-center justify-center text-outline">
                      <span className="material-symbols-outlined text-[24px]">dark_mode</span>
                    </div>
                  )}

                  {/* Gradient Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Active Badge */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-md">
                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                    </div>
                  )}

                  {/* Color Accent Pill */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: preset.palette.primary }}
                    />
                    <span className="text-[9px] font-mono text-white/90">
                      {preset.category}
                    </span>
                  </div>
                </div>

                {/* Preset Title & Description */}
                <div className="p-2 bg-surface-container/90 flex flex-col justify-between flex-1">
                  <span className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                    {preset.name}
                  </span>
                  <span className="text-[9.5px] text-outline line-clamp-1 mt-0.5">
                    {preset.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Custom Background Image Upload */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Personal Image Upload</span>
              {isCustomActive && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.2 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Active
                </span>
              )}
            </h4>
            <p className="text-[11px] text-outline mt-0.5">
              Upload your own photo (JPG, PNG, WebP) — accent palette will be dynamically extracted
            </p>
          </div>

          {isCustomActive && (
            <button
              type="button"
              onClick={handleRemoveCustom}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
              <span>Remove</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileUpload}
          className="hidden"
        />

        {isCustomActive && settings.customBackgroundUrl ? (
          <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl bg-surface-container-high/40 border border-white/10">
            <div className="relative w-full sm:w-36 aspect-[16/10] rounded-lg overflow-hidden bg-black flex-shrink-0 shadow-lg border border-white/10">
              <img
                src={settings.customBackgroundUrl}
                alt="Custom background"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-1.5 left-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary text-black">
                Custom Upload
              </div>
            </div>
            <div className="flex flex-col justify-between flex-1 gap-2 w-full">
              <div>
                <span className="text-xs font-bold text-white">Custom Background Active</span>
                <p className="text-[11px] text-outline mt-0.5">
                  High-fidelity personal wallpaper with adaptive ambient palette applied.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">upload_file</span>
                  <span>Replace Image</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-primary/50 hover:bg-primary/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group text-center"
          >
            <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-primary/20 flex items-center justify-center text-outline group-hover:text-primary transition-all">
              <span className="material-symbols-outlined text-[22px]">add_photo_alternate</span>
            </div>
            <div>
              <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                {isUploading ? "Extracting Color Palette & Uploading..." : "Click or drag to upload custom background"}
              </span>
              <p className="text-[11px] text-outline mt-0.5">
                Supports JPG, PNG, or WebP (up to 10MB)
              </p>
            </div>
            {uploadError && (
              <span className="text-xs text-rose-400 font-semibold">{uploadError}</span>
            )}
          </div>
        )}
      </div>

      {/* 4. Intelligent Adaptive vs Manual Accent Color System */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Intelligent Accent Color Palette</span>
            </h4>
            <p className="text-[11px] text-outline mt-0.5">
              Powers active navigation, playback buttons, sliders, sound bars &amp; glow
            </p>
          </div>

          {/* Mode Switcher: Auto Adaptive vs Manual */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-high border border-white/10 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => updateSetting("accentMode", "auto")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${accentMode === "auto"
                  ? "bg-primary text-surface-container-lowest font-bold shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.35)]"
                  : "text-outline hover:text-white"
                }`}
            >
              Adaptive (Auto)
            </button>
            <button
              type="button"
              onClick={() => updateSetting("accentMode", "manual")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${accentMode === "manual"
                  ? "bg-primary text-surface-container-lowest font-bold shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.35)]"
                  : "text-outline hover:text-white"
                }`}
            >
              Manual Accent
            </button>
          </div>
        </div>

        {accentMode === "auto" ? (
          /* Automatic Adaptive Color Display */
          <div className="p-3.5 rounded-xl bg-surface-container/60 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="w-8 h-8 rounded-full border border-white/20 shadow-lg flex-shrink-0"
                style={{
                  backgroundColor: `rgb(var(--color-primary-rgb, 76 215 246))`,
                  boxShadow: `0 0 16px var(--theme-primary-glow, rgba(76,215,246,0.4))`,
                }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{activePresetObj.name} Harmony Palette</span>
                  <span className="text-[10px] font-mono text-primary font-bold px-1.5 py-0.2 rounded bg-primary/10">
                    Live
                  </span>
                </span>
                <span className="text-[10px] text-outline mt-0.5">
                  Automatically adapted to complement the tone of {activePresetObj.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-4 h-4 rounded-full border border-white/20"
                style={{ backgroundColor: `rgb(var(--color-primary-rgb, 76 215 246))` }}
                title="Primary Accent"
              />
              <span
                className="w-4 h-4 rounded-full border border-white/20"
                style={{ backgroundColor: `rgb(var(--color-primary-container-rgb, 6 182 212))` }}
                title="Container Accent"
              />
            </div>
          </div>
        ) : (
          /* Manual Color Picker & Swatches */
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MANUAL_ACCENT_PALETTES.map((pal) => {
                const isSelected = settings.manualAccentColor === pal.color;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => {
                      updateSettings({
                        accentMode: "manual",
                        manualAccentColor: pal.color,
                        themeAccent: pal.id,
                      });
                    }}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${isSelected
                        ? "bg-white/10 border-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.3)] ring-1 ring-primary/40"
                        : "bg-surface-container/50 border-white/5 hover:border-white/20"
                      }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex-shrink-0 shadow-md border border-white/20"
                      style={{ backgroundColor: pal.color, boxShadow: `0 0 10px ${pal.glow}` }}
                    />
                    <span className="text-xs font-semibold text-white truncate">
                      {pal.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom HEX Color Picker */}
            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs text-outline font-semibold">Custom HEX Color:</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.manualAccentColor || "#38bdf8"}
                  onChange={(e) => {
                    updateSettings({
                      accentMode: "manual",
                      manualAccentColor: e.target.value,
                    });
                  }}
                  className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer overflow-hidden p-0"
                  title="Pick custom accent color"
                />
                <span className="text-xs font-mono text-white/80 uppercase">
                  {settings.manualAccentColor || "#38bdf8"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Precision Fine-Tuning Sliders */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-4">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Atmospheric Fine-Tuning
          </h4>
          <p className="text-[11px] text-outline mt-0.5">
            Calibrate opacity, darkness, glow and diffusion to match your display
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Background Image Opacity */}
          <div className="p-3.5 rounded-xl bg-surface-container/50 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Background Opacity</span>
              <span className="text-[11px] font-mono text-primary font-bold">
                {settings.bgOpacity ?? 55}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="85"
              step="1"
              value={settings.bgOpacity ?? 55}
              onChange={(e) => {
                updateSettings({
                  bgOpacity: parseInt(e.target.value, 10),
                  intensityPreset: "custom",
                });
              }}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-outline block">
              Controls visibility of photographic background layer
            </span>
          </div>

          {/* Dark Overlay Intensity */}
          <div className="p-3.5 rounded-xl bg-surface-container/50 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Dark Overlay Contrast</span>
              <span className="text-[11px] font-mono text-primary font-bold">
                {settings.overlayOpacity ?? 48}%
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="95"
              step="1"
              value={settings.overlayOpacity ?? 48}
              onChange={(e) => {
                updateSettings({
                  overlayOpacity: parseInt(e.target.value, 10),
                  intensityPreset: "custom",
                });
              }}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-outline block">
              Keeps text and song titles crystal clear and readable
            </span>
          </div>

          {/* Ambient Radial Glow */}
          <div className="p-3.5 rounded-xl bg-surface-container/50 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Ambient Glow Intensity</span>
              <span className="text-[11px] font-mono text-primary font-bold">
                {settings.ambientGlowIntensity ?? 45}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="2"
              value={settings.ambientGlowIntensity ?? 45}
              onChange={(e) => {
                updateSettings({
                  ambientGlowIntensity: parseInt(e.target.value, 10),
                  intensityPreset: "custom",
                });
              }}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-outline block">
              Subtle colored illumination in top and bottom corners
            </span>
          </div>

          {/* Background Blur */}
          <div className="p-3.5 rounded-xl bg-surface-container/50 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Diffusion Blur</span>
              <span className="text-[11px] font-mono text-primary font-bold">
                {settings.bgBlur ?? 5}px
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={settings.bgBlur ?? 5}
              onChange={(e) => {
                updateSettings({
                  bgBlur: parseInt(e.target.value, 10),
                  intensityPreset: "custom",
                });
              }}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-outline block">
              Gaussian optical blur applied to background image
            </span>
          </div>
        </div>
      </div>

      {/* 6. Preserved Album Artwork Glow & Lyrics Switches */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container/40 border border-white/5 space-y-3">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
          Playback Atmosphere Features
        </h4>

        {/* Dynamic Artwork Ambient Glow */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/50 border border-white/5">
          <div className="flex items-center gap-3 max-w-[80%]">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">flare</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Atmospheric Album Glow</span>
              <span className="text-[11px] text-outline">
                Projects dynamic ambient color lighting inspired by current track artwork
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSetting("ambientGlow", !settings.ambientGlow)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${settings.ambientGlow ? "bg-primary" : "bg-surface-container-high"
              }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.ambientGlow ? "left-6" : "left-1"
                }`}
            />
          </button>
        </div>

        {/* Synchronized Live Lyrics */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/50 border border-white/5">
          <div className="flex items-center gap-3 max-w-[80%]">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">lyrics</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Synchronized Karaoke Lyrics</span>
              <span className="text-[11px] text-outline">
                Live line-by-line glowing lyric auto-scrolling during song playback
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSetting("showLiveLyrics", !settings.showLiveLyrics)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${settings.showLiveLyrics ? "bg-primary" : "bg-surface-container-high"
              }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.showLiveLyrics ? "left-6" : "left-1"
                }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
