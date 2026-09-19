"use client";

import React, { useState, useEffect } from "react";
import { fetchArtistImage } from "../services/audioService";

/**
 * Generates single-letter initial for fallback UI (e.g., 'K' for Kendrick)
 */
function getInitial(name) {
  if (!name || typeof name !== "string") return "?";
  const cleaned = name.trim();
  return cleaned.charAt(0).toUpperCase();
}

/**
 * ArtistAvatar Component
 *
 * 1. Automatically fetches high-resolution (500x500) profile image via JioSaavn / iTunes APIs.
 * 2. Renders an <img> with width: 100%, height: 100%, border-radius: 50%, and object-fit: cover.
 * 3. Gracefully reverts to the initials UI (e.g. 'K' for Kendrick) via onError if the image link fails or is missing.
 */
export default function ArtistAvatar({
  name = "",
  avatar = null,
  className = "",
  imgClassName = "",
}) {
  const [imageUrl, setImageUrl] = useState(avatar || null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!avatar);

  useEffect(() => {
    let isCancelled = false;

    // If pre-passed avatar exists, start with it
    if (avatar) {
      setImageUrl(avatar);
      setHasError(false);
    }

    if (!name) {
      setIsLoading(false);
      return;
    }

    // Fetch dynamic high-resolution profile photo
    const resolveArtistPhoto = async () => {
      try {
        const fetchedUrl = await fetchArtistImage(name);
        if (!isCancelled) {
          if (fetchedUrl) {
            setImageUrl(fetchedUrl);
            setHasError(false);
          } else if (!avatar) {
            setHasError(true);
          }
        }
      } catch (err) {
        if (!isCancelled && !avatar) {
          setHasError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    resolveArtistPhoto();

    return () => {
      isCancelled = true;
    };
  }, [name, avatar]);

  const initial = getInitial(name);

  return (
    <div
      className={`relative w-full h-full rounded-full overflow-hidden flex items-center justify-center select-none ${className}`}
      style={{ width: "100%", height: "100%", borderRadius: "50%" }}
    >
      {/* 1. Graceful Error / Missing Fallback: Initials UI */}
      {(hasError || !imageUrl) ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
          }}
          className="w-full h-full rounded-full flex items-center justify-center bg-gradient-to-br from-primary/25 via-surface-container-high to-surface-container-lowest text-primary font-bold border border-primary/20 shadow-inner"
        >
          <span className="text-2xl md:text-3xl font-black tracking-tight text-white/90 drop-shadow-md">
            {initial}
          </span>
        </div>
      ) : (
        /* 2. Image UI with exact circular styling and onError fallback */
        <img
          src={imageUrl}
          alt={name}
          onError={() => setHasError(true)}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
          }}
          className={`w-full h-full rounded-full object-cover group-hover:scale-105 transition-transform duration-500 ${imgClassName}`}
          loading="lazy"
        />
      )}
    </div>
  );
}
