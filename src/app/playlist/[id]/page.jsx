"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../../context/MusicContext";
import { NOCTURNE_PLAYLISTS, NOCTURNE_TRACKS, getPlaylistById } from "../../../data/nocturneData";
import DownloadButton from "../../../components/DownloadButton";
import SongOptionsMenu from "../../../components/SongOptionsMenu";
import { formatPlaylistDuration } from "../../../utils/playlistUtils";
import {
  saveLocalAudioFile,
  getAudioFileDuration,
  formatFileSize,
} from "../../../services/localAudioStorage";

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlistId = params?.id || "midnight-reverie";
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
    toggleShuffle,
    pinnedPlaylistIds,
    togglePinPlaylist,
    isPlaylistPinned,
    formatTime,
    customPlaylists,
    deleteCustomPlaylist,
    selfMixes,
    deleteSelfMix,
    addTrackToPlaylist,
    addLocalTracksToSelfMix,
    removeTrackFromPlaylist,
    offlineTrackIds,
    downloadPlaylist,
    removePlaylistOffline,
  } = useMusic();

  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [remotePlaylist, setRemotePlaylist] = useState(null);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Playlist Offline Download States
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [downloadStatusMsg, setDownloadStatusMsg] = useState(null);
  const [isOfflineMenuOpen, setIsOfflineMenuOpen] = useState(false);

  const localMatch =
    customPlaylists?.find((p) => String(p.id) === String(playlistId)) ||
    selfMixes?.find((p) => String(p.id) === String(playlistId)) ||
    getPlaylistById(playlistId) ||
    NOCTURNE_PLAYLISTS.find((p) => p.id.toLowerCase() === String(playlistId).toLowerCase());

  useEffect(() => {
    if (!localMatch && playlistId) {
      setIsLoadingRemote(true);
      fetch(`/api/audio/playlist?id=${encodeURIComponent(playlistId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.tracks && data.tracks.length > 0) {
            setRemotePlaylist(data);
          }
        })
        .catch((err) => console.warn("Error fetching remote playlist:", err))
        .finally(() => setIsLoadingRemote(false));
    }
  }, [playlistId, localMatch]);

  const playlist = localMatch || remotePlaylist || NOCTURNE_PLAYLISTS[0];

  const isCustomPlaylist = Boolean(
    playlist?.isCustom ||
    customPlaylists?.some((p) => p.id === playlistId) ||
    selfMixes?.some((p) => p.id === playlistId)
  );

  const isSelfMix = Boolean(
    playlist?.isSelfMix ||
    selfMixes?.some((p) => p.id === playlistId)
  );

  const tracks = playlist.tracks || (isCustomPlaylist ? [] : NOCTURNE_TRACKS);

  // Auto-play when opened with ?play=true query param
  useEffect(() => {
    if (shouldAutoPlay && !hasAutoPlayedRef.current && tracks && tracks.length > 0) {
      hasAutoPlayedRef.current = true;
      playTrack(tracks[0], tracks);
    }
  }, [shouldAutoPlay, tracks, playTrack]);

  const isCurrentPlaylistPlaying =
    isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  const handleMasterPlay = () => {
    if (tracks.length === 0) return;
    if (isCurrentPlaylistPlaying) {
      togglePlay();
    } else {
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

  // Offline Download Handlers
  const totalTrackCount = tracks?.length || 0;
  const downloadedTrackCount = tracks?.filter((t) => offlineTrackIds?.has(String(t.id)))?.length || 0;
  const isPlaylistFullyOffline = totalTrackCount > 0 && downloadedTrackCount === totalTrackCount;
  const isPlaylistPartiallyOffline = downloadedTrackCount > 0 && downloadedTrackCount < totalTrackCount;

  const handleDownloadPlaylist = async () => {
    if (!tracks || tracks.length === 0 || isDownloadingOffline) return;
    setIsDownloadingOffline(true);
    setDownloadProgress({ current: 0, total: tracks.length });
    setDownloadStatusMsg(null);
    setIsOfflineMenuOpen(false);

    try {
      const res = await downloadPlaylist(
        {
          id: playlist.id,
          title: playlist.title,
          coverUrl: playlist.coverUrl,
          tracks,
        },
        ({ current, total }) => {
          setDownloadProgress({ current, total });
        }
      );

      if (res.failedCount > 0) {
        setDownloadStatusMsg(`⚠ ${res.failedCount} songs could not be downloaded`);
      } else {
        setDownloadStatusMsg(`✓ ${res.successCount} songs available offline`);
      }
    } catch (err) {
      console.error("Playlist offline download error:", err);
      setDownloadStatusMsg("Download encountered an error");
    } finally {
      setIsDownloadingOffline(false);
    }
  };

  const handleRemoveOffline = async () => {
    try {
      await removePlaylistOffline(playlist.id, tracks);
      setIsOfflineMenuOpen(false);
      setDownloadStatusMsg(null);
    } catch (err) {
      console.warn("Remove playlist offline error:", err);
    }
  };

  const handleFilesSelected = async (filesList) => {
    if (!filesList || filesList.length === 0 || !isSelfMix) return;
    setIsUploading(true);

    try {
      const newTracks = [];
      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const isAudio =
          file.type.startsWith("audio/") ||
          /\.(mp3|wav|m4a|aac|flac|ogg|wma|opus)$/i.test(file.name);
        if (!isAudio) continue;

        const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_]+/g, " ");
        const durationSecs = await getAudioFileDuration(file);

        const mins = Math.floor(durationSecs / 60);
        const secs = durationSecs % 60;
        const formattedDuration = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
        const trackId = `local-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;

        // Save blob to IndexedDB
        await saveLocalAudioFile(trackId, file, {
          fileName: file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: file.size,
        });

        newTracks.push({
          id: trackId,
          title: cleanTitle,
          artist: "Self Mix Upload",
          album: playlist.title || "Personal Self Mix",
          duration: durationSecs || 180,
          durationFormatted: formattedDuration,
          coverUrl:
            playlist.coverUrl ||
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
          isLocal: true,
          source: "local-upload",
          fileName: file.name,
          fileSize: file.size,
          badge: "Self Mix",
          badgeType: "cyan",
        });
      }

      if (newTracks.length > 0) {
        addLocalTracksToSelfMix(playlist.id, newTracks);
      }
    } catch (err) {
      console.error("Error uploading audio files into self mix:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const totalDurationStr = formatPlaylistDuration(tracks);

  return (
    <div className="w-full flex flex-col pb-12 select-none">
      {/* Dynamic Hero Banner */}
      <div className="relative w-full p-4 sm:p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-4 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 group">
            <img
              src={playlist.coverUrl}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Metadata info */}
          <div className="flex flex-col gap-2 sm:gap-2.5 text-center md:text-left flex-1 min-w-0">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[10px] sm:text-[11px] font-bold tracking-wider uppercase ${isSelfMix
                  ? "bg-cyan-950/80 text-cyan-300 border-cyan-700/60"
                  : "bg-primary/15 border-primary/30 text-primary"
                  }`}
              >
                {isSelfMix ? "Self Mix • Hi-Res Lossless" : (playlist.fidelity || "Public Playlist • Hi-Res Lossless")}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-tertiary/15 text-tertiary text-[9px] sm:text-[10px] font-mono font-bold">
                {playlist.spec || "24-Bit • 192kHz"}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {playlist.title}
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant line-clamp-2 max-w-2xl">
              {playlist.description}
            </p>

            <div className="flex items-center justify-center md:justify-start gap-2 sm:gap-3 text-xs text-outline pt-1 sm:pt-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <img
                  src={playlist.curatorAvatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS"}
                  alt="Curator"
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover"
                />
                <span className="text-white font-medium">{playlist.curator}</span>
              </div>
              <span>•</span>
              <span className="font-semibold text-white">
                {tracks.length} {tracks.length === 1 ? "Track" : "Tracks"}
              </span>
              <span>•</span>
              <span className="font-mono text-outline">{totalDurationStr}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{playlist.updatedDate || "Updated today"}</span>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center gap-2.5 sm:gap-4 mt-5 sm:mt-8 flex-wrap">
          {/* Master Play Button */}
          <button
            onClick={handleMasterPlay}
            disabled={tracks.length === 0}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={isCurrentPlaylistPlaying ? "Pause playlist" : "Play playlist"}
          >
            <span className="material-symbols-outlined text-[26px] sm:text-[32px]">
              {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>

          {/* Shuffle Button matching Image 3 */}
          <button
            type="button"
            onClick={() => toggleShuffle(tracks)}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border flex items-center gap-1.5 sm:gap-2 text-xs md:text-sm font-semibold transition-all cursor-pointer ${isShuffle
                ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_15px_rgba(76,215,246,0.3)]"
                : "bg-surface-container/60 text-outline hover:text-white border-white/10 hover:border-white/20"
              }`}
            title={isShuffle ? "Shuffle is ON" : "Shuffle is OFF"}
          >
            <span className="material-symbols-outlined text-[17px] sm:text-[19px]">shuffle</span>
            <span>Shuffle</span>
          </button>

          {/* Pin to Library Button matching Image 3 */}
          <button
            type="button"
            onClick={() => togglePinPlaylist(playlist.id, playlist)}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border flex items-center gap-1.5 sm:gap-2 text-xs md:text-sm font-semibold transition-all cursor-pointer ${isPlaylistPinned(playlist.id)
                ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_15px_rgba(76,215,246,0.3)]"
                : "bg-surface-container/60 text-outline hover:text-white border-white/10 hover:border-white/20"
              }`}
            title={isPlaylistPinned(playlist.id) ? "Unpin from library" : "Pin to library"}
          >
            <span className={`material-symbols-outlined text-[17px] sm:text-[19px] ${isPlaylistPinned(playlist.id) ? "rotate-45" : ""}`}>
              push_pin
            </span>
            <span>{isPlaylistPinned(playlist.id) ? "Pinned" : "Pin to Library"}</span>
          </button>

          {/* Like Playlist */}
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer"
            title="Save to library"
          >
            <span className="material-symbols-outlined text-[22px]">favorite_border</span>
          </button>

          {/* Offline Download Control */}
          <div className="relative">
            {isDownloadingOffline ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/15 text-primary border border-primary/40 text-xs font-bold shadow-[0_0_15px_rgba(76,215,246,0.3)] animate-pulse select-none">
                <span className="material-symbols-outlined text-[17px] animate-spin">
                  progress_activity
                </span>
                <span>
                  Downloading {downloadProgress.current} / {downloadProgress.total} songs
                </span>
              </div>
            ) : isPlaylistFullyOffline ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsOfflineMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 text-xs font-bold shadow-[0_0_16px_rgba(16,185,129,0.25)] active:scale-95 transition-all cursor-pointer group"
                  title="Available for offline playback on this device (click for options)"
                >
                  <span className="material-symbols-outlined text-emerald-400 text-[18px]">
                    check_circle
                  </span>
                  <span>✓ Available Offline</span>
                  <span className="material-symbols-outlined text-[15px] text-emerald-400/80 group-hover:translate-y-0.5 transition-transform">
                    expand_more
                  </span>
                </button>

                {isOfflineMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-52 bg-[#0d172e]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-2 z-[100] animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] text-outline border-b border-white/10 mb-1">
                      {downloadedTrackCount} of {totalTrackCount} songs offline
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadPlaylist}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px] text-primary">
                        refresh
                      </span>
                      <span>Update / Re-download</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveOffline}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        delete
                      </span>
                      <span>Remove from offline</span>
                    </button>
                  </div>
                )}
              </div>
            ) : isPlaylistPartiallyOffline ? (
              <button
                type="button"
                onClick={handleDownloadPlaylist}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25 text-xs font-bold active:scale-95 transition-all cursor-pointer"
                title="Download missing tracks to make playlist fully offline"
              >
                <span className="material-symbols-outlined text-[18px] text-cyan-400">
                  downloading
                </span>
                <span>
                  {downloadedTrackCount} / {totalTrackCount} Available Offline
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadPlaylist}
                disabled={totalTrackCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container/80 text-white hover:text-primary hover:border-primary/40 border border-white/10 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group"
                title="Download all songs in playlist to this device for offline playback"
              >
                <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
                  download_for_offline
                </span>
                <span>Download for Offline</span>
              </button>
            )}
          </div>

          {downloadStatusMsg && (
            <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              {downloadStatusMsg}
            </span>
          )}

          {/* Upload Tracks Button (Only for Self Mix) */}
          {isSelfMix && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFilesSelected(e.target.files);
                  }
                }}
              />
              <button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/40 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                title="Upload audio mix files into this Self Mix"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isUploading ? "progress_activity" : "upload_file"}
                </span>
                <span>{isUploading ? "Uploading..." : "Upload Mix"}</span>
              </button>
            </>
          )}

          {/* Delete Playlist Button (icon-only matching Image 2) */}
          {isCustomPlaylist && (
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              aria-label={isSelfMix ? "Delete Self Mix" : "Delete Playlist"}
              title={isSelfMix ? "Delete Self Mix" : "Delete Playlist"}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all shadow-sm active:scale-95 ml-auto sm:ml-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal Dialog */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0d172e] border border-red-500/30 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-col gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <span className="material-symbols-outlined text-[26px]">delete</span>
            </div>
            <div className="flex flex-col text-center gap-1.5">
              <h3 className="text-lg font-bold text-white">
                Delete {isSelfMix ? "Self Mix" : "Playlist"}?
              </h3>
              <p className="text-xs text-outline leading-relaxed">
                Are you sure you want to delete <span className="text-white font-semibold">"{playlist.title}"</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-outline hover:text-white hover:bg-white/5 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  if (isSelfMix) {
                    deleteSelfMix(playlist.id);
                    router.push("/self-mix");
                  } else {
                    deleteCustomPlaylist(playlist.id);
                    router.push("/playlists");
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tracklist Table */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-2">
        {/* Table Header */}
        <div className="grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_8rem] items-center px-3 md:px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="hidden md:block">Artist</span>
          <span className="text-right flex items-center justify-end pr-1">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
          </span>
          <span className="text-right hidden md:block pr-2">Actions</span>
        </div>

        {/* Tracks List */}
        <div className="flex flex-col gap-1">
          {tracks.length === 0 ? (
            isSelfMix ? (
              /* Empty state with audio upload dropzone for Self Mix */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center py-16 text-center gap-3 rounded-2xl border-2 border-dashed transition-all my-4 cursor-pointer ${isDragging
                  ? "border-primary bg-primary/10"
                  : "border-white/15 hover:border-primary/50 bg-surface-container-high/40 hover:bg-surface-container-high/60"
                  }`}
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-3xl">upload_file</span>
                </div>
                <p className="text-white font-bold text-base">This Self Mix is empty</p>
                <p className="text-xs text-outline max-w-sm">
                  Drag and drop your audio files (MP3, WAV, FLAC, M4A) or click here to upload your YouTube mixes and DJ mashups.
                </p>
                <span className="px-4 py-1.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs mt-1 shadow-md">
                  Choose Audio Files
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3 glass-card rounded-2xl border border-white/5 my-4">
                <span className="material-symbols-outlined text-4xl text-outline">queue_music</span>
                <p className="text-white font-bold text-base">This playlist is empty</p>
                <p className="text-xs text-outline max-w-sm">
                  Add recommended tracks below or search songs to build your personalized playlist.
                </p>
              </div>
            )
          ) : (
            tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => handleRowClick(track)}
                  className={`group grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_8rem] items-center px-3 md:px-4 py-2.5 rounded-xl transition-all cursor-pointer ${isCurrent
                    ? "bg-surface-container-high/80 border border-primary/30"
                    : "hover:bg-surface-container/60 hover:border-white/5 border border-transparent"
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
                              values="10;4;14;10"
                            />
                            <animate
                              attributeName="y"
                              dur="0.8s"
                              repeatCount="indefinite"
                              values="10;16;6;10"
                            />
                          </rect>
                          <rect height="15" rx="1.5" width="3" x="8.5" y="5">
                            <animate
                              attributeName="height"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="15;8;18;15"
                            />
                            <animate
                              attributeName="y"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="5;12;2;5"
                            />
                          </rect>
                          <rect height="12" rx="1.5" width="3" x="14" y="8">
                            <animate
                              attributeName="height"
                              dur="0.7s"
                              repeatCount="indefinite"
                              values="12;16;6;12"
                            />
                            <animate
                              attributeName="y"
                              dur="0.7s"
                              repeatCount="indefinite"
                              values="8;4;14;8"
                            />
                          </rect>
                          <rect height="8" rx="1.5" width="3" x="19.5" y="12">
                            <animate
                              attributeName="height"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="8;14;5;8"
                            />
                            <animate
                              attributeName="y"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="12;6;15;12"
                            />
                          </rect>
                        </svg>
                      </span>
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

                  {/* Cover & Title */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high shadow">
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-semibold truncate transition-colors ${isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                            }`}
                        >
                          {track.title}
                        </span>
                        {offlineTrackIds?.has(String(track.id)) && (
                          <span
                            className="material-symbols-outlined text-primary text-[14px] flex-shrink-0"
                            title="Available offline on this device"
                          >
                            download_done
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-on-surface-variant md:hidden truncate mt-0.5">
                        {track.artist}
                      </span>
                    </div>
                  </div>

                  {/* Artist */}
                  <div className="hidden md:block truncate text-xs text-on-surface-variant hover:text-white">
                    {track.artist}
                  </div>

                  {/* Duration */}
                  <div className="text-right text-xs font-mono text-outline pr-2">
                    {track.durationFormatted || formatTime(track.duration)}
                  </div>

                  {/* Actions: Download, Like, & Remove from playlist */}
                  <div className="flex items-center justify-end gap-1 flex-shrink-0">
                    {!track.isLocal && (
                      <DownloadButton track={track} buttonSize="p-1" iconSize="text-[18px]" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(track.id);
                      }}
                      className={`p-1 hover:scale-110 transition-transform ${isLiked(track.id) ? "text-primary" : "text-outline hover:text-white"
                        }`}
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        favorite
                      </span>
                    </button>
                    {isCustomPlaylist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(playlist.id, track.id);
                        }}
                        className="p-1 text-outline hover:text-red-400 hover:bg-white/10 rounded-md transition-colors"
                        title="Remove from playlist"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                    <SongOptionsMenu track={track} playlistId={isCustomPlaylist ? playlist.id : null} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Upload Dropzone below tracklist for Self Mix */}
        {isSelfMix && tracks.length > 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                handleFilesSelected(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-6 p-4 rounded-xl border border-dashed transition-all flex items-center justify-between gap-4 cursor-pointer ${isDragging
              ? "border-primary bg-primary/10"
              : "border-white/15 hover:border-primary/40 bg-surface-container/40 hover:bg-surface-container/70"
              }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Add more tracks to this Self Mix</span>
                <span className="text-[11px] text-outline">
                  Drop MP3, WAV, FLAC, or M4A mixes here or click to browse
                </span>
              </div>
            </div>

            <button
              type="button"
              className="px-3.5 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-xs font-bold whitespace-nowrap hover:bg-primary hover:text-surface-container-lowest transition-all"
            >
              Upload Audio
            </button>
          </div>
        )}

        {/* Recommended songs to add ONLY if regular custom playlist (NOT Self Mix) */}
        {isCustomPlaylist && !isSelfMix && (
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">add_circle</span>
                  Add Songs to "{playlist.title}"
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Quickly sequence more tracks into your custom playlist</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {NOCTURNE_TRACKS.filter((nt) => !tracks.some((t) => t.id === nt.id))
                .slice(0, 6)
                .map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container/50 border border-white/5 hover:border-primary/30 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={track.coverUrl} alt={track.title} className="w-10 h-10 rounded-lg object-cover" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-white truncate">{track.title}</span>
                        <span className="text-[11px] text-on-surface-variant truncate">{track.artist}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => addTrackToPlaylist(playlist.id, track)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/30 text-xs font-bold transition-all ml-2 flex-shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      <span>Add</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
