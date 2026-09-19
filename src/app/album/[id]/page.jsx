"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../../context/MusicContext";
import { fetchAlbumDetails } from "../../../services/audioService";
import DownloadButton from "../../../components/DownloadButton";

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const albumId = params?.id || "marco";
  const shouldAutoPlay = searchParams?.get("play") === "true";
  const hasAutoPlayedRef = useRef(false);

  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    toggleLike,
    isLiked,
    isShuffle,
    setIsShuffle,
    formatTime,
    addRecentSearch,
  } = useMusic();

  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAlbumLiked, setIsAlbumLiked] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // Fetch album details from API
  useEffect(() => {
    let isCancelled = false;
    if (!albumId) return;

    const loadAlbum = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAlbumDetails(albumId);
        if (isCancelled) return;

        if (data && (data.title || data.name)) {
          const rawTracks = data.tracks || [];
          // Sort chronologically by release date (newest first), followed by popularity
          const sortedTracks = [...rawTracks].sort((a, b) => {
            const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
            const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
            if (dateB !== dateA) return dateB - dateA;

            const yearA = a.year || 0;
            const yearB = b.year || 0;
            if (yearB !== yearA) return yearB - yearA;

            return (b.playCount || 0) - (a.playCount || 0);
          });

          setAlbum(data);
          setTracks(sortedTracks);

          if (shouldAutoPlay && !hasAutoPlayedRef.current && sortedTracks.length > 0) {
            hasAutoPlayedRef.current = true;
            playTrack(sortedTracks[0], sortedTracks);
          }
        } else {
          setError("Album details could not be loaded.");
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Error loading album:", err);
          setError("Failed to load album data. Please try again.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadAlbum();

    return () => {
      isCancelled = true;
    };
  }, [albumId, shouldAutoPlay]);

  // Total duration formatted
  const totalDurationFormatted = useMemo(() => {
    if (!tracks || tracks.length === 0) return "0 min";
    const totalSecs = tracks.reduce((acc, t) => acc + (t.duration || 210), 0);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs} hr ${remMins} min`;
    }
    return `${mins} min ${secs > 0 ? `${secs} sec` : ""}`;
  }, [tracks]);

  const isCurrentAlbumPlaying =
    isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  const handleMasterPlay = () => {
    if (isCurrentAlbumPlaying) {
      togglePlay();
    } else if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handleRowClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  const handleDownload = async (track, e) => {
    e?.stopPropagation?.();
    if (!track) return;
    setDownloadingId(track.id);

    try {
      const downloadParams = new URLSearchParams({
        title: track.title || "Track",
        artist: track.artist || album?.artist || "Artist",
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

  return (
    <div className="w-full flex flex-col pb-16 select-none animate-fade-in">
      {/* Dynamic Hero Banner (Exact Image 2 Structure) */}
      <div className="relative w-full p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art */}
          <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 group">
            {isLoading ? (
              <div className="w-full h-full bg-surface-container-highest animate-pulse" />
            ) : (
              <img
                src={album?.image || album?.thumbnail || album?.coverUrl || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80"}
                alt={album?.title || "Album Cover"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )}
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Metadata info */}
          <div className="flex flex-col gap-2.5 text-center md:text-left flex-1 min-w-0">
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold tracking-wider uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">movie</span>
                Official Film Album • Hi-Res Lossless
              </span>
              <span className="px-2 py-0.5 rounded-md bg-tertiary/15 text-tertiary text-[10px] font-mono font-bold border border-tertiary/25">
                24-Bit • 192kHz Lossless
              </span>
            </div>

            <h1 className="text-2xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              {isLoading ? "Loading Album..." : album?.title || "Film Soundtrack"}
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant line-clamp-2 max-w-2xl">
              {album?.description || "Original Motion Picture Soundtrack"}
            </p>

            <div className="flex items-center justify-center md:justify-start gap-3 text-xs text-outline pt-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[11px] font-bold">
                  <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
                </div>
                <span className="text-white font-medium">{album?.artist || "Film Soundtrack"}</span>
              </div>
              <span>•</span>
              <span>{tracks.length} Songs</span>
              <span>•</span>
              <span>{totalDurationFormatted}</span>
              {album?.year && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">{album.year}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center gap-4 mt-8">
          {/* Master Play Button */}
          <button
            onClick={handleMasterPlay}
            disabled={tracks.length === 0}
            className="w-14 h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title={isCurrentAlbumPlaying ? "Pause album" : "Play all songs"}
          >
            <span className="material-symbols-outlined text-[32px]">
              {isCurrentAlbumPlaying ? "pause" : "play_arrow"}
            </span>
          </button>

          {/* Shuffle Button */}
          <button
            onClick={() => setIsShuffle((prev) => !prev)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isShuffle
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container"
            }`}
            title="Toggle Shuffle"
          >
            <span className="material-symbols-outlined text-[22px]">shuffle</span>
          </button>

          {/* Like Album */}
          <button
            onClick={() => setIsAlbumLiked((prev) => !prev)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isAlbumLiked
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container"
            }`}
            title={isAlbumLiked ? "Saved to Library" : "Save to library"}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: isAlbumLiked ? "'FILL' 1" : "'FILL' 0" }}
            >
              {isAlbumLiked ? "favorite" : "favorite_border"}
            </span>
          </button>

          {/* Download for offline */}
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer"
            title="Download album"
          >
            <span className="material-symbols-outlined text-[22px]">download_for_offline</span>
          </button>

          {/* More options */}
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer"
            title="Share Album Link"
          >
            <span className="material-symbols-outlined text-[22px]">more_horiz</span>
          </button>
        </div>
      </div>

      {/* Tracklist Table (Exact Image 2 Structure) */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-2">
        {/* Table Header */}
        <div className="grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="hidden md:block">Artist</span>
          <span className="text-right flex items-center justify-end">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
          </span>
          <span className="text-center" />
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="flex flex-col gap-2 pt-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-surface-container/40 border border-white/5 animate-pulse flex items-center px-4 gap-4"
              >
                <div className="w-6 h-4 bg-white/10 rounded" />
                <div className="w-11 h-11 rounded-lg bg-white/10" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="w-1/3 h-4 bg-white/10 rounded" />
                  <div className="w-1/4 h-3 bg-white/5 rounded" />
                </div>
                <div className="w-16 h-4 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && !isLoading && (
          <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3 mt-4">
            <span className="material-symbols-outlined text-[20px]">error_outline</span>
            <span>{error}</span>
          </div>
        )}

        {/* Tracks List */}
        {!isLoading && tracks.length > 0 && (
          <div className="flex flex-col gap-1">
            {tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id || idx}
                  onClick={() => handleRowClick(track)}
                  className={`group grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer select-none ${
                    isCurrent
                      ? "bg-surface-container-high/80 border border-primary/30 text-primary shadow-[0_0_15px_rgba(76,215,246,0.15)]"
                      : "hover:bg-surface-container/60 hover:border-white/5 border border-transparent text-on-surface"
                  }`}
                >
                  {/* Index / Play status */}
                  <div className="flex items-center justify-center w-full">
                    {isCurrentPlaying ? (
                      <span className="text-primary flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                          <rect height="10" rx="1.5" width="3" x="3" y="10">
                            <animate
                              attributeName="height"
                              dur="0.8s"
                              repeatCount="indefinite"
                              values="10;20;10"
                            />
                            <animate
                              attributeName="y"
                              dur="0.8s"
                              repeatCount="indefinite"
                              values="10;5;10"
                            />
                          </rect>
                          <rect height="16" rx="1.5" width="3" x="10.5" y="7">
                            <animate
                              attributeName="height"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="16;8;16"
                            />
                            <animate
                              attributeName="y"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="7;11;7"
                            />
                          </rect>
                          <rect height="12" rx="1.5" width="3" x="18" y="9">
                            <animate
                              attributeName="height"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="12;22;12"
                            />
                            <animate
                              attributeName="y"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="9;4;9"
                            />
                          </rect>
                        </svg>
                      </span>
                    ) : (
                      <>
                        <span className="text-xs font-mono text-outline group-hover:hidden">
                          {idx + 1}
                        </span>
                        <span className="material-symbols-outlined text-primary text-[18px] hidden group-hover:block">
                          play_arrow
                        </span>
                      </>
                    )}
                  </div>

                  {/* Title with thumbnail */}
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high relative shadow-sm">
                      <img
                        src={track.thumbnail || track.coverUrl || album?.image || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80"}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-sm font-semibold truncate transition-colors ${
                          isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                        }`}
                      >
                        {track.title}
                      </span>
                      <span className="text-xs text-on-surface-variant md:hidden truncate mt-0.5">
                        {track.artist || album?.artist || "Unknown Artist"}
                      </span>
                    </div>
                  </div>

                  {/* Artist */}
                  <span className="text-xs text-on-surface-variant truncate pr-4 hidden md:block">
                    {track.artist || album?.artist || "Unknown Artist"}
                  </span>

                  {/* Duration */}
                  <span className="text-xs font-mono text-outline text-right">
                    {track.durationFormatted || formatTime(track.duration || 210)}
                  </span>

                  {/* Row Actions: Download & Like */}
                  <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <DownloadButton track={track} iconSize="text-[16px]" buttonSize="p-1" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(track);
                      }}
                      className={`p-1 rounded-full transition-colors cursor-pointer ${
                        isLiked(track.id) ? "text-primary" : "text-outline hover:text-white"
                      }`}
                      title={isLiked(track.id) ? "Liked" : "Like song"}
                    >
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {isLiked(track.id) ? "favorite" : "favorite_border"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
