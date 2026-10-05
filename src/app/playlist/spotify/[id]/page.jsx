"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMusic } from "../../../../context/MusicContext";
import { fetchSpotifyPlaylist } from "../../../../services/spotifyClientService";
import {
  matchSpotifyTrackToJioSaavn,
  matchSpotifyTracksBatch,
  MATCH_STATUS,
} from "../../../../lib/matchSpotifyTrackToJioSaavn";
import SpotifyBadge, { SpotifyIcon } from "../../../../components/SpotifyBadge";
import PlaylistSkeleton from "../../../../components/PlaylistSkeleton";

export default function SpotifyPlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlistId = params?.id || "";

  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    formatTime,
  } = useMusic();

  // Fast initial hydration from search params if passed from card click
  const initialPlaylist = useMemo(() => {
    const nameParam = searchParams.get("name");
    const coverParam = searchParams.get("cover");
    const curatorParam = searchParams.get("curator");
    const descParam = searchParams.get("desc");
    const spotifyUrlParam = searchParams.get("spotifyUrl");

    return {
      id: playlistId,
      name: nameParam || "Spotify Playlist",
      title: nameParam || "Spotify Playlist",
      description: descParam || "",
      artwork: coverParam || null,
      images: coverParam ? [{ url: coverParam }] : [],
      curator: curatorParam || "Spotify",
      owner: curatorParam || "Spotify",
      spotifyUrl:
        spotifyUrlParam ||
        (playlistId ? `https://open.spotify.com/playlist/${playlistId}` : "https://open.spotify.com"),
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
    };
  }, [playlistId, searchParams]);

  const [playlist, setPlaylist] = useState(initialPlaylist);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Map of spotifyTrackId -> { status, score, confidence, song, error }
  const [matchMap, setMatchMap] = useState({});
  const [isMatching, setIsMatching] = useState(false);

  // Fetch playlist details on mount or ID change
  useEffect(() => {
    let isCancelled = false;
    if (!playlistId) return;

    setIsLoading(true);
    setLoadError(null);

    fetchSpotifyPlaylist(playlistId)
      .then((data) => {
        if (isCancelled) return;

        if (data && (data.id || data.name)) {
          setPlaylist((prev) => ({
            ...prev,
            ...data,
            // Preserve cover if API returned null but searchParams had it
            artwork: data.artwork || prev.artwork,
          }));

          // If authorized tracks are available from Spotify, initiate JioSaavn matching
          if (data.tracksAvailable && Array.isArray(data.tracks) && data.tracks.length > 0) {
            setIsMatching(true);

            // Pre-seed matching status for all tracks
            const initialMap = {};
            data.tracks.forEach((t) => {
              initialMap[t.id] = {
                status: MATCH_STATUS.MATCHING,
                song: null,
                score: 0,
              };
            });
            setMatchMap(initialMap);

            // Batch match tracks in parallel (concurrency 4)
            matchSpotifyTracksBatch(
              data.tracks,
              (trackId, result) => {
                if (!isCancelled) {
                  setMatchMap((prev) => ({
                    ...prev,
                    [trackId]: result,
                  }));
                }
              },
              4
            ).finally(() => {
              if (!isCancelled) {
                setIsMatching(false);
              }
            });
          }
        } else {
          setLoadError("Could not retrieve playlist metadata");
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn("Spotify playlist fetch error:", err);
          setLoadError(err?.message || "Failed to load Spotify playlist");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [playlistId]);

  // Ordered list of matched JioSaavn songs (strictly preserves Spotify track order)
  const matchedSongsInOrder = useMemo(() => {
    if (!Array.isArray(playlist.tracks) || playlist.tracks.length === 0) return [];
    const list = [];
    for (const spTrack of playlist.tracks) {
      const match = matchMap[spTrack.id];
      if (match?.status === MATCH_STATUS.MATCHED && match.song) {
        list.push(match.song);
      }
    }
    return list;
  }, [playlist.tracks, matchMap]);

  const totalTracksCount = playlist.tracks?.length || playlist.totalCount || 0;
  const matchedCount = matchedSongsInOrder.length;
  const hasPlayableSongs = matchedCount > 0;

  // Check if any matched song from this playlist is currently playing
  const isPlaylistActivePlaying =
    isPlaying &&
    matchedSongsInOrder.length > 0 &&
    matchedSongsInOrder.some((s) => String(s.id) === String(currentTrack?.id));

  // Master Play button handler: plays first matched track and sets whole matched playlist as queue
  const handleMasterPlay = () => {
    if (!hasPlayableSongs) return;

    if (isPlaylistActivePlaying) {
      togglePlay();
    } else {
      // Play the first matched track, with all matched tracks in order as the queue
      playTrack(matchedSongsInOrder[0], matchedSongsInOrder);
    }
  };

  // Individual track click handler
  const handleTrackClick = (spTrack) => {
    const match = matchMap[spTrack.id];
    if (match?.status === MATCH_STATUS.MATCHED && match.song) {
      if (currentTrack?.id === match.song.id) {
        togglePlay();
      } else {
        // Play song using the existing JioSaavn playback system and queue
        playTrack(match.song, matchedSongsInOrder);
      }
    }
  };

  const coverUrl =
    playlist.artwork ||
    playlist.images?.[0]?.url ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

  if (isLoading && (!playlist.tracks || playlist.tracks.length === 0) && !playlist.artwork) {
    return <PlaylistSkeleton />;
  }

  return (
    <div className="w-full flex flex-col pb-16 select-none animate-fade-in">
      {/* Back Button Navigation */}
      <div className="px-4 sm:px-6 md:px-8 pt-4 pb-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container/70 hover:bg-surface-container border border-white/10 hover:border-white/20 text-white/90 hover:text-white text-xs font-semibold cursor-pointer shadow-md transition-all group"
        >
          <span className="material-symbols-outlined text-[17px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span>Back</span>
        </button>
      </div>

      {/* Hero Header Banner */}
      <div className="relative w-full p-4 sm:p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-5 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Spotify Playlist Artwork - Original 1:1 Aspect Ratio, NO overlays on artwork */}
          <div className="relative w-36 h-36 sm:w-48 sm:h-48 md:w-60 md:h-60 rounded-2xl overflow-hidden shadow-[0_20px_45px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 bg-surface-container-highest group mx-auto md:mx-0">
            <img
              src={coverUrl}
              alt={playlist.title || playlist.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>

          {/* Playlist Metadata Info */}
          <div className="flex flex-col gap-2 sm:gap-2.5 text-center md:text-left flex-1 min-w-0 w-full">
            {/* Spotify Badging & Type */}
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <SpotifyBadge label="Spotify Playlist" size="sm" />
              <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-outline text-[10px] sm:text-[11px] font-mono font-semibold">
                Discovery
              </span>
            </div>

            {/* Playlist Title */}
            <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight line-clamp-2">
              {playlist.title || playlist.name}
            </h1>

            {/* Description */}
            {playlist.description ? (
              <p className="text-xs md:text-sm text-on-surface-variant line-clamp-3 max-w-2xl leading-relaxed">
                {playlist.description}
              </p>
            ) : null}

            {/* Curator, Track Count, Duration */}
            <div className="flex items-center justify-center md:justify-start gap-2 sm:gap-3 text-xs text-outline pt-1 flex-wrap">
              <div className="flex items-center gap-1.5 text-white font-medium">
                <SpotifyIcon className="w-4 h-4 text-[#1DB954]" />
                <span>Curated by {playlist.curator || "Spotify"}</span>
              </div>
              {totalTracksCount > 0 ? (
                <>
                  <span>•</span>
                  <span className="font-semibold text-white">
                    {totalTracksCount} {totalTracksCount === 1 ? "Track" : "Tracks"}
                  </span>
                </>
              ) : null}
              {matchedCount > 0 && totalTracksCount > 0 ? (
                <>
                  <span>•</span>
                  <span className="text-[#1ed760] font-semibold">
                    {matchedCount} of {totalTracksCount} available on Ceepeefy
                  </span>
                </>
              ) : null}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-center md:justify-start gap-3 pt-3 flex-wrap">
              {/* Play Playlist / Play Available Songs Button */}
              {hasPlayableSongs && (
                <button
                  type="button"
                  onClick={handleMasterPlay}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] hover:brightness-110 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(29,185,84,0.4)] hover:shadow-[0_0_28px_rgba(29,185,84,0.6)] active:scale-95 transition-all cursor-pointer"
                  title={
                    matchedCount === totalTracksCount
                      ? "Play Playlist on Ceepeefy"
                      : `Play ${matchedCount} Available Songs on Ceepeefy`
                  }
                >
                  <span className="material-symbols-outlined text-[20px] font-bold">
                    {isPlaylistActivePlaying ? "pause" : "play_arrow"}
                  </span>
                  <span>
                    {matchedCount === totalTracksCount
                      ? "Play Playlist"
                      : `Play Available Songs (${matchedCount})`}
                  </span>
                </button>
              )}

              {/* Direct Open in Spotify Link */}
              <a
                href={playlist.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 hover:border-[#1DB954]/50 text-white/90 hover:text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer group"
                title="Open playlist directly on Spotify"
              >
                <SpotifyIcon className="w-4 h-4 text-[#1DB954] group-hover:scale-110 transition-transform" />
                <span>Open in Spotify</span>
                <span className="material-symbols-outlined text-[15px] text-outline group-hover:text-white transition-colors">
                  arrow_outward
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Matching Progress Banner (shown while actively resolving) */}
      {isMatching && (
        <div className="px-4 md:px-8 py-3 bg-[#1DB954]/10 border-b border-[#1DB954]/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#1ed760]">
            <div className="w-3.5 h-3.5 border-2 border-[#1ed760] border-t-transparent rounded-full animate-spin" />
            <span>Matching playlist tracks to high-fidelity audio on Ceepeefy...</span>
          </div>
          <span className="font-mono text-white/80">
            {matchedCount} verified
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="px-4 sm:px-6 md:px-8 pt-6">
        {/* Case 1: Authorized Spotify Tracks Are Available */}
        {playlist.tracksAvailable && playlist.tracks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {/* Table Header */}
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_9rem] items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-outline select-none">
              <span className="text-center">#</span>
              <span>Title</span>
              <span className="hidden md:inline">Album</span>
              <span className="text-right hidden md:inline">Duration</span>
              <span className="text-right">Ceepeefy Status</span>
            </div>

            {/* Track List */}
            <div className="flex flex-col gap-1">
              {playlist.tracks.map((spTrack, idx) => {
                const match = matchMap[spTrack.id] || { status: MATCH_STATUS.MATCHING };
                const isMatched = match.status === MATCH_STATUS.MATCHED && Boolean(match.song);
                const isUnavailable = match.status === MATCH_STATUS.UNAVAILABLE;
                const isMatchingTrack = match.status === MATCH_STATUS.MATCHING;
                const isError = match.status === MATCH_STATUS.ERROR;

                const isCurrentPlayingThisTrack =
                  isPlaying && isMatched && currentTrack?.id === match.song?.id;

                return (
                  <div
                    key={spTrack.id || idx}
                    onClick={() => {
                      if (isMatched) handleTrackClick(spTrack);
                    }}
                    className={`group grid grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_9rem] items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 rounded-xl transition-all border ${isCurrentPlayingThisTrack
                        ? "bg-white/10 border-primary/40 shadow-sm"
                        : isMatched
                          ? "hover:bg-white/5 border-transparent hover:border-white/5 cursor-pointer"
                          : "border-transparent opacity-60 cursor-not-allowed"
                      }`}
                    title={
                      isMatched
                        ? `Play "${spTrack.title}" on Ceepeefy`
                        : isUnavailable
                          ? `"${spTrack.title}" is not available on Ceepeefy`
                          : "Checking Ceepeefy availability..."
                    }
                  >
                    {/* Track Number / Play Indicator */}
                    <div className="text-center flex items-center justify-center flex-shrink-0">
                      {isCurrentPlayingThisTrack ? (
                        <div className="flex items-end gap-[2px] h-3.5">
                          <span className="w-1 bg-[#1ed760] animate-pulse rounded-full h-full" />
                          <span className="w-1 bg-[#1ed760] animate-pulse rounded-full h-3/4 delay-75" />
                          <span className="w-1 bg-[#1ed760] animate-pulse rounded-full h-1/2 delay-150" />
                        </div>
                      ) : (
                        <>
                          <span className={`text-xs font-mono text-outline ${isMatched ? "group-hover:hidden" : ""}`}>
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          {isMatched && (
                            <span className="material-symbols-outlined text-[#1ed760] text-[18px] hidden group-hover:block">
                              play_arrow
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Title & Artist */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Album thumbnail */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-highest shadow-sm border border-white/5">
                        <img
                          src={
                            spTrack.coverUrl ||
                            playlist.artwork ||
                            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format&fit=crop&q=80"
                          }
                          alt={spTrack.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-xs sm:text-sm font-semibold truncate transition-colors ${isCurrentPlayingThisTrack
                              ? "text-[#1ed760]"
                              : isMatched
                                ? "text-white group-hover:text-[#1ed760]"
                                : "text-white/70"
                            }`}
                        >
                          {spTrack.title}
                        </span>
                        <span className="text-[11px] text-on-surface-variant truncate">
                          {spTrack.artist}
                        </span>
                      </div>
                    </div>

                    {/* Album Name */}
                    <div className="hidden md:block min-w-0 truncate text-xs text-outline">
                      {spTrack.album || "—"}
                    </div>

                    {/* Duration */}
                    <div className="hidden md:block text-right font-mono text-xs text-outline">
                      {spTrack.durationFormatted || formatTime(spTrack.duration || 210)}
                    </div>

                    {/* Ceepeefy Status Badge */}
                    <div className="text-right flex items-center justify-end">
                      {isMatched ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 text-[#1ed760] text-[10px] sm:text-[11px] font-semibold">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          <span className="hidden sm:inline">Available on Ceepeefy</span>
                          <span className="sm:hidden">Available</span>
                        </div>
                      ) : isMatchingTrack ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-outline text-[10px] font-mono">
                          <div className="w-2.5 h-2.5 border-2 border-outline border-t-transparent rounded-full animate-spin" />
                          <span className="hidden sm:inline">Matching...</span>
                        </div>
                      ) : isUnavailable ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-outline text-[10px] sm:text-[11px]">
                          <span className="text-xs">○</span>
                          <span className="hidden sm:inline">Not available</span>
                        </div>
                      ) : isError ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px]">
                          <span>Unavailable</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : isLoading ? (
          /* Loading State */
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-10 h-10 border-3 border-[#1DB954] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-outline font-medium">
              Loading Spotify playlist information...
            </span>
          </div>
        ) : (
          /* Case 2: Spotify API Restricted Tracks (Expected official Spotify Web API behavior for third-party playlists) */
          <div className="py-12 sm:py-16 px-4 max-w-2xl mx-auto flex flex-col items-center text-center gap-5 glass-card rounded-3xl border border-white/10 bg-surface-container/60 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954]">
              <SpotifyIcon className="w-8 h-8 text-[#1DB954]" />
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Playlist Contents Available on Spotify
              </h2>
              <p className="text-xs sm:text-sm text-outline leading-relaxed max-w-md">
                In accordance with Spotify Web API access permissions, the track list for this public playlist is hosted directly on Spotify. You can listen to the complete playlist with one click.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <a
                href={playlist.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-[0_0_24px_rgba(29,185,84,0.4)] transition-all cursor-pointer"
              >
                <SpotifyIcon className="w-5 h-5 text-black" />
                <span>Open in Spotify</span>
                <span className="material-symbols-outlined text-[17px]">arrow_outward</span>
              </a>

              <Link
                href="/search?filter=Playlists"
                className="px-5 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 hover:text-white text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                Browse Other Playlists
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
