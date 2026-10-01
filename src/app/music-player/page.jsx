"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMusic } from "../../context/MusicContext";
import SongOptionsMenu from "../../components/SongOptionsMenu";
import { formatPlaylistDuration } from "../../utils/playlistUtils";
import {
  getAllLocalDeviceTracks,
  saveLocalDeviceTracks,
  deleteLocalDeviceTrack,
  clearAllLocalDeviceTracks,
  processImportedFiles,
  recordLocalRecentlyPlayed,
  getLocalRecentlyPlayedTracks,
  formatFileSize,
} from "../../services/localMusicService";

export default function MusicPlayerPage() {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useMusic();

  const [tracks, setTracks] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'recent', 'artists', 'albums', 'folders'
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("addedAt"); // 'title', 'artist', 'album', 'addedAt', 'duration'
  const [selectedFilterValue, setSelectedFilterValue] = useState(null); // when clicking an artist/album/folder
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, fileName: "" });

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Load saved local tracks from IndexedDB
  const loadTracks = async () => {
    try {
      const stored = await getAllLocalDeviceTracks();
      setTracks(stored);
      const recents = await getLocalRecentlyPlayedTracks(stored);
      setRecentTracks(recents);
    } catch (err) {
      console.warn("[MusicPlayer] Failed to load local tracks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTracks();
  }, []);

  // Handle file import
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("audio/") ||
      /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(f.name)
    );

    if (files.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: files.length, fileName: files[0].name });

    try {
      const processed = await processImportedFiles(files, (curr, tot, name) => {
        setImportProgress({ current: curr, total: tot, fileName: name });
      });

      await saveLocalDeviceTracks(processed);
      await loadTracks();
    } catch (err) {
      console.error("[MusicPlayer] Import failed:", err);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  // Handle single track deletion
  const handleDeleteTrack = async (trackId, e) => {
    e?.stopPropagation();
    if (!confirm("Remove this song from your local library? (The actual file on your disk remains untouched)")) {
      return;
    }
    await deleteLocalDeviceTrack(trackId);
    await loadTracks();
  };

  // Handle clear library
  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear your local music player library?")) {
      return;
    }
    await clearAllLocalDeviceTracks();
    await loadTracks();
  };

  // Play a specific local track
  const handlePlaySong = (track, listToQueue) => {
    recordLocalRecentlyPlayed(track.id);
    // Refresh recents
    getLocalRecentlyPlayedTracks(tracks).then((r) => setRecentTracks(r));

    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, listToQueue || tracks);
    }
  };

  // Total library duration & size
  const totalDuration = useMemo(() => formatPlaylistDuration(tracks), [tracks]);
  const totalSize = useMemo(() => {
    const bytes = tracks.reduce((acc, t) => acc + (t.fileSize || 0), 0);
    return formatFileSize(bytes);
  }, [tracks]);

  // Groupings: Artists, Albums, Folders
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

  // Filter & Sort tracks
  const displayedTracks = useMemo(() => {
    let list = [...tracks];

    // Filter by selected sub-category if active
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

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q) ||
          t.fileName?.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "artist") return (a.artist || "").localeCompare(b.artist || "");
      if (sortBy === "album") return (a.album || "").localeCompare(b.album || "");
      if (sortBy === "duration") return (b.duration || 0) - (a.duration || 0);
      return (b.addedAt || 0) - (a.addedAt || 0); // addedAt default
    });

    return list;
  }, [tracks, recentTracks, activeTab, selectedFilterValue, searchQuery, sortBy]);

  return (
    <div className="w-full px-3 md:px-8 py-4 md:py-8 flex flex-col gap-6 md:gap-8 select-none">
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">music_note</span>
            Music Player
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] md:text-[11px] text-outline">
            Local Device Library • 100% Offline
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Local Music Player</span>
              <span className="text-[9px] md:text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-mono font-bold tracking-widest uppercase">
                DEVICE
              </span>
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-1">
              Play and organize songs stored directly on your computer or phone. High-resolution master audio, no cloud uploads, completely private.
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
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer"
              title="Import an entire folder of music"
            >
              <span className="material-symbols-outlined text-[17px] text-primary">folder_open</span>
              <span className="hidden sm:inline">Scan Folder</span>
            </button>

            {tracks.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-outline hover:text-red-400 border border-white/5 transition-all text-xs cursor-pointer"
                title="Clear all imported songs"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Stats Bar */}
        {tracks.length > 0 && (
          <div className="flex items-center gap-2.5 sm:gap-4 overflow-x-auto no-scrollbar pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high/60 border border-white/5 text-[11px] text-outline">
              <span className="text-white font-bold">{tracks.length}</span> songs
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
        <div className="p-4 rounded-2xl bg-surface-container-high/80 border border-primary/30 flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Importing local audio files...</span>
              <span className="font-mono text-primary font-bold">
                {importProgress.current} / {importProgress.total}
              </span>
            </div>
            <span className="text-[11px] text-outline truncate mt-0.5">
              {importProgress.fileName}
            </span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "all", label: "All Songs", icon: "queue_music", count: tracks.length },
            { id: "recent", label: "Recently Played", icon: "history", count: recentTracks.length },
            { id: "artists", label: "Artists", icon: "person", count: artistsMap.length },
            { id: "albums", label: "Albums", icon: "album", count: albumsMap.length },
            { id: "folders", label: "Folders", icon: "folder", count: foldersMap.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedFilterValue(null);
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
                      isActive ? "bg-surface-container-lowest/20 text-surface-container-lowest" : "bg-white/10 text-outline"
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
          {/* Search box */}
          <div className="relative flex-1 sm:w-48 md:w-60">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local music..."
              className="w-full bg-surface-container-high/60 border border-white/10 focus:border-primary/50 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-outline focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-white"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Sort dropdown */}
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
        </div>
      </div>

      {/* Breadcrumb if filtering by specific Artist/Album/Folder */}
      {selectedFilterValue && (
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

      {/* Main Content Areas */}
      {tracks.length === 0 ? (
        /* Empty State */
        <div className="w-full py-16 px-4 rounded-3xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-primary shadow-[0_0_24px_rgba(76,215,246,0.2)]">
            <span className="material-symbols-outlined text-[32px]">library_music</span>
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h2 className="text-lg md:text-xl font-bold text-white">Your Local Library is Empty</h2>
            <p className="text-xs md:text-sm text-on-surface-variant">
              Import audio tracks from your device to listen with full Ceepeefy studio fidelity. Supports MP3, M4A, AAC, WAV, FLAC, and OGG files.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(76,215,246,0.4)] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Select Audio Files</span>
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">folder</span>
              <span>Scan Folder</span>
            </button>
          </div>
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
        /* Songs List (All Songs, Recent, or Filtered Songs) */
        <div className="flex flex-col gap-2">
          {/* Quick controls: Play All & Shuffle */}
          {displayedTracks.length > 0 && (
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlaySong(displayedTracks[0], displayedTracks)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.3)] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  <span>Play All</span>
                </button>
                <button
                  onClick={() => {
                    const shuffled = [...displayedTracks].sort(() => Math.random() - 0.5);
                    handlePlaySong(shuffled[0], shuffled);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">shuffle</span>
                  <span className="hidden sm:inline">Shuffle</span>
                </button>
              </div>
              <span className="text-[11px] text-outline font-mono">
                {displayedTracks.length} {displayedTracks.length === 1 ? "song" : "songs"}
              </span>
            </div>
          )}

          {displayedTracks.length === 0 ? (
            <div className="py-12 text-center text-outline text-xs">
              No matching tracks found. Try a different search query.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/5 rounded-2xl glass-card border border-white/5 overflow-hidden">
              {displayedTracks.map((track, idx) => {
                const isTrackPlaying = isPlaying && String(currentTrack?.id) === String(track.id);
                const isCurrent = String(currentTrack?.id) === String(track.id);

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlaySong(track, displayedTracks)}
                    className={`group flex items-center justify-between gap-3 p-2.5 sm:p-3 hover:bg-surface-container/70 transition-colors cursor-pointer select-none ${
                      isCurrent ? "bg-primary/10 border-l-2 border-primary" : ""
                    }`}
                  >
                    {/* Left: Index & Play state & Artwork */}
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

                      {/* Title & Artist */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs sm:text-sm font-semibold truncate ${
                              isCurrent ? "text-primary font-bold" : "text-white group-hover:text-primary transition-colors"
                            }`}
                          >
                            {track.title}
                          </span>
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 uppercase shrink-0">
                            LOCAL
                          </span>
                        </div>
                        <span className="text-[10px] sm:text-[11px] text-outline truncate mt-0.5">
                          {track.artist} • {track.album}
                        </span>
                      </div>
                    </div>

                    {/* Right: Duration & Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-outline hidden sm:inline">
                        {track.durationFormatted}
                      </span>

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
      )}
    </div>
  );
}
