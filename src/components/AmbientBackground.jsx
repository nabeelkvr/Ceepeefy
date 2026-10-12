"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMusic } from "../context/MusicContext";
import { BACKGROUND_PRESETS, applyThemeToDom } from "../data/themeData";

export default function AmbientBackground() {
  const { settings } = useMusic();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync CSS variables onto :root whenever settings change
  useEffect(() => {
    if (mounted) {
      applyThemeToDom(settings);
    }
  }, [settings, mounted]);

  const activePreset = useMemo(() => {
    const id = settings?.backgroundId || "sunset-mountains";
    return BACKGROUND_PRESETS.find((p) => p.id === id) || BACKGROUND_PRESETS[0];
  }, [settings?.backgroundId]);

  const isCustom = settings?.backgroundId === "custom" && Boolean(settings?.customBackgroundUrl);
  const activeImageUrl = isCustom ? settings.customBackgroundUrl : activePreset.imageUrl;

  const bgOpacity = typeof settings?.bgOpacity === "number" ? Math.max(0.80, settings.bgOpacity / 100) : 0.90;
  const overlayOpacity = typeof settings?.overlayOpacity === "number" ? Math.min(0.40, settings.overlayOpacity / 100) : 0.25;
  const glowOpacity = typeof settings?.ambientGlowIntensity === "number" ? settings.ambientGlowIntensity / 100 : 0.55;

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none transition-colors duration-700"
      style={{
        backgroundColor: "var(--theme-bg-base, #050914)",
      }}
      aria-hidden="true"
    >
      {/* LAYER 1: Deep Base Foundation */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 110% at 50% 10%, #080808 0%, #050505 40%, #020202 75%, #000000 100%)",
        }}
      />

      {/* LAYER 2: Cinematic Horizon / Subtle Silhouette */}
      {activeImageUrl && (
        <div
          className="absolute -inset-1 transition-all duration-700 ease-out"
          style={{
            backgroundImage: `url(${activeImageUrl})`,
            backgroundPosition: "center 12%",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: Math.min(bgOpacity, 0.40),
            filter: "saturate(1.1) brightness(0.85) contrast(1.1)",
          }}
        />
      )}

      {/* LAYER 3: Atmospheric Subtle Glows */}
      
      {/* Top-Right Golden Sunset Glow */}
      <div
        className="absolute -top-[5%] right-[2%] w-[60vw] max-w-[800px] h-[50vw] max-h-[650px] rounded-full transition-all duration-700 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 65% 35%, rgba(251, 146, 60, 0.10) 0%, rgba(249, 115, 22, 0.05) 30%, transparent 60%)",
          opacity: glowOpacity * 0.65,
          filter: "blur(70px)",
        }}
      />

      {/* Top-Left Dusk Cyan Glow */}
      <div
        className="absolute -top-[5%] left-[8%] w-[50vw] max-w-[700px] h-[45vw] max-h-[600px] rounded-full transition-all duration-700 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 45% 45%, rgba(6, 182, 212, 0.08) 0%, rgba(56, 189, 248, 0.04) 35%, transparent 65%)",
          opacity: glowOpacity * 0.55,
          filter: "blur(75px)",
        }}
      />

      {/* LAYER 4: Pure Black Depth Overlays */}

      {/* Smooth Vertical Gradient: Immersive fade to deep black */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 0, 0, ${overlayOpacity * 0.50}) 0%, rgba(0, 0, 0, ${overlayOpacity * 0.30}) 20%, rgba(0, 0, 0, ${overlayOpacity * 0.65}) 60%, rgba(0, 0, 0, 0.98) 100%)`,
        }}
      />

      {/* Left Sidebar Atmospheric Shield */}
      <div
        className="hidden md:block absolute inset-y-0 left-0 w-80 pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.5) 80px, transparent 100%)",
        }}
      />

      {/* Bottom Player Atmospheric Shield */}
      <div
        className="absolute inset-x-0 bottom-0 h-36 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.6) 60px, transparent 100%)",
        }}
      />
    </div>
  );
}

