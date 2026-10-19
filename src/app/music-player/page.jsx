"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMusic } from "../../context/MusicContext";
import SongOptionsMenu from "../../components/SongOptionsMenu";
import DownloadButton from "../../components/DownloadButton";
import LocalPlaylistCard from "../../components/LocalPlaylistCard";
import LocalPlaylistDetailView from "../../components/LocalPlaylistDetailView";
import LocalPlaylistModal from "../../components/LocalPlaylistModal";
import AddToLocalPlaylistModal from "../../components/AddToLocalPlaylistModal";
import LocalMusicInfoModal from "../../components/LocalMusicInfoModal";
import { formatPlaylistDuration } from "../../utils/playlistUtils";
import { searchMusicAutocomplete, rankSearchResults } from "../../services/audioService";
import {
  getAllLocalDeviceTracks,
  saveLocalDeviceTracks,
  deleteLocalDeviceTrack,
  clearAllLocalDeviceTracks,
  processImportedFiles,
  recordLocalRecentlyPlayed,
  getLocalRecentlyPlayedTracks,
  formatFileSize,
  getAllLocalPlaylists,
  saveLocalPlaylist,
  deleteLocalPlaylist,
  addTracksToLocalPlaylist,
  removeTrackFromLocalPlaylist,
  reorderLocalPlaylistTracks,
  scanDirectoryWithFSA,
} from "../../services/localMusicService";

export default function MusicPlayerPage() {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    addToQueue,
    toggleLike,
    isLiked,
  } = useMusic();

  // Local tracks & playlists state
  const [tracks, setTracks] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [localPlaylists, setLocalPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation & filtering state
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'playlists', 'recent', 'artists', 'albums', 'folders'
  const [activePlaylistId, setActivePlaylistId] = useState(null); // when viewing a local playlist detail
  const [selectedFilterValue, setSelectedFilterValue] = useState(null); // when clicking an artist/album/folder
  const [sortBy, setSortBy] = useState("addedAt"); // 'title', 'artist', 'album', 'addedAt', 'duration'

  // Multi-select state
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalogSongs, setCatalogSongs] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, fileName: "" });

  // Modals state
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [tracksToAddToPlaylist, setTracksToAddToPlaylist] = useState([]);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Helper to show temporary toasts
  const showToast = (msg, type = "success") => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load saved local tracks & playlists from IndexedDB
  const loadLibrary = async () => {
    try {
      const [storedTracks, storedPlaylists] = await Promise.all([
        getAllLocalDeviceTracks(),
        getAllLocalPlaylists(),
      ]);
      setTracks(storedTracks);
      setLocalPlaylists(storedPlaylists);

      const recents = await getLocalRecentlyPlayedTracks(storedTracks);
      setRecentTracks(recents);
    } catch (err) {
      console.warn("[MusicPlayer] Failed to load local library:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Fetch catalog songs whenever debounced query changes
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setCatalogSongs([]);
      setIsSearching(false);
      setSearchError(null);
      setSearchPage(1);
      setHasMoreCatalog(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);
    setSearchError(null);
    setSearchPage(1);

    searchMusicAutocomplete(q, 1)
      .then((data) => {
        if (isCancelled) return;
        const rawSongs = Array.isArray(data.songs) ? data.songs : [];
        const ranked = rankSearchResults(rawSongs, q, data.topMatch);
        setCatalogSongs(ranked);
        setHasMoreCatalog(rawSongs.length >= 15);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("[MusicPlayer Search] Catalog query error:", err);
        setSearchError("Failed to fetch songs from catalog. Please try again.");
      })
      .finally(() => {
        if (!isCancelled) setIsSearching(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery]);

  // Progressive loading / pagination for catalog search
  const handleLoadMore = async () => {
    const q = debouncedQuery.trim();
    if (!q || isLoadingMore || !hasMoreCatalog) return;

    setIsLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      const data = await searchMusicAutocomplete(q, nextPage);
      const newRaw = Array.isArray(data.songs) ? data.songs : [];
      if (newRaw.length === 0) {
        setHasMoreCatalog(false);
      } else {
        const combined = [...catalogSongs, ...newRaw];
        const ranked = rankSearchResults(combined, q, data.topMatch);
        setCatalogSongs(ranked);
        setSearchPage(nextPage);
        setHasMoreCatalog(newRaw.length >= 15);
      }
    } catch (err) {
      console.warn("[MusicPlayer Search] Load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Local tracks matching current search query
  const matchingLocalTracks = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    if (!q) return [];
    return tracks
      .filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q) ||
          t.fileName?.toLowerCase().includes(q)
      )
      .map((t) => ({ ...t, isLocal: true, source: "local-device" }));
  }, [tracks, debouncedQuery]);

  // Combined search results (local tracks at top if any, followed by ranked catalog songs)
  const combinedSearchResults = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];

    const localKeys = new Set(
      matchingLocalTracks.map(
        (t) => `${(t.title || "").toLowerCase().trim()}:::${(t.artist || "").toLowerCase().trim()}`
      )
    );

    const filteredCatalog = catalogSongs.filter((cat) => {
      const key = `${(cat.title || "").toLowerCase().trim()}:::${(cat.artist || "").toLowerCase().trim()}`;
      return !localKeys.has(key);
    });

    return [...matchingLocalTracks, ...filteredCatalog];
  }, [matchingLocalTracks, catalogSongs, debouncedQuery]);

  // Handle files import from file input or drag-and-drop
  const handleFileSelect = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    await processAndSaveFiles(rawFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // Process raw audio files with duplicate detection
  const processAndSaveFiles = async (rawFiles) => {
    const audioFiles = rawFiles.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(f.name)
    );

    if (audioFiles.length === 0) {
      showToast("No supported audio files detected in selection.", "error");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: audioFiles.length, fileName: audioFiles[0].name });

    try {
      const result = await processImportedFiles(
        audioFiles,
        tracks,
        (curr, tot, name) => {
          setImportProgress({ current: curr, total: tot, fileName: name });
        }
      );

      const processed = result.processed || [];
      if (processed.length > 0) {
        await saveLocalDeviceTracks(processed);
        await loadLibrary();
        const dupText = result.duplicateCount > 0 ? ` (${result.duplicateCount} duplicates skipped)` : "";
        showToast(`Successfully imported ${processed.length} new ${processed.length === 1 ? "song" : "songs"}${dupText}`);
      } else if (result.duplicateCount > 0) {
        showToast(`All ${result.duplicateCount} selected files are already in your library.`);
      }
    } catch (err) {
      console.error("[MusicPlayer] Import failed:", err);
      showToast("Failed to import some audio files. Please try again.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Folder Scan: File System Access API with fallback
  const handleScanFolder = async () => {
    // 1. Try modern File System Access API where supported
    if (typeof window !== "undefined" && window.showDirectoryPicker) {
      setIsImporting(true);
      setImportProgress({ current: 0, total: 0, fileName: "Selecting folder..." });

      const scanResult = await scanDirectoryWithFSA((curr, name) => {
        setImportProgress({ current: curr, total: curr, fileName: name });
      });

      if (scanResult.cancelled) {
        setIsImporting(false);
        return;
      }

      if (scanResult.supported && scanResult.files?.length > 0) {
        await processAndSaveFiles(scanResult.files);
        return;
      }
      setIsImporting(false);
    }

    // 2. Fallback to standard webkitdirectory file input
    if (folderInputRef.current) {
      folderInputRef.current.click();
    } else {
      setIsInfoModalOpen(true);
    }
  };

  // Handle single track deletion (local only)
  const handleDeleteTrack = async (trackId, e) => {
    e?.stopPropagation();
    if (
      !confirm(
        "Remove this song from your local library? (The actual file on your device remains untouched)"
      )
    ) {
      return;
    }
    await deleteLocalDeviceTrack(trackId);
    // Also remove from any local playlists that include it
    for (const pl of localPlaylists) {
      if (pl.trackIds?.includes(trackId)) {
        await removeTrackFromLocalPlaylist(pl.id, trackId);
      }
    }
    await loadLibrary();
    showToast("Song removed from library.");
  };

  // Handle clear library
  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear your local music player library? Your playlists and imported tracks will be cleared.")) {
      return;
    }
    await clearAllLocalDeviceTracks();
    await loadLibrary();
    showToast("Local music library cleared.");
  };

  // Play a song (works seamlessly for local tracks & online catalog tracks)
  const handlePlaySong = (track, listToQueue = tracks) => {
    const isLocal =
      track.isLocal ||
      String(track.id).startsWith("local-") ||
      track.source === "local-device";

    if (isLocal) {
      recordLocalRecentlyPlayed(track.id);
      getLocalRecentlyPlayedTracks(tracks).then((r) => setRecentTracks(r));
    }

    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      // Pass options: { context: "playlist", isSequentialPlaylist: true } for local tracks
      // so local playback queue remains strictly isolated within local files!
      playTrack(track, listToQueue || tracks, {
        context: isLocal ? "playlist" : undefined,
        isSequentialPlaylist: isLocal,
      });
    }
  };

  // Play all tracks in a list
  const handlePlayAll = (list) => {
    if (!list || list.length === 0) return;
    handlePlaySong(list[0], list);
  };

  // Shuffle play tracks
  const handleShufflePlay = (list) => {
    if (!list || list.length === 0) return;
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    handlePlaySong(shuffled[0], shuffled);
  };

  // Local Playlists Management
  const handleCreateOrUpdatePlaylist = async (playlistData) => {
    await saveLocalPlaylist(playlistData);
    await loadLibrary();
    setIsPlaylistModalOpen(false);
    setEditingPlaylist(null);
    showToast(`Playlist "${playlistData.name}" saved!`);
  };

  const handleDeletePlaylist = async (playlistId) => {
    await deleteLocalPlaylist(playlistId);
    if (activePlaylistId === playlistId) {
      setActivePlaylistId(null);
    }
    await loadLibrary();
    showToast("Playlist deleted. Underlying audio files were preserved.");
  };

  const handleAddToPlaylistAction = async (playlistId, trackIds) => {
    await addTracksToLocalPlaylist(playlistId, trackIds);
    await loadLibrary();
    setSelectedTrackIds(new Set());
    setIsSelectionMode(false);
  };

  const handleRemoveTrackFromPlaylist = async (playlistId, trackId) => {
    await removeTrackFromLocalPlaylist(playlistId, trackId);
    await loadLibrary();
    showToast("Song removed from playlist.");
  };

  const handleReorderPlaylistTracks = async (playlistId, newTrackIds) => {
    await reorderLocalPlaylistTracks(playlistId, newTrackIds);
    await loadLibrary();
  };

  // Multi-selection helpers
  const toggleSelectTrack = (trackId, e) => {
    e?.stopPropagation();
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const selectAllDisplayed = () => {
    const next = new Set(displayedTracks.map((t) => t.id));
    setSelectedTrackIds(next);
  };

  const clearSelection = () => {
    setSelectedTrackIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBatchAddToPlaylist = () => {
    const selectedObjs = tracks.filter((t) => selectedTrackIds.has(t.id));
    if (selectedObjs.length === 0) return;
    setTracksToAddToPlaylist(selectedObjs);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleBatchPlaySelected = () => {
    const selectedObjs = tracks.filter((t) => selectedTrackIds.has(t.id));
    if (selectedObjs.length === 0) return;
    handlePlayAll(selectedObjs);
  };

  // Single track add to playlist
  const openSingleTrackAddToPlaylist = (track, e) => {
    e?.stopPropagation();
    setTracksToAddToPlaylist([track]);
    setIsAddToPlaylistModalOpen(true);
  };

  // Total library duration & size (local tracks)
  const totalDuration = useMemo(() => formatPlaylistDuration(tracks), [tracks]);
  const totalSize = useMemo(() => {
    const bytes = tracks.reduce((acc, t) => acc + (t.fileSize || 0), 0);
    return formatFileSize(bytes);
  }, [tracks]);

  // Groupings: Artists, Albums, Folders (local tracks)
  const artistsMap = useMemo(() => {
    const map = new Map();
    tracks.forEach((t) => {
      const artist = t.artist || "Unknown Artist";
      if (!map.has(artist)) {
        map.set(artist, { name: artist, tracks: [], coverUrl: t.coverUrl });
      }
      map.get(artist).tracks.push(t);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  const albumsMap = useMemo(() => {
    const map = new Map();
    tracks.forEach((t) => {
      const album = t.album || "Unknown Album";
      if (!map.has(album)) {
        map.set(album, { title: album, artist: t.artist, tracks: [], coverUrl: t.coverUrl });
      }
      map.get(album).tracks.push(t);
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [tracks]);

  const foldersMap = useMemo(() => {
    const map = new Map();
    tracks.forEach((t) => {
      const folder = t.folder || "All Music";
      if (!map.has(folder)) {
        map.set(folder, { name: folder, tracks: [] });
      }
      map.get(folder).tracks.push(t);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  // Filter & Sort local tracks for non-search views
  const displayedTracks = useMemo(() => {
    let list = [...tracks];

    if (selectedFilterValue) {
      if (activeTab === "artists") {
        list = list.filter((t) => (t.artist || "Unknown Artist") === selectedFilterValue);
      } else if (activeTab === "albums") {
        list = list.filter((t) => (t.album || "Unknown Album") === selectedFilterValue);
      } else if (activeTab === "folders") {
        list = list.filter((t) => (t.folder || "All Music") === selectedFilterValue);
      }
    } else if (activeTab === "recent") {
      list = [...recentTracks];
    }

    list.sort((a, b) => {
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "artist") return (a.artist || "").localeCompare(b.artist || "");
      if (sortBy === "album") return (a.album || "").localeCompare(b.album || "");
      if (sortBy === "duration") return (b.duration || 0) - (a.duration || 0);
      return (b.addedAt || 0) - (a.addedAt || 0);
    });

    return list;
  }, [tracks, recentTracks, activeTab, selectedFilterValue, sortBy]);

  const activePlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return localPlaylists.find((p) => p.id === activePlaylistId) || null;
  }, [localPlaylists, activePlaylistId]);

  const isSearchingActive = Boolean(debouncedQuery.trim());

  return (
    <div className="w-full px-3 md:px-8 py-4 md:py-8 flex flex-col gap-6 select-none relative pb-24 md:pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[150] animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-semibold backdrop-blur-xl ${
              toastMessage.type === "error"
                ? "bg-red-950/90 border-red-500/40 text-red-200"
                : "bg-surface-container-highest/90 border-cyan-400/40 text-white shadow-[0_0_25px_rgba(76,215,246,0.25)]"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                toastMessage.type === "error" ? "text-red-400" : "text-primary"
              }`}
            >
              {toastMessage.type === "error" ? "error" : "check_circle"}
            </span>
            <span>{toastMessage.msg}</span>
          </div>
        </div>
      )}

      {/* Hidden File / Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">music_note</span>
              Music Player
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] md:text-[11px] text-outline">
              Offline Library &amp; Local Playlists
            </span>
          </div>

          {/* Offline / Storage Status Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Offline Ready • No Data Used</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Music Player</span>
              <span className="text-[9px] md:text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-mono font-bold tracking-widest uppercase">
                OFFLINE
              </span>
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-1">
              Your personal offline music library. Import songs from your device to build custom playlists and enjoy studio playback anywhere without internet.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_16px_rgba(76,215,246,0.35)] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Import Songs</span>
            </button>

            <button
              onClick={handleScanFolder}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer"
              title="Scan folder or select directory"
            >
              <span className="material-symbols-outlined text-[17px] text-primary">folder_open</span>
              <span>Scan Folder</span>
            </button>

            <button
              onClick={() => setIsInfoModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-outline hover:text-white transition-all text-xs cursor-pointer"
              title="Supported audio formats & PWA storage guide"
            >
              <span className="material-symbols-outlined text-[16px]">info</span>
            </button>

            {tracks.length > 0 && !isSearchingActive && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-outline hover:text-red-400 border border-white/5 transition-all text-xs cursor-pointer"
                title="Clear all imported songs"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Stats Bar (shown when not searching) */}
        {!isSearchingActive && tracks.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-white font-bold">{tracks.length}</span> songs
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-cyan-300 font-bold">{localPlaylists.length}</span> playlists
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-white font-bold">{artistsMap.length}</span> artists
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-white font-bold">{albumsMap.length}</span> albums
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-primary font-mono">{totalDuration}</span> playback
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-cyan-400 font-mono">{totalSize}</span>
            </div>
          </div>
        )}
      </div>

      {/* Importing Progress Overlay */}
      {isImporting && (
        <div className="p-4 rounded-2xl bg-surface-container-high/90 border border-primary/30 flex items-center gap-3 animate-pulse shadow-xl">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Importing local audio files...</span>
              <span className="font-mono text-primary font-bold">
                {importProgress.total > 0
                  ? `${importProgress.current} / ${importProgress.total}`
                  : `${importProgress.current} files`}
              </span>
            </div>
            <span className="text-[11px] text-outline truncate mt-0.5">
              {importProgress.fileName}
            </span>
          </div>
        </div>
      )}

      {/* Navigation Tabs & Search Controls */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "all", label: "All Songs", icon: "queue_music", count: tracks.length },
            { id: "playlists", label: "Playlists", icon: "playlist_play", count: localPlaylists.length },
            { id: "recent", label: "Recently Played", icon: "history", count: recentTracks.length },
            { id: "artists", label: "Artists", icon: "person", count: artistsMap.length },
            { id: "albums", label: "Albums", icon: "album", count: albumsMap.length },
            { id: "folders", label: "Folders", icon: "folder", count: foldersMap.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id && !isSearchingActive && !activePlaylistId;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setActivePlaylistId(null);
                  setSelectedFilterValue(null);
                  if (searchQuery) {
                    setSearchQuery("");
                    setDebouncedQuery("");
                  }
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)] scale-105"
                    : "bg-surface-container/70 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-white/5"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-surface-container-lowest/20 text-surface-container-lowest"
                        : "bg-white/10 text-outline"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Universal Search Box */}
          <div className="relative flex-1 sm:w-60 md:w-80">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
              {isSearching ? "sync" : "search"}
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local songs, artists, albums..."
              className={`w-full bg-surface-container-high/60 border rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder-outline focus:outline-none transition-all ${
                isSearchingActive ? "border-primary/50 ring-1 ring-primary/20" : "border-white/10"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-white cursor-pointer"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Sort dropdown (for local library views) */}
          {!isSearchingActive && !activePlaylistId && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-surface-container-high/60 border border-white/10 text-on-surface-variant text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary/50 cursor-pointer"
            >
              <option value="addedAt">Recently Added</option>
              <option value="title">Title (A-Z)</option>
              <option value="artist">Artist (A-Z)</option>
              <option value="album">Album (A-Z)</option>
              <option value="duration">Duration</option>
            </select>
          )}
        </div>
      </div>

      {/* Floating Multi-Select Action Bar */}
      {selectedTrackIds.size > 0 && !activePlaylistId && (
        <div className="sticky top-4 z-30 flex items-center justify-between gap-3 p-3 px-4 rounded-2xl bg-[#181818] backdrop-blur-xl border border-primary/40 shadow-[0_10px_30px_rgba(0,0,0,0.8)] animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono font-bold text-xs">
              {selectedTrackIds.size}
            </span>
            <span className="text-xs font-semibold text-white">
              {selectedTrackIds.size === 1 ? "song" : "songs"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchPlaySelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              <span>Play Selected</span>
            </button>

            <button
              onClick={handleBatchAddToPlaylist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">playlist_add</span>
              <span>Add to Playlist</span>
            </button>

            <button
              onClick={clearSelection}
              className="p-1.5 rounded-lg text-outline hover:text-white cursor-pointer transition-colors"
              title="Clear selection"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Breadcrumb if filtering by specific Artist/Album/Folder (local) */}
      {!isSearchingActive && selectedFilterValue && !activePlaylistId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-high/40 border border-white/5 text-xs">
          <span className="text-outline uppercase tracking-wider font-mono text-[10px]">Filtering:</span>
          <span className="font-bold text-white">{selectedFilterValue}</span>
          <button
            onClick={() => setSelectedFilterValue(null)}
            className="ml-auto text-primary hover:underline font-semibold text-[11px] cursor-pointer"
          >
            Show All
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      {isSearchingActive ? (
        /* SEARCH RESULTS VIEW (Online Catalog & Local Search) */
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-primary text-[20px]">manage_search</span>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    Search Results for &ldquo;{debouncedQuery}&rdquo;
                  </h2>
                  <span className="text-[11px] font-mono text-outline shrink-0">
                    ({combinedSearchResults.length} {combinedSearchResults.length === 1 ? "song" : "songs"})
                  </span>
                </div>
                <span className="text-[10px] text-outline hidden sm:inline">
                  Intelligently searching local files first, followed by online music catalog
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {combinedSearchResults.length > 0 && (
                <>
                  <button
                    onClick={() => handlePlaySong(combinedSearchResults[0], combinedSearchResults)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.3)] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                    <span>Play All</span>
                  </button>
                  <button
                    onClick={() => {
                      const shuffled = [...combinedSearchResults].sort(() => Math.random() - 0.5);
                      handlePlaySong(shuffled[0], shuffled);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white text-xs font-semibold transition-all cursor-pointer hidden sm:flex"
                  >
                    <span className="material-symbols-outlined text-[15px] text-primary">shuffle</span>
                    <span>Shuffle</span>
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                }}
                className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-outline hover:text-white text-xs transition-all cursor-pointer flex items-center gap-1"
                title="Clear search query"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Loading Skeleton */}
          {isSearching && combinedSearchResults.length === 0 && (
            <div className="flex flex-col gap-2 rounded-2xl glass-card border border-white/5 p-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-2.5 animate-pulse">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-5 h-4 bg-white/5 rounded" />
                    <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="w-36 sm:w-56 h-3.5 bg-white/10 rounded" />
                      <div className="w-24 sm:w-40 h-2.5 bg-white/5 rounded" />
                    </div>
                  </div>
                  <div className="w-12 h-3 bg-white/5 rounded hidden sm:block" />
                </div>
              ))}
            </div>
          )}

          {/* Error Banner */}
          {searchError && (
            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-200">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-400 text-[18px]">error</span>
                <span>{searchError}</span>
              </div>
              <button
                onClick={() => {
                  const q = debouncedQuery.trim();
                  if (q) {
                    setIsSearching(true);
                    setSearchError(null);
                    searchMusicAutocomplete(q, 1)
                      .then((data) => {
                        const raw = Array.isArray(data.songs) ? data.songs : [];
                        setCatalogSongs(rankSearchResults(raw, q, data.topMatch));
                      })
                      .catch(() => setSearchError("Failed to fetch songs. Please try again."))
                      .finally(() => setIsSearching(false));
                  }
                }}
                className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty Search Results State */}
          {!isSearching && !searchError && combinedSearchResults.length === 0 && (
            <div className="w-full py-16 px-4 rounded-3xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-primary shadow-[0_0_24px_rgba(76,215,246,0.2)]">
                <span className="material-symbols-outlined text-[32px]">search_off</span>
              </div>
              <div className="flex flex-col gap-1 max-w-md">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  No songs found for &ldquo;{debouncedQuery}&rdquo;
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Check for typos or search for songs by artist, album, or file name.
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                }}
                className="px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white text-xs font-semibold cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          )}

          {/* Song Results List */}
          {combinedSearchResults.length > 0 && (
            <div className="flex flex-col divide-y divide-white/5 rounded-2xl glass-card border border-white/5 overflow-hidden">
              {combinedSearchResults.map((track, idx) => {
                const isTrackPlaying = isPlaying && String(currentTrack?.id) === String(track.id);
                const isCurrent = String(currentTrack?.id) === String(track.id);
                const liked = isLiked(track.id);

                return (
                  <div
                    key={`${track.id}-${idx}`}
                    onClick={() => handlePlaySong(track, combinedSearchResults)}
                    className={`group flex items-center justify-between gap-3 p-2.5 sm:p-3 hover:bg-surface-container/70 transition-colors cursor-pointer select-none ${
                      isCurrent ? "bg-primary/10 border-l-2 border-primary" : ""
                    }`}
                  >
                    {/* Left: Index / Play Icon / Artwork */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-outline w-6 text-center shrink-0">
                        {isTrackPlaying ? (
                          <span className="material-symbols-outlined text-[16px] text-primary animate-pulse">
                            graphic_eq
                          </span>
                        ) : (
                          idx + 1
                        )}
                      </span>

                      <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden bg-surface-container-highest shrink-0 shadow">
                        <img
                          src={
                            track.coverUrl ||
                            track.thumbnail ||
                            track.image ||
                            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"
                          }
                          alt={track.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div
                          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <span className="material-symbols-outlined text-white text-[20px]">
                            {isTrackPlaying ? "pause" : "play_arrow"}
                          </span>
                        </div>
                      </div>

                      {/* Title & Artist & Badges */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-xs sm:text-sm font-semibold truncate ${
                              isCurrent
                                ? "text-primary font-bold"
                                : "text-white group-hover:text-primary transition-colors"
                            }`}
                          >
                            {track.title}
                          </span>
                          {track.isLocal ? (
                            <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 uppercase shrink-0 font-bold">
                              LOCAL
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 uppercase shrink-0">
                              Lossless
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] sm:text-[11px] text-outline truncate mt-0.5">
                          {track.artist || "Unknown Artist"}
                          {track.album ? ` • ${track.album}` : ""}
                        </span>
                      </div>
                    </div>

                    {/* Right: Duration & Actions */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-outline hidden sm:inline">
                        {track.durationFormatted ||
                          (track.duration
                            ? `${Math.floor(track.duration / 60)}:${String(
                                Math.floor(track.duration % 60)
                              ).padStart(2, "0")}`
                            : "")}
                      </span>

                      {/* Like / Heart Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className={`p-1 rounded-md transition-all cursor-pointer ${
                          liked
                            ? "text-primary opacity-100 scale-110"
                            : "opacity-0 group-hover:opacity-100 text-outline hover:text-white"
                        }`}
                        title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {liked ? "favorite" : "favorite_border"}
                        </span>
                      </button>

                      {/* Add to Playlist Action */}
                      <button
                        type="button"
                        onClick={(e) => openSingleTrackAddToPlaylist(track, e)}
                        className="opacity-0 group-hover:opacity-100 text-outline hover:text-primary p-1 rounded-md transition-all cursor-pointer"
                        title="Add to local playlist"
                      >
                        <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                      </button>

                      {/* Download Button (for catalog songs) */}
                      {!track.isLocal && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <DownloadButton
                            track={track}
                            buttonSize="p-1"
                            iconSize="text-[18px]"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                      )}

                      {/* Delete Button (for local songs only) */}
                      {track.isLocal && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTrack(track.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-outline hover:text-red-400 p-1 rounded-md transition-all cursor-pointer"
                          title="Remove from local library"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}

                      {/* Song Options Menu */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <SongOptionsMenu track={track} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progressive Loading / Load More Songs */}
          {hasMoreCatalog && (
            <div className="flex justify-center pt-3 pb-2">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs hover:border-primary/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span>Loading more songs...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      expand_more
                    </span>
                    <span>Load More Songs</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : activePlaylist ? (
        /* LOCAL PLAYLIST DETAIL VIEW */
        <LocalPlaylistDetailView
          playlist={activePlaylist}
          allTracks={tracks}
          onBack={() => setActivePlaylistId(null)}
          onPlaySong={(track, list) => handlePlaySong(track, list)}
          onPlayAll={(list) => handlePlayAll(list)}
          onShufflePlay={(list) => handleShufflePlay(list)}
          onEditPlaylist={(pl) => {
            setEditingPlaylist(pl);
            setIsPlaylistModalOpen(true);
          }}
          onDeletePlaylist={(id) => handleDeletePlaylist(id)}
          onRemoveTrackFromPlaylist={(plId, tId) => handleRemoveTrackFromPlaylist(plId, tId)}
          onReorderTracks={(plId, newIds) => handleReorderPlaylistTracks(plId, newIds)}
          onOpenAddSongs={() => {
            // Find tracks not yet in this playlist
            const existingIds = new Set(activePlaylist.trackIds || []);
            const availableTracks = tracks.filter((t) => !existingIds.has(t.id));
            if (availableTracks.length === 0) {
              showToast("All songs in your library are already in this playlist.");
              return;
            }
            setTracksToAddToPlaylist(availableTracks);
            setIsAddToPlaylistModalOpen(true);
          }}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
        />
      ) : (
        /* STANDARD LOCAL LIBRARY VIEWS (when not searching and not in playlist detail) */
        <>
          {tracks.length === 0 ? (
            /* Beautiful Empty State matching requirements */
            <div className="w-full py-16 px-4 rounded-3xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-5 my-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 via-surface-container-high to-surface-container border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_30px_rgba(76,215,246,0.25)]">
                  <span className="material-symbols-outlined text-[40px]">library_music</span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">offline_bolt</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-w-md">
                <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
                  Your music, your way
                </h2>
                <p className="text-xs md:text-sm text-on-surface-variant leading-relaxed">
                  Import songs from your device to build your personal offline library. Stored safely in your browser database for zero-data playback anytime.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2 flex-wrap justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(76,215,246,0.4)] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  <span>Import Audio Files</span>
                </button>

                <button
                  onClick={() => setIsInfoModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">help_outline</span>
                  <span>Browse Supported Files</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-outline pt-2">
                <span className="material-symbols-outlined text-[15px] text-emerald-400">verified_user</span>
                <span>MP3, M4A, FLAC, WAV, AAC, OGG • 100% Offline • No data uploads</span>
              </div>
            </div>
          ) : activeTab === "playlists" ? (
            /* Playlists Tab View */
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Your Local Playlists</h2>
                  <p className="text-xs text-outline">Custom playlists stored on this device</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingPlaylist(null);
                    setIsPlaylistModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.35)] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>New Playlist</span>
                </button>
              </div>

              {localPlaylists.length === 0 ? (
                <div className="py-16 text-center text-outline text-xs flex flex-col items-center justify-center gap-3 glass-card rounded-2xl border border-white/5 p-6">
                  <span className="material-symbols-outlined text-[36px] text-primary/60">playlist_add</span>
                  <div className="flex flex-col gap-1 max-w-sm">
                    <span className="font-bold text-white text-sm">No Local Playlists Yet</span>
                    <span>Create a playlist to group your imported songs by mood, workout, or favorites.</span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingPlaylist(null);
                      setIsPlaylistModalOpen(true);
                    }}
                    className="mt-2 px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs cursor-pointer"
                  >
                    + Create First Playlist
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {/* Create New Playlist Card */}
                  <div
                    onClick={() => {
                      setEditingPlaylist(null);
                      setIsPlaylistModalOpen(true);
                    }}
                    className="group flex flex-col items-center justify-center text-center gap-2 p-4 rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-surface-container/60 transition-all duration-300 cursor-pointer aspect-square"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">add</span>
                    </div>
                    <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                      New Playlist
                    </span>
                  </div>

                  {localPlaylists.map((pl) => {
                    const plTracks = (pl.trackIds || [])
                      .map((id) => tracks.find((t) => t.id === id))
                      .filter(Boolean);

                    return (
                      <LocalPlaylistCard
                        key={pl.id}
                        playlist={pl}
                        tracks={plTracks}
                        onClick={() => setActivePlaylistId(pl.id)}
                        onPlay={(playlist, trackList) => handlePlayAll(trackList)}
                        onEdit={(playlist) => {
                          setEditingPlaylist(playlist);
                          setIsPlaylistModalOpen(true);
                        }}
                        onDelete={(playlist) => handleDeletePlaylist(playlist.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === "artists" && !selectedFilterValue ? (
            /* Artists View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {artistsMap.map((artist) => (
                <div
                  key={artist.name}
                  onClick={() => setSelectedFilterValue(artist.name)}
                  className="group flex flex-col items-center text-center gap-2.5 p-3 sm:p-4 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1"
                >
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-surface-container-highest shadow-md ring-2 ring-white/10 group-hover:ring-primary transition-all">
                    <img
                      src={artist.coverUrl}
                      alt={artist.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex flex-col items-center w-full min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-white truncate w-full group-hover:text-primary transition-colors">
                      {artist.name}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-outline">
                      {artist.tracks.length} {artist.tracks.length === 1 ? "track" : "tracks"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === "albums" && !selectedFilterValue ? (
            /* Albums View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {albumsMap.map((album) => (
                <div
                  key={album.title}
                  onClick={() => setSelectedFilterValue(album.title)}
                  className="group flex flex-col gap-2 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1"
                >
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
                    <img
                      src={album.coverUrl}
                      alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                      {album.title}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-outline truncate">
                      {album.artist || "Unknown Artist"} • {album.tracks.length} tracks
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === "folders" && !selectedFilterValue ? (
            /* Folders View */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {foldersMap.map((folder) => (
                <div
                  key={folder.name}
                  onClick={() => setSelectedFilterValue(folder.name)}
                  className="group flex items-center justify-between p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">folder</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-outline">
                        {folder.tracks.length} {folder.tracks.length === 1 ? "track" : "tracks"}
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline group-hover:translate-x-1 transition-transform text-[18px]">
                    chevron_right
                  </span>
                </div>
              ))}
            </div>
          ) : (
            /* Local Songs Table View (All Songs, Recent, or Filtered) */
            <div className="flex flex-col gap-6">
              {/* Quick Carousels for 'All Songs' main view */}
              {activeTab === "all" && !selectedFilterValue && (
                <>
                  {/* Recently Played Quick Carousel (if any) */}
                  {recentTracks.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[18px]">history</span>
                          <h3 className="text-xs sm:text-sm font-bold text-white">Recently Played</h3>
                        </div>
                        <button
                          onClick={() => setActiveTab("recent")}
                          className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                        >
                          View All ({recentTracks.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                        {recentTracks.slice(0, 10).map((track) => (
                          <div
                            key={`rec-${track.id}`}
                            onClick={() => handlePlaySong(track, recentTracks)}
                            className="group flex items-center gap-2.5 p-2 rounded-xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/70 transition-all cursor-pointer shrink-0 w-52 sm:w-60"
                          >
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-container-highest">
                              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-white text-[18px]">play_arrow</span>
                              </div>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                                {track.title}
                              </span>
                              <span className="text-[10px] text-outline truncate">{track.artist}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Your Playlists Quick Carousel (if any) */}
                  {localPlaylists.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-cyan-300 text-[18px]">playlist_play</span>
                          <h3 className="text-xs sm:text-sm font-bold text-white">Your Playlists</h3>
                        </div>
                        <button
                          onClick={() => setActiveTab("playlists")}
                          className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                        >
                          View All ({localPlaylists.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                        {localPlaylists.map((pl) => {
                          const plTracks = (pl.trackIds || [])
                            .map((id) => tracks.find((t) => t.id === id))
                            .filter(Boolean);
                          const cover =
                            pl.coverUrl ||
                            plTracks[0]?.coverUrl ||
                            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";

                          return (
                            <div
                              key={`pl-quick-${pl.id}`}
                              onClick={() => setActivePlaylistId(pl.id)}
                              className="group flex items-center gap-3 p-2.5 rounded-xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/70 transition-all cursor-pointer shrink-0 w-48 sm:w-56"
                            >
                              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-container-highest shadow">
                                <img src={cover} alt={pl.name} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                                  {pl.name}
                                </span>
                                <span className="text-[10px] text-outline">
                                  {plTracks.length} {plTracks.length === 1 ? "song" : "songs"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Songs List Controls & Actions */}
              <div className="flex flex-col gap-2">
                {displayedTracks.length > 0 && (
                  <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePlaySong(displayedTracks[0], displayedTracks)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.3)] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                        <span>Play All</span>
                      </button>
                      <button
                        onClick={() => handleShufflePlay(displayedTracks)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white text-xs font-semibold transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          shuffle
                        </span>
                        <span className="hidden sm:inline">Shuffle</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsSelectionMode(!isSelectionMode);
                          if (isSelectionMode) clearSelection();
                        }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                          isSelectionMode
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-surface-container-high/60 border-white/10 text-outline hover:text-white"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {isSelectionMode ? "check_box" : "check_box_outline_blank"}
                        </span>
                        <span className="hidden sm:inline">
                          {isSelectionMode ? "Select Mode" : "Select"}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSelectionMode && (
                        <button
                          onClick={selectAllDisplayed}
                          className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                      )}
                      <span className="text-[11px] text-outline font-mono">
                        {displayedTracks.length} {displayedTracks.length === 1 ? "song" : "songs"}
                      </span>
                    </div>
                  </div>
                )}

                {displayedTracks.length === 0 ? (
                  <div className="py-12 text-center text-outline text-xs">
                    No local tracks found in this category.
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-white/5 rounded-2xl glass-card border border-white/5 overflow-hidden">
                    {displayedTracks.map((track, idx) => {
                      const isTrackPlaying = isPlaying && String(currentTrack?.id) === String(track.id);
                      const isCurrent = String(currentTrack?.id) === String(track.id);
                      const isSelected = selectedTrackIds.has(track.id);

                      return (
                        <div
                          key={track.sourceEntryId ? `${track.id}__${track.sourceEntryId}` : `${track.id || "track"}__pos_${idx}`}
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelectTrack(track.id);
                            } else {
                              handlePlaySong(track, displayedTracks);
                            }
                          }}
                          className={`group flex items-center justify-between gap-3 p-2.5 sm:p-3 hover:bg-surface-container/70 transition-colors cursor-pointer select-none ${
                            isCurrent ? "bg-primary/10 border-l-2 border-primary" : ""
                          } ${isSelected ? "bg-primary/15" : ""}`}
                        >
                          {/* Left: Selection Checkbox / Index & Artwork */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {isSelectionMode ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => toggleSelectTrack(track.id, e)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                              />
                            ) : (
                              <span className="text-xs font-mono text-outline w-6 text-center shrink-0">
                                {isTrackPlaying ? (
                                  <span className="material-symbols-outlined text-[16px] text-primary animate-pulse">
                                    graphic_eq
                                  </span>
                                ) : (
                                  idx + 1
                                )}
                              </span>
                            )}

                            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden bg-surface-container-highest shrink-0 shadow">
                              <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                              <div
                                className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                                  isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                <span className="material-symbols-outlined text-white text-[20px]">
                                  {isTrackPlaying ? "pause" : "play_arrow"}
                                </span>
                              </div>
                            </div>

                            {/* Title & Artist & Badges */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-xs sm:text-sm font-semibold truncate ${
                                    isCurrent
                                      ? "text-primary font-bold"
                                      : "text-white group-hover:text-primary transition-colors"
                                  }`}
                                >
                                  {track.title}
                                </span>
                                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 uppercase shrink-0 font-bold">
                                  LOCAL
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-[11px] text-outline truncate mt-0.5">
                                {track.artist} • {track.album}
                              </span>
                            </div>
                          </div>

                          {/* Right: Duration & Actions */}
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className="text-[11px] font-mono text-outline hidden sm:inline">
                              {track.durationFormatted}
                            </span>

                            {/* Add to Local Playlist button */}
                            <button
                              type="button"
                              onClick={(e) => openSingleTrackAddToPlaylist(track, e)}
                              className="opacity-0 group-hover:opacity-100 text-outline hover:text-primary p-1 rounded-md transition-all cursor-pointer"
                              title="Add to local playlist"
                            >
                              <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                            </button>

                            {/* Delete from Library */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteTrack(track.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-outline hover:text-red-400 p-1 rounded-md transition-all cursor-pointer"
                              title="Remove from local library"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>

                            {/* Song Options Menu */}
                            <div onClick={(e) => e.stopPropagation()}>
                              <SongOptionsMenu track={track} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODALS */}
      {/* 1. Create / Edit Local Playlist Modal */}
      <LocalPlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => {
          setIsPlaylistModalOpen(false);
          setEditingPlaylist(null);
        }}
        onSave={handleCreateOrUpdatePlaylist}
        playlist={editingPlaylist}
        existingPlaylists={localPlaylists}
      />

      {/* 2. Add Tracks to Local Playlist Modal */}
      <AddToLocalPlaylistModal
        isOpen={isAddToPlaylistModalOpen}
        onClose={() => {
          setIsAddToPlaylistModalOpen(false);
          setTracksToAddToPlaylist([]);
        }}
        tracksToAdd={tracksToAddToPlaylist}
        playlists={localPlaylists}
        onAddToPlaylist={handleAddToPlaylistAction}
        onCreateNewPlaylist={() => {
          setIsAddToPlaylistModalOpen(false);
          setEditingPlaylist(null);
          setIsPlaylistModalOpen(true);
        }}
      />

      {/* 3. Supported Audio Formats & PWA Storage Info Modal */}
      <LocalMusicInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        onTriggerImport={() => fileInputRef.current?.click()}
      />
    </div>
  );
}
