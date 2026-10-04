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

  const bgOpacity = typeof settings?.bgOpacity === "number" ? settings.bgOpacity / 100 : 0.55;
  const overlayOpacity = typeof settings?.overlayOpacity === "number" ? settings.overlayOpacity / 100 : 0.48;
  const glowOpacity = typeof settings?.ambientGlowIntensity === "number" ? settings.ambientGlowIntensity / 100 : 0.45;
  const bgBlur = typeof settings?.bgBlur === "number" ? settings.bgBlur : 5;

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none transition-colors duration-700"
      style={{
        backgroundColor: "var(--theme-bg-base, #0c0814)",
      }}
      aria-hidden="true"
    >
      {/* LAYER 1: Deep Dark Base Ambient Gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(13, 20, 38, 0.35) 0%, rgba(5, 8, 17, 0.95) 80%, #03050c 100%)",
        }}
      />

      {/* LAYER 2: Photographic Background with Smooth Transition & Refined Blur */}
      {activeImageUrl && (
        <div
          className="absolute -inset-4 transition-all duration-700 ease-out"
          style={{
            backgroundImage: `url(${activeImageUrl})`,
            backgroundPosition: "center 30%",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: bgOpacity,
            filter: `blur(${bgBlur}px) saturate(1.15) brightness(0.92)`,
            transform: "scale(1.02)",
          }}
        />
      )}

      {/* LAYER 3: Dark Overlay & Cinematic Vignette for 100% Readability */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: `linear-gradient(to bottom, rgba(6, 9, 18, ${overlayOpacity * 0.70}) 0%, rgba(4, 7, 14, ${overlayOpacity * 0.85}) 45%, rgba(3, 5, 11, ${Math.min(0.94, overlayOpacity + 0.22)}) 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 35%, transparent 35%, rgba(2, 4, 9, 0.75) 90%)",
        }}
      />

      {/* LAYER 4: Soft Controlled Radial Ambient Lighting Derived from Accent Color */}
      {/* Top right primary glow */}
      <div
        className="absolute -top-[12%] right-[5%] w-[60vw] max-w-[800px] h-[60vw] max-h-[800px] rounded-full transition-all duration-700 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-primary-rgb, 167 139 250), 0.18) 0%, rgba(var(--color-primary-rgb, 167 139 250), 0.04) 45%, transparent 70%)",
          opacity: glowOpacity,
          filter: "blur(60px)",
        }}
      />

      {/* Bottom right warm sunset glow */}
      <div
        className="absolute -bottom-[8%] right-[8%] w-[55vw] max-w-[700px] h-[55vw] max-h-[700px] rounded-full transition-all duration-700 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(251, 146, 60, 0.12) 0%, rgba(244, 63, 94, 0.05) 35%, transparent 65%)",
          opacity: glowOpacity,
          filter: "blur(70px)",
        }}
      />

      {/* Bottom left subtle container glow */}
      <div
        className="absolute bottom-[5%] -left-[8%] w-[50vw] max-w-[650px] h-[50vw] max-h-[650px] rounded-full transition-all duration-700 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-primary-container-rgb, 124 58 237), 0.10) 0%, transparent 65%)",
          opacity: glowOpacity * 0.75,
          filter: "blur(70px)",
        }}
      />

      {/* LAYER 5: Ultra-Subtle Velvet Ambient Depth */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
    </div>
  );
}
