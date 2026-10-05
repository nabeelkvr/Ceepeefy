"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { NOCTURNE_ARTISTS, NOCTURNE_TRACKS } from "../../data/nocturneData";
import ArtistAvatar from "../../components/ArtistAvatar";
import { useMusic } from "../../context/MusicContext";

export default function ArtistsPage() {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useMusic();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = [
    "All",
    "Trending Now",
    "Malayalam",
    "Rap",
    "Hindi",
    "Tamil",
    "Global Pop",
  ];

  const filteredArtists = useMemo(() => {
    return NOCTURNE_ARTISTS.filter((artist) => {
      // Category match
      if (selectedCategory !== "All") {
        const cats = artist.categories || [artist.category];
        const matchesCategory = cats.some((c) =>
          c?.toLowerCase().includes(selectedCategory.toLowerCase())
        );
        if (!matchesCategory) return false;
      }

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = artist.name?.toLowerCase().includes(q);
        const matchesGenre = artist.genre?.toLowerCase().includes(q);
        const matchesRole = artist.role?.toLowerCase().includes(q);
        if (!matchesName && !matchesGenre && !matchesRole) return false;
      }

      return true;
    });
  }, [searchQuery, selectedCategory]);

  const handleArtistPlay = (artist, e) => {
    e.preventDefault();
    e.stopPropagation();

    const artistTracks = NOCTURNE_TRACKS.filter((t) =>
      t.artist?.toLowerCase().includes(artist.name.toLowerCase())
    );

    const isThisArtistPlaying =
      isPlaying && currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());

    if (isThisArtistPlaying) {
      togglePlay();
    } else if (artistTracks.length > 0) {
      playTrack(artistTracks[0], artistTracks);
    } else {
      // Fallback to playing first available track
      playTrack(NOCTURNE_TRACKS[0], NOCTURNE_TRACKS);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 md:px-8 py-6 md:py-8 flex flex-col gap-6 md:gap-8 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">graphic_eq</span>
            Artist Directory
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] md:text-[11px] text-outline font-mono">
            {NOCTURNE_ARTISTS.length} Artists Worldwide
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-white tracking-tight">
              Popular Artists
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl mt-1">
              Explore global icons, playback discographies in studio master lossless quality, and discover curated selections.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artists or genres..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container-high/80 border border-white/10 text-white placeholder-outline text-xs sm:text-sm focus:outline-none focus:border-primary/50 transition-colors shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-white"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none whitespace-nowrap cursor-pointer ${
              selectedCategory === cat
                ? "bg-primary text-surface-container-lowest shadow-[0_0_14px_rgba(76,215,246,0.35)] scale-105"
                : "bg-surface-container/70 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-white/5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Artists Grid */}
      {filteredArtists.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/5 text-center flex flex-col items-center justify-center gap-3 py-16">
          <div className="w-12 h-12 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-outline">
            <span className="material-symbols-outlined text-[24px]">mic_off</span>
          </div>
          <p className="text-sm font-semibold text-white">No artists found</p>
          <p className="text-xs text-outline max-w-sm">
            Try adjusting your search query or switching categories.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 pb-8">
          {filteredArtists.map((artist) => {
            const isArtistPlaying =
              isPlaying &&
              currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());

            return (
              <Link
                key={artist.id}
                href={`/artist/${artist.id}`}
                className="group flex flex-col items-center text-center gap-2 p-2 sm:p-2.5 rounded-[4px] hover:bg-white/[0.04] transition-all duration-200 cursor-pointer select-none relative"
              >
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-surface-container-highest shadow-md p-1 ring-2 ring-primary/20 group-hover:ring-primary group-hover:shadow-[0_0_20px_rgba(76,215,246,0.3)] transition-all">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <ArtistAvatar
                      name={artist.name}
                      avatar={artist.avatar}
                      className="w-full h-full"
                    />
                  </div>
                  {/* Perfectly Centered Mini Play Badge on bottom right of Avatar */}
                  <button
                    onClick={(e) => handleArtistPlay(artist, e)}
                    className="absolute bottom-0 right-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.6)] hover:scale-110 active:scale-95 transition-all z-10 cursor-pointer"
                    title={isArtistPlaying ? "Pause audio" : `Play ${artist.name}`}
                  >
                    {isArtistPlaying ? (
                      <span className="material-symbols-outlined text-[14px] sm:text-[16px] leading-none">
                        pause
                      </span>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current translate-x-[0.5px]"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="flex flex-col items-center min-w-0 w-full mt-1">
                  <span className="text-xs sm:text-sm font-semibold truncate transition-colors w-full text-white group-hover:text-primary">
                    {artist.name}
                  </span>
                  <span className="text-[10px] sm:text-xs text-outline truncate w-full">
                    {artist.genre || artist.role || "Artist"}
                  </span>
                  {artist.followers && (
                    <span className="text-[9px] text-outline/70 font-mono mt-0.5">
                      {artist.followers} followers
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
