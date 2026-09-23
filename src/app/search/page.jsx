"use client";

import React, { useRef, useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import { useDebounce } from "../../hooks/useDebounce";
import {
  searchMusicAutocomplete,
  searchMusicTracks,
  fetchAlbumDetails,
  parsePlayCount,
} from "../../services/audioService";
import { NOCTURNE_GENRES, NOCTURNE_PLAYLISTS } from "../../data/nocturneData";
import { CURATED_GENRES, getGenreById, getGenreByName } from "../../data/genreData";
import DownloadButton from "../../components/DownloadButton";
import ArtistAvatar from "../../components/ArtistAvatar";
import SongOptionsMenu from "../../components/SongOptionsMenu";
import { formatPlaylistDuration } from "../../utils/playlistUtils";

function SearchContent() {
  const {
    searchQuery,
    setSearchQuery,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearAllRecentSearches,
    currentTrack,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlay,
    toggleLike,
    isLiked,
    formatTime,
    customPlaylists,
    selfMixes,
  } = useMusic();

  const searchInputRef = useRef(null);
  const artistsCarouselRef = useRef(null);
  const albumsCarouselRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Custom debounced input (300ms delay) for smooth keystrokes
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Federated state management: segregated React states
  const [topMatch, setTopMatch] = useState(null);
  const [liveTracks, setLiveTracks] = useState([]);
  const [matchedMovie, setMatchedMovie] = useState(null);
  const [matchedArtist, setMatchedArtist] = useState(null);
  const [matchedAlbum, setMatchedAlbum] = useState(null);
  const [extraArtists, setExtraArtists] = useState([]);
  const [extraAlbums, setExtraAlbums] = useState([]);
  const [rawAlbums, setRawAlbums] = useState([]);
  const [rawArtists, setRawArtists] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [artistTracks, setArtistTracks] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const initialGenreParam = searchParams.get("genre");
  const [selectedGenre, setSelectedGenre] = useState(() => {
    if (initialGenreParam) {
      return getGenreById(initialGenreParam) || getGenreByName(initialGenreParam) || null;
    }
    return null;
  });

  const categoryFilters = ["All", "Songs", "Albums", "Playlists", "Artists"];

  // Combined matching albums - matched album first, followed by all candidate albums
  const allAlbums = useMemo(() => {
    const list = [];
    const seen = new Set();
    if (matchedAlbum?.id) {
      seen.add(String(matchedAlbum.id));
      list.push(matchedAlbum);
    }
    if (matchedMovie?.id && !seen.has(String(matchedMovie.id))) {
      seen.add(String(matchedMovie.id));
      list.push(matchedMovie);
    }
    for (const alb of rawAlbums) {
      if (alb?.id && !seen.has(String(alb.id))) {
        seen.add(String(alb.id));
        list.push(alb);
      }
    }
    for (const alb of extraAlbums) {
      if (alb?.id && !seen.has(String(alb.id))) {
        seen.add(String(alb.id));
        list.push(alb);
      }
    }
    return list;
  }, [matchedAlbum, matchedMovie, rawAlbums, extraAlbums]);

  // Combined matching artists - matched artist first, followed by all candidate artists
  const allArtists = useMemo(() => {
    const list = [];
    const seen = new Set();
    if (matchedArtist) {
      const aId = String(matchedArtist.id || matchedArtist.name || "");
      if (aId) {
        seen.add(aId.toLowerCase());
        list.push(matchedArtist);
      }
    }
    for (const art of rawArtists) {
      const aId = String(art.id || art.name || "");
      if (aId && !seen.has(aId.toLowerCase())) {
        seen.add(aId.toLowerCase());
        list.push(art);
      }
    }
    for (const art of extraArtists) {
      const aId = String(art.id || art.name || "");
      if (aId && !seen.has(aId.toLowerCase())) {
        seen.add(aId.toLowerCase());
        list.push(art);
      }
    }
    return list;
  }, [matchedArtist, rawArtists, extraArtists]);

  // The 'Playlists' Merging Logic:
  // When 'Playlists' is selected, search both the JioSaavn API for matching public playlists
  // AND the user's local custom playlists stored in the app's state/context.
  // Merge these two data sources into a single array (putting user's local matching playlists first)
  const mergedPlaylists = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const localList = [...(customPlaylists || []), ...(selfMixes || [])];
    const matchingLocal = localList
      .filter((pl) => {
        if (!q) return true;
        return (
          (pl.title || "").toLowerCase().includes(q) ||
          (pl.subtitle || "").toLowerCase().includes(q) ||
          (pl.description || "").toLowerCase().includes(q) ||
          (pl.curator || "").toLowerCase().includes(q)
        );
      })
      .map((pl) => ({
        ...pl,
        isCustom: true,
        curator: pl.curator || "You",
        trackCount: pl.tracks?.length || pl.songsCount || 0,
      }));

    const matchingRemote = (playlists || []).map((pl) => ({
      id: String(pl.id),
      title: pl.title,
      subtitle: pl.subtitle || pl.description || "Curated Playlist",
      description: pl.description || pl.subtitle || "Curated Playlist",
      coverUrl: pl.coverUrl || pl.image || pl.thumbnail,
      curator: pl.curator || "JioSaavn Editor",
      trackCount: pl.songCount || pl.trackCount || null,
      isCustom: false,
      tracks: pl.tracks || [],
    }));

    const seenIds = new Set();
    const result = [];

    // Local matching playlists first
    for (const pl of matchingLocal) {
      const pid = String(pl.id);
      if (pid && !seenIds.has(pid)) {
        seenIds.add(pid);
        result.push(pl);
      }
    }
    // Then remote public playlists
    for (const pl of matchingRemote) {
      const pid = String(pl.id);
      if (pid && !seenIds.has(pid)) {
        seenIds.add(pid);
        result.push(pl);
      }
    }

    return result;
  }, [debouncedQuery, customPlaylists, selfMixes, playlists]);

  // Combined user playlists for Browse Catalog featured section (default playlists removed)
  const allPlaylists = useMemo(
    () => customPlaylists || [],
    [customPlaylists]
  );

  // Spotlight Album and Other Albums
  const spotlightAlbum = useMemo(() => {
    return matchedAlbum || matchedMovie || allAlbums[0] || null;
  }, [matchedAlbum, matchedMovie, allAlbums]);

  const otherAlbums = useMemo(() => {
    if (!spotlightAlbum) return allAlbums;
    return allAlbums.filter((alb) => String(alb.id) !== String(spotlightAlbum.id));
  }, [allAlbums, spotlightAlbum]);

  // Spotlight Artist and Other Artists
  const spotlightArtist = useMemo(() => {
    return matchedArtist || allArtists[0] || null;
  }, [matchedArtist, allArtists]);

  const otherArtists = useMemo(() => {
    if (!spotlightArtist) return allArtists;
    const sId = String(spotlightArtist.id || spotlightArtist.name || "").toLowerCase();
    return allArtists.filter((art) => {
      const aId = String(art.id || art.name || "").toLowerCase();
      return aId && aId !== sId;
    });
  }, [allArtists, spotlightArtist]);

  // Left playlists (matching first, fallback to user created playlists)
  const leftPlaylists = useMemo(() => {
    if (mergedPlaylists && mergedPlaylists.length > 0) {
      return mergedPlaylists;
    }
    return customPlaylists || [];
  }, [mergedPlaylists, customPlaylists]);

  // Fallback synthesis if rawAlbums is empty but liveTracks has tracks with album
  useEffect(() => {
    if (!matchedAlbum && !matchedMovie && rawAlbums.length === 0 && liveTracks.length > 0) {
      const albumMap = new Map();
      liveTracks.forEach((t) => {
        const albName = (t.album || "").trim();
        if (albName && !albumMap.has(albName.toLowerCase())) {
          albumMap.set(albName.toLowerCase(), {
            id: `alb-${albName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
            title: albName,
            artist: t.artist || "Soundtrack",
            image: t.thumbnail || t.image || t.coverUrl,
            year: t.year || null,
            trackCount: liveTracks.filter((lt) => (lt.album || "").toLowerCase() === albName.toLowerCase()).length,
          });
        }
      });
      if (albumMap.size > 0) {
        const list = Array.from(albumMap.values());
        setMatchedAlbum(list[0]);
        if (list.length > 1) {
          setExtraAlbums(list.slice(1));
        }
      }
    }
  }, [liveTracks, matchedAlbum, matchedMovie, rawAlbums]);

  // Fallback synthesis if rawArtists is empty but liveTracks has tracks with artist
  useEffect(() => {
    if (!matchedArtist && rawArtists.length === 0 && liveTracks.length > 0) {
      const artistMap = new Map();
      liveTracks.forEach((t) => {
        const primary = (t.artist || "").split(/[,&/]/)[0].trim();
        if (primary && !artistMap.has(primary.toLowerCase())) {
          artistMap.set(primary.toLowerCase(), {
            id: `artist-${primary.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
            name: primary,
            role: "Artist",
            avatar: t.thumbnail || t.image || t.coverUrl,
            image: t.thumbnail || t.image || t.coverUrl,
          });
        }
      });
      if (artistMap.size > 0) {
        const list = Array.from(artistMap.values());
        setMatchedArtist(list[0]);
        if (list.length > 1) {
          setExtraArtists(list.slice(1));
        }
      }
    }
  }, [liveTracks, matchedArtist, rawArtists]);

  // ⌘K hotkey focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync initial query and genre from URL param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
    const g = searchParams.get("genre");
    if (g) {
      const found = getGenreById(g) || getGenreByName(g);
      if (found) {
        setSelectedGenre(found);
      }
    }
  }, [searchParams]);

  // Fetch predictive autocomplete results via JioSaavn autocomplete.get
  useEffect(() => {
    let isCancelled = false;

    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setTopMatch(null);
      setLiveTracks([]);
      setMatchedMovie(null);
      setMatchedArtist(null);
      setMatchedAlbum(null);
      setExtraArtists([]);
      setExtraAlbums([]);
      setRawAlbums([]);
      setRawArtists([]);
      setPlaylists([]);
      setArtistTracks([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      setSearchError(null);

      try {
        const data = await searchMusicAutocomplete(trimmed);
        if (isCancelled) return;

        const candidateSongs = Array.isArray(data.songs) ? data.songs : [];
        const candidateArtists = Array.isArray(data.artists) ? data.artists : [];
        const candidateAlbums = Array.isArray(data.albums) ? data.albums : [];
        const candidatePlaylists = Array.isArray(data.playlists) ? data.playlists : [];

        setLiveTracks(candidateSongs);
        setTopMatch(data.topMatch || null);
        setPlaylists(candidatePlaylists);
        setRawAlbums(candidateAlbums);
        setRawArtists(candidateArtists);

        // Resolve Highlight Card (Artist vs Album/Movie) from predictive response
        let selectedArtist = null;
        let selectedAlbum = null;

        if (data.topMatch) {
          if (data.topMatch.type === "artist") {
            selectedArtist = data.topMatch;
            selectedAlbum = candidateAlbums[0] || null;
          } else if (data.topMatch.type === "album") {
            selectedAlbum = data.topMatch;
            selectedArtist = candidateArtists[0] || null;
          } else {
            // song
            selectedAlbum = candidateAlbums[0] || null;
            selectedArtist = candidateArtists[0] || null;
          }
        } else {
          selectedArtist = candidateArtists[0] || null;
          selectedAlbum = candidateAlbums[0] || null;
        }

        setMatchedArtist(selectedArtist);
        setMatchedAlbum(selectedAlbum);
        setMatchedMovie(selectedAlbum?.isMovie ? selectedAlbum : null);

        // Filter other candidate albums & artists (excluding resolved highlight card)
        const otherAlbumsList = candidateAlbums.filter(
          (alb) => !selectedAlbum || String(alb.id) !== String(selectedAlbum.id)
        );
        const otherArtistsList = candidateArtists.filter(
          (art) => !selectedArtist || String(art.id) !== String(selectedArtist.id)
        );

        setExtraAlbums(otherAlbumsList);
        setExtraArtists(otherArtistsList);

        // Pre-fetch album details in background to load complete track count and tracks
        if (selectedAlbum?.id && (!selectedAlbum.tracks || selectedAlbum.tracks.length === 0)) {
          fetchAlbumDetails(selectedAlbum.id)
            .then((details) => {
              if (!isCancelled && details?.tracks?.length > 0) {
                setMatchedAlbum((prev) =>
                  prev && String(prev.id) === String(selectedAlbum.id)
                    ? {
                      ...prev,
                      trackCount: details.tracks.length,
                      tracks: details.tracks,
                    }
                    : prev
                );
              }
            })
            .catch(() => { });
        }

        // Pre-fetch artist tracks in background
        if (selectedArtist?.name) {
          searchMusicTracks(selectedArtist.name, { sort: "recent" })
            .then((tracks) => {
              if (!isCancelled && tracks?.length > 0) {
                setArtistTracks(tracks);
              }
            })
            .catch(() => {
              if (!isCancelled) setArtistTracks([]);
            });
        } else {
          setArtistTracks([]);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Predictive search error:", err);
          setSearchError("Unable to fetch live music catalog results. Please try again.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchResults();

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery]);

  // Secondary artists list
  const otherMatchedArtists = useMemo(() => {
    const list = [];
    const seen = new Set();
    if (matchedArtist?.name) {
      seen.add(matchedArtist.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
    for (const a of extraArtists) {
      const aClean = (a.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!aClean || seen.has(aClean)) continue;
      seen.add(aClean);
      list.push(a);
    }
    return list;
  }, [extraArtists, matchedArtist]);

  // Lazy Audio Resolution: Click handler sends track ID to HTML5 audio service for direct 320kbps stream
  const handleTrackClick = (track) => {
    if (!track) return;
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim(), "search");
    }
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      // Use played track as seed for intelligent recommendation queue, not the search results list
      playTrack(track, null, { fromSearch: true });
    }
  };

  const handleMovieCardClick = async (movie, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!movie) return;

    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim(), "search");
    }

    let tracksToPlay = movie.tracks || [];
    if (!tracksToPlay || tracksToPlay.length === 0) {
      try {
        const albumDetails = await fetchAlbumDetails(movie.id);
        if (albumDetails?.tracks && albumDetails.tracks.length > 0) {
          tracksToPlay = albumDetails.tracks;
        }
      } catch (err) {
        console.warn("Could not fetch official album details:", err);
      }
    }

    if (tracksToPlay.length > 0) {
      playTrack(tracksToPlay[0], tracksToPlay);
    } else if (liveTracks.length > 0) {
      playTrack(liveTracks[0], null, { fromSearch: true });
    }

    const albumId = movie.id || encodeURIComponent(movie.title);
    router.push(`/album/${albumId}`);
  };

  const handleArtistCardClick = async (artist, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!artist) return;

    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim(), "search");
    }

    let tracksToPlay = artistTracks || [];
    if (!tracksToPlay || tracksToPlay.length === 0) {
      try {
        const recentTracks = await searchMusicTracks(artist.name, { sort: "recent" });
        if (recentTracks && recentTracks.length > 0) {
          tracksToPlay = recentTracks;
        }
      } catch (err) {
        console.warn("Could not fetch artist tracks:", err);
      }
    }

    if (tracksToPlay.length > 0) {
      playTrack(tracksToPlay[0], tracksToPlay);
    } else if (liveTracks.length > 0) {
      playTrack(liveTracks[0], null, { fromSearch: true });
    }

    router.push(`/artists/${artist.id}`);
  };

  const handleDownload = async (track, e) => {
    e.stopPropagation();
    if (!track) return;

    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim(), "search");
    }
    setDownloadingId(track.id);

    try {
      const downloadParams = new URLSearchParams({
        title: track.title || "Track",
        artist: track.artist || "Artist",
        trackId: track.id || "",
      });

      if (track.audioUrl) {
        downloadParams.set("audioUrl", track.audioUrl);
      }

      const res = await fetch(`/api/audio/download?${downloadParams.toString()}`);
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `${track.title} - ${track.artist}.mp3`.replace(/[/\\?%*:|"<>]/g, "");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Audio download error:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  const isArtistPlaying =
    isPlaying &&
    Boolean(matchedArtist?.name) &&
    Boolean(currentTrack?.artist) &&
    currentTrack.artist.toLowerCase().includes(matchedArtist.name.toLowerCase());

  const isAlbumPlaying =
    isPlaying &&
    matchedAlbum &&
    ((Boolean(currentTrack?.album) && Boolean(matchedAlbum?.title) && currentTrack.album.toLowerCase() === matchedAlbum.title.toLowerCase()) ||
      (Array.isArray(matchedAlbum.tracks) && matchedAlbum.tracks.some((t) => t.id === currentTrack?.id)));

  const isMoviePlaying =
    isPlaying && matchedMovie && liveTracks.some((t) => t.id === currentTrack?.id);

  const scrollArtistsContainer = (direction) => {
    if (artistsCarouselRef.current) {
      const amount = direction === "left" ? -350 : 350;
      artistsCarouselRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const scrollAlbumsContainer = (direction) => {
    if (albumsCarouselRef.current) {
      const amount = direction === "left" ? -350 : 350;
      albumsCarouselRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  // Reusable Tracklist Row Component (used in both 'All' and 'Songs' layouts)
  const renderSongRow = (track, idx) => {
    const isCurrent = currentTrack?.id === track.id;
    const isCurrentPlaying = isCurrent && isPlaying;

    return (
      <div
        key={track.id || idx}
        onClick={() => handleTrackClick(track)}
        className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer border ${isCurrent
          ? "bg-white/10 border-primary/30"
          : "hover:bg-white/5 border-transparent hover:border-white/5"
          }`}
      >
        {/* Left: Index + Play Icon + Thumbnail + Title & Artist */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Number & Play Icon */}
          <div className="w-5 text-center flex items-center justify-center flex-shrink-0">
            {isCurrentPlaying ? (
              <div className="flex items-end gap-[2.5px] h-3.5">
                <span className="w-1 bg-primary animate-pulse rounded-full h-full" />
                <span className="w-1 bg-primary animate-pulse rounded-full h-3/4 delay-75" />
                <span className="w-1 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
              </div>
            ) : (
              <span className="text-xs font-semibold text-outline group-hover:hidden">
                {idx + 1}
              </span>
            )}
            <span
              className={`material-symbols-outlined text-primary text-[19px] ${isCurrentPlaying ? "block" : "hidden group-hover:block"
                }`}
            >
              {isCurrentPlaying ? "pause" : "play_arrow"}
            </span>
          </div>

          {/* Rounded Thumbnail */}
          <div className="w-11 h-11 md:w-12 md:h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high relative shadow-sm border border-white/5">
            <img
              src={track.thumbnail || track.image || track.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"}
              alt={track.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              loading="lazy"
            />
            {isCurrent && isBuffering && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Title & Subtitle (Artist • Album) */}
          <div className="flex flex-col min-w-0 pr-2">
            <span
              className={`text-sm md:text-base font-bold truncate transition-colors ${isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                }`}
            >
              {track.title}
            </span>
            <span className="text-xs text-on-surface-variant truncate mt-0.5">
              {track.artist}
            </span>
          </div>
        </div>

        {/* Right: Duration, Download, Like */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Duration */}
          <span className="text-xs font-mono text-outline w-10 text-right">
            {track.durationFormatted || formatTime(track.duration || 210)}
          </span>

          {/* Download Button */}
          <DownloadButton
            track={track}
            onDownloadStart={() => {
              if (searchQuery.trim()) {
                addRecentSearch(searchQuery.trim(), "search");
              }
            }}
          />

          {/* Heart / Like Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(track);
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isLiked(track.id) ? "text-primary" : "text-outline hover:text-white hover:bg-white/10"
              }`}
            title={isLiked(track.id) ? "Liked" : "Like song"}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
            >
              {isLiked(track.id) ? "favorite" : "favorite_border"}
            </span>
          </button>

          {/* 3-Dot Options Menu */}
          <SongOptionsMenu track={track} />
        </div>
      </div>
    );
  };

  // Reusable Album Card Component (Exact Image 2 Structure)
  const renderAlbumCard = (album, isCarousel = false) => {
    const isThisAlbumPlaying =
      isPlaying &&
      ((Boolean(currentTrack?.album) && Boolean(album?.title) && currentTrack.album.toLowerCase() === album.title.toLowerCase()) ||
        (Array.isArray(album?.tracks) && album.tracks.some((t) => t.id === currentTrack?.id)));

    const songCount = album.tracks?.length || album.trackCount || 1;

    return (
      <div
        key={album.id}
        onClick={(e) => handleMovieCardClick(album, e)}
        className={`group p-3.5 sm:p-4 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/75 hover:bg-surface-container transition-all duration-300 cursor-pointer shadow-lg flex flex-col justify-between select-none ${isCarousel ? "w-44 sm:w-48 flex-shrink-0" : "w-full"
          }`}
      >
        <div>
          <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
            <img
              src={album.image || album.thumbnail || album.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80"}
              alt={album.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            {/* Top-Right Badge */}
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-emerald-400 flex items-center gap-1.5 shadow-md">
              <span className="material-symbols-outlined text-[13px] text-emerald-400">
                {album.isMovie ? "movie" : "album"}
              </span>
              <span className="uppercase tracking-wider">
                {album.isMovie ? "Film" : "Album"}
              </span>
            </div>
            {/* Glowing Hover Play Button */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_22px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                <span className="material-symbols-outlined text-[28px]">
                  {isThisAlbumPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
              {album.title}
            </h3>
            <p className="text-xs text-on-surface-variant truncate mt-0.5">
              {album.isMovie ? "Film Soundtrack" : "Album"} • {album.artist || "Soundtrack"}
            </p>
          </div>
        </div>

        <div>
          {/* Metadata line */}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/10 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-outline text-[11px]">
                {songCount} Songs
              </span>
              {album.year && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-outline border border-white/10">
                  {album.year}
                </span>
              )}
            </div>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
              <span>Play & Open</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </span>
          </div>

          {/* Bottom Action Button (Image 2 exact match) */}
          <button
            type="button"
            onClick={(e) => handleMovieCardClick(album, e)}
            className="w-full mt-3 py-2 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[16px] flex-shrink-0">queue_music</span>
              <span className="truncate">
                {album.isMovie ? "Movie Playlist" : "Album Playlist"} ({songCount} Songs)
              </span>
            </div>
            <span className="material-symbols-outlined text-[15px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    );
  };

  // Reusable Artist Card Component (Exact Image 2 Structure)
  const renderArtistCard = (artist, isCarousel = false) => {
    const isThisArtistPlaying =
      isPlaying &&
      Boolean(artist?.name) &&
      Boolean(currentTrack?.artist) &&
      currentTrack.artist.toLowerCase().includes(artist.name.toLowerCase());

    return (
      <div
        key={artist.id || artist.name}
        onClick={(e) => handleArtistCardClick(artist, e)}
        className={`group p-3.5 sm:p-4 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/75 hover:bg-surface-container transition-all duration-300 cursor-pointer shadow-lg flex flex-col justify-between select-none ${isCarousel ? "w-44 sm:w-48 flex-shrink-0" : "w-full"
          }`}
      >
        <div>
          <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
            <ArtistAvatar
              name={artist.name}
              avatar={artist.avatar || artist.image}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Top-Right Badge */}
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-primary flex items-center gap-1.5 shadow-md">
              <span className="material-symbols-outlined text-[13px] text-primary">mic</span>
              <span className="uppercase tracking-wider font-bold">Artist</span>
            </div>
            {/* Glowing Hover Play Button */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_22px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                <span className="material-symbols-outlined text-[28px]">
                  {isThisArtistPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
              {artist.name}
            </h3>
            <p className="text-xs text-on-surface-variant truncate mt-0.5">
              Artist • {artist.role || artist.genre || "Verified Artist"}
            </p>
          </div>
        </div>

        <div>
          {/* Metadata line */}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/10 text-xs">
            <div className="flex items-center gap-1.5 text-outline text-[11px]">
              <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
              <span>Verified Artist</span>
            </div>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
              <span>Explore</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </span>
          </div>

          {/* Bottom Action Button (Image 2 exact match) */}
          <button
            type="button"
            onClick={(e) => handleArtistCardClick(artist, e)}
            className="w-full mt-3 py-2 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[16px] flex-shrink-0">mic</span>
              <span className="truncate">View Artist & Songs</span>
            </div>
            <span className="material-symbols-outlined text-[15px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    );
  };

  const handlePlaylistClick = (pl, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!pl) return;
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim(), "search");
    }
    if (pl.tracks && pl.tracks.length > 0) {
      playTrack(pl.tracks[0], pl.tracks);
    }
    router.push(`/playlist/${encodeURIComponent(pl.id)}?play=true`);
  };

  // Small Album Card Component for left column (Image 4 side-by-side 2-column grid)
  const renderSmallAlbumCard = (album) => {
    const isThisAlbumPlaying =
      isPlaying &&
      ((Boolean(currentTrack?.album) && Boolean(album?.title) && currentTrack.album.toLowerCase() === album.title.toLowerCase()) ||
        (Array.isArray(album?.tracks) && album.tracks.some((t) => t.id === currentTrack?.id)));
    const songCount = album.tracks?.length || album.trackCount || 1;

    return (
      <div
        key={album.id}
        onClick={(e) => handleMovieCardClick(album, e)}
        className="group p-2.5 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/5 hover:border-primary/40 transition-all duration-300 cursor-pointer shadow-md flex flex-col justify-between select-none"
      >
        <div>
          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-inner mb-2 border border-white/10">
            <img
              src={album.image || album.thumbnail || album.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"}
              alt={album.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            {/* Top-right badge */}
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-emerald-400">
              {album.isMovie ? "Film" : "Album"}
            </div>
            {/* Hover play button */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.8)]">
                <span className="material-symbols-outlined text-[18px]">
                  {isThisAlbumPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
            {isThisAlbumPlaying && (
              <div className="absolute bottom-1 right-1 flex items-end gap-[1.5px] h-2.5 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm">
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-full" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-2/3 delay-75" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
              </div>
            )}
          </div>

          <h4 className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">
            {album.title}
          </h4>
          <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
            {album.year || (album.isMovie ? "Soundtrack" : "Album")} • {songCount} songs
          </p>
        </div>
      </div>
    );
  };

  // Small Artist Card Component for left column (Image 4 side-by-side 2-column grid)
  const renderSmallArtistCard = (artist) => {
    const isThisArtistPlaying =
      isPlaying &&
      Boolean(artist?.name) &&
      Boolean(currentTrack?.artist) &&
      currentTrack.artist.toLowerCase().includes(artist.name.toLowerCase());

    return (
      <div
        key={artist.id || artist.name}
        onClick={(e) => handleArtistCardClick(artist, e)}
        className="group p-2.5 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/5 hover:border-primary/40 transition-all duration-300 cursor-pointer shadow-md flex flex-col justify-between select-none"
      >
        <div>
          <div className="relative w-full aspect-square rounded-full overflow-hidden bg-surface-container-highest shadow-inner mb-2 border border-white/10">
            <ArtistAvatar
              name={artist.name}
              avatar={artist.avatar || artist.image}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.8)]">
                <span className="material-symbols-outlined text-[18px]">
                  {isThisArtistPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
            {isThisArtistPlaying && (
              <div className="absolute bottom-1 right-1 flex items-end gap-[1.5px] h-2.5 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm">
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-full" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-2/3 delay-75" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
              </div>
            )}
          </div>

          <h4 className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate text-center">
            {artist.name}
          </h4>
          <p className="text-[10px] text-on-surface-variant truncate mt-0.5 text-center">
            {artist.role || artist.genre || "Artist"}
          </p>
        </div>
      </div>
    );
  };

  // Small Playlist Card Component for left column (Image 4 side-by-side 2-column grid)
  const renderSmallPlaylistCard = (pl) => {
    const trackCount = pl.trackCount || pl.tracks?.length || pl.songsCount || (pl.isCustom ? 0 : 25);
    const isThisPlaylistPlaying =
      isPlaying && pl.tracks && pl.tracks.some((t) => t.id === currentTrack?.id);

    return (
      <div
        key={pl.id}
        onClick={(e) => handlePlaylistClick(pl, e)}
        className="group p-2.5 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/5 hover:border-primary/40 transition-all duration-300 cursor-pointer shadow-md flex flex-col justify-between select-none"
      >
        <div>
          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-highest shadow-inner mb-2 border border-white/10">
            <img
              src={pl.coverUrl || pl.image || pl.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80"}
              alt={pl.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.8)]">
                <span className="material-symbols-outlined text-[18px]">
                  {isThisPlaylistPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
            {isThisPlaylistPlaying && (
              <div className="absolute bottom-1 right-1 flex items-end gap-[1.5px] h-2.5 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm">
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-full" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-2/3 delay-75" />
                <span className="w-0.5 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
              </div>
            )}
          </div>

          <h4 className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">
            {pl.title}
          </h4>
          <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
            {trackCount} tracks
          </p>
        </div>
      </div>
    );
  };

  // Reusable Playlist Card Component (Exact Image 2 Structure)
  const renderPlaylistCard = (pl, isCarousel = false) => {
    const trackCount = pl.trackCount || pl.tracks?.length || (pl.isCustom ? 0 : 25);
    const isThisPlaylistPlaying =
      isPlaying && pl.tracks && pl.tracks.some((t) => t.id === currentTrack?.id);

    return (
      <div
        key={pl.id}
        onClick={(e) => handlePlaylistClick(pl, e)}
        className={`group p-3.5 sm:p-4 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/75 hover:bg-surface-container transition-all duration-300 cursor-pointer shadow-lg flex flex-col justify-between select-none ${isCarousel ? "w-44 sm:w-48 flex-shrink-0" : "w-full"
          }`}
      >
        <div>
          <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
            <img
              src={pl.coverUrl || pl.image || pl.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80"}
              alt={pl.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            {/* Top-Right Badge */}
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 flex items-center gap-1.5 shadow-md">
              {pl.isCustom ? (
                <>
                  <span className="material-symbols-outlined text-[13px] text-primary">person</span>
                  <span className="text-primary uppercase tracking-wider font-bold">By You</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[13px] text-amber-400">queue_music</span>
                  <span className="text-amber-400 uppercase tracking-wider font-bold">Playlist</span>
                </>
              )}
            </div>
            {/* Glowing Hover Play Button */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_22px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                <span className="material-symbols-outlined text-[28px]">
                  {isThisPlaylistPlaying ? "pause" : "play_arrow"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
              {pl.title}
            </h3>
            <p className="text-xs text-on-surface-variant truncate mt-0.5">
              Playlist • {pl.curator || (pl.isCustom ? "You" : "JioSaavn Editor")}
            </p>
          </div>
        </div>

        <div>
          {/* Metadata line */}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/10 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-outline text-[11px]">
                {trackCount} Tracks
              </span>
              {pl.language && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-outline border border-white/10 capitalize">
                  {pl.language}
                </span>
              )}
              {pl.isCustom && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
                  Custom
                </span>
              )}
            </div>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
              <span>Play & Open</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </span>
          </div>

          {/* Bottom Action Button (Image 2 exact match) */}
          <button
            type="button"
            onClick={handlePlaylistClick}
            className="w-full mt-3 py-2 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[16px] flex-shrink-0">playlist_play</span>
              <span className="truncate">
                Open Playlist ({trackCount} Tracks)
              </span>
            </div>
            <span className="material-symbols-outlined text-[15px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    );
  };

  // Highlight Card for 'All' federated search layout (Artist Spotlight or Album Spotlight or Top Song)
  const renderHighlightCard = () => {
    const isArtistPreferred = topMatch?.type === "artist" && matchedArtist;

    if (isArtistPreferred || (!matchedAlbum && !matchedMovie && matchedArtist)) {
      return (
        <div
          onClick={(e) => handleArtistCardClick(matchedArtist, e)}
          className="group relative p-3 sm:p-3.5 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/80 hover:bg-surface-container transition-all cursor-pointer shadow-lg flex flex-col justify-between select-none w-full"
        >
          <div>
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-2.5">
              <ArtistAvatar
                name={matchedArtist.name}
                avatar={matchedArtist.avatar || matchedArtist.image}
                className="w-full h-full"
                imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-primary flex items-center gap-1 shadow-md">
                <span className="material-symbols-outlined text-[12px] text-primary">mic</span>
                <span className="uppercase tracking-wider font-bold">Artist</span>
              </div>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-11 h-11 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                  <span className="material-symbols-outlined text-[24px]">
                    {isArtistPlaying ? "pause" : "play_arrow"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
                {matchedArtist.name}
              </h3>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {matchedArtist.role || "Artist"} • {matchedArtist.genre || "Popular Artist"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center gap-1.5 text-outline text-[11px]">
                <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
                <span>{artistTracks.length > 0 ? `${artistTracks.length} Songs` : "Verified Artist"}</span>
              </div>
              <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
                <span>Play & Open</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => handleArtistCardClick(matchedArtist, e)}
              className="w-full mt-2.5 py-1.5 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[15px] flex-shrink-0">queue_music</span>
                <span className="truncate">Artist Playlist ({artistTracks.length > 0 ? `${artistTracks.length} Songs` : "All"})</span>
              </div>
              <span className="material-symbols-outlined text-[14px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </div>
      );
    }

    if (matchedAlbum || matchedMovie) {
      const alb = matchedAlbum || matchedMovie;
      const songCount = alb.tracks?.length || alb.trackCount || 1;
      return (
        <div
          onClick={(e) => handleMovieCardClick(alb, e)}
          className="group relative p-3 sm:p-3.5 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/80 hover:bg-surface-container transition-all cursor-pointer shadow-lg flex flex-col justify-between select-none w-full"
        >
          <div>
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-2.5">
              <img
                src={alb.image || alb.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80"}
                alt={alb.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-emerald-400 flex items-center gap-1 shadow-md">
                <span className="material-symbols-outlined text-[12px] text-emerald-400">
                  {alb.isMovie ? "movie" : "album"}
                </span>
                <span className="uppercase tracking-wider">
                  {alb.isMovie ? "Film" : "Album"}
                </span>
              </div>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-11 h-11 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                  <span className="material-symbols-outlined text-[24px]">
                    {isAlbumPlaying || isMoviePlaying ? "pause" : "play_arrow"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
                {alb.title}
              </h3>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {alb.isMovie ? "Film Soundtrack" : "Album"} • {alb.artist || "Soundtrack"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-outline text-[11px]">
                  {songCount} Songs
                </span>
                {alb.year && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-outline border border-white/10">
                    {alb.year}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
                <span>Play & Open</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => handleMovieCardClick(alb, e)}
              className="w-full mt-2.5 py-1.5 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[15px] flex-shrink-0">queue_music</span>
                <span className="truncate">
                  {alb.isMovie ? "Movie Playlist" : "Album Playlist"} ({songCount} Songs)
                </span>
              </div>
              <span className="material-symbols-outlined text-[14px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </div>
      );
    }

    if (liveTracks[0]) {
      const topSong = liveTracks[0];
      const isTopPlaying = currentTrack?.id === topSong.id && isPlaying;
      return (
        <div
          onClick={() => handleTrackClick(topSong)}
          className="group relative p-3 sm:p-3.5 rounded-2xl glass-card border border-white/10 hover:border-primary/40 bg-surface-container/80 hover:bg-surface-container transition-all cursor-pointer shadow-lg flex flex-col justify-between select-none w-full"
        >
          <div>
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-2.5">
              <img
                src={topSong.thumbnail || topSong.image || topSong.coverUrl}
                alt={topSong.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/80 backdrop-blur-md border border-white/15 text-primary flex items-center gap-1 shadow-md">
                <span className="material-symbols-outlined text-[12px] text-primary">music_note</span>
                <span className="uppercase tracking-wider font-bold">Top Song</span>
              </div>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-11 h-11 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.85)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                  <span className="material-symbols-outlined text-[24px]">
                    {isTopPlaying ? "pause" : "play_arrow"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-primary transition-colors truncate">
                {topSong.title}
              </h3>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {topSong.artist} • {topSong.album || "Single"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-xs">
              <span className="text-[11px] font-mono text-outline">
                {topSong.durationFormatted || formatTime(topSong.duration || 210)}
              </span>
              <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0">
                <span>Play Song</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleTrackClick(topSong)}
              className="w-full mt-2.5 py-1.5 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary hover:text-white font-bold text-xs flex items-center justify-between transition-all shadow-sm group/btn cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[15px] flex-shrink-0">play_arrow</span>
                <span className="truncate">Play Track</span>
              </div>
              <span className="material-symbols-outlined text-[14px] flex-shrink-0 group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const hasQuery = Boolean(debouncedQuery.trim());

  return (
    <div className="w-full px-3 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-6 select-none max-w-7xl mx-auto">
      {/* Search Header Bar (Hidden when inside Genre Showcase) */}
      {!selectedGenre && (
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="relative max-w-2xl w-full">
            <button
              type="button"
              onClick={() => {
                if (searchQuery.trim()) {
                  addRecentSearch(searchQuery.trim(), "search");
                }
              }}
              className="absolute left-3 md:left-3.5 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-white/10 cursor-pointer"
              title="Search"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                search
              </span>
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value && selectedGenre) {
                  setSelectedGenre(null);
                  router.replace("/search", { scroll: false });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  addRecentSearch(searchQuery.trim(), "search");
                }
              }}
              placeholder="Search any song, artist, album, playlist (e.g. Asal, Hridayam, Anirudh, Arijit)..."
              className="w-full bg-surface-container/90 border border-white/10 hover:border-white/20 focus:border-primary/50 text-white placeholder:text-outline text-xs md:text-base rounded-full pl-10 md:pl-12 pr-10 md:pr-12 py-2.5 md:py-3.5 shadow-inner outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedGenre(null);
                  router.replace("/search", { scroll: false });
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 rounded-full bg-surface-container-highest hover:bg-white/20 text-outline hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px] md:text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Category Filter Pills (All, Songs, Albums, Playlists, Artists) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
            {categoryFilters.map((cat) => {
              const isSelected = activeFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveFilter(cat)}
                  className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-xs font-semibold transition-all select-none whitespace-nowrap cursor-pointer ${isSelected
                    ? "bg-white text-surface-container-lowest shadow-sm font-bold scale-105"
                    : "bg-surface-container/70 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-white/10"
                    }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Recent Search History Chips (Visible only when search input is empty) */}
          {!searchQuery.trim() && recentSearches.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {recentSearches.map((item) => {
                  const labelText = typeof item === "string" ? item : item.label;
                  const itemId = typeof item === "string" ? item : item.id;
                  return (
                    <div
                      key={itemId}
                      onClick={() => setSearchQuery(labelText)}
                      className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container/70 hover:bg-surface-container-high text-on-surface-variant hover:text-white border border-white/10 transition-all cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[15px] text-outline group-hover:text-primary transition-colors">
                        search
                      </span>
                      <span className="font-medium text-xs truncate max-w-[140px]">
                        {labelText}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentSearch(itemId);
                        }}
                        className="text-outline hover:text-white transition-colors flex items-center justify-center ml-0.5 cursor-pointer"
                        title="Remove"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={clearAllRecentSearches}
                className="ml-auto text-xs text-outline hover:text-white font-medium whitespace-nowrap cursor-pointer transition-colors px-2 py-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {(hasQuery || activeFilter !== "All") && (!selectedGenre || debouncedQuery.trim().toLowerCase() !== selectedGenre?.name?.toLowerCase()) ? (
        <div className="flex flex-col gap-8 animate-fade-in">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-primary font-mono uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Predicting live catalog results...</span>
            </div>
          )}

          {/* Search Error */}
          {searchError && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error_outline</span>
              <span>{searchError}</span>
            </div>
          )}

          {/* Conditional Layouts based on activeFilter */}
          {!isLoading && (
            <>
              {/* 1. 'All' Layout: Federated View (Highlight Card on Left, Top Songs on Right, Artists & Albums Carousels Below) */}
              {activeFilter === "All" && (
                <>
                  {liveTracks.length === 0 && allAlbums.length === 0 && allArtists.length === 0 && mergedPlaylists.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container/80 border border-white/10 flex items-center justify-center text-outline mb-1">
                        <span className="material-symbols-outlined text-[28px]">music_off</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        No results found for &quot;{debouncedQuery}&quot;
                      </h3>
                      <p className="text-xs text-outline max-w-md">
                        Check your spelling or explore top trending artists, albums, and playlists.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-8">
                      {/* Top 2-Column Section */}
                      <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
                        {/* Left Column: Big Spot Album -> Other Albums (Image 4 2-col grid) -> Big Spot Artists -> Other Artists -> Playlists */}
                        {(spotlightAlbum || spotlightArtist || otherAlbums.length > 0 || otherArtists.length > 0 || leftPlaylists.length > 0) && (
                          <div className="w-full sm:max-w-[290px] lg:w-[275px] xl:w-[290px] flex-shrink-0 flex flex-col gap-5">
                            {/* 1. Big Card: Spot Album (Do NOT change size, exact Image 1) */}
                            {spotlightAlbum && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-mono uppercase tracking-wider text-outline font-bold">
                                    ALBUM SPOTLIGHT
                                  </span>
                                  <div className="flex items-center gap-1 text-amber-400">
                                    <span className="material-symbols-outlined text-[15px]">album</span>
                                    <span className="text-[11px] font-bold">Official Album</span>
                                  </div>
                                </div>
                                {renderAlbumCard(spotlightAlbum, false)}
                              </div>
                            )}

                            {/* 2. Other Albums in Small Cards (Only 2 cards side-by-side) */}
                            {otherAlbums.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-mono uppercase tracking-wider text-outline font-bold">
                                    OTHER ALBUMS
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveFilter("Albums")}
                                    className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <span>See all</span>
                                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                  {otherAlbums.slice(0, 2).map((alb) => renderSmallAlbumCard(alb))}
                                </div>
                              </div>
                            )}

                            {/* 3. Big Card: Spot Artists */}
                            {spotlightArtist && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-mono uppercase tracking-wider text-outline font-bold">
                                    SPOT ARTISTS
                                  </span>
                                  <div className="flex items-center gap-1 text-primary">
                                    <span className="material-symbols-outlined text-[15px]">verified</span>
                                    <span className="text-[11px] font-bold">Official Artist</span>
                                  </div>
                                </div>
                                {renderArtistCard(spotlightArtist, false)}
                              </div>
                            )}

                            {/* 4. Other Artist in Small Cards (Only 2 cards side-by-side) */}
                            {otherArtists.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-mono uppercase tracking-wider text-outline font-bold">
                                    OTHER ARTISTS
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveFilter("Artists")}
                                    className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <span>See all</span>
                                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                  {otherArtists.slice(0, 2).map((art) => renderSmallArtistCard(art))}
                                </div>
                              </div>
                            )}

                            {/* 5. Playlists in Small Cards (4 small cards in 2x2 grid) */}
                            {leftPlaylists.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-mono uppercase tracking-wider text-outline font-bold">
                                    PLAYLISTS
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveFilter("Playlists")}
                                    className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <span>See all</span>
                                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                  {leftPlaylists.slice(0, 4).map((pl) => renderSmallPlaylistCard(pl))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Right: Top Songs List (Unchanged as Image 5) */}
                        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between pb-0.5">
                            <span className="text-xs font-mono uppercase tracking-wider text-outline font-semibold">
                              Songs
                            </span>
                            {liveTracks.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveFilter("Songs")}
                                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <span>See all ({liveTracks.length})</span>
                                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                              </button>
                            )}
                          </div>

                          {liveTracks.length > 0 ? (
                            <div className="flex flex-col gap-1 bg-surface-container-lowest/40 rounded-2xl p-2 border border-white/5">
                              {liveTracks.slice(0, 25).map((track, idx) => renderSongRow(track, idx))}
                            </div>
                          ) : (
                            <div className="p-8 rounded-2xl bg-surface-container/40 border border-white/5 text-center text-outline text-xs">
                              No matching songs found
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Horizontal Carousel: Matching Artists */}
                      {allArtists.length > 0 && (
                        <div className="flex flex-col gap-3 pt-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-[20px]">mic</span>
                              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                                Artists
                              </h2>
                              <span className="text-xs font-mono text-outline">({allArtists.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {allArtists.length > 4 && (
                                <button
                                  type="button"
                                  onClick={() => setActiveFilter("Artists")}
                                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer mr-2"
                                >
                                  <span>See all</span>
                                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => scrollArtistsContainer("left")}
                                className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-all cursor-pointer"
                                title="Previous"
                              >
                                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => scrollArtistsContainer("right")}
                                className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-all cursor-pointer"
                                title="Next"
                              >
                                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                              </button>
                            </div>
                          </div>
                          <div
                            ref={artistsCarouselRef}
                            className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 pt-1"
                          >
                            {allArtists.map((artist) => renderArtistCard(artist, true))}
                          </div>
                        </div>
                      )}

                      {/* Horizontal Carousel: Matching Albums & Soundtracks */}
                      {allAlbums.length > 0 && (
                        <div className="flex flex-col gap-3 pt-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-tertiary text-[20px]">album</span>
                              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                                Albums & Soundtracks
                              </h2>
                              <span className="text-xs font-mono text-outline">({allAlbums.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {allAlbums.length > 4 && (
                                <button
                                  type="button"
                                  onClick={() => setActiveFilter("Albums")}
                                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer mr-2"
                                >
                                  <span>See all</span>
                                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => scrollAlbumsContainer("left")}
                                className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-all cursor-pointer"
                                title="Previous"
                              >
                                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => scrollAlbumsContainer("right")}
                                className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-all cursor-pointer"
                                title="Next"
                              >
                                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                              </button>
                            </div>
                          </div>
                          <div
                            ref={albumsCarouselRef}
                            className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 pt-1"
                          >
                            {allAlbums.map((album) => renderAlbumCard(album, true))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* 2. 'Songs' Layout: Full-width extended vertical list of matching songs */}
              {activeFilter === "Songs" && (
                <div className="w-full flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-0.5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-outline">
                      MATCHING SONGS
                    </h2>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      {liveTracks.length} FOUND
                    </span>
                  </div>

                  {liveTracks.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container/80 border border-white/10 flex items-center justify-center text-outline mb-1">
                        <span className="material-symbols-outlined text-[28px]">music_off</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">No songs found</h3>
                      <p className="text-xs text-outline max-w-md">
                        {hasQuery
                          ? `No songs match "${debouncedQuery}". Try a different search term.`
                          : "Type in the search bar above to search for songs."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 bg-surface-container-lowest/40 rounded-2xl p-2 sm:p-3 border border-white/5">
                      {liveTracks.map((track, idx) => renderSongRow(track, idx))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. 'Albums' Layout: Responsive grid of matching official film and studio albums */}
              {activeFilter === "Albums" && (
                <div className="w-full flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-0.5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-outline">
                      OFFICIAL FILM & STUDIO ALBUMS
                    </h2>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      {allAlbums.length} FOUND
                    </span>
                  </div>

                  {allAlbums.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container/80 border border-white/10 flex items-center justify-center text-outline mb-1">
                        <span className="material-symbols-outlined text-[28px]">album</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">No albums found</h3>
                      <p className="text-xs text-outline max-w-md">
                        {hasQuery
                          ? `No official film or studio albums match "${debouncedQuery}".`
                          : "Type in the search bar above to find albums and soundtracks."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 sm:gap-6">
                      {allAlbums.map((album) => renderAlbumCard(album, false))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. 'Artists' Layout: Responsive grid of matching artist profile cards */}
              {activeFilter === "Artists" && (
                <div className="w-full flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-0.5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-outline">
                      ARTIST PROFILES
                    </h2>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      {allArtists.length} FOUND
                    </span>
                  </div>

                  {allArtists.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container/80 border border-white/10 flex items-center justify-center text-outline mb-1">
                        <span className="material-symbols-outlined text-[28px]">mic</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">No artists found</h3>
                      <p className="text-xs text-outline max-w-md">
                        {hasQuery
                          ? `No artist profiles match "${debouncedQuery}".`
                          : "Type in the search bar above to search for artists."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 sm:gap-6">
                      {allArtists.map((artist) => renderArtistCard(artist, false))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. 'Playlists' Layout: Merged local custom playlists + JioSaavn public playlists */}
              {activeFilter === "Playlists" && (
                <div className="w-full flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-0.5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-outline">
                      PLAYLISTS
                    </h2>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      {mergedPlaylists.length} FOUND
                    </span>
                  </div>

                  {mergedPlaylists.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container/80 border border-white/10 flex items-center justify-center text-outline mb-1">
                        <span className="material-symbols-outlined text-[28px]">queue_music</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">No playlists found</h3>
                      <p className="text-xs text-outline max-w-md">
                        {hasQuery
                          ? `No public or custom playlists match "${debouncedQuery}".`
                          : "You have no custom playlists yet. Create one or search for public playlists."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 sm:gap-6">
                      {mergedPlaylists.map((pl) => renderPlaylistCard(pl, false))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : selectedGenre ? (
        /* Curated Genre Showcase View */
        <div className="flex flex-col gap-8 pt-2 animate-fade-in">
          {/* Top Bar: Back Button & Horizontal Genre Hop Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                setSelectedGenre(null);
                setSearchQuery("");
                router.replace("/search", { scroll: false });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 hover:border-white/25 text-white/90 hover:text-white transition-all text-xs font-semibold cursor-pointer shadow-md self-start group"
            >
              <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span>Back</span>
            </button>

            {/* Quick Switcher across all 10 genres */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 max-w-full">
              {CURATED_GENRES.map((g) => {
                const isCurrentActive = selectedGenre.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGenre(g);
                      router.replace(`/search?genre=${g.id}`, { scroll: false });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${isCurrentActive
                      ? "bg-white text-black font-bold shadow-md scale-105"
                      : "bg-surface-container/70 hover:bg-surface-container-high text-outline hover:text-white border border-white/10"
                      }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genre Hero Banner */}
          <div
            style={{ background: selectedGenre.bgStyle }}
            className="relative rounded-3xl p-6 sm:p-8 md:p-10 overflow-hidden border border-white/20 shadow-2xl flex flex-col md:flex-row items-start md:items-end gap-6 justify-between"
          >
            {/* Ambient vignette and specular sheen */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none transform translate-x-1/3 -translate-y-1/3" />

            {/* Left: Artwork, Badge & Description */}
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 max-w-2xl">
              <div className="w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/30 flex-shrink-0">
                <img
                  src={selectedGenre.image || selectedGenre.tracks?.[0]?.coverUrl}
                  alt={selectedGenre.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-[10px] font-extrabold uppercase tracking-wider text-white">
                    Curated Collection
                  </span>
                  <span className="text-white/80 text-xs font-semibold">
                    {selectedGenre.detail}
                  </span>
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg">
                  {selectedGenre.name}
                </h1>

                <p className="text-xs sm:text-sm text-white/85 font-medium max-w-xl leading-relaxed">
                  {selectedGenre.description}
                </p>

                <div className="flex items-center gap-2 text-xs text-white/70 font-medium pt-1">
                  <span>{selectedGenre.tracks?.length || 10} Curated Tracks</span>
                </div>
              </div>
            </div>

            {/* Right: Play All & Shuffle Buttons */}
            <div className="relative z-10 flex items-center gap-3 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  const tracks = selectedGenre.tracks || [];
                  if (tracks.length > 0) {
                    const isGenrePlaying =
                      isPlaying && tracks.some((t) => t.id === currentTrack?.id);
                    if (isGenrePlaying) {
                      togglePlay();
                    } else {
                      playTrack(tracks[0], tracks);
                    }
                  }
                }}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-white hover:bg-neutral-100 text-black font-bold text-sm shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[24px] fill-current text-black">
                  {isPlaying && selectedGenre.tracks?.some((t) => t.id === currentTrack?.id)
                    ? "pause"
                    : "play_arrow"}
                </span>
                <span>
                  {isPlaying && selectedGenre.tracks?.some((t) => t.id === currentTrack?.id)
                    ? "Pause"
                    : "Play All"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const tracks = selectedGenre.tracks || [];
                  if (tracks.length > 0) {
                    const randomIndex = Math.floor(Math.random() * tracks.length);
                    playTrack(tracks[randomIndex], tracks);
                  }
                }}
                className="p-3.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg"
                title="Shuffle Genre"
              >
                <span className="material-symbols-outlined text-[20px]">
                  shuffle
                </span>
              </button>
            </div>
          </div>

          {/* Section 1: Curated Perfect Songs */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Perfect Songs</span>
                <span className="text-xs font-normal text-outline">
                  ({selectedGenre.tracks?.length || 0})
                </span>
              </h2>
              <span className="text-xs text-outline font-medium">
                Ranked by popularity & critical acclaim
              </span>
            </div>

            <div className="flex flex-col divide-y divide-white/5 bg-surface-container/40 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
              {selectedGenre.tracks?.map((track, idx) => {
                const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;
                const isThisTrackActive = currentTrack?.id === track.id;

                return (
                  <div
                    key={track.id}
                    onClick={() => playTrack(track, selectedGenre.tracks)}
                    className={`group flex items-center gap-3.5 sm:gap-4 p-3 sm:px-4 sm:py-3 transition-colors cursor-pointer ${isThisTrackActive
                      ? "bg-white/10 text-primary"
                      : "hover:bg-white/5 text-white"
                      }`}
                  >
                    {/* Index Number or Sound Equalizer Animation */}
                    <div className="w-8 text-center flex items-center justify-center flex-shrink-0">
                      {isThisTrackPlaying ? (
                        <div className="flex items-end justify-center gap-0.5 h-4">
                          <span className="w-1 bg-primary rounded-full animate-[soundBar1_0.8s_ease-in-out_infinite] h-3.5" />
                          <span className="w-1 bg-primary rounded-full animate-[soundBar2_1.1s_ease-in-out_infinite] h-2.5" />
                          <span className="w-1 bg-primary rounded-full animate-[soundBar3_0.9s_ease-in-out_infinite] h-4" />
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-outline group-hover:hidden">
                            {idx + 1}
                          </span>
                          <span className="material-symbols-outlined text-[20px] text-white hidden group-hover:inline-block">
                            play_arrow
                          </span>
                        </>
                      )}
                    </div>

                    {/* Cover Thumbnail */}
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-md border border-white/10">
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Title & Artist */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className={`text-sm font-semibold truncate ${isThisTrackActive ? "text-primary font-bold" : "text-white"
                          }`}
                      >
                        {track.title}
                      </span>
                      <span className="text-xs text-outline truncate group-hover:text-white/80 transition-colors mt-0.5">
                        {track.artist}
                      </span>
                    </div>

                    {/* Play Count (Desktop) */}
                    {track.plays && (
                      <div className="hidden sm:block text-xs text-outline/80 font-medium">
                        {track.plays} plays
                      </div>
                    )}

                    {/* Actions: Like, Download & Duration */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isLiked(track.id)
                          ? "text-primary"
                          : "text-outline hover:text-white hover:bg-white/10"
                          }`}
                        title={isLiked(track.id) ? "Liked" : "Like song"}
                      >
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{
                            fontVariationSettings: isLiked(track.id)
                              ? "'FILL' 1"
                              : "'FILL' 0",
                          }}
                        >
                          {isLiked(track.id) ? "favorite" : "favorite_border"}
                        </span>
                      </button>

                      <DownloadButton
                        track={track}
                        buttonSize="p-1"
                        iconSize="text-[18px]"
                      />

                      <span className="text-xs text-outline font-medium w-10 text-right">
                        {track.durationFormatted}
                      </span>

                      <SongOptionsMenu track={track} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Featured Artists in Genre */}
          {selectedGenre.curatedArtists && selectedGenre.curatedArtists.length > 0 && (
            <div className="flex flex-col gap-3 pt-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Featured {selectedGenre.name} Artists
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {selectedGenre.curatedArtists.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artists/${artist.id}`}
                    className="group p-4 rounded-2xl bg-surface-container/40 hover:bg-surface-container-high border border-white/5 hover:border-white/20 transition-all flex flex-col items-center text-center gap-3 cursor-pointer shadow-md"
                  >
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shadow-xl border-2 border-white/10 group-hover:border-primary/50 group-hover:scale-105 transition-all">
                      <img
                        src={artist.avatar}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-white group-hover:text-primary transition-colors line-clamp-1">
                        {artist.name}
                      </span>
                      <span className="text-xs text-outline">
                        {artist.monthlyListeners} listeners
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty Search Query / Browse Catalog View (Redesigned Beautiful Genre Cards) */
        <div className="flex flex-col gap-6 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Browse all
            </h2>
            <span className="text-xs text-outline font-medium">
              10 Curated Genres • 100+ Top Tracks
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-5">
            {CURATED_GENRES.map((genre) => {
              const isCurrentGenrePlaying =
                isPlaying &&
                genre.tracks?.some((t) => t.id === currentTrack?.id);

              return (
                <div
                  key={genre.id}
                  onClick={() => {
                    setSelectedGenre(genre);
                    router.replace(`/search?genre=${genre.id}`, { scroll: false });
                  }}
                  style={{ background: genre.bgStyle }}
                  className="group relative h-36 sm:h-44 p-3.5 sm:p-5 rounded-2xl sm:rounded-2xl border border-white/15 hover:border-white/40 overflow-hidden cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1.5 active:scale-[0.98] select-none flex flex-col justify-between"
                >
                  {/* Subtle top ambient specular shine */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 pointer-events-none" />

                  {/* Top content: Genre Title & Subtitle */}
                  <div className="relative z-10 flex flex-col gap-0.5">
                    <span className="text-sm sm:text-xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md group-hover:translate-x-0.5 transition-transform">
                      {genre.name}
                    </span>
                    <span className="text-[10px] sm:text-xs text-white/85 font-medium line-clamp-1">
                      {genre.subtitle}
                    </span>
                  </div>

                  {/* Glowing Circular Disc Album Cover Preview at bottom-right matching Image 1 */}
                  <div className="absolute -bottom-2.5 -right-2.5 sm:-bottom-3 sm:-right-3 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/25 shadow-[0_10px_25px_rgba(0,0,0,0.6)] transform group-hover:scale-110 transition-all duration-300">
                    <img
                      src={genre.image || genre.tracks?.[0]?.coverUrl}
                      alt={genre.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                  </div>

                  {/* Bottom Bar: Explore & Quick Play Button */}
                  <div className="relative z-20 flex items-center justify-between mt-auto pt-2">
                    {/* Playing indicator badge if this genre is active */}
                    {isCurrentGenrePlaying ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[14px] text-primary animate-pulse">
                          volume_up
                        </span>
                        <span>Playing</span>
                      </div>
                    ) : (
                      <div className="text-[10px] sm:text-[11px] font-semibold text-white/75 group-hover:text-white transition-colors flex items-center gap-1">
                        <span>Explore</span>
                        <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">
                          arrow_forward
                        </span>
                      </div>
                    )}

                    {/* Quick Play Icon Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (genre.tracks && genre.tracks.length > 0) {
                          if (isCurrentGenrePlaying) {
                            togglePlay();
                          } else {
                            playTrack(genre.tracks[0], genre.tracks);
                          }
                          setSelectedGenre(genre);
                          router.replace(`/search?genre=${genre.id}`, { scroll: false });
                        }
                      }}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white text-black flex items-center justify-center shadow-xl shadow-black/40 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer ml-auto"
                      title={`Play ${genre.name}`}
                    >
                      <span className="material-symbols-outlined text-[24px] fill-current text-black ml-0.5">
                        {isCurrentGenrePlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section: Playlists under Browse all (Only shown if user has created playlists) */}
          {allPlaylists && allPlaylists.length > 0 && (
            <div className="flex flex-col gap-4 pt-6 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Your Playlists
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Custom collections created by you
                  </p>
                </div>
                <Link
                  href="/playlists"
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline uppercase tracking-wider group"
                >
                  <span>See All</span>
                  <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                    arrow_forward
                  </span>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                {allPlaylists.slice(0, 5).map((pl) => {
                  const tracks = pl.tracks || [];
                  const isPlaylistPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

                  return (
                    <div
                      key={pl.id}
                      className="group flex flex-col gap-3 glass-card p-3.5 rounded-2xl border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-lg select-none cursor-pointer"
                    >
                      {/* Cover image with hover play button */}
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
                        <img
                          src={pl.coverUrl}
                          alt={pl.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-bold text-primary border border-primary/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          <span>BY YOU</span>
                        </div>
                        <div
                          className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-end p-3 transition-opacity duration-300 ${isPlaylistPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (tracks.length > 0) {
                                if (isPlaylistPlaying) {
                                  togglePlay();
                                } else {
                                  playTrack(tracks[0], tracks);
                                }
                              }
                            }}
                            className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_16px_rgba(76,215,246,0.6)] transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
                            title={isPlaylistPlaying ? "Pause" : "Play"}
                          >
                            <span className="material-symbols-outlined text-[24px]">
                              {isPlaylistPlaying ? "pause" : "play_arrow"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Playlist details */}
                      <Link href={`/playlist/${pl.id}`} className="flex flex-col min-w-0">
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                          {pl.title}
                        </h3>
                        <p className="text-xs text-on-surface-variant truncate mt-0.5">
                          By You • {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                        </p>
                      </Link>

                      {/* Bottom tag / stats: track count and total duration */}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="w-full p-8 animate-pulse text-outline text-sm">Loading Search...</div>}>
      <SearchContent />
    </Suspense>
  );
}
