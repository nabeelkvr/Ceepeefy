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
import PlaylistCover from "../components/PlaylistCover";
import SongCard from "../components/SongCard";
import PlaylistCard from "../components/PlaylistCard";
import { formatPlaylistDuration } from "../utils/playlistUtils";
import { fetchSpotifyDiscovery } from "../services/spotifyClientService";
import SpotifyArtistCard from "../components/SpotifyArtistCard";
import SpotifyBadge, { SpotifyIcon } from "../components/SpotifyBadge";
import Footer from "../components/Footer";
import RecommendationCard from "../components/RecommendationCard";
import { getPersonalizedRecommendations } from "../utils/personalizedRecommendations";
import {
  SPOTIFY_STYLE_PLAYLISTS,
  MALAYALAM_HITS,
  MADE_FOR_YOU_TRACKS,
  CHILL_RELAX_TRACKS,
  HINDI_BESTS_TRACKS,
  TAMIL_HITS,
  ENGLISH_VIBES_TRACKS,
  BEAST_PHONKS_TRACKS,
} from "../data/curatedDiscovery";

const FEATURED_PLAYLIST_COLLECTION = [
  {
    id: "chill-vibes",
    playlistId: "chill-vibes",
    badgeIcon: "music_note",
    badgeLabel: "Chill Vibes",
    badgeClass: "bg-[#6366f1]/25 text-[#c7d2fe] border-[#818cf8]/40",
    buttonBg: "from-[#6366f1] to-[#818cf8]",
    cardBorder: "border-[#6366f1]/30 hover:border-[#818cf8]/70 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]",
    cardGradient: "from-[#0f0c29]/95 via-[#1b143f]/85 to-[#0b0819]/90",
    title: "Chill Vibes",
    subtitle: "Relax • Unwind • Feel Good",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "top-hits-2025",
    playlistId: "top-hits-2025",
    badgeIcon: "local_fire_department",
    badgeLabel: "Top Hits",
    badgeClass: "bg-[#f43f5e]/25 text-[#fecdd3] border-[#fb7185]/40",
    buttonBg: "from-[#f43f5e] to-[#fb7185]",
    cardBorder: "border-[#f43f5e]/30 hover:border-[#fb7185]/70 hover:shadow-[0_0_30px_rgba(244,63,94,0.3)]",
    cardGradient: "from-[#200511]/95 via-[#3b0821]/85 to-[#12020a]/90",
    title: "Top Hits 2025",
    subtitle: "Trending Now",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "gym-power",
    playlistId: "gym-power",
    badgeIcon: "star",
    badgeLabel: "Workout",
    badgeClass: "bg-[#059669]/25 text-[#a7f3d0] border-[#34d399]/40",
    buttonBg: "from-[#059669] to-[#10b981]",
    cardBorder: "border-[#059669]/30 hover:border-[#34d399]/70 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]",
    cardGradient: "from-[#021f18]/95 via-[#06382b]/85 to-[#01140f]/90",
    title: "Gym Power",
    subtitle: "Be Stronger Every Day",
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "love-ballads",
    playlistId: "love-ballads",
    badgeIcon: "favorite",
    badgeLabel: "Romantic",
    badgeClass: "bg-[#c026d3]/25 text-[#f5d0fe] border-[#e879f9]/40",
    buttonBg: "from-[#c026d3] to-[#d946ef]",
    cardBorder: "border-[#c026d3]/30 hover:border-[#e879f9]/70 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)]",
    cardGradient: "from-[#1d0628]/95 via-[#350b4a]/85 to-[#0f0215]/90",
    title: "Love Ballads",
    subtitle: "For Special Moments",
    image: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&auto=format&fit=crop&q=80",
  },
];

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
    clearRecentlyPlayed,
    bumpPlaylistToTop,
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
  const spotifyArtistsRef = useRef(null);

  // Spotify Discovery state (populated from Spotify Web API discovery endpoint)
  const [spotifyDiscovery, setSpotifyDiscovery] = useState({ artists: [] });
  const [isSpotifyLoading, setIsSpotifyLoading] = useState(false);

  // Dynamic Personalized Recommendations (Ranked by user listening history & behavior)
  const [recommendationSeed, setRecommendationSeed] = useState(0);

  const recommendedTracks = useMemo(() => {
    return getPersonalizedRecommendations(recentlyPlayedTracks, {
      limit: 12,
      refreshSeed: recommendationSeed,
    });
  }, [recentlyPlayedTracks, recommendationSeed]);

  useEffect(() => {
    let isMounted = true;
    setIsSpotifyLoading(true);
    fetchSpotifyDiscovery()
      .then((data) => {
        if (isMounted && data) {
          setSpotifyDiscovery({
            artists: Array.isArray(data.artists) ? data.artists : [],
          });
        }
      })
      .catch((err) => {
        console.warn("[Spotify Home] Discovery error:", err);
      })
      .finally(() => {
        if (isMounted) setIsSpotifyLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const scrollSpotifyArtists = (direction) => {
    if (spotifyArtistsRef.current) {
      const scrollAmount = direction === "left" ? -350 : 350;
      spotifyArtistsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };



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
    if (playlist?.id && bumpPlaylistToTop) {
      bumpPlaylistToTop(playlist.id);
    }
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
  const [refreshSeed] = useState(0);
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

  // Automatically rotates every day based on the calendar day seed + interactive refresh
  const displayedArtists = useMemo(() => {
    const daySeed = getTodayDaySeed();
    const effectiveSeed = daySeed + refreshSeed * 37;
    return getArtistsByCategory(artistCategory, effectiveSeed, liveTrendingArtists, 12);
  }, [artistCategory, refreshSeed, liveTrendingArtists]);

  // Automatically rotates Malayalam Hits every calendar day with random popular songs
  const dailyMalayalamHits = useMemo(() => {
    const daySeed = getTodayDaySeed();
    const list = [...MALAYALAM_HITS];
    let m = list.length, t, i;
    let seed = daySeed * 47;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    while (m) {
      i = Math.floor(random() * m--);
      t = list[m];
      list[m] = list[i];
      list[i] = t;
    }
    return list;
  }, []);

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

      {/* Section 1: Recently played songs - Single-row header */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Recently played songs
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            {displayRecentlyPlayed.length > 0 && (
              <button
                type="button"
                onClick={clearRecentlyPlayed}
                className="flex items-center gap-1 text-xs font-semibold text-outline hover:text-white hover:border-white/20 transition-all px-2.5 py-1 rounded-lg bg-surface-container/60 hover:bg-surface-container border border-white/5 cursor-pointer active:scale-95"
                title="Clear recently played history"
              >
                <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                <span>Clear</span>
              </button>
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
            className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2"
          >
            {displayRecentlyPlayed.map((track) => (
              <SongCard
                key={track.id}
                track={track}
                trackList={displayRecentlyPlayed}
                imageRounded="rounded-md"
                onPlay={() => handleTrackClick(track)}
              />
            ))}
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

      {/* Section 2: Featured Playlists (Image 1: 4 modern cards in a row with badges and Play Now buttons) */}
      <section ref={playlistsSectionRef} id="featured-playlists" className="flex flex-col gap-3.5 sm:gap-4.5 scroll-mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Featured Playlists
          </h2>

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

        {/* 4 Cards (Responsive: 2 cols on mobile, 2 cols on tablet, 4 cols on desktop - totally 4 in 2 rows on mobile) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-4.5">
          {FEATURED_PLAYLIST_COLLECTION.map((card) => {
            const spotPl = SPOTIFY_STYLE_PLAYLISTS.find(
              (p) => p.id === card.playlistId || p.playlistId === card.playlistId
            );
            const nocturnePl = NOCTURNE_PLAYLISTS.find((p) => p.id === card.playlistId);
            const playlistTracks = spotPl?.tracks?.length
              ? spotPl.tracks
              : nocturnePl?.tracks?.length
              ? nocturnePl.tracks
              : NOCTURNE_TRACKS;
            const isCardPlaying = isPlaying && playlistTracks.some((t) => t.id === currentTrack?.id);

            const handleCardClick = () => {
              router.push(`/playlist/${card.playlistId}`);
            };

            const handlePlayClick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isCardPlaying) {
                togglePlay();
              } else if (playlistTracks.length > 0) {
                playTrack(playlistTracks[0], playlistTracks);
              }
            };

            return (
              <div
                key={card.id}
                onClick={handleCardClick}
                className={`relative h-32 sm:h-48 lg:h-52 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-br ${card.cardGradient} border ${card.cardBorder} transition-all duration-300 hover:scale-[1.02] shadow-md sm:shadow-xl group cursor-pointer flex flex-col justify-between p-2.5 sm:p-5 select-none`}
              >
                {/* Background Image with Ambient Smooth Mask */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-3/5 sm:w-7/12 h-full overflow-hidden select-none pointer-events-none"
                  style={{
                    maskImage: "linear-gradient(to left, rgba(0,0,0,0.95) 30%, rgba(0,0,0,0) 100%)",
                    WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.95) 30%, rgba(0,0,0,0) 100%)",
                  }}
                >
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                </div>

                {/* Top Badge */}
                <div className="z-10 flex items-center">
                  <div
                    className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[9px] sm:text-xs font-semibold backdrop-blur-md border ${card.badgeClass}`}
                  >
                    <span className="material-symbols-outlined text-[12px] sm:text-[14px] leading-none">
                      {card.badgeIcon}
                    </span>
                    <span className="truncate">{card.badgeLabel}</span>
                  </div>
                </div>

                {/* Bottom Content: Title, Subtitle, Play Button */}
                <div className="z-10 flex flex-col mt-auto pt-1 sm:pt-2">
                  <h3 className="text-xs sm:text-lg lg:text-xl font-bold text-white tracking-tight leading-tight drop-shadow-md truncate">
                    {card.title}
                  </h3>
                  <p className="text-[9.5px] sm:text-xs font-normal text-white/75 mt-0.5 drop-shadow-sm truncate max-w-full hidden sm:block">
                    {card.subtitle}
                  </p>

                  <div className="mt-1.5 sm:mt-3">
                    <button
                      type="button"
                      onClick={handlePlayClick}
                      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full bg-gradient-to-r ${card.buttonBg} text-white text-[10px] sm:text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all w-fit cursor-pointer`}
                    >
                      <span className="material-symbols-outlined text-[13px] sm:text-[16px] leading-none">
                        {isCardPlaying ? "pause" : "play_arrow"}
                      </span>
                      <span>{isCardPlaying ? "Pause" : "Play Now"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Carousel Pagination Indicator (Image 1) */}
        <div className="flex items-center justify-center gap-1.5 pt-1.5 pb-1">
          <div className="w-4 h-1.5 rounded-full bg-primary/80" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Under the 4 Big Cards: Spotify-Style Curated Playlist Row (Excluding the 4 featured cards above) */}
        <div className="flex flex-col gap-2 pt-1 sm:pt-2">
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Trending Playlists
          </h3>

          <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4 pb-2 pt-1 -mx-2 px-2">
            {SPOTIFY_STYLE_PLAYLISTS.filter(
              (pl) =>
                !FEATURED_PLAYLIST_COLLECTION.some(
                  (f) => f.playlistId === pl.id || f.playlistId === pl.playlistId
                )
            ).map((pl) => (
              <PlaylistCard key={pl.id} playlist={pl} />
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Redesigned Recommended for You (Horizontal Compact Cards: 3/row Desktop, 2/row Mobile) */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Recommended for You
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setRecommendationSeed((prev) => prev + 1)}
              className="flex items-center gap-1 text-xs font-semibold text-outline hover:text-white hover:border-white/20 transition-all px-2.5 py-1 rounded-lg bg-surface-container/60 hover:bg-surface-container border border-white/5 cursor-pointer active:scale-95"
              title="Refresh recommendations"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link
              href="/search"
              className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
            >
              <span>Explore More</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Responsive Grid: 4 rows on mobile (8 items, 2 cols), 4 rows on desktop (12 items, 3 cols) */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5 lg:gap-3.5">
          {recommendedTracks.map((track, index) => (
            <div
              key={track.id}
              className={index >= 8 ? "hidden lg:block min-w-0" : "block min-w-0"}
            >
              <RecommendationCard
                track={track}
                trackList={recommendedTracks}
                onPlay={() => {
                  if (currentTrack?.id === track.id) {
                    togglePlay();
                  } else {
                    playTrack(track, recommendedTracks);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Dynamic & Categorized Popular Artists */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Popular artists
          </h2>
          <Link
            href="/artists"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Show All ({NOCTURNE_ARTISTS.length})</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
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

        {/* Dynamic Artist Avatars Grid: 2 rows on mobile (3 cols x 2 rows), grid on tablet/desktop */}
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4 md:gap-5 pb-2 transition-all duration-300">
          {displayedArtists.map((artist, index) => {
            const isArtistPlaying =
              isPlaying &&
              currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase());

            return (
              <Link
                key={artist.id}
                href={`/artist/${artist.id}`}
                className={`w-full group flex flex-col items-center text-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-[4px] hover:bg-white/[0.04] transition-all duration-200 cursor-pointer select-none relative ${index >= 6 ? "hidden sm:flex" : "flex"
                  }`}
              >
                <div className="relative w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-surface-container-highest shadow-md p-0.5 sm:p-1 ring-2 ring-primary/20 group-hover:ring-primary group-hover:shadow-[0_0_20px_rgba(76,215,246,0.3)] transition-all">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <ArtistAvatar
                      name={artist.name}
                      avatar={artist.avatar}
                      className="w-full h-full"
                    />
                  </div>
                  {/* Persistent Centered Mini Play Badge on bottom right of Avatar */}
                  <button
                    onClick={(e) => handleArtistPlay(artist, e)}
                    className="absolute bottom-0 right-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_10px_rgba(76,215,246,0.6)] hover:scale-110 active:scale-95 transition-all z-10"
                    title={isArtistPlaying ? "Pause audio" : `Play ${artist.name}`}
                  >
                    {isArtistPlaying ? (
                      <span className="material-symbols-outlined text-[12px] sm:text-[14px] leading-none flex items-center justify-center">
                        pause
                      </span>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current translate-x-[0.5px]"
                      >
                        <polygon points="6 4 19 12 6 20" />
                      </svg>
                    )}
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

      {/* Spotify Discovery: Spotify Artists */}
      {spotifyDiscovery.artists.length > 0 && (
        <section className="flex flex-col gap-3.5 md:gap-4.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <SpotifyIcon className="w-5 h-5 text-[#1DB954]" />
              <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
                Spotify Artists
              </h2>
              <SpotifyBadge label="Spotify" size="xs" />
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scrollSpotifyArtists("left")}
                  className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-colors cursor-pointer"
                  title="Scroll left"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollSpotifyArtists("right")}
                  className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-colors cursor-pointer"
                  title="Scroll right"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>

              <Link
                href="/search"
                className="flex items-center gap-1 text-on-surface-variant hover:text-[#1ed760] transition-colors text-xs font-semibold uppercase tracking-wider group"
              >
                <span>Search Spotify</span>
                <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>

          <div
            ref={spotifyArtistsRef}
            className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4 pb-2 pt-1 -mx-2 px-2"
          >
            {spotifyDiscovery.artists.map((artist) => (
              <SpotifyArtistCard key={artist.id} artist={artist} isCarousel={true} />
            ))}
          </div>
        </section>
      )}

      {/* Section 5: Malayalam Hits */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Malayalam Hits
          </h2>
          <Link
            href="/artists"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Show All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {dailyMalayalamHits.map((track) => (
            <SongCard key={track.id} track={track} trackList={dailyMalayalamHits} />
          ))}
        </div>
      </section>

      {/* Section 6: Hindi Bests */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
              Hindi Bests
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold flex-shrink-0">
              Trending
            </span>
          </div>
          <Link
            href="/search?genre=hindi"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Explore All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {HINDI_BESTS_TRACKS.map((track) => (
            <SongCard key={track.id} track={track} trackList={HINDI_BESTS_TRACKS} />
          ))}
        </div>
      </section>

      {/* Section 7: Tamil Hits */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
              Tamil Hits
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 font-semibold flex-shrink-0">
              Hot & Trending
            </span>
          </div>
          <Link
            href="/search?genre=tamil"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Explore All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {TAMIL_HITS.map((track) => (
            <SongCard key={track.id} track={track} trackList={TAMIL_HITS} />
          ))}
        </div>
      </section>

      {/* Section 8: English Vibes */}
      <section className="flex flex-col gap-3.5 md:gap-4.5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
              English Vibes
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-400/15 text-purple-400 border border-purple-400/30 font-semibold flex-shrink-0">
              Global Hits
            </span>
          </div>
          <Link
            href="/search?genre=english"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Explore All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {ENGLISH_VIBES_TRACKS.map((track) => (
            <SongCard key={track.id} track={track} trackList={ENGLISH_VIBES_TRACKS} />
          ))}
        </div>
      </section>

      {/* Section 9: Beast Phonks */}
      <section className="flex flex-col gap-3.5 md:gap-4.5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>Beast Phonks</span>
              <span className="material-symbols-outlined text-rose-500 text-[20px] sm:text-[24px]">local_fire_department</span>
            </h2>
          </div>
          <Link
            href="/search?genre=phonk"
            className="flex items-center gap-1 text-on-surface-variant hover:text-rose-400 transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Explore All</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {BEAST_PHONKS_TRACKS.map((track) => (
            <SongCard key={track.id} track={track} trackList={BEAST_PHONKS_TRACKS} />
          ))}
        </div>
      </section>

      {/* Modern Footer matching Image 2 */}
      <Footer />
    </div>
  );
}
