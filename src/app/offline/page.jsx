"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import {
  getOfflineTracks,
  getOfflineStorageStats,
  removeOfflineTrack,
  getOfflineCoverUrl,
  getOfflinePlaylists,
  removePlaylistOffline,
} from "../../services/offlineStorage";
import SongOptionsMenu from "../../components/SongOptionsMenu";

export default function OfflineSongsPage() {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    formatTime,
    offlineTrackIds,
    refreshOfflineState,
    isNetworkOnline,
    showOfflineNotice,
  } = useMusic();

  const [isMounted, setIsMounted] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [offlinePlaylists, setOfflinePlaylists] = useState([]);
  const [stats, setStats] = useState({ trackCount: 0, formattedSize: "0 MB", isPersisted: false });
  const [isLoading, setIsLoading] = useState(true);
  const [coverUrls, setCoverUrls] = useState({});

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadOfflineData = async () => {
    setIsLoading(true);
    try {
      const [offlineList, storageStats, playlists] = await Promise.all([
        getOfflineTracks(),
        getOfflineStorageStats(),
        getOfflinePlaylists(),
      ]);
      setTracks(offlineList);
      setStats(storageStats);
      setOfflinePlaylists(playlists);

      // Resolve local blob cover URLs for full offline image display
      const covers = {};
      for (const t of offlineList) {
        const tid = String(t.trackId || t.id);
        covers[tid] = await getOfflineCoverUrl(tid, t.coverUrl);
      }
      setCoverUrls(covers);
    } catch (err) {
      console.warn("Error loading offline songs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOfflineData();
  }, [offlineTrackIds]);

  const isCurrentPlaylistPlaying =
    isPlaying && tracks.some((t) => String(t.trackId || t.id) === String(currentTrack?.id));

  const handleMasterPlay = () => {
    if (tracks.length === 0) return;
    if (isCurrentPlaylistPlaying) {
      togglePlay();
    } else {
      playTrack(tracks[0], tracks);
    }
  };

  const handlePlayOfflinePlaylist = (e, pl) => {
    e.stopPropagation();
    if (!tracks || tracks.length === 0) return;

    // Filter downloaded tracks belonging to this playlist or match by ID
    const plTrackIds = new Set(
      Array.isArray(pl.downloadedTrackIds)
        ? pl.downloadedTrackIds.map(String)
        : []
    );
    const plTracks = tracks.filter((t) =>
      plTrackIds.has(String(t.trackId || t.id)) ||
      (Array.isArray(t.playlistIds) && t.playlistIds.includes(String(pl.playlistId)))
    );

    const targetTracks = plTracks.length > 0 ? plTracks : tracks;
    if (targetTracks.length > 0) {
      playTrack(targetTracks[0], targetTracks);
      if (showOfflineNotice) {
        showOfflineNotice(`Playing "${pl.title}" in offline mode`);
      }
    }
  };

  const handleRemoveOfflinePlaylist = async (e, pl) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${pl.title}" from offline downloads on this device?\n(This will not delete the playlist from your cloud library).`
    );
    if (!confirmed) return;

    await removePlaylistOffline(pl.playlistId);
    await refreshOfflineState();
    await loadOfflineData();
    if (showOfflineNotice) {
      showOfflineNotice(`Removed "${pl.title}" from offline storage`);
    }
  };

  const handleRowClick = (track) => {
    const tid = String(track.trackId || track.id);
    if (String(currentTrack?.id) === tid) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  const handleRemoveTrack = async (e, track) => {
    e.stopPropagation();
    const tid = String(track.trackId || track.id);
    await removeOfflineTrack(tid);
    await refreshOfflineState();
    await loadOfflineData();
  };

  return (
    <div className="w-full flex flex-col pb-12 select-none">
      {/* Hero Header */}
      <div className="relative w-full p-3.5 sm:p-6 md:p-8 bg-gradient-to-b from-cyan-950/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-3.5 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art Box */}
          <div className="w-24 h-24 sm:w-36 sm:h-36 md:w-56 md:h-56 rounded-2xl bg-gradient-to-br from-cyan-600 via-teal-700 to-slate-900 flex flex-col items-center justify-center shadow-[0_20px_40px_rgba(6,182,212,0.35)] flex-shrink-0 border border-white/10 relative overflow-hidden group mx-auto md:mx-0">
            <span
              className="material-symbols-outlined text-white text-[40px] sm:text-[56px] md:text-[76px] drop-shadow-md group-hover:scale-105 transition-transform"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              download_for_offline
            </span>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-3 sm:left-3 sm:right-3 flex items-center justify-between text-[8.5px] sm:text-[10px] md:text-[11px] font-mono font-bold text-cyan-200 bg-black/50 backdrop-blur-md px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg border border-white/10">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="hidden sm:inline">LOCAL ONLY</span>
                <span className="sm:hidden">OFFLINE</span>
              </span>
              <span>{stats.formattedSize}</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-1.5 sm:gap-2.5 text-center md:text-left flex-1 min-w-0 w-full">
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
                Device Storage • IndexedDB
              </span>
              {isMounted && !isNetworkOnline && (
                <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Offline Mode
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Offline Songs
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant max-w-xl line-clamp-2 sm:line-clamp-none">
              Tracks stored in persistent high-fidelity audio binary format on this device. Fully playable anytime without internet connection or Supabase dependency.
            </p>

            <div className="flex items-center justify-center md:justify-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-outline pt-0.5 sm:pt-1 flex-wrap">
              <span className="text-white font-medium">This Device</span>
              <span>•</span>
              <span className="text-primary font-semibold">{tracks.length} {tracks.length === 1 ? "Song" : "Songs"}</span>
              <span>•</span>
              <span className="font-mono text-outline">{stats.formattedSize} Used</span>
              {isMounted && stats.isPersisted && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] sm:text-[14px]">verified</span>
                    Persistent
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Master Play Controls */}
        {tracks.length > 0 && (
          <div className="flex items-center justify-center md:justify-start gap-3 sm:gap-4 mt-4 sm:mt-6 md:mt-8 flex-wrap">
            <button
              onClick={handleMasterPlay}
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0"
              title={isCurrentPlaylistPlaying ? "Pause" : "Play all offline songs"}
            >
              <span className="material-symbols-outlined text-[24px] sm:text-[32px]">
                {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-surface-container/70 border border-white/10 text-[11px] sm:text-xs text-on-surface-variant font-medium">
              <span className="material-symbols-outlined text-primary text-[15px] sm:text-[16px]">
                check_circle
              </span>
              <span>Zero data usage • Instant local playback</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-6">
        {/* Section: Offline Playlists */}
        {offlinePlaylists.length > 0 && (
          <div className="flex flex-col gap-4 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">queue_music</span>
                <h2 className="text-xl font-bold text-white tracking-tight">Offline Playlists</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono font-semibold">
                  {offlinePlaylists.length}
                </span>
              </div>
            </div>

            {/* 1. Mobile Horizontal List (< md) */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {offlinePlaylists.map((pl) => (
                <div
                  key={pl.playlistId}
                  onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                  className="flex items-center gap-3.5 p-3 rounded-2xl glass-card border border-white/5 hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer shadow-lg group"
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container-highest flex-shrink-0 shadow border border-white/10">
                    <img
                      src={pl.coverUrl}
                      alt={pl.title}
                      onError={(e) => {
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                        {pl.title}
                      </h3>
                      <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 flex-shrink-0">
                        OFFLINE
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                      {pl.downloadedTrackIds?.length || pl.totalTracks || 0} songs downloaded
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => handlePlayOfflinePlaylist(e, pl)}
                      className="w-9 h-9 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.5)] active:scale-90 transition-transform cursor-pointer"
                      title="Play offline playlist"
                    >
                      <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveOfflinePlaylist(e, pl)}
                      className="w-8 h-8 rounded-full text-outline hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title="Remove offline download"
                    >
                      <span className="material-symbols-outlined text-[17px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 2. Desktop Grid (md:) */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-5 gap-4">
              {offlinePlaylists.map((pl) => (
                <div
                  key={pl.playlistId}
                  onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                  className="group relative flex flex-col gap-3 p-3.5 rounded-2xl bg-surface-container/60 hover:bg-surface-container border border-white/5 hover:border-primary/40 transition-all duration-300 shadow-lg cursor-pointer select-none"
                >
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
                    <img
                      src={pl.coverUrl}
                      alt={pl.title}
                      onError={(e) => {
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleRemoveOfflinePlaylist(e, pl)}
                        className="w-8 h-8 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-red-500/30"
                        title="Remove offline download"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handlePlayOfflinePlaylist(e, pl)}
                        className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                        title="Play offline playlist"
                      >
                        <span className="material-symbols-outlined text-[24px]">play_arrow</span>
                      </button>
                    </div>
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono font-bold text-cyan-300 border border-white/10 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">download_done</span>
                      OFFLINE
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <h3 className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate">
                      {pl.title}
                    </h3>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">
                      {pl.downloadedTrackIds?.length || pl.totalTracks || 0} songs downloaded
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section: Offline Songs Table */}
        <div className="flex flex-col gap-2">
          {offlinePlaylists.length > 0 && tracks.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary text-[20px]">music_note</span>
              <h2 className="text-lg font-bold text-white tracking-tight">All Downloaded Songs</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-outline font-mono">
                {tracks.length}
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-xs text-outline font-medium">Loading local offline storage...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-surface-container/70 border border-white/10 flex items-center justify-center text-outline shadow-inner">
                <span className="material-symbols-outlined text-[44px]">download_for_offline</span>
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="text-lg font-bold text-white">Your offline songs will appear here</h3>
                <p className="text-xs text-outline leading-relaxed">
                  Download full playlists or individual songs to listen seamlessly anywhere without an internet connection.
                </p>
              </div>
              <Link
                href="/playlists"
                className="mt-3 px-6 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_20px_rgba(76,215,246,0.35)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">queue_music</span>
                <span>Browse Playlists</span>
              </Link>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_6.5rem] items-center px-3 md:px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
                <span className="text-center">#</span>
                <span>Title</span>
                <span className="hidden md:block">Artist / Album</span>
                <span className="text-right flex items-center justify-end pr-1">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                </span>
                <span className="text-right hidden md:block pr-2">Action</span>
              </div>

              {/* Tracks List */}
              <div className="flex flex-col gap-1">
                {tracks.map((track, idx) => {
                  const tid = String(track.trackId || track.id);
                  const isCurrent = String(currentTrack?.id) === tid;
                  const isPlayingRow = isCurrent && isPlaying;
                  const displayCover =
                    coverUrls[tid] ||
                    track.coverUrl ||
                    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

                  return (
                    <div
                      key={tid}
                      onClick={() => handleRowClick(track)}
                      className={`grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_6.5rem] items-center px-3 md:px-4 py-2.5 rounded-xl border transition-all cursor-pointer group ${
                        isCurrent
                          ? "bg-surface-container-high/80 border-primary/50 text-white"
                          : "border-transparent hover:bg-surface-container/60 hover:border-white/5"
                      }`}
                    >
                      {/* # or Play indicator */}
                      <div className="flex items-center justify-center">
                        {isPlayingRow ? (
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-0.5 h-full bg-primary animate-pulse" />
                            <span className="w-0.5 h-2 bg-primary animate-pulse delay-75" />
                            <span className="w-0.5 h-3 bg-primary animate-pulse delay-150" />
                          </div>
                        ) : (
                          <>
                            <span className="group-hover:hidden text-xs font-mono text-outline">
                              {idx + 1}
                            </span>
                            <span className="hidden group-hover:block text-white">
                              <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Title & Cover */}
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="w-10 h-10 rounded-lg bg-surface-container flex-shrink-0 overflow-hidden relative border border-white/10 shadow-sm">
                          <img
                            src={displayCover}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src =
                                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-tl bg-cyan-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm font-semibold truncate ${
                                isCurrent ? "text-primary" : "text-white group-hover:text-primary transition-colors"
                              }`}
                            >
                              {track.title}
                            </span>
                            <span
                              className="material-symbols-outlined text-primary text-[14px] flex-shrink-0"
                              title="Available offline"
                            >
                              download_done
                            </span>
                          </div>
                          <span className="text-xs text-outline truncate md:hidden">
                            {track.artist}
                          </span>
                        </div>
                      </div>

                      {/* Artist & Album */}
                      <div className="hidden md:flex flex-col min-w-0 pr-4">
                        <span className="text-xs text-on-surface-variant font-medium truncate">
                          {track.artist}
                        </span>
                        {track.album && (
                          <span className="text-[11px] text-outline truncate">
                            {track.album}
                          </span>
                        )}
                      </div>

                      {/* Duration */}
                      <div className="text-right text-xs font-mono text-outline pr-2">
                        {track.durationFormatted ||
                          (typeof track.duration === "number"
                            ? formatTime(track.duration)
                            : "3:30")}
                      </div>

                      {/* Action: Remove from offline & 3-dot context menu */}
                      <div className="flex items-center justify-end gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleRemoveTrack(e, track)}
                          className="p-1.5 rounded-lg text-outline hover:text-red-400 hover:bg-white/10 transition-colors"
                          title="Remove offline download from this device"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            delete
                          </span>
                        </button>
                        <SongOptionsMenu track={track} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
