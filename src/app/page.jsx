"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import SongOptionsMenu from "../components/SongOptionsMenu";
import { formatPlaylistDuration } from "../utils/playlistUtils";

export default function HomePage() {
  const router = useRouter();
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
  const recentsContainerRef = useRef(null);
  const selfMixesSectionRef = useRef(null);
  const playlistsSectionRef = useRef(null);

  const scrollRecents = (direction) => {
    if (recentsContainerRef.current) {
      const scrollAmount = direction === "left" ? -420 : 420;
      recentsContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

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
    const tracks = (mix.tracks && mix.tracks.length > 0)
      ? mix.tracks
      : getPlaylistById(mix.id)?.tracks || NOCTURNE_TRACKS;
    if (!tracks || tracks.length === 0) {
      router.push(`/self-mix?id=${mix.id}`);
      return;
    }
    const firstTrack = tracks[0];

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
    <div className="relative w-full overflow-hidden px-3 sm:px-6 md:px-8 flex flex-col gap-6 md:gap-10 pt-3 md:pt-6">
      {/* Ambient Glowing Backdrops */}
      <div className="absolute -top-40 right-10 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="absolute top-96 -left-20 w-[500px] h-[500px] bg-secondary-container/15 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="absolute bottom-40 right-1/4 w-[450px] h-[450px] bg-tertiary/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Section 1: Recently played songs (Master Tier Selection) - Single Horizontal Row */}
      <section className="flex flex-col gap-3.5 md:gap-5">
        <div className="flex items-end justify-between">
          <div>
            <span className="font-label-sm text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] md:text-[14px]">graphic_eq</span>
              Master Tier Selection
            </span>
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
              Recently played songs
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {displayRecentlyPlayed.length > 3 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollRecents("left")}
                  className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 text-outline hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Scroll left"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollRecents("right")}
                  className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 text-outline hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Scroll right"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            )}
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
        </div>

        {displayRecentlyPlayed.length > 0 ? (
          <div
            ref={recentsContainerRef}
            className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-5 pb-3 pt-1 -mx-2 px-2"
          >
            {displayRecentlyPlayed.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => handleTrackClick(track)}
                  className={`w-[145px] sm:w-[180px] md:w-[200px] flex-shrink-0 group flex flex-col gap-2 md:gap-3 glass-card p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5 select-none ${
                    isCurrent
                      ? "border-primary/60 bg-surface-container/95 shadow-[0_0_20px_rgba(76,215,246,0.25)]"
                      : "border-white/5 hover:border-primary/40 hover:bg-surface-container/90"
                  }`}
                >
                  <div className="relative aspect-square w-full rounded-lg sm:rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
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
                      className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-end p-2.5 sm:p-3 transition-opacity ${
                        isCurrentPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_16px_rgba(76,215,246,0.6)] transform translate-y-2 group-hover:translate-y-0 transition-transform">
                        <span className="material-symbols-outlined text-[20px] sm:text-[24px]">
                          {isCurrentPlaying ? "pause" : "play_arrow"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <h3
                      className={`text-xs sm:text-sm font-semibold truncate transition-colors ${
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
                      <div className="flex items-center gap-0.5">
                        <DownloadButton track={track} buttonSize="p-0.5" iconSize="text-[15px]" />
                        <SongOptionsMenu
                          track={track}
                          iconClassName="text-[16px]"
                          buttonClassName="p-0.5 text-outline hover:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl glass-card border border-white/5 flex items-center sm:flex-col sm:justify-center sm:text-center gap-3.5 py-4 sm:py-8 md:py-12">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-outline flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">history</span>
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold text-white">No recently played songs</p>
              <p className="text-[11px] sm:text-xs text-on-surface-variant max-w-sm mt-0.5">
                Songs you play from Search or Self Mix will appear here automatically.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Featured Playlists */}
      <section ref={playlistsSectionRef} id="featured-playlists" className="flex flex-col gap-4 sm:gap-5 scroll-mt-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
              <span className="material-symbols-outlined text-[15px]">queue_music</span>
              <span>Curated Selections</span>
            </div>
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight mt-1">
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
              <div className="p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl glass-card border border-white/5 flex items-center justify-between sm:flex-col sm:justify-center sm:text-center gap-3 py-4 sm:py-8 md:py-12">
                <div className="flex items-center gap-3 sm:flex-col">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-outline flex-shrink-0">
                    <span className="material-symbols-outlined text-[20px] sm:text-[24px]">queue_music</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-white">No playlists yet</p>
                    <p className="text-[11px] sm:text-xs text-on-surface-variant max-w-sm mt-0.5">
                      Create a custom playlist to see it here.
                    </p>
                  </div>
                </div>
                <Link
                  href="/playlists"
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[15px] sm:text-[16px]">add</span>
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
                const targetUrl = pl.isSelfMix ? `/self-mix?id=${pl.id}` : `/playlist/${pl.id}`;

                return (
                  <div
                    key={pl.id}
                    onClick={() => router.push(targetUrl)}
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
                          type="button"
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
                    <div className="flex flex-col min-w-0">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                        {pl.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">
                        {pl.subtitle || pl.description}
                      </p>
                    </div>

                    {/* Modern Audio Telemetry Capsule for Track Count & Duration */}
                    <div className="mt-auto pt-2">
                      <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-surface-container-high/60 backdrop-blur-md border border-white/10 group-hover:border-primary/30 transition-all duration-300 shadow-inner overflow-hidden w-full">
                        {/* Track Count Badge with Animated Soundwave Equalizer */}
                        <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[10px] sm:text-[10.5px] font-bold tracking-tight shadow-[0_0_10px_rgba(76,215,246,0.15)] flex-shrink-0">
                          <div className="flex items-end gap-[1.5px] h-2.5 flex-shrink-0">
                            <span className="w-[2px] h-full bg-primary rounded-full animate-pulse" />
                            <span className="w-[2px] h-2/3 bg-primary rounded-full animate-pulse delay-75" />
                            <span className="w-[2px] h-1/2 bg-primary rounded-full animate-pulse delay-150" />
                          </div>
                          <span className="tabular-nums whitespace-nowrap">
                            {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                          </span>
                        </div>

                        {/* Duration Pill */}
                        <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-white/80 text-[10px] sm:text-[10.5px] font-mono font-medium min-w-0 flex-shrink overflow-hidden">
                          <span className="material-symbols-outlined text-[12px] text-outline flex-shrink-0">schedule</span>
                          <span className="truncate">{formatPlaylistDuration(tracks)}</span>
                        </div>
                      </div>
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

        {/* Dynamic Artist Avatars Grid / Horizontal Scroll on mobile */}
        <div className={`flex flex-row overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-5 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 pb-2 -mx-2 px-2 transition-all duration-300 ${isRefreshing ? "opacity-40 scale-[0.99]" : "opacity-100 scale-100"}`}>
          {displayedArtists.map((artist) => {
            const isArtistPlaying =
              isPlaying &&
              currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());

            return (
              <Link
                key={artist.id}
                href={`/artist/${artist.id}`}
                className="w-28 sm:w-auto flex-shrink-0 sm:flex-shrink group flex flex-col items-center text-center gap-2 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5 select-none relative"
              >
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-surface-container-highest shadow-md p-0.5 sm:p-1 ring-2 ring-primary/20 group-hover:ring-primary group-hover:shadow-[0_0_20px_rgba(76,215,246,0.3)] transition-all">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <ArtistAvatar
                      name={artist.name}
                      avatar={artist.avatar}
                      className="w-full h-full"
                    />
                  </div>
                  {/* Persistent Mini Play Badge on bottom right of Avatar (Matches Image 1 & 2) */}
                  <button
                    onClick={(e) => handleArtistPlay(artist, e)}
                    className="absolute bottom-0 right-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_10px_rgba(76,215,246,0.6)] hover:scale-110 active:scale-95 transition-all z-10"
                    title={isArtistPlaying ? "Pause audio" : `Play ${artist.name}`}
                  >
                    <span className="material-symbols-outlined text-[15px] sm:text-[18px]">
                      {isArtistPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>
                </div>

                <div className="flex flex-col items-center min-w-0 w-full">
                  <span className="text-xs sm:text-sm font-semibold truncate transition-colors w-full text-white group-hover:text-primary">
                    {artist.name}
                  </span>
                  <span className="text-[10px] sm:text-xs text-outline truncate w-full">{artist.genre || artist.role}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section 4: My self mixes */}
      <section ref={selfMixesSectionRef} id="self-mixes" className="flex flex-col gap-5 pb-10 scroll-mt-6">
        <div className="flex items-center sm:items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider sm:tracking-widest text-primary font-bold">
                <span className="material-symbols-outlined text-[13px] sm:text-[15px]">cloud_download</span>
                <span className="sm:hidden">Archive &amp; Rips</span>
                <span className="hidden sm:inline">Personal Archive &amp; Offline Rips</span>
              </div>
              <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded-full bg-secondary-container/70 text-secondary border border-secondary/30 font-semibold flex-shrink-0">
                {selfMixes?.length || 0} {selfMixes?.length === 1 ? "Mix" : "Mixes"}
              </span>
            </div>
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight mt-0.5 sm:mt-1 truncate">
              My self mixes
            </h2>
          </div>

          {/* Carousel Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Link
              href="/self-mix"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 text-[11px] sm:text-xs font-semibold text-outline hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-[15px] sm:text-[16px] text-primary">add</span>
              <span className="sm:hidden">Mix</span>
              <span className="hidden sm:inline">New Mix</span>
            </Link>
            <button
              onClick={() => scrollMixes("left")}
              className="hidden sm:flex w-8 h-8 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 items-center justify-center text-outline hover:text-white transition-all active:scale-90 shadow-md cursor-pointer"
              title="Scroll left"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              onClick={() => scrollMixes("right")}
              className="hidden sm:flex w-8 h-8 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 items-center justify-center text-outline hover:text-white transition-all active:scale-90 shadow-md cursor-pointer"
              title="Scroll right"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Mixes Section: Mobile Sleek Horizontal List + Desktop Responsive Grid */}
        {(() => {
          const displayedMixes = (selfMixes && selfMixes.length > 0) ? selfMixes : NOCTURNE_MIXES;

          return (
            <>
              {/* 1. Mobile Horizontal Cards (< md) matching Image 2 */}
              <div className="flex flex-col gap-2.5 md:hidden">
                {displayedMixes.map((mix, idx) => {
                  const tracks = mix.tracks || [];
                  const isMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
                  const rawSpec =
                    mix.spec || (idx === 0 ? "HI-FI" : idx === 1 ? "SPATIAL 360" : idx === 2 ? "32-BIT" : "FLAC");
                  const specBadge = rawSpec.includes("24-Bit") ? "24-BIT" : rawSpec.length > 8 ? rawSpec.split("•")[0].trim() : rawSpec;

                  return (
                    <div
                      key={mix.id}
                      onClick={() => router.push(`/self-mix?id=${mix.id}`)}
                      className="p-3 rounded-2xl glass-card border border-white/5 hover:border-primary/40 active:scale-[0.98] transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container-highest flex-shrink-0 shadow border border-white/10">
                          <img
                            src={
                              mix.coverUrl ||
                              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
                            }
                            alt={mix.title}
                            className="w-full h-full object-cover"
                          />
                          {isMixPlaying && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="material-symbols-outlined text-primary text-[16px] animate-pulse">
                                graphic_eq
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-primary transition-colors truncate">
                              {mix.title}
                            </h3>
                            <span className="text-[7.5px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 flex-shrink-0">
                              {specBadge}
                            </span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
                            {tracks.length} {tracks.length === 1 ? "track" : "tracks"} • {mix.curator || "You"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleMixPlay(mix, e)}
                        className="w-9 h-9 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_12px_rgba(76,215,246,0.5)] active:scale-90 cursor-pointer"
                        title={isMixPlaying ? "Pause Mix" : "Play Mix"}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {isMixPlaying ? "pause" : "play_arrow"}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 2. Desktop Grid (md:) */}
              <div
                ref={mixesContainerRef}
                className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
              >
                {displayedMixes.map((mix) => {
                  const tracks = mix.tracks || [];
                  const isMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

                  return (
                    <Link
                      key={mix.id}
                      href={`/self-mix?id=${mix.id}`}
                      className="group flex flex-col justify-between p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-lg select-none cursor-pointer"
                    >
                      <div>
                        {/* Top Image Box with floating badges */}
                        <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3.5">
                          <img
                            src={
                              mix.coverUrl ||
                              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
                            }
                            alt={mix.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />

                          {/* Left floating badge */}
                          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-[10px] font-medium text-white flex items-center gap-1.5 shadow-md">
                            <span className="material-symbols-outlined text-[13px] text-primary">
                              queue_music
                            </span>
                            <span>SELF MIX</span>
                          </div>

                          {/* Right floating badge */}
                          <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-cyan-500/40 bg-cyan-950/70 text-cyan-300 backdrop-blur-md shadow-md">
                            {tracks.length} {tracks.length === 1 ? "TRACK" : "TRACKS"}
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
                              equalizer
                            </span>
                          </div>
                        </div>

                        {/* Subtitle */}
                        <p className="text-xs text-on-surface-variant line-clamp-2 mt-1.5 leading-relaxed">
                          {mix.subtitle || mix.description || `Self mix by ${mix.curator || "You"}`}
                        </p>
                      </div>

                      {/* Footer: Metadata + Play Button */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-outline">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          <span>
                            {tracks.length} tracks • {mix.duration || "Self Mix"}
                          </span>
                        </div>

                        <button
                          onClick={(e) => handleMixPlay(mix, e)}
                          className="w-9 h-9 rounded-full bg-primary/20 hover:bg-primary text-primary hover:text-surface-container-lowest border border-primary/40 hover:border-primary flex items-center justify-center shadow-md transform group-hover:scale-105 active:scale-90 transition-all duration-300 cursor-pointer"
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
            </>
          );
        })()}
      </section>
    </div>
  );
}
