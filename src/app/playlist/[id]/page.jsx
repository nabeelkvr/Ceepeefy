"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../../context/MusicContext";
import { NOCTURNE_PLAYLISTS, NOCTURNE_TRACKS, getPlaylistById } from "../../../data/nocturneData";
import { SPOTIFY_STYLE_PLAYLISTS } from "../../../data/curatedDiscovery";
import DownloadButton from "../../../components/DownloadButton";
import SongOptionsMenu from "../../../components/SongOptionsMenu";
import PlaylistCover from "../../../components/PlaylistCover";
import { formatPlaylistDuration } from "../../../utils/playlistUtils";
import { searchMusicTracks } from "../../../services/audioService";
import useDebounce from "../../../hooks/useDebounce";
import {
  saveLocalAudioFile,
  getAudioFileDuration,
  formatFileSize,
} from "../../../services/localAudioStorage";
import {
  uploadAudioToCloud,
  saveSelfMixToCloud,
  isSupabaseConfigured,
} from "../../../services/supabaseClient";
import { getAccountUserId } from "../../../config/authConfig";
import PlaylistSkeleton from "../../../components/PlaylistSkeleton";

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
    createPlaylist,
    deleteCustomPlaylist,
    selfMixes,
    deleteSelfMix,
    addTrackToPlaylist,
    addLocalTracksToSelfMix,
    removeTrackFromPlaylist,
    offlineTrackIds,
    downloadPlaylist,
    removePlaylistOffline,
    renamePlaylist,
    bumpPlaylistToTop,
    user,
  } = useMusic();

  const currentUserId = getAccountUserId(user);

  const fileInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
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

  // Add Songs & Search State
  const [isAddSongsOpen, setIsAddSongsOpen] = useState(false);
  const [searchAddQuery, setSearchAddQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchAddQuery, 300);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingAdd, setIsSearchingAdd] = useState(false);
  const [justAddedIds, setJustAddedIds] = useState(new Set());
  const addSongsSectionRef = useRef(null);
  const searchAddInputRef = useRef(null);

  const localMatch =
    customPlaylists?.find((p) => String(p.id) === String(playlistId)) ||
    selfMixes?.find((p) => String(p.id) === String(playlistId)) ||
    getPlaylistById(playlistId) ||
    SPOTIFY_STYLE_PLAYLISTS.find(
      (p) =>
        p.id.toLowerCase() === String(playlistId).toLowerCase() ||
        String(p.playlistId || "").toLowerCase() === String(playlistId).toLowerCase()
    ) ||
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

  const tracks = playlist?.tracks || (isCustomPlaylist ? [] : NOCTURNE_TRACKS);

  // Auto-play when opened with ?play=true query param
  useEffect(() => {
    if (shouldAutoPlay && !hasAutoPlayedRef.current && tracks && tracks.length > 0) {
      hasAutoPlayedRef.current = true;
      if (playlist?.id && bumpPlaylistToTop) {
        bumpPlaylistToTop(playlist.id);
      }
      playTrack(tracks[0], tracks);
    }
  }, [shouldAutoPlay, tracks, playTrack, playlist?.id, bumpPlaylistToTop]);

  // Sync edited title when playlist changes
  useEffect(() => {
    if (playlist?.title) {
      setEditedTitle(playlist.title);
    }
  }, [playlist?.title]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleRenameSubmit = (e) => {
    if (e) e.preventDefault();
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== playlist.title && renamePlaylist) {
      renamePlaylist(playlist.id, trimmed);
    } else {
      setEditedTitle(playlist.title || "");
    }
    setIsEditingTitle(false);
  };

  const isCurrentPlaylistPlaying =
    isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  const handleMasterPlay = () => {
    if (tracks.length === 0) return;
    if (playlist?.id && bumpPlaylistToTop) {
      bumpPlaylistToTop(playlist.id);
    }
    if (isCurrentPlaylistPlaying) {
      togglePlay();
    } else {
      playTrack(tracks[0], tracks);
    }
  };

  // Instant Shuffle Playback: Randomizes tracks and immediately starts playback
  const handleShufflePlay = () => {
    if (!tracks || tracks.length === 0) return;
    if (playlist?.id && bumpPlaylistToTop) {
      bumpPlaylistToTop(playlist.id);
    }
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    setIsShuffle(true);
    playTrack(shuffled[0], shuffled);
  };

  const handleRowClick = (track) => {
    if (playlist?.id && bumpPlaylistToTop) {
      bumpPlaylistToTop(playlist.id);
    }
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
      const hasCloud = isSupabaseConfigured();

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
        const trackId = `${hasCloud ? "cloud" : "local"}-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;

        let audioUrl = "";
        let isCloud = false;

        // 1. Upload to Supabase Storage if configured for cross-device access
        if (hasCloud) {
          try {
            const { publicUrl } = await uploadAudioToCloud(file, currentUserId);
            audioUrl = publicUrl;
            isCloud = true;

            await saveSelfMixToCloud({
              id: trackId,
              title: cleanTitle,
              audioUrl: publicUrl,
              owner: currentUserId,
              duration: durationSecs || 180,
              durationFormatted: formattedDuration,
              fileName: file.name,
              fileSize: file.size,
              coverUrl: playlist.coverUrl,
            }).catch((e) => console.warn("Supabase record insert warning:", e));
          } catch (cloudErr) {
            console.warn("Cloud upload failed, falling back to local storage:", cloudErr);
          }
        }

        // 2. Save blob to IndexedDB as local offline cache
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
          audioUrl: audioUrl || null,
          isLocal: !isCloud,
          isCloud: isCloud,
          source: isCloud ? "supabase-cloud" : "local-upload",
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

  // Add Songs Handlers
  const handleOpenAddSongs = () => {
    setIsAddSongsOpen(true);
    setTimeout(() => {
      if (addSongsSectionRef.current) {
        addSongsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (searchAddInputRef.current) {
        searchAddInputRef.current.focus();
      }
    }, 80);
  };

  const handleAddSongToPlaylist = (track) => {
    if (!track) return;
    if (isCustomPlaylist) {
      addTrackToPlaylist(playlist.id, track);
      setJustAddedIds((prev) => new Set([...prev, String(track.id)]));
    } else {
      const newPlaylist = createPlaylist(playlist.title);
      if (newPlaylist?.id) {
        (playlist.tracks || []).forEach((t) => addTrackToPlaylist(newPlaylist.id, t));
        addTrackToPlaylist(newPlaylist.id, track);
        setJustAddedIds((prev) => new Set([...prev, String(track.id)]));
        router.push(`/playlist/${newPlaylist.id}`);
      }
    }
  };

  // Debounced catalog & local music search
  useEffect(() => {
    const q = (debouncedSearchQuery || "").trim();
    if (!q) {
      setSearchResults([]);
      setIsSearchingAdd(false);
      return;
    }

    let isMounted = true;
    setIsSearchingAdd(true);

    // Instant local matches from Nocturne tracks
    const lower = q.toLowerCase();
    const localFiltered = NOCTURNE_TRACKS.filter((nt) => {
      return (
        nt.title?.toLowerCase().includes(lower) ||
        nt.artist?.toLowerCase().includes(lower) ||
        (nt.album && nt.album.toLowerCase().includes(lower))
      );
    });

    // Query live audio search catalog
    searchMusicTracks(q)
      .then((remoteSongs) => {
        if (!isMounted) return;
        const seenIds = new Set();
        const combined = [];

        // Put local matches first
        localFiltered.forEach((track) => {
          seenIds.add(String(track.id));
          combined.push(track);
        });

        // Add remote matches
        (remoteSongs || []).forEach((s) => {
          if (!s || !s.id) return;
          const sId = String(s.id);
          if (!seenIds.has(sId)) {
            seenIds.add(sId);
            combined.push({
              id: sId,
              title: s.title || "Untitled",
              artist: s.artist || "Unknown Artist",
              album: s.album || s.artist || "",
              coverUrl: s.coverUrl || s.thumbnail || s.image || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
              duration: typeof s.duration === "number" ? s.duration : 210,
              durationFormatted: s.durationFormatted || "3:30",
              audioUrl: s.audioUrl || "",
              badge: "Lossless",
            });
          }
        });

        setSearchResults(combined);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("Search tracks error:", err);
        setSearchResults(localFiltered);
      })
      .finally(() => {
        if (isMounted) setIsSearchingAdd(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearchQuery]);

  const totalDurationStr = formatPlaylistDuration(tracks);

  if (isLoadingRemote && !localMatch && !remotePlaylist) {
    return <PlaylistSkeleton />;
  }

  return (
    <div className="w-full flex flex-col pb-12 select-none">
      {/* Dynamic Hero Banner */}
      <div className="relative w-full p-4 sm:p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-3.5 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art */}
          <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 group mx-auto md:mx-0">
            <PlaylistCover
              tracks={tracks}
              fallbackUrl={playlist.coverUrl}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Metadata info */}
          <div className="flex flex-col gap-1.5 sm:gap-2.5 text-center md:text-left flex-1 min-w-0 w-full">
            <div className="flex items-center justify-center md:justify-start gap-1.5 sm:gap-2 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[9px] sm:text-[11px] font-bold tracking-wider uppercase ${isSelfMix
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

            {isEditingTitle ? (
              <form
                onSubmit={handleRenameSubmit}
                className="flex items-center justify-center md:justify-start gap-2 w-full max-w-xl my-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditedTitle(playlist.title || "");
                      setIsEditingTitle(false);
                    }
                  }}
                  onBlur={handleRenameSubmit}
                  className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white bg-surface-container-high/90 border border-primary/50 focus:border-primary rounded-xl px-3 py-1 outline-none w-full shadow-[0_0_15px_rgba(76,215,246,0.3)] transition-all"
                  autoFocus
                  placeholder="Playlist name"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-primary text-surface-container-lowest hover:bg-primary/90 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md"
                  title="Save title"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditedTitle(playlist.title || "");
                    setIsEditingTitle(false);
                  }}
                  className="p-2 rounded-xl bg-surface-container text-outline hover:text-white hover:bg-white/10 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
                  title="Cancel"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center md:justify-start gap-2 group/title">
                <h1
                  onDoubleClick={() => {
                    setIsEditingTitle(true);
                    setEditedTitle(playlist.title || "");
                  }}
                  title="Double-click to rename"
                  className="text-xl sm:text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight line-clamp-2 cursor-pointer hover:text-primary transition-colors select-none"
                >
                  {playlist.title}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTitle(true);
                    setEditedTitle(playlist.title || "");
                  }}
                  className="opacity-0 group-hover/title:opacity-100 p-1.5 rounded-lg text-outline hover:text-white hover:bg-white/10 transition-all cursor-pointer flex-shrink-0"
                  title="Rename playlist (or double-click title)"
                  aria-label="Rename playlist"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-center md:justify-start gap-2 sm:gap-3 text-xs text-outline pt-0.5 sm:pt-1">
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

        {/* Action Controls Bar - Premium Glassmorphic Studio Dock */}
        <div className="flex flex-row items-center gap-2 sm:gap-3 mt-4 sm:mt-6 w-full max-w-full overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-2xl sm:rounded-full bg-surface-container-high/60 backdrop-blur-2xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.6)]">
            {/* Master Play Button - Glowing Gradient Orb */}
            <button
              onClick={handleMasterPlay}
              disabled={tracks.length === 0}
              className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-gradient-to-tr from-cyan-500 via-primary to-blue-400 text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.65)] hover:shadow-[0_0_32px_rgba(76,215,246,0.9)] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              title={isCurrentPlaylistPlaying ? "Pause playlist" : "Play playlist"}
            >
              <span className="material-symbols-outlined text-[24px] sm:text-[30px]">
                {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            {/* Shuffle Button - Click to Play in Random Order */}
            <button
              type="button"
              onClick={handleShufflePlay}
              disabled={tracks.length === 0}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 active:scale-90 disabled:opacity-40 ${
                isShuffle
                  ? "bg-primary/25 text-primary border-primary/50 shadow-[0_0_16px_rgba(76,215,246,0.4)]"
                  : "bg-white/5 text-outline hover:text-primary hover:bg-primary/10 border-white/10 hover:border-primary/40 hover:shadow-[0_0_12px_rgba(76,215,246,0.2)]"
              }`}
              title="Shuffle and play random track"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">shuffle</span>
            </button>

            {/* Add Songs Button */}
            <button
              type="button"
              onClick={handleOpenAddSongs}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 active:scale-90 ${
                isAddSongsOpen
                  ? "bg-primary text-surface-container-lowest border-primary shadow-[0_0_18px_rgba(76,215,246,0.5)]"
                  : "bg-white/5 text-outline hover:text-white hover:bg-white/10 border-white/10 hover:border-white/20"
              }`}
              title="Search and add songs to this playlist"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                {isAddSongsOpen ? "search" : "add"}
              </span>
            </button>

            {/* Pin to Library Button */}
            <button
              type="button"
              onClick={() => togglePinPlaylist(playlist.id, playlist)}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 active:scale-90 ${
                isPlaylistPinned(playlist.id)
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                  : "bg-white/5 text-outline hover:text-amber-300 hover:bg-amber-500/10 border-white/10 hover:border-amber-500/30"
              }`}
              title={isPlaylistPinned(playlist.id) ? "Unpin from library" : "Pin to top of playlists"}
            >
              <span className={`material-symbols-outlined text-[18px] sm:text-[20px] ${isPlaylistPinned(playlist.id) ? "rotate-45" : ""}`}>
                push_pin
              </span>
            </button>

            {/* Offline Download Control */}
            <div className="relative flex-shrink-0">
              {isDownloadingOffline ? (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center shadow-[0_0_15px_rgba(76,215,246,0.35)] animate-pulse select-none" title="Downloading songs offline...">
                  <span className="material-symbols-outlined text-[17px] animate-spin">
                    progress_activity
                  </span>
                </div>
              ) : isPlaylistFullyOffline ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsOfflineMenuOpen((prev) => !prev)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30 shadow-[0_0_16px_rgba(16,185,129,0.3)] active:scale-90 transition-all flex items-center justify-center cursor-pointer"
                    title="Downloaded for offline listening (click for options)"
                  >
                    <span className="material-symbols-outlined text-emerald-400 text-[18px] sm:text-[20px]">
                      check_circle
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
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadPlaylist}
                  disabled={totalTrackCount === 0}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center bg-white/5 text-outline hover:text-emerald-300 hover:bg-emerald-500/10 border-white/10 hover:border-emerald-500/30 transition-all cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  title="Download all songs in playlist for offline playback"
                >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                    download_for_offline
                  </span>
                </button>
              )}
            </div>

            {/* Like Playlist */}
            <button
              type="button"
              onClick={() => toggleLike(playlist)}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 active:scale-90 ${
                isLiked(playlist.id)
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-[0_0_16px_rgba(244,63,94,0.35)]"
                  : "bg-white/5 text-outline hover:text-rose-400 hover:bg-rose-500/10 border-white/10 hover:border-rose-500/30"
              }`}
              title={isLiked(playlist.id) ? "Liked" : "Add to favorites"}
            >
              <span className={`material-symbols-outlined text-[18px] sm:text-[20px] ${isLiked(playlist.id) ? "fill-current" : ""}`}>
                {isLiked(playlist.id) ? "favorite" : "favorite_border"}
              </span>
            </button>

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
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-primary/15 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/40 shadow-[0_0_12px_rgba(76,215,246,0.25)] hover:shadow-[0_0_18px_rgba(76,215,246,0.5)] transition-all active:scale-90 cursor-pointer disabled:opacity-50 flex-shrink-0"
                  title="Upload audio tracks to cloud storage"
                >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                    {isUploading ? "progress_activity" : "upload_file"}
                  </span>
                </button>
              </>
            )}

            {/* Delete Playlist Button */}
            {isCustomPlaylist && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                aria-label={isSelfMix ? "Delete Self Mix" : "Delete Playlist"}
                title={isSelfMix ? "Delete Self Mix" : "Delete Playlist"}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 hover:border-red-500/50 shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.35)] transition-all active:scale-90 cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">delete</span>
              </button>
            )}
          </div>
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
        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_auto] items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 py-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-outline select-none">
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="hidden md:block">Artist</span>
          <span className="text-right flex items-center justify-end pr-1">
            <span className="material-symbols-outlined text-[15px]">schedule</span>
          </span>
          <span className="text-right pr-2">Actions</span>
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
                <button
                  type="button"
                  onClick={handleOpenAddSongs}
                  className="mt-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span>Add Songs</span>
                </button>
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
                  className={`group grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_auto] items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer select-none ${isCurrent
                    ? "bg-primary/10 border border-primary/40 shadow-[0_0_20px_rgba(76,215,246,0.15)]"
                    : "bg-surface-container/30 hover:bg-surface-container-high/80 hover:border-white/10 border border-transparent hover:shadow-md"
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

                  {/* Duration with clean tabular font and dedicated space */}
                  <div className="text-right text-xs font-mono text-outline tabular-nums whitespace-nowrap pl-1 pr-1 sm:pr-2">
                    {track.durationFormatted || formatTime(track.duration)}
                  </div>

                  {/* Actions: Download, Like, & Remove from playlist */}
                  <div className="flex items-center justify-end gap-1 sm:gap-1.5 flex-shrink-0">
                    {!track.isLocal && (
                      <DownloadButton
                        track={track}
                        buttonSize="w-8 h-8"
                        iconSize="text-[18px]"
                        className="hover:scale-110 active:scale-95"
                      />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(track.id);
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer hover:bg-white/10 active:scale-95 ${
                        isLiked(track.id) ? "text-primary shadow-[0_0_12px_rgba(76,215,246,0.3)]" : "text-outline hover:text-white"
                      }`}
                      title={isLiked(track.id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {isLiked(track.id) ? "favorite" : "favorite_border"}
                      </span>
                    </button>
                    {isCustomPlaylist && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(playlist.id, track.id);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer active:scale-95"
                        title="Remove from playlist"
                      >
                        <span className="material-symbols-outlined text-[17px]">close</span>
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

        {/* Add Songs & Song Search Section */}
        {(isCustomPlaylist || isAddSongsOpen) && !isSelfMix && (
          <div
            ref={addSongsSectionRef}
            className="mt-10 pt-8 border-t border-white/10 flex flex-col gap-6 scroll-mt-24"
          >
            {/* Header & Subtitle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                  </div>
                  <span>Add Songs to &ldquo;{playlist.title}&rdquo;</span>
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Search millions of songs or pick recommendations to sequence into your playlist
                </p>
              </div>

              {isAddSongsOpen && (
                <button
                  type="button"
                  onClick={() => setIsAddSongsOpen(false)}
                  className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container border border-white/10 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                  <span>Close Search</span>
                </button>
              )}
            </div>

            {/* Song Search Bar */}
            <div className="relative w-full max-w-2xl">
              <div className="relative flex items-center w-full bg-surface-container-high/90 hover:bg-surface-container-high border border-white/10 focus-within:border-primary/50 focus-within:shadow-[0_0_25px_rgba(76,215,246,0.18)] rounded-2xl px-4 py-3 transition-all duration-200">
                <span className="material-symbols-outlined text-outline text-[20px] select-none">
                  search
                </span>
                <input
                  ref={searchAddInputRef}
                  type="text"
                  value={searchAddQuery}
                  onChange={(e) => setSearchAddQuery(e.target.value)}
                  placeholder="Search songs by title, artist, or album..."
                  className="bg-transparent border-none text-white text-sm placeholder:text-outline/60 focus:outline-none w-full ml-3 font-normal"
                />
                {isSearchingAdd && (
                  <span className="material-symbols-outlined text-primary text-[18px] animate-spin select-none mr-1">
                    progress_activity
                  </span>
                )}
                {searchAddQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchAddQuery("");
                      searchAddInputRef.current?.focus();
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-outline hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer"
                    title="Clear search"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search Results or Recommendations */}
            <div className="flex flex-col gap-3">
              {searchAddQuery.trim() ? (
                /* Search Results Mode */
                <>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium">
                    <span>
                      {isSearchingAdd
                        ? `Searching for "${searchAddQuery}"...`
                        : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} found for "${searchAddQuery}"`}
                    </span>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {searchResults.map((track) => {
                        const inPlaylist =
                          tracks.some((t) => String(t.id) === String(track.id)) ||
                          justAddedIds.has(String(track.id));

                        return (
                          <div
                            key={track.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container border border-white/5 hover:border-primary/30 transition-all group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                                <img
                                  src={track.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"}
                                  alt={track.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playTrack(track, [track]);
                                  }}
                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                                  title="Preview track"
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    {currentTrack?.id === track.id && isPlaying ? "pause" : "play_arrow"}
                                  </span>
                                </button>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                                  {track.title}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant truncate">
                                  <span className="truncate">{track.artist}</span>
                                  {track.durationFormatted && (
                                    <>
                                      <span>•</span>
                                      <span className="flex-shrink-0">{track.durationFormatted}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {inPlaylist ? (
                              <button
                                disabled
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold ml-2 flex-shrink-0 cursor-default shadow-sm select-none"
                              >
                                <span className="material-symbols-outlined text-[16px]">check</span>
                                <span>Added</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddSongToPlaylist(track)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/30 text-xs font-bold transition-all ml-2 flex-shrink-0 cursor-pointer shadow-sm active:scale-95"
                              >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : !isSearchingAdd ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 bg-surface-container/30 border border-white/5 rounded-2xl p-6">
                      <span className="material-symbols-outlined text-3xl text-outline">search_off</span>
                      <p className="text-xs text-outline">No songs found for &ldquo;{searchAddQuery}&rdquo;.</p>
                      <p className="text-[11px] text-outline/70">Try searching for an artist, track title, or popular song.</p>
                    </div>
                  ) : null}
                </>
              ) : (
                /* Recommendations Mode */
                <>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium">
                    <span>Recommended for your playlist</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {NOCTURNE_TRACKS.filter((nt) => !tracks.some((t) => String(t.id) === String(nt.id)) && !justAddedIds.has(String(nt.id)))
                      .slice(0, 8)
                      .map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container/50 hover:bg-surface-container/80 border border-white/5 hover:border-primary/30 transition-all group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                              <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playTrack(track, [track]);
                                }}
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                                title="Preview track"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {currentTrack?.id === track.id && isPlaying ? "pause" : "play_arrow"}
                                </span>
                              </button>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                                {track.title}
                              </span>
                              <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant truncate">
                                <span className="truncate">{track.artist}</span>
                                {track.durationFormatted && (
                                  <>
                                    <span>•</span>
                                    <span className="flex-shrink-0">{track.durationFormatted}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddSongToPlaylist(track)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/30 text-xs font-bold transition-all ml-2 flex-shrink-0 cursor-pointer active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            <span>Add</span>
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
