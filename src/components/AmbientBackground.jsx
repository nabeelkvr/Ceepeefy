"use client";

import React, { useEffect, useState } from "react";
import { useMusic } from "../context/MusicContext";
import { applyThemeToDom } from "../data/themeData";

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

  const isCustom = settings?.backgroundId === "custom" && Boolean(settings?.customBackgroundUrl);
  const customImageUrl = isCustom ? settings.customBackgroundUrl : null;

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none bg-[#020202]"
      style={{
        backgroundColor: "#020202",
      }}
      aria-hidden="true"
    >
      {/* Spotify Signature Deep Foundation */}
      <div className="absolute inset-0 bg-[#020202]" />

      {/* User Custom Wallpaper Overlay (if explicitly uploaded in Settings) */}
      {customImageUrl && (
        <div
          className="absolute -inset-1 transition-opacity duration-700 ease-out"
          style={{
            backgroundImage: `url(${customImageUrl})`,
            backgroundPosition: "center 12%",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: 0.18,
            filter: "brightness(0.6) contrast(1.1)",
          }}
        />
      )}
    </div>
  );
}
