"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import {
  formatPlaylistDuration,
  formatPlaylistTracksAndDurationUppercase,
  processLocalImage,
  PLAYLIST_CATEGORIES,
  getPlaylistCategory,
} from "../../utils/playlistUtils";
import PlaylistCover from "../../components/PlaylistCover";
import SpotifyImportModal from "../../components/SpotifyImportModal";
import { uploadPlaylistCoverToCloud, isSupabaseConfigured } from "../../services/supabaseClient";

export default function PlaylistsPage() {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    customPlaylists,
    addedPlaylists,
    createPlaylist,
    deletePlaylist,
    deleteCustomPlaylist,
    removeAddedPlaylist,
    updatePlaylistCover,
    isPlaylistPinned,
    togglePinPlaylist,
    renamePlaylist,
    updatePlaylistCategory,
    bumpPlaylistToTop,
    refreshCloudPlaylists,
    updateSpotifyPlaylist,
    syncingPlaylistIds,
  } = useMusic();

  // Authoritatively load fresh playlists from Supabase cloud whenever the playlist page is opened
  React.useEffect(() => {
    refreshCloudPlaylists?.();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved =
          sessionStorage.getItem("ceepeefy_playlist_active_category") ||
          localStorage.getItem("ceepeefy_playlist_active_category");
        if (saved && (saved === "All" || PLAYLIST_CATEGORIES.includes(saved))) {
          return saved;
        }
      } catch {}
    }
    return "All";
  });

  const handleSelectCategory = (cat) => {
    setActiveCategory(cat);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("ceepeefy_playlist_active_category", cat);
        localStorage.setItem("ceepeefy_playlist_active_category", cat);
      } catch {}
    }
  };

  const [syncNotice, setSyncNotice] = useState(null);

  // Auto-dismiss sync notice toast after 4.5 seconds
  React.useEffect(() => {
    if (syncNotice) {
      const timer = setTimeout(() => {
        setSyncNotice(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [syncNotice]);

  const handleUpdateSpotifyPlaylist = async (playlist, e) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (!playlist?.id || syncingPlaylistIds?.has(playlist.id)) return;
    setSyncNotice(null);

    try {
      const result = await updateSpotifyPlaylist(playlist.id);
      if (result.success) {
        setSyncNotice({
          type: result.count > 0 ? "success" : "info",
          message:
            result.message ||
            (result.count > 0
              ? `Added ${result.count} new tracks to "${playlist.title}"!`
              : "Playlist is already up to date."),
        });
      } else {
        setSyncNotice({
          type: "error",
          message: result.message || "Failed to update playlist from Spotify.",
        });
      }
    } catch (err) {
      console.error("Failed to update Spotify playlist:", err);
      setSyncNotice({
        type: "error",
        message: err.message || "Network error occurred while syncing with Spotify.",
      });
    }
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [selectedCreateCategory, setSelectedCreateCategory] = useState("Mixed");
  const [isCreateMoveToOpen, setIsCreateMoveToOpen] = useState(false);
  const [movingPlaylistId, setMovingPlaylistId] = useState(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  const coverFileInputRef = React.useRef(null);
  const [targetCoverPlaylistId, setTargetCoverPlaylistId] = useState(null);
  const [isProcessingCover, setIsProcessingCover] = useState(false);

  // Close Move to dropdowns on outside click
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (movingPlaylistId && !e.target.closest('[data-moveto-container="true"]')) {
        setMovingPlaylistId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [movingPlaylistId]);

  const handleOpenCoverPicker = (playlistId, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setTargetCoverPlaylistId(String(playlistId));
    if (coverFileInputRef.current) {
      coverFileInputRef.current.value = "";
      coverFileInputRef.current.click();
    }
  };

  const handleCoverFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !targetCoverPlaylistId) return;
    try {
      setIsProcessingCover(true);
      let durableUrl = null;
      if (isSupabaseConfigured()) {
        try {
          const uploadRes = await uploadPlaylistCoverToCloud(file, targetCoverPlaylistId);
          if (uploadRes?.publicUrl) {
            durableUrl = uploadRes.publicUrl;
          }
        } catch (uploadErr) {
          console.warn("[PlaylistsPage] Storage upload notice, falling back to local optimization:", uploadErr);
        }
      }

      if (!durableUrl) {
        durableUrl = await processLocalImage(file);
      }

      if (updatePlaylistCover) {
        await updatePlaylistCover(targetCoverPlaylistId, durableUrl);
      }
    } catch (err) {
      console.error("Failed to update playlist cover:", err);
    } finally {
      setIsProcessingCover(false);
      setTargetCoverPlaylistId(null);
    }
  };

  // Unified playlist collection with resolved category
  const allPlaylists = React.useMemo(() => {
    let storedCategories = {};
    if (typeof window !== "undefined") {
      try {
        storedCategories = JSON.parse(localStorage.getItem("ceepeefy_playlist_categories") || "{}");
      } catch {}
    }

    const map = new Map();
    // 1. Add user custom playlists
    (customPlaylists || []).filter((pl) => !pl.isSelfMix).forEach((pl) => {
      const storedCat = storedCategories[String(pl.id)];
      const cat = storedCat || pl.category || pl.sourceMeta?.category || getPlaylistCategory(pl);
      map.set(String(pl.id), { ...pl, isCustom: true, category: cat });
    });
    // 2. Add pinned / added playlists (e.g. from search / curated)
    (addedPlaylists || []).filter((pl) => !pl.isSelfMix).forEach((pl) => {
      if (!map.has(String(pl.id))) {
        const storedCat = storedCategories[String(pl.id)];
        const cat = storedCat || pl.category || pl.sourceMeta?.category || getPlaylistCategory(pl);
        map.set(String(pl.id), { ...pl, category: cat });
      }
    });
    const list = Array.from(map.values());
    // Pinned playlists show FIRST
    return list.sort((a, b) => {
      const aPinned = isPlaylistPinned(a.id);
      const bPinned = isPlaylistPinned(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [customPlaylists, addedPlaylists, isPlaylistPinned]);

  const filteredPlaylists = React.useMemo(() => {
    return allPlaylists.filter((pl) => {
      // Category filter
      if (activeCategory !== "All") {
        const plCat = pl.category || "Mixed";
        if (plCat !== activeCategory) {
          return false;
        }
      }

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        pl.title?.toLowerCase().includes(q) ||
        pl.curator?.toLowerCase().includes(q) ||
        pl.artist?.toLowerCase().includes(q) ||
        pl.description?.toLowerCase().includes(q)
      );
    });
  }, [allPlaylists, activeCategory, searchQuery]);

  const totalCount = allPlaylists.length;

  const handleCreateSubmit = (e) => {
    e?.preventDefault();
    const created = createPlaylist(newTitle, selectedCreateCategory);
    setNewTitle("");
    setIsCreateMoveToOpen(false);
    setShowCreateModal(false);
    if (created?.id) {
      router.push(`/playlist/${created.id}`);
    }
  };

  const handlePlaylistPlay = (playlist, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (playlist?.id && bumpPlaylistToTop) {
      bumpPlaylistToTop(playlist.id);
    }

    const tracks = playlist.tracks || [];
    if (tracks.length === 0) {
      const targetUrl = playlist.type === "album" || playlist.isAlbum
        ? `/album/${playlist.id}`
        : `/playlist/${playlist.id}`;
      router.push(targetUrl);
      return;
    }
    const isThisPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

    if (isThisPlaying) {
      togglePlay();
    } else {
      playTrack(tracks[0], tracks, {
        context: "playlist",
        playlistId: playlist.id,
        playlistTitle: playlist.title,
      });
    }
  };

  return (
    <div className="w-full px-3 md:px-8 2xl:px-12 3xl:px-16 py-4 md:py-8 2xl:py-10 flex flex-col gap-6 md:gap-10 2xl:gap-12 select-none relative">
      {/* Sync / Update Notice Toast */}
      {syncNotice && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.85)] backdrop-blur-xl border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200 select-none ${
            syncNotice.type === "error"
              ? "bg-red-950/90 border-red-500/50 text-red-200"
              : syncNotice.type === "info"
              ? "bg-sky-950/90 border-sky-500/50 text-sky-200"
              : "bg-emerald-950/90 border-emerald-500/50 text-emerald-200"
          }`}
        >
          <span className="material-symbols-outlined text-[17px]">
            {syncNotice.type === "error" ? "error" : syncNotice.type === "info" ? "info" : "check_circle"}
          </span>
          <span>{syncNotice.message}</span>
          <button
            onClick={() => setSyncNotice(null)}
            className="text-white/60 hover:text-white ml-1 text-[15px] cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-2.5 md:gap-3">
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] md:text-[16px]">queue_music</span>
            Playlists Library
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] md:text-[11px] text-outline font-mono">
            {totalCount} {totalCount === 1 ? "Collection" : "Collections"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-xl md:text-4xl font-extrabold text-white tracking-tight">
              Playlists
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-0.5 md:mt-1">
              Organize and stream your favorite tracks, custom collections, and pinned playlists in studio master fidelity.
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Playlist Search Input */}
            <div className="flex items-center gap-2 px-3 py-1.5 md:px-3.5 md:py-2 rounded-full bg-surface-container/70 border border-white/10 text-on-surface w-full md:w-60 shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[17px] md:text-[18px]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter collections..."
                className="bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-outline/70 w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-outline hover:text-white"
                >
                  <span className="material-symbols-outlined text-[15px] md:text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Import Spotify Playlist Button */}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 md:px-4 md:py-2 rounded-full bg-surface-container hover:bg-[#1DB954]/10 border border-[#1DB954]/30 hover:border-[#1DB954] text-white hover:text-[#1DB954] font-bold text-xs shadow-[0_0_12px_rgba(29,185,84,0.15)] active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
              title="Import Spotify Playlist"
            >
              <svg className="w-4 h-4 fill-current text-[#1DB954]" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.464-1.027.25-2.812-1.718-6.353-2.107-10.525-1.155-.403.093-.805-.16-.897-.563-.092-.403.16-.805.563-.897 4.568-1.042 8.497-.6 11.636 1.338.353.214.464.674.25 1.027zm1.468-3.26c-.27.44-.847.578-1.287.308-3.22-1.979-8.128-2.552-11.936-1.396-.497.15-1.026-.134-1.176-.631-.15-.497.134-1.026.631-1.176 4.364-1.324 9.774-.679 13.46 1.588.44.27.578.847.308 1.307zm.126-3.41c-3.86-2.292-10.228-2.503-13.91-1.385-.593.18-1.223-.153-1.403-.746-.18-.593.153-1.223.746-1.403 4.234-1.285 11.272-1.04 15.688 1.583.534.317.708 1.01.391 1.544-.316.533-1.009.708-1.544.391z" />
              </svg>
              <span>Import Playlist</span>
            </button>

            {/* Create Playlist Button */}
            <button
              onClick={() => {
                setNewTitle("");
                setSelectedCreateCategory(activeCategory === "All" ? "Mixed" : activeCategory);
                setIsCreateMoveToOpen(false);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 md:px-4 md:py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px] md:text-[18px]">add</span>
              <span>New Playlist</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills (Image 1 Structure: All, Mixed, Malayalam, Hindi, Tamil, English, Phonks, Bgms, Others) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 pb-0.5">
          {["All", ...PLAYLIST_CATEGORIES].map((cat) => {
            const isSelected = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all select-none whitespace-nowrap cursor-pointer min-h-[36px] sm:min-h-[40px] flex items-center justify-center ${isSelected
                  ? "bg-white text-surface-container-lowest shadow-md font-bold scale-105"
                  : "bg-surface-container/70 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-white/10"
                  }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Playlists Library Section */}
      <div className="flex flex-col gap-3.5 md:gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">queue_music</span>
            <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
              {activeCategory === "All" ? "All Collections" : `${activeCategory} Collections`}
            </h2>
            <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono font-bold">
              {filteredPlaylists.length}
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant hidden sm:inline">
            Pinned playlists appear first • Double-click playlist name to rename
          </span>
        </div>

        {/* Playlist Card Grid (matching Home Playlist Card style with uppercase track & duration header) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-3.5 sm:gap-4 md:gap-5 2xl:gap-6">
          {/* 'Create New Playlist' Card */}
          <div
            onClick={() => {
              setNewTitle("");
              setSelectedCreateCategory(activeCategory === "All" ? "Mixed" : activeCategory);
              setIsCreateMoveToOpen(false);
              setShowCreateModal(true);
            }}
            className="w-full flex flex-col group cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="relative aspect-square w-full rounded-[10px] overflow-hidden border-2 border-dashed border-cyan-500/40 group-hover:border-cyan-400 bg-[#161922] group-hover:bg-primary/10 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 shadow-md">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/15 border border-primary/30 group-hover:scale-110 group-hover:bg-primary text-primary group-hover:text-black flex items-center justify-center transition-all shadow-[0_0_16px_rgba(76,215,246,0.3)]">
                <span className="material-symbols-outlined text-[22px] sm:text-[24px]">add</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-white/90 group-hover:text-primary transition-colors">
                New Playlist
              </span>
            </div>

            <div className="flex flex-col min-w-0 mt-1.5">
              <p className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider truncate leading-tight">
                {activeCategory === "All" ? "CUSTOM COLLECTION" : `${activeCategory.toUpperCase()} COLLECTION`}
              </p>
              <h3 className="text-xs sm:text-[13px] font-bold text-white group-hover:text-primary transition-colors truncate mt-0.5 leading-tight">
                Create New Playlist
              </h3>
            </div>
          </div>

          {/* Unified Playlists List with Pinned Playlists First */}
          {filteredPlaylists.map((pl) => {
            const tracks = pl.tracks || [];
            const isPlaylistPlaying =
              isPlaying && tracks.some((t) => t.id === currentTrack?.id);
            const isPinned = isPlaylistPinned(pl.id);
            const isAlbum = pl.type === "album" || pl.isAlbum;
            const targetUrl = isAlbum ? `/album/${pl.id}` : `/playlist/${pl.id}`;

            const coverUrl =
              pl.customCover ||
              pl.coverUrl ||
              pl.image ||
              (Array.isArray(pl.images) && pl.images[0]?.url) ||
              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

            const headerSubtitle = formatPlaylistTracksAndDurationUppercase(tracks, pl.duration);
            const playlistCategory = pl.category || "Mixed";
            const isSpotifyPlaylist = Boolean(
              pl.badge === "SPOTIFY" ||
              pl.source === "spotify_import" ||
              pl.sourceMeta?.spotifyId ||
              pl.spotifyId
            );
            const isUpdatingThisPlaylist = Boolean(syncingPlaylistIds?.has(pl.id));

            return (
              <div
                key={pl.id}
                onClick={() => router.push(targetUrl)}
                className="w-full flex flex-col group cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1"
              >
                {/* Square Artwork (Rounded-[10px]) */}
                <div
                  className={`relative aspect-square w-full rounded-[10px] overflow-hidden bg-[#161922] shadow-md transition-all duration-200 ${isPlaylistPlaying
                      ? "ring-2 ring-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.35)]"
                      : isPinned
                        ? "ring-1.5 ring-primary/60 shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.2)]"
                        : "ring-1 ring-white/10 group-hover:ring-white/25"
                    }`}
                >
                  <PlaylistCover
                    tracks={tracks}
                    coverUrl={pl.customCover || pl.coverUrl || pl.image}
                    fallbackUrl={coverUrl}
                    alt={pl.title}
                    isSpotify={Boolean(pl.badge === "SPOTIFY" || pl.source === "spotify_import" || pl.sourceMeta?.spotifyId)}
                    className="w-full h-full object-cover rounded-[10px] group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Change Cover quick button on hover */}
                  <button
                    type="button"
                    onClick={(e) => handleOpenCoverPicker(pl.id, e)}
                    className="absolute bottom-2 left-2 z-10 opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/20 text-[9px] font-bold text-white/90 hover:text-white hover:bg-black/95 flex items-center gap-1 transition-all cursor-pointer shadow-md"
                    title="Change cover with local photo"
                  >
                    <span className="material-symbols-outlined text-[12px] text-cyan-300">photo_camera</span>
                    <span>Cover</span>
                  </button>

                  {/* Badges top-left */}
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                    {isPinned && (
                      <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded backdrop-blur-md border bg-black/70 text-primary border-primary/40 flex items-center gap-0.5 shadow-md">
                        <span className="material-symbols-outlined text-[10px]">push_pin</span>
                        PINNED
                      </span>
                    )}
                    {isUpdatingThisPlaylist && (
                      <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded backdrop-blur-md border bg-[#1DB954] text-black border-[#1DB954] flex items-center gap-0.5 shadow-md animate-pulse">
                        <span className="material-symbols-outlined text-[10px] animate-spin">sync</span>
                        UPDATING
                      </span>
                    )}
                    {pl.isCustom ? (
                      <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded backdrop-blur-md border bg-black/70 text-cyan-300 border-cyan-400/30 flex items-center gap-0.5 shadow-md">
                        <span className="material-symbols-outlined text-[10px]">person</span>
                        YOU
                      </span>
                    ) : isAlbum ? (
                      <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded backdrop-blur-md border bg-black/70 text-amber-300 border-amber-500/30 shadow-md">
                        ALBUM
                      </span>
                    ) : null}
                  </div>

                  {/* Discrete Action buttons top-right */}
                  <div className={`absolute top-1.5 right-1.5 flex items-center gap-1 z-10 transition-opacity duration-200 ${
                    isUpdatingThisPlaylist ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}>
                    {/* Spotify Update Button (Persistent for Spotify-linked playlists) */}
                    {isSpotifyPlaylist && (
                      <button
                        type="button"
                        disabled={isUpdatingThisPlaylist}
                        onClick={(e) => handleUpdateSpotifyPlaylist(pl, e)}
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${
                          isUpdatingThisPlaylist
                            ? "bg-[#1DB954] text-black border-[#1DB954] shadow-[0_0_12px_rgba(29,185,84,0.5)]"
                            : "bg-black/70 text-white/80 border-[#1DB954]/40 hover:text-[#1DB954] hover:border-[#1DB954] hover:bg-black/90 hover:scale-105"
                        }`}
                        title={isUpdatingThisPlaylist ? "Synchronizing with Spotify..." : "Update playlist from Spotify"}
                      >
                        <span className={`material-symbols-outlined text-[13px] sm:text-[14px] ${isUpdatingThisPlaylist ? "animate-spin text-black" : "text-[#1DB954]"}`}>
                          sync
                        </span>
                      </button>
                    )}

                    {/* Pin/Unpin Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePinPlaylist(pl.id, pl);
                      }}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${isPinned
                          ? "bg-primary text-black border-primary shadow-[0_0_10px_rgba(76,215,246,0.4)]"
                          : "bg-black/70 text-white/80 border-white/10 hover:text-white hover:bg-black/90 hover:scale-105"
                        }`}
                      title={isPinned ? "Unpin playlist" : "Pin playlist to top"}
                    >
                      <span className={`material-symbols-outlined text-[12px] sm:text-[13px] ${isPinned ? "rotate-45" : ""}`}>
                        push_pin
                      </span>
                    </button>

                    {/* Change Cover Photo Button */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenCoverPicker(pl.id, e)}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white/80 hover:text-cyan-300 hover:bg-black/90 hover:scale-105 flex items-center justify-center transition-all cursor-pointer"
                      title="Change cover with local photo"
                    >
                      <span className="material-symbols-outlined text-[13px] sm:text-[14px]">photo_camera</span>
                    </button>

                    {/* Move to Category Button with Dropdown */}
                    <div className="relative" data-moveto-container="true">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMovingPlaylistId(movingPlaylistId === pl.id ? null : pl.id);
                        }}
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${movingPlaylistId === pl.id
                            ? "bg-primary text-black border-primary shadow-[0_0_10px_rgba(76,215,246,0.4)]"
                            : "bg-black/70 text-white/80 border-white/10 hover:text-cyan-300 hover:bg-black/90 hover:scale-105"
                          }`}
                        title={`Move to category (currently ${playlistCategory})`}
                      >
                        <span className="material-symbols-outlined text-[13px] sm:text-[14px]">
                          drive_file_move
                        </span>
                      </button>

                      {/* Dropdown displaying category names */}
                      {movingPlaylistId === pl.id && (
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className="absolute right-0 top-full mt-1.5 z-50 w-44 bg-surface-container-highest/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
                        >
                          <div className="px-3 py-1 text-[10px] font-bold text-outline uppercase tracking-wider border-b border-white/10 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[12px] text-primary">drive_file_move</span>
                            <span>Move to</span>
                          </div>
                          {PLAYLIST_CATEGORIES.map((catName) => {
                            const isCurrent = playlistCategory === catName;
                            return (
                              <button
                                key={catName}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updatePlaylistCategory(pl.id, catName);
                                  setMovingPlaylistId(null);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${isCurrent
                                    ? "bg-primary/20 text-primary font-bold"
                                    : "text-white/90 hover:bg-white/10 hover:text-white"
                                  }`}
                              >
                                <span>{catName}</span>
                                {isCurrent && (
                                  <span className="material-symbols-outlined text-[14px] text-primary">check</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Delete / Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteError(null);
                        setPlaylistToDelete(pl);
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white/80 hover:text-red-400 hover:bg-black/90 hover:scale-105 flex items-center justify-center transition-all cursor-pointer"
                      title={pl.isCustom ? "Delete playlist" : "Remove from library"}
                    >
                      <span className="material-symbols-outlined text-[13px] sm:text-[14px]">delete</span>
                    </button>
                  </div>

                  {/* Floating Play Button on Hover */}
                  <div
                    className={`absolute inset-0 bg-black/35 flex items-end justify-end p-1.5 sm:p-2 transition-all duration-200 ${isPlaylistPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => handlePlaylistPlay(pl, e)}
                      className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.6)] transform transition-all duration-200 hover:scale-110 active:scale-95 ${isPlaylistPlaying
                          ? "translate-y-0 scale-100 shadow-[0_0_14px_rgba(var(--color-primary-rgb),0.6)]"
                          : "translate-y-2 group-hover:translate-y-0 scale-95 group-hover:scale-100"
                        }`}
                      title={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
                      aria-label={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
                    >
                      <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                        {isPlaylistPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>

                  {/* Animated equalizer if playing */}
                  {isPlaylistPlaying && (
                    <div className="absolute bottom-2 left-2 px-1 py-0.5 rounded-sm bg-black/80 backdrop-blur-md border border-white/10 flex items-center gap-0.5">
                      <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
                      <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse delay-75" />
                      <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </div>

                {/* Details: Uppercase Subtitle Above Title + Playlist Name */}
                <div className="flex flex-col min-w-0 mt-1.5">
                  {/* Row 1: Uppercase format above playlist name with Category prefix */}
                  <p
                    className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider truncate leading-tight"
                    title={`${playlistCategory.toUpperCase()} • ${headerSubtitle}`}
                  >
                    <span className="text-primary/90 font-bold">{playlistCategory.toUpperCase()}</span> • {headerSubtitle}
                  </p>

                  {/* Row 2: Playlist Name (double click to edit if custom) */}
                  {editingPlaylistId === pl.id && pl.isCustom ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (editingTitle.trim()) {
                          renamePlaylist(pl.id, editingTitle.trim());
                        }
                        setEditingPlaylistId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 mt-0.5"
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingPlaylistId(null);
                        }}
                        onBlur={() => {
                          if (editingTitle.trim()) {
                            renamePlaylist(pl.id, editingTitle.trim());
                          }
                          setEditingPlaylistId(null);
                        }}
                        autoFocus
                        className="text-xs sm:text-[13px] font-bold text-white bg-surface-container-highest px-1.5 py-0.5 rounded border border-primary/50 outline-none w-full"
                      />
                      <button
                        type="submit"
                        className="p-1 rounded bg-primary text-surface-container-lowest flex-shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[13px]">check</span>
                      </button>
                    </form>
                  ) : (
                    <h3
                      onDoubleClick={(e) => {
                        if (!pl.isCustom) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingPlaylistId(pl.id);
                        setEditingTitle(pl.title || "");
                      }}
                      title={pl.isCustom ? `${pl.title} (Double-click to rename)` : pl.title}
                      className={`text-xs sm:text-[13px] font-bold truncate transition-colors leading-tight mt-0.5 ${isPlaylistPlaying ? "text-primary font-extrabold" : "text-white group-hover:text-primary"
                        }`}
                    >
                      {pl.title}
                    </h3>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state when category or filter has no playlists */}
          {filteredPlaylists.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-surface-container-high/80 border border-white/10 flex items-center justify-center text-primary mb-3 shadow-lg">
                <span className="material-symbols-outlined text-[28px]">drive_file_move</span>
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                No playlists in "{activeCategory}" yet
              </h3>
              <p className="text-xs text-on-surface-variant max-w-sm mb-4">
                Create a new playlist in {activeCategory} or move your existing playlists here.
              </p>
              <button
                onClick={() => {
                  setNewTitle("");
                  setSelectedCreateCategory(activeCategory === "All" ? "Mixed" : activeCategory);
                  setIsCreateMoveToOpen(false);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(76,215,246,0.3)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Create {activeCategory === "All" ? "" : activeCategory + " "}Playlist</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Creation Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => {
            setShowCreateModal(false);
            setIsCreateMoveToOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-container-high/95 border border-white/15 p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  queue_music
                </span>
                <h2 className="text-lg font-bold text-white">Create New Playlist</h2>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setIsCreateMoveToOpen(false);
                }}
                className="p-1 rounded-full text-outline hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateSubmit(e);
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-outline uppercase tracking-wider">
                  Playlist Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Acoustic Coffeehouse"
                  autoFocus
                  maxLength={40}
                  className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-outline/60 outline-none transition-all"
                />
              </div>

              {/* Move to Category Selector */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">drive_file_move</span>
                    Move to
                  </span>
                  <span className="text-[11px] text-primary font-bold">
                    {selectedCreateCategory}
                  </span>
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCreateMoveToOpen(!isCreateMoveToOpen)}
                    className="w-full flex items-center justify-between bg-surface-container-lowest border border-white/15 hover:border-white/30 rounded-xl px-3.5 py-2.5 text-xs text-white transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">drive_file_move</span>
                      <span className="text-on-surface-variant font-medium">Move to:</span>
                      <span className="font-bold text-white px-2 py-0.5 rounded bg-primary/15 text-primary text-[11px]">
                        {selectedCreateCategory}
                      </span>
                    </div>
                    <span className={`material-symbols-outlined text-[18px] text-outline transition-transform duration-200 ${isCreateMoveToOpen ? "rotate-180" : ""}`}>
                      expand_more
                    </span>
                  </button>

                  {/* Dropdown displaying category names */}
                  {isCreateMoveToOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-surface-container-highest/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                      {PLAYLIST_CATEGORIES.map((catName) => {
                        const isCurrent = selectedCreateCategory === catName;
                        return (
                          <button
                            key={catName}
                            type="button"
                            onClick={() => {
                              setSelectedCreateCategory(catName);
                              setIsCreateMoveToOpen(false);
                            }}
                            className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${isCurrent
                                ? "bg-primary/20 text-primary font-bold"
                                : "text-white/90 hover:bg-white/10 hover:text-white"
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[15px] text-outline">folder</span>
                              <span>{catName}</span>
                            </div>
                            {isCurrent && (
                              <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Vibe Suggestions */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-outline font-medium">Quick suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["🌙 Night Drive", "☕ Focus Beats", "⚡ Cyber Synth", "🎧 Chill Vibes"].map((vibe) => (
                    <button
                      key={vibe}
                      type="button"
                      onClick={() => setNewTitle(vibe.replace(/^[^\s]+\s*/, "") + " Mix")}
                      className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary border border-white/5 hover:border-primary/30 transition-all cursor-pointer"
                    >
                      {vibe}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setIsCreateMoveToOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Create Playlist</span>
                  <span className="material-symbols-outlined text-[16px]">check</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Dialog */}
      {playlistToDelete && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeleting) {
              setPlaylistToDelete(null);
              setDeleteError(null);
            }
          }}
        >
          <div 
            className="w-full max-w-sm bg-[#181818] border border-red-500/30 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <span className="material-symbols-outlined text-[26px]">delete</span>
            </div>
            <div className="flex flex-col text-center gap-1.5">
              <h3 className="text-lg font-bold text-white">
                {playlistToDelete.isCustom ? "Delete Playlist?" : "Remove Playlist?"}
              </h3>
              <p className="text-xs text-outline leading-relaxed">
                Are you sure you want to {playlistToDelete.isCustom ? "permanently delete" : "remove"}{" "}
                <span className="text-white font-semibold">"{playlistToDelete.title}"</span>?{" "}
                {playlistToDelete.isCustom ? "This action cannot be undone." : "You can add it back anytime."}
              </p>
              {deleteError && (
                <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setPlaylistToDelete(null);
                  setDeleteError(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-outline hover:text-white hover:bg-white/5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  setDeleteError(null);
                  try {
                    if (playlistToDelete.isCustom) {
                      const res = deletePlaylist ? await deletePlaylist(playlistToDelete.id) : await deleteCustomPlaylist(playlistToDelete.id);
                      if (res && res.error) {
                        setDeleteError(res.error);
                        setIsDeleting(false);
                        return;
                      }
                    } else {
                      removeAddedPlaylist(playlistToDelete.id);
                    }
                    setPlaylistToDelete(null);
                  } catch (err) {
                    console.error("Failed to delete playlist:", err);
                    setDeleteError(err.message || "Failed to delete playlist");
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>{playlistToDelete.isCustom ? "Delete" : "Remove"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotify Import Modal */}
      <SpotifyImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        defaultCategory={activeCategory === "All" ? "Mixed" : activeCategory}
      />

      {/* Hidden Cover Image File Picker */}
      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverFileSelected}
      />
    </div>
  );
}
