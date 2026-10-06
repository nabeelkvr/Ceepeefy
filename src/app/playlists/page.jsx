"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import { formatPlaylistDuration, formatPlaylistTracksAndDurationUppercase } from "../../utils/playlistUtils";
import PlaylistCover from "../../components/PlaylistCover";

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
    deleteCustomPlaylist,
    removeAddedPlaylist,
    isPlaylistPinned,
    togglePinPlaylist,
    renamePlaylist,
    bumpPlaylistToTop,
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Unified playlist collection
  const allPlaylists = React.useMemo(() => {
    const map = new Map();
    // 1. Add user custom playlists
    (customPlaylists || []).filter((pl) => !pl.isSelfMix).forEach((pl) => {
      map.set(String(pl.id), { ...pl, isCustom: true });
    });
    // 2. Add pinned / added playlists (e.g. from search / curated)
    (addedPlaylists || []).filter((pl) => !pl.isSelfMix).forEach((pl) => {
      if (!map.has(String(pl.id))) {
        map.set(String(pl.id), pl);
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
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        pl.title?.toLowerCase().includes(q) ||
        pl.curator?.toLowerCase().includes(q) ||
        pl.artist?.toLowerCase().includes(q) ||
        pl.description?.toLowerCase().includes(q)
      );
    });
  }, [allPlaylists, searchQuery]);

  const totalCount = allPlaylists.length;

  const handleCreateSubmit = (e) => {
    e?.preventDefault();
    const created = createPlaylist(newTitle);
    setNewTitle("");
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
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <div className="w-full px-3 md:px-8 py-4 md:py-8 flex flex-col gap-6 md:gap-10 select-none">
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

            {/* Create Playlist Button */}
            <button
              onClick={() => {
                setNewTitle("");
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 md:px-4 md:py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px] md:text-[18px]">add</span>
              <span>New Playlist</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Playlists Library Section */}
      <div className="flex flex-col gap-3.5 md:gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">queue_music</span>
            <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
              All Collections
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-5">
          {/* 'Create New Playlist' Card */}
          <div
            onClick={() => {
              setNewTitle("");
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
                CUSTOM COLLECTION
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
              pl.coverUrl ||
              pl.image ||
              (Array.isArray(pl.images) && pl.images[0]?.url) ||
              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

            const headerSubtitle = formatPlaylistTracksAndDurationUppercase(tracks, pl.duration);

            return (
              <div
                key={pl.id}
                onClick={() => router.push(targetUrl)}
                className="w-full flex flex-col group cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1"
              >
                {/* Square Artwork (Rounded-[10px]) */}
                <div
                  className={`relative aspect-square w-full rounded-[10px] overflow-hidden bg-[#161922] shadow-md transition-all duration-200 ${
                    isPlaylistPlaying
                      ? "ring-2 ring-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.35)]"
                      : isPinned
                      ? "ring-1.5 ring-primary/60 shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.2)]"
                      : "ring-1 ring-white/10 group-hover:ring-white/25"
                  }`}
                >
                  {pl.isCustom || !pl.coverUrl ? (
                    <PlaylistCover
                      tracks={tracks}
                      fallbackUrl={coverUrl}
                      alt={pl.title}
                      className="w-full h-full object-cover rounded-[10px] group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <img
                      src={coverUrl}
                      alt={pl.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
                      }}
                      className="w-full h-full object-cover rounded-[10px] group-hover:scale-105 transition-transform duration-500"
                    />
                  )}

                  {/* Badges top-left */}
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                    {isPinned && (
                      <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded backdrop-blur-md border bg-black/70 text-primary border-primary/40 flex items-center gap-0.5 shadow-md">
                        <span className="material-symbols-outlined text-[10px]">push_pin</span>
                        PINNED
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
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {/* Pin/Unpin Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePinPlaylist(pl.id, pl);
                      }}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${
                        isPinned
                          ? "bg-primary text-black border-primary shadow-[0_0_10px_rgba(76,215,246,0.4)]"
                          : "bg-black/70 text-white/80 border-white/10 hover:text-white hover:bg-black/90 hover:scale-105"
                      }`}
                      title={isPinned ? "Unpin playlist" : "Pin playlist to top"}
                    >
                      <span className={`material-symbols-outlined text-[12px] sm:text-[13px] ${isPinned ? "rotate-45" : ""}`}>
                        push_pin
                      </span>
                    </button>

                    {/* Delete / Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (pl.isCustom) {
                          deleteCustomPlaylist(pl.id);
                        } else {
                          removeAddedPlaylist(pl.id);
                        }
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white/80 hover:text-red-400 hover:bg-black/90 hover:scale-105 flex items-center justify-center transition-all cursor-pointer"
                      title={pl.isCustom ? "Delete playlist" : "Remove from library"}
                    >
                      <span className="material-symbols-outlined text-[13px] sm:text-[14px]">delete</span>
                    </button>
                  </div>

                  {/* Floating Play Button on Hover */}
                  <div
                    className={`absolute inset-0 bg-black/35 flex items-end justify-end p-1.5 sm:p-2 transition-all duration-200 ${
                      isPlaylistPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => handlePlaylistPlay(pl, e)}
                      className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.6)] transform transition-all duration-200 hover:scale-110 active:scale-95 ${
                        isPlaylistPlaying
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
                  {/* Row 1: Uppercase format above playlist name in recent played songs artist style */}
                  <p
                    className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider truncate leading-tight"
                    title={headerSubtitle}
                  >
                    {headerSubtitle}
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
                      className={`text-xs sm:text-[13px] font-bold truncate transition-colors leading-tight mt-0.5 ${
                        isPlaylistPlaying ? "text-primary font-extrabold" : "text-white group-hover:text-primary"
                      }`}
                    >
                      {pl.title}
                    </h3>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Creation Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowCreateModal(false)}
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
                onClick={() => setShowCreateModal(false)}
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
                  onClick={() => setShowCreateModal(false)}
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
    </div>
  );
}
