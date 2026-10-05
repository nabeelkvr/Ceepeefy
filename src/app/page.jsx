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
import RecommendationCard from "../components/RecommendationCard";
import { getPersonalizedRecommendations } from "../utils/personalizedRecommendations";
import {
  SPOTIFY_STYLE_PLAYLISTS,
  MALAYALAM_HITS,
  MADE_FOR_YOU_TRACKS,
  CHILL_RELAX_TRACKS,
} from "../data/curatedDiscovery";

const FEATURED_PLAYLIST_COLLECTION = [
  {
    id: "hindi-hits",
    playlistId: "midnight-reverie",
    title: "Hindi",
    subtitle: "हिट्स",
    gradient: "from-[#6f0f1b] via-[#480a11] to-[#1c0307]",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "english-top-hits",
    playlistId: "midnight-club",
    title: "English",
    subtitle: "Top Hits",
    gradient: "from-[#0c4a6e] via-[#082f49] to-[#02131e]",
    image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "chill-vibes",
    playlistId: "late-night-lofi",
    title: "Chill",
    subtitle: "Vibes",
    gradient: "from-[#4a123f] via-[#2f0c29] to-[#120410]",
    image: "https://images.unsplash.com/photo-1509233725247-49e657c54213?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "workout-beats",
    playlistId: "deep-state",
    title: "Workout",
    subtitle: "Beats",
    gradient: "from-[#1e293b] via-[#0f172a] to-[#020617]",
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "punjabi-hits",
    playlistId: "cyberpunk-atmosphere",
    title: "Punjabi",
    subtitle: "ਪੰਜਾਬੀ Pop",
    gradient: "from-[#78350f] via-[#451a03] to-[#1c0802]",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "malayalam-chill",
    playlistId: "acoustic-focus",
    title: "Malayalam",
    subtitle: "മലയാളം Hits",
    gradient: "from-[#064e3b] via-[#022c22] to-[#01140f]",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "bollywood-romance",
    playlistId: "coffee-chill",
    title: "Bollywood",
    subtitle: "Romance",
    gradient: "from-[#831843] via-[#500724] to-[#1f020d]",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "lofi-midnight",
    playlistId: "study-lofi",
    title: "Lo-Fi",
    subtitle: "Midnight",
    gradient: "from-[#312e81] via-[#1e1b4b] to-[#090820]",
    image: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
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

  // 4 big cards in 2 rows, randomly chosen from curated featured collection
  const [featuredCards, setFeaturedCards] = useState(() => FEATURED_PLAYLIST_COLLECTION.slice(0, 4));

  useEffect(() => {
    // Randomize 4 cards on client mount to display in 2 rows randomly
    const shuffled = [...FEATURED_PLAYLIST_COLLECTION].sort(() => 0.5 - Math.random());
    setFeaturedCards(shuffled.slice(0, 4));
  }, []);

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

      {/* Section 2: Featured Playlists (Image 1: 4 big cards in 2 rows randomly) */}
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

        {/* 4 Big Cards in 2 Rows */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5">
          {featuredCards.map((card) => {
            const nocturnePl = NOCTURNE_PLAYLISTS.find((p) => p.id === card.playlistId);
            const playlistTracks = nocturnePl?.tracks?.length ? nocturnePl.tracks : NOCTURNE_TRACKS;
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
                className={`relative h-24 sm:h-28 md:h-32 rounded-[4px] overflow-hidden bg-gradient-to-r ${card.gradient} border border-white/10 hover:border-primary/50 transition-all duration-300 hover:scale-[1.02] shadow-xl group cursor-pointer flex items-center justify-between p-3.5 sm:p-5 md:p-6 select-none`}
              >
                {/* Left: Big Bold Title & Subtitle */}
                <div className="flex flex-col justify-center min-w-0 z-10 max-w-[55%]">
                  <h3 className="text-base sm:text-lg md:text-2xl font-black text-white tracking-tight leading-none drop-shadow-md">
                    {card.title}
                  </h3>
                  <p className="text-xs sm:text-sm font-semibold text-white/75 mt-1 sm:mt-1.5 drop-shadow-sm truncate">
                    {card.subtitle}
                  </p>
                </div>

                {/* Right: Cover Photo with Smooth Mask Gradient */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1/2 sm:w-5/12 h-full overflow-hidden select-none pointer-events-none"
                  style={{
                    maskImage: "linear-gradient(to left, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)",
                    WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)",
                  }}
                >
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>

                {/* Hover / Active Play Button */}
                <div className="absolute right-3 sm:right-5 bottom-2.5 sm:bottom-3.5 z-20">
                  <button
                    type="button"
                    onClick={handlePlayClick}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.6)] transition-all duration-300 hover:scale-110 active:scale-95 ${
                      isCardPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0"
                    }`}
                    title={isCardPlaying ? "Pause" : "Play"}
                  >
                    <span className="material-symbols-outlined text-[20px] sm:text-[24px]">
                      {isCardPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Under the 4 Big Cards: Spotify-Style Curated Playlist Row (Image 1) */}
        <div className="flex flex-col gap-2 pt-1 sm:pt-2">
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Trending Playlists
          </h3>

          <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4 pb-2 pt-1 -mx-2 px-2">
            {SPOTIFY_STYLE_PLAYLISTS.map((pl) => (
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

        {/* Responsive Grid: EXACTLY 3 cards per row on Desktop, 2 on Tablet, EXACTLY 2 on Mobile */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5 lg:gap-3.5">
          {recommendedTracks.map((track) => (
            <RecommendationCard
              key={track.id}
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
          {MALAYALAM_HITS.map((track) => (
            <SongCard key={track.id} track={track} trackList={MALAYALAM_HITS} />
          ))}
        </div>
      </section>

      {/* Section 6: Chill & Relax */}
      <section className="flex flex-col gap-3.5 md:gap-4.5">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight">
            Chill &amp; Relax
          </h2>
          <Link
            href="/playlist/late-night-lofi"
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span>Chill Stream</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth gap-3 md:gap-4.5 pb-2 pt-1 -mx-2 px-2">
          {CHILL_RELAX_TRACKS.map((track) => (
            <SongCard key={track.id} track={track} trackList={CHILL_RELAX_TRACKS} />
          ))}
        </div>
      </section>

      {/* Section 7: My self mixes */}
      <section ref={selfMixesSectionRef} id="self-mixes" className="flex flex-col gap-4 pb-10 scroll-mt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight truncate">
              My self mixes
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary-container/70 text-secondary border border-secondary/30 font-semibold flex-shrink-0">
              {selfMixes?.length || 0} {selfMixes?.length === 1 ? "Mix" : "Mixes"}
            </span>
          </div>

          <Link
            href="/self-mix"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/10 hover:border-primary/50 text-xs font-semibold text-outline hover:text-white transition-all"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">add</span>
            <span>New Mix</span>
          </Link>
        </div>

        {/* Mixes Section: Mobile Sleek Horizontal List + Desktop Responsive Grid */}
        {(() => {
          const displayedMixes = (selfMixes && selfMixes.length > 0) ? selfMixes : NOCTURNE_MIXES;

          return (
            <>
              {/* 1. Mobile Horizontal Cards (< md) */}
              <div className="flex flex-col gap-2 md:hidden">
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
                      className="p-1.5 sm:p-2 rounded-[4px] hover:bg-white/[0.04] transition-all flex items-center justify-between gap-3 cursor-pointer group select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative w-12 h-12 rounded-[4px] overflow-hidden bg-surface-container-highest flex-shrink-0 shadow border border-white/10">
                          <img
                            src={
                              mix.coverUrl ||
                              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
                            }
                            alt={mix.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover rounded-[4px]"
                          />
                          {isMixPlaying && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-[4px]">
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
                        className="w-8 h-8 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_12px_rgba(76,215,246,0.5)] active:scale-90 cursor-pointer"
                        title={isMixPlaying ? "Pause Mix" : "Play Mix"}
                      >
                        <span className="material-symbols-outlined text-[18px]">
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
                className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
              >
                {displayedMixes.map((mix) => {
                  const tracks = mix.tracks || [];
                  const isMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

                  return (
                    <Link
                      key={mix.id}
                      href={`/self-mix?id=${mix.id}`}
                      className="group flex flex-col justify-between cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1"
                    >
                      <div>
                        {/* Top Image Box with floating badges & rounded-[4px] edges */}
                        <div className="relative aspect-[16/10] w-full rounded-[4px] overflow-hidden bg-surface-container-highest shadow-md mb-2">
                          <img
                            src={
                              mix.coverUrl ||
                              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
                            }
                            alt={mix.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 rounded-[4px]"
                          />

                          {/* Left floating badge */}
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-[3px] bg-black/75 backdrop-blur-md border border-white/10 text-[9px] font-medium text-white flex items-center gap-1 shadow-md">
                            <span className="material-symbols-outlined text-[12px] text-primary">
                              queue_music
                            </span>
                            <span>SELF MIX</span>
                          </div>

                          {/* Right floating badge */}
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-[3px] text-[9px] font-mono font-bold tracking-wider uppercase border border-cyan-500/40 bg-cyan-950/80 text-cyan-300 backdrop-blur-md shadow-md">
                            {tracks.length} {tracks.length === 1 ? "TRACK" : "TRACKS"}
                          </div>

                          {/* Hover / Playing Play Button */}
                          <div
                            className={`absolute inset-0 bg-black/35 flex items-end justify-end p-2 transition-all duration-200 ${
                              isMixPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleMixPlay(mix, e)}
                              className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.6)] transform hover:scale-110 active:scale-95 transition-all cursor-pointer"
                              title={isMixPlaying ? "Pause Mix" : "Play Mix"}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {isMixPlaying ? "pause" : "play_arrow"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Title & Playing Indicator */}
                        <div className="flex items-center justify-between gap-1.5">
                          <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-primary transition-colors truncate">
                            {mix.title}
                          </h3>
                          {isMixPlaying && (
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <span className="w-1 h-3 bg-primary rounded-full animate-pulse" />
                              <span className="w-1 h-4 bg-primary rounded-full animate-pulse delay-75" />
                              <span className="w-1 h-2 bg-primary rounded-full animate-pulse delay-150" />
                            </div>
                          )}
                        </div>

                        {/* Subtitle */}
                        <p className="text-[11px] text-neutral-400 line-clamp-2 mt-0.5 leading-snug">
                          {mix.subtitle || mix.description || `Self mix by ${mix.curator || "You"}`}
                        </p>
                      </div>

                      {/* Footer: Metadata */}
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5 text-[10.5px] font-mono text-outline">
                        <span>{tracks.length} tracks • {mix.duration || "Self Mix"}</span>
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
