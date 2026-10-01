"use client";

import React, { useState } from "react";

/**
 * Dynamic Playlist Cover Component
 * - 0 tracks: default fallback cover
 * - 1 track: full single song cover
 * - 2-3 tracks: split 50/50 vertically (left: song 1, right: song 2)
 * - 4+ tracks: 2x2 collage (4 quadrants: song 1, 2, 3, 4)
 */
export default function PlaylistCover({ tracks = [], fallbackUrl = "", className = "", alt = "Playlist Cover" }) {
  const [loadedMap, setLoadedMap] = useState({});

  const validCovers = (tracks || [])
    .map((t) => t?.coverUrl || t?.thumbnail || t?.image)
    .filter(Boolean);

  const defaultCover =
    fallbackUrl ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

  const handleLoad = (idx) => {
    setLoadedMap((prev) => ({ ...prev, [idx]: true }));
  };

  // Case 0: No tracks, show fallback
  if (validCovers.length === 0) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-surface-container-highest ${className}`}>
        {!loadedMap[0] && (
          <div className="absolute inset-0 w-full h-full skeleton-shimmer bg-white/10 z-0" />
        )}
        <img
          src={defaultCover}
          alt={alt}
          loading="lazy"
          onLoad={() => handleLoad(0)}
          className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${
            loadedMap[0] ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    );
  }

  // Case 1: Exactly 1 track
  if (validCovers.length === 1) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-surface-container-highest ${className}`}>
        {!loadedMap[0] && (
          <div className="absolute inset-0 w-full h-full skeleton-shimmer bg-white/10 z-0" />
        )}
        <img
          src={validCovers[0]}
          alt={alt}
          loading="lazy"
          onLoad={() => handleLoad(0)}
          className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${
            loadedMap[0] ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    );
  }

  // Case 2: 2 or 3 tracks -> 50/50 split (left & right)
  if (validCovers.length < 4) {
    return (
      <div className={`relative w-full h-full overflow-hidden flex bg-surface-container-highest ${className}`}>
        <div className="w-1/2 h-full overflow-hidden border-r border-black/20 relative">
          {!loadedMap[0] && (
            <div className="absolute inset-0 w-full h-full skeleton-shimmer bg-white/10 z-0" />
          )}
          <img
            src={validCovers[0]}
            alt={`${alt} - Part 1`}
            loading="lazy"
            onLoad={() => handleLoad(0)}
            className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${
              loadedMap[0] ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
        <div className="w-1/2 h-full overflow-hidden relative">
          {!loadedMap[1] && (
            <div className="absolute inset-0 w-full h-full skeleton-shimmer bg-white/10 z-0" />
          )}
          <img
            src={validCovers[1]}
            alt={`${alt} - Part 2`}
            loading="lazy"
            onLoad={() => handleLoad(1)}
            className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${
              loadedMap[1] ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>
    );
  }

  // Case 3: 4 or more tracks -> 2x2 grid collage (4 quadrants)
  return (
    <div className={`relative w-full h-full overflow-hidden grid grid-cols-2 grid-rows-2 bg-surface-container-highest ${className}`}>
      {validCovers.slice(0, 4).map((cover, idx) => (
        <div key={idx} className="relative w-full h-full overflow-hidden border border-black/10">
          {!loadedMap[idx] && (
            <div className="absolute inset-0 w-full h-full skeleton-shimmer bg-white/10 z-0" />
          )}
          <img
            src={cover}
            alt={`${alt} - Track ${idx + 1}`}
            loading="lazy"
            onLoad={() => handleLoad(idx)}
            className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${
              loadedMap[idx] ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      ))}
    </div>
  );
}
