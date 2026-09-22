"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useMusic } from "../context/MusicContext";
import {
  NOCTURNE_ARTISTS,
  NOCTURNE_TRACKS,
  NOCTURNE_MIXES,
  NOCTURNE_PLAYLISTS,
  getTracksByArtist,
  getPlaylistById,
  getArtistsByCategory,
} from "../data/nocturneData";
import { searchMusicTracks } from "../services/audioService";
import ArtistAvatar from "../components/ArtistAvatar";
import DownloadButton from "../components/DownloadButton";
import { formatPlaylistDuration } from "../utils/playlistUtils";

export default function HomePage() {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    activeFilter,
    setActiveFilter,
    toggleLike,
    isLiked,
    formatTime,
    recentlyPlayedTracks,
    customPlaylists,
    selfMixes,
    user,
    openAuthModal,
  } = useMusic();

  const filterChips = [
    "All songs",
    "Music",
    "Self mixes",
    "Rap songs",
    "Feel goods",
    "Playlists",
  ];
  const mixesContainerRef = useRef(null);
  const selfMixesSectionRef = useRef(null);
  const playlistsSectionRef = useRef(null);

  const scrollMixes = (direction) => {
    if (mixesContainerRef.current) {
      const scrollAmount = direction === "left" ? -340 : 340;
      mixesContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleFilterClick = (chip) => {
    setActiveFilter(chip);
    if (chip === "Self mixes" && selfMixesSectionRef.current) {
      selfMixesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (chip === "Playlists" && playlistsSectionRef.current) {
      playlistsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleMixPlay = (mix, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const playlist = getPlaylistById(mix.id) || NOCTURNE_PLAYLISTS.find((p) => p.id === mix.id);
    const tracks = playlist?.tracks || NOCTURNE_TRACKS;
    const firstTrack = tracks[0] || NOCTURNE_TRACKS[0];

    const isThisPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
    if (isThisPlaying) {
      togglePlay();
    } else {
      playTrack(firstTrack, tracks);
    }
  };

  const handlePlaylistPlay = (playlist, e) => {
    e.preventDefault();
    e.stopPropagation();
    const tracks = playlist.tracks && playlist.tracks.length > 0 ? playlist.tracks : [];
    if (tracks.length === 0) {
      router.push(`/playlist/${playlist.id}`);
      return;
    }
    const firstTrack = tracks[0];
    if (currentTrack?.id === firstTrack.id) {
      togglePlay();
    } else {
      playTrack(firstTrack, tracks);
    }
  };

  // Dynamic recently played tracks: ONLY songs the user actually played
  const displayRecentlyPlayed = useMemo(() => {
    const DEFAULT_MOCK_TRACK_IDS = new Set([
      "track-midnight-pulse",
      "track-aether-resonance",
      "track-shadows-in-blue",
      "track-kuroshio-current",
      "track-continuum-shift",
    ]);

    const recents = Array.isArray(recentlyPlayedTracks)
      ? recentlyPlayedTracks.filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)))
      : [];

    if (activeFilter === "All songs" || activeFilter === "Music") {
      return recents;
    }
    if (activeFilter === "Rap songs") {
      const filtered = recents.filter((track) => {
        const g = (track.genre || "").toLowerCase();
        const a = (track.artist || "").toLowerCase();
        return (
          g.includes("rap") ||
          g.includes("hip-hop") ||
          a.includes("kendrick") ||
          a.includes("drake") ||
          a.includes("divine") ||
          a.includes("eminem")
        );
      });
      return filtered;
    }
    if (activeFilter === "Feel goods") {
      const filtered = recents.filter((track) => {
        const g = (track.genre || "").toLowerCase();
        return (
          g === "synthwave" ||
          g === "lo-fi" ||
          g === "pop" ||
          g === "ambient" ||
          track.badge === "Dolby Atmos" ||
          track.badge === "Master"
        );
      });
      return filtered;
    }
    if (activeFilter === "Self mixes") {
      const filtered = recents.filter((track) => {
        const t = (track.title || "").toLowerCase();
        const g = (track.genre || "").toLowerCase();
        return t.includes("midnight") || g === "electronic" || g === "synthwave" || track.badge === "Master";
      });
      return filtered;
    }
    return recents;
  }, [recentlyPlayedTracks, activeFilter]);

  const artistCategories = ["Trending Now", "Malayalam", "Rap", "Hindi", "Tamil"];
  const [artistCategory, setArtistCategory] = useState("Trending Now");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveTrendingArtists, setLiveTrendingArtists] = useState([]);

  // Fetch live trending artists from API on load
  useEffect(() => {
    fetch("/api/artist/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.artists) && data.artists.length > 0) {
          setLiveTrendingArtists(data.artists);
        }
      })
      .catch((err) => console.warn("Live trending artists fetch skipped:", err));
  }, []);

  // Computes a consistent day-of-year numeric seed for the current date
  const getTodayDaySeed = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return now.getFullYear() * 1000 + dayOfYear;
  };

  const handleRefreshTrending = () => {
    setIsRefreshing(true);
    setRefreshSeed((prev) => prev + 1);
    fetch("/api/artist/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.artists) && data.artists.length > 0) {
          setLiveTrendingArtists(data.artists);
        }
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setIsRefreshing(false), 450);
      });
  };

  // Automatically rotates every day based on the calendar day seed + interactive refresh
  const displayedArtists = useMemo(() => {
    const daySeed = getTodayDaySeed();
    const effectiveSeed = daySeed + refreshSeed * 37;
    return getArtistsByCategory(artistCategory, effectiveSeed, liveTrendingArtists, 12);
  }, [artistCategory, refreshSeed, liveTrendingArtists]);

  const handleArtistPlay = async (artist, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const isThisArtist = currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());
    if (isThisArtist && isPlaying) {
      togglePlay();
      return;
    }

    try {
      const liveSongs = await searchMusicTracks(artist.name);
      if (liveSongs && liveSongs.length > 0) {
        playTrack(liveSongs[0], liveSongs);
        return;
      }
    } catch (err) {
      console.warn("Live artist play fetch failed:", err);
    }

    const fallbackTracks = getTracksByArtist(artist.id);
    const firstTrack = fallbackTracks[0] || NOCTURNE_TRACKS[0];
    playTrack(firstTrack);
  };

  const handleTrackClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, displayRecentlyPlayed);
    }
  };

  return (
    <div className="relative w-full overflow-hidden px-4 md:px-8 flex flex-col gap-10 pt-6">
      {/* Ambient Glowing Backdrops */}
      <div className="absolute -top-40 right-10 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="absolute top-96 -left-20 w-[500px] h-[500px] bg-secondary-container/15 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="absolute bottom-40 right-1/4 w-[450px] h-[450px] bg-tertiary/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Section 1: Recently played songs (Master Tier Selection) */}
      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between">
          <div>
            <span className="font-label-sm text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
              Master Tier Selection
            </span>
            <h2 className="font-headline-lg text-xl md:text-2xl font-bold text-white tracking-tight">
              Recently played songs
            </h2>
          </div>
          {displayRecentlyPlayed.length > 0 && (
            <Link
              href="/playlist/midnight-reverie"
              className="hidden sm:flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold group"
            >
              <span>Explore Archives</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          )}
        </div>

        {displayRecentlyPlayed.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
            {displayRecentlyPlayed.slice(0, 10).map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => handleTrackClick(track)}
                  className={`group flex flex-col gap-3 glass-card p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5 select-none ${
                    isCurrent
                      ? "border-primary/60 bg-surface-container/95 shadow-[0_0_20px_rgba(76,215,246,0.25)]"
                      : "border-white/5 hover:border-primary/40 hover:bg-surface-container/90"
                  }`}
                >
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
                    <img
                      alt={track.title}
                      src={track.coverUrl}
                      onError={(e) => {
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div
                      className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-end p-3 transition-opacity ${
                        isCurrentPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_16px_rgba(76,215,246,0.6)] transform translate-y-2 group-hover:translate-y-0 transition-transform">
                        <span className="material-symbols-outlined text-[24px]">
                          {isCurrentPlaying ? "pause" : "play_arrow"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <h3
                      className={`text-sm font-semibold truncate transition-colors ${
                        isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                      }`}
                    >
                      {track.title}
                    </h3>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">
                      {track.artist}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5">
                      <span className="text-[11px] text-outline font-mono">
                        {track.durationFormatted || "3:30"}
                      </span>
                      <DownloadButton track={track} buttonSize="p-0.5" iconSize="text-[15px]" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-2.5 py-12">
            <div className="w-12 h-12 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[24px]">history</span>
            </div>
            <p className="text-sm font-semibold text-white">No recently played songs</p>
            <p className="text-xs text-on-surface-variant max-w-sm">
              Songs you play from Search or Self Mix will automatically appear here.
            </p>
          </div>
        )}
      </section>

      {/* Section 2: Featured Playlists */}
      <section ref={playlistsSectionRef} id="featured-playlists" className="flex flex-col gap-5 scroll-mt-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
              <span className="material-symbols-outlined text-[15px]">queue_music</span>
              <span>Curated Selections</span>
            </div>
            <h2 className="font-headline-lg text-xl md:text-2xl font-bold text-white tracking-tight mt-1">
              Featured Playlists
            </h2>
          </div>

          <Link
            href="/playlists"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Show All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        {/* Playlists Grid - Only user created playlists & self mixes (no default mock playlists) */}
        {(() => {
          const userPlaylists = [
            ...(user ? (selfMixes || []) : []),
            ...(user ? (customPlaylists || []) : []),
          ];

          if (userPlaylists.length === 0) {
            return (
              <div className="p-8 rounded-2xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-3 py-12">
                <div className="w-12 h-12 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-outline">
                  <span className="material-symbols-outlined text-[24px]">queue_music</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">No playlists yet</p>
                  <p className="text-xs text-on-surface-variant max-w-sm mt-0.5">
                    Create a custom playlist or upload a track in Self Mix to see it here.
                  </p>
                </div>
                <Link
                  href="/playlists"
                  className="mt-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Create Playlist</span>
                </Link>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
              {userPlaylists.map((pl) => {
                const tracks = pl.tracks || [];
                const isPlaylistPlaying =
                  isPlaying && tracks.some((t) => t.id === currentTrack?.id);

                return (
                  <div
                    key={pl.id}
                    className="group flex flex-col gap-3 glass-card p-3.5 rounded-2xl border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-lg select-none cursor-pointer"
                  >
                    {/* Playlist Cover Image with Hover Play */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
                      <img
                        src={pl.coverUrl}
                        alt={pl.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {pl.isSelfMix ? (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-cyan-950/80 backdrop-blur-md text-[9px] font-bold text-cyan-300 border border-cyan-700/60 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">equalizer</span>
                          <span>SELF MIX</span>
                        </div>
                      ) : pl.isCustom ? (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-bold text-primary border border-primary/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          <span>BY YOU</span>
                        </div>
                      ) : null}
                      <div
                        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-end p-3 transition-opacity duration-300 ${
                          isPlaylistPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <button
                          onClick={(e) => handlePlaylistPlay(pl, e)}
                          className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_16px_rgba(76,215,246,0.6)] transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-95"
                          title={isPlaylistPlaying ? "Pause" : "Play"}
                        >
                          <span className="material-symbols-outlined text-[24px]">
                            {isPlaylistPlaying ? "pause" : "play_arrow"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Playlist Title & Curator */}
                    <Link href={`/playlist/${pl.id}`} className="flex flex-col min-w-0">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                        {pl.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">
                        {pl.subtitle || pl.description}
                      </p>
                    </Link>

                    {/* Bottom Tags: Track count & Duration */}
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5 text-[11px] font-mono text-outline">
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <span className="material-symbols-outlined text-[13px]">graphic_eq</span>
                        {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {formatPlaylistDuration(tracks)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Section 3: Dynamic & Categorized Popular Artists */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">
                  {artistCategory === "Trending Now" ? "trending_up"
                    : artistCategory === "Malayalam" ? "language"
                      : artistCategory === "Rap" ? "mic"
                        : artistCategory === "Hindi" ? "music_note"
                          : "queue_music"}
                </span>
                {artistCategory === "Trending Now" ? "Trending Now Spotlight"
                  : artistCategory === "Malayalam" ? "Malayalam Spotlight"
                    : artistCategory === "Rap" ? "Rap Spotlight"
                      : artistCategory === "Hindi" ? "Hindi Spotlight"
                        : "Tamil Spotlight"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Updated Daily
              </span>
            </div>
            <h2 className="font-headline-lg text-xl md:text-2xl font-bold text-white tracking-tight mt-0.5">
              Popular artists
            </h2>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              onClick={handleRefreshTrending}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/40 text-xs font-semibold text-on-surface-variant hover:text-white transition-all shadow-sm active:scale-95 group cursor-pointer"
              title="Refresh and bring new trending artists"
            >
              <span
                className={`material-symbols-outlined text-[16px] text-primary transition-transform duration-500 ${
                  isRefreshing ? "animate-spin" : "group-hover:rotate-180"
                }`}
              >
                autorenew
              </span>
              <span className="whitespace-nowrap font-mono text-[11px]">
                {isRefreshing ? "Refreshing..." : "New Artists"}
              </span>
            </button>
            <Link
              href="/artists"
              className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold group"
            >
              <span className="uppercase tracking-wider">Show All ({NOCTURNE_ARTISTS.length})</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {artistCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setArtistCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none whitespace-nowrap ${artistCategory === cat
                  ? "bg-primary text-surface-container-lowest shadow-[0_0_14px_rgba(76,215,246,0.35)] scale-105"
                  : "bg-surface-container/70 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-white/5"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Dynamic Artist Avatars Grid */}
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5 transition-all duration-300 ${isRefreshing ? "opacity-40 scale-[0.99]" : "opacity-100 scale-100"}`}>
          {displayedArtists.map((artist) => {
            const isArtistPlaying =
              isPlaying &&
              currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());

            return (
              <Link
                key={artist.id}
                href={`/artist/${artist.id}`}
                className="group flex flex-col items-center text-center gap-3 p-4 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5 select-none relative"
              >
                <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-surface-container-highest shadow-md p-1 ring-2 ring-primary/20 group-hover:ring-primary group-hover:shadow-[0_0_20px_rgba(76,215,246,0.3)] transition-all">
                  <ArtistAvatar
                    name={artist.name}
                    avatar={artist.avatar}
                    className="w-full h-full"
                  />
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <button
                      onClick={(e) => handleArtistPlay(artist, e)}
                      className="pointer-events-auto w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform hover:scale-110"
                      title={isArtistPlaying ? "Pause audio" : `Play ${artist.name}`}
                    >
                      <span className="material-symbols-outlined text-[24px]">
                        {isArtistPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center min-w-0 w-full">
                  <span className="text-sm font-semibold truncate transition-colors w-full text-white group-hover:text-primary">
                    {artist.name}
                  </span>
                  <span className="text-xs text-outline truncate">{artist.genre || artist.role}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section 4: My self mixes */}
      <section ref={selfMixesSectionRef} id="self-mixes" className="flex flex-col gap-5 pb-10 scroll-mt-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
                <span className="material-symbols-outlined text-[15px]">cloud_download</span>
                <span>Personal Archive &amp; Offline Rips</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary-container/70 text-secondary border border-secondary/30 font-semibold">
                4 Sets
              </span>
            </div>
            <h2 className="font-headline-lg text-xl md:text-2xl font-bold text-white tracking-tight mt-1">
              My self mixes
            </h2>
          </div>

          {/* Carousel Arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollMixes("left")}
              className="w-8 h-8 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 flex items-center justify-center text-outline hover:text-white transition-all active:scale-90 shadow-md"
              title="Scroll left"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              onClick={() => scrollMixes("right")}
              className="w-8 h-8 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 flex items-center justify-center text-outline hover:text-white transition-all active:scale-90 shadow-md"
              title="Scroll right"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Mixes Grid / Horizontal Carousel */}
        <div
          ref={mixesContainerRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
        >
          {NOCTURNE_MIXES.map((mix) => {
            const playlist = getPlaylistById(mix.id) || NOCTURNE_PLAYLISTS.find((p) => p.id === mix.id);
            const tracks = playlist?.tracks || NOCTURNE_TRACKS;
            const isMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

            return (
              <Link
                key={mix.id}
                href={`/playlist/${mix.id}`}
                className="group flex flex-col justify-between p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-lg select-none cursor-pointer"
              >
                <div>
                  {/* Top Image Box with floating badges */}
                  <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3.5">
                    <img
                      src={mix.image}
                      alt={mix.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Left floating badge */}
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-[10px] font-medium text-white flex items-center gap-1.5 shadow-md">
                      <span className="material-symbols-outlined text-[13px] text-primary">
                        {mix.tagIcon || "smart_display"}
                      </span>
                      <span>{mix.tag}</span>
                    </div>

                    {/* Right floating badge */}
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-tertiary/40 bg-tertiary/20 text-tertiary backdrop-blur-md shadow-md">
                      {mix.badge}
                    </div>
                  </div>

                  {/* Title, Playing Indicator, and Icon */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-base text-white group-hover:text-primary transition-colors truncate">
                      {mix.title}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isMixPlaying && (
                        <div className="flex items-center gap-0.5 mr-1">
                          <span className="w-1 h-3 bg-primary rounded-full animate-pulse" />
                          <span className="w-1 h-4 bg-primary rounded-full animate-pulse delay-75" />
                          <span className="w-1 h-2.5 bg-primary rounded-full animate-pulse delay-150" />
                        </div>
                      )}
                      <span className="material-symbols-outlined text-outline text-[17px] group-hover:text-primary transition-colors">
                        {mix.icon || "diamond"}
                      </span>
                    </div>
                  </div>

                  {/* Subtitle */}
                  <p className="text-xs text-on-surface-variant line-clamp-2 mt-1.5 leading-relaxed">
                    {mix.subtitle}
                  </p>
                </div>

                {/* Footer: Metadata + Play Button */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-outline">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    <span>
                      {mix.tracksCount} • {mix.duration}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleMixPlay(mix, e)}
                    className="w-9 h-9 rounded-full bg-primary/20 hover:bg-primary text-primary hover:text-surface-container-lowest border border-primary/40 hover:border-primary flex items-center justify-center shadow-md transform group-hover:scale-105 active:scale-90 transition-all duration-300"
                    title={isMixPlaying ? "Pause Playlist" : "Play Playlist"}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isMixPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
