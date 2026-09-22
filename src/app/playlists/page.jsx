"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import { formatPlaylistDuration } from "../../utils/playlistUtils";

export default function PlaylistsPage() {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    customPlaylists,
    createPlaylist,
    deleteCustomPlaylist,
    user,
    openAuthModal,
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // All current dummy playlists are cleared - only user custom playlists are shown!
  const allPlaylists = customPlaylists || [];

  const filteredPlaylists = allPlaylists.filter((pl) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      pl.title?.toLowerCase().includes(q) ||
      pl.curator?.toLowerCase().includes(q) ||
      pl.description?.toLowerCase().includes(q)
    );
  });

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

    const tracks = playlist.tracks || [];
    if (tracks.length === 0) {
      router.push(`/playlist/${playlist.id}`);
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
    <div className="w-full px-4 md:px-8 py-8 flex flex-col gap-8 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">queue_music</span>
            Playlists Library
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] text-outline">
            {allPlaylists.length} {allPlaylists.length === 1 ? "Playlist" : "Playlists"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
              Playlists
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-1">
              Organize and stream your favorite tracks, custom collections, and personal sequences in studio master fidelity.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Playlist Search Input */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-container/70 border border-white/10 text-on-surface w-full md:w-60 shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter playlists..."
                className="bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-outline/70 w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-outline hover:text-white"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Create Playlist Button */}
            <button
              onClick={() => {
                setNewTitle("");
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Playlist</span>
            </button>
          </div>
        </div>
      </div>

      {/* Playlists Container */}
      <div className="flex flex-wrap items-start justify-start gap-4 sm:gap-5">
        {/* 1. First Card: 'Create New Playlist' Box */}
            <div
              onClick={() => {
                setNewTitle("");
                setShowCreateModal(true);
              }}
              className="w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/10 hover:border-primary/50 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
            >
          <div>
            {/* Aspect Square Area matching playlist cover box */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden border-2 border-dashed border-white/15 group-hover:border-primary/60 bg-surface-container-high/40 group-hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1.5 mb-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/30 group-hover:scale-110 group-hover:bg-primary text-primary group-hover:text-surface-container-lowest flex items-center justify-center transition-all shadow-[0_0_20px_rgba(76,215,246,0.3)]">
                <span className="material-symbols-outlined text-[24px]">add</span>
              </div>
              <span className="text-xs font-bold text-white/90 group-hover:text-primary transition-colors">
                New Playlist
              </span>
              <span className="text-[10px] text-outline font-mono uppercase tracking-wider">
                Click to create
              </span>
            </div>

            {/* Title and metadata matching playlist card structure */}
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                Create New Playlist
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Start a personal collection
              </p>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
            <span className="flex items-center gap-1 font-mono text-[10px] text-primary">
              <span className="material-symbols-outlined text-[13px]">queue_music</span>
              Custom Playlist
            </span>
            <span className="font-mono text-[10px]">Lossless</span>
          </div>
        </div>

        {/* 2. Then display the Playlists as flex left */}
        {filteredPlaylists.map((pl) => {
          const tracks = pl.tracks || [];
          const isPlaylistPlaying =
            isPlaying && tracks.some((t) => t.id === currentTrack?.id);

          return (
            <Link
              key={pl.id}
              href={`/playlist/${pl.id}`}
              className="w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl relative overflow-hidden cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
            >
              <div>
                {/* Playlist Cover Image with Play Overlay */}
                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
                  <img
                    src={pl.coverUrl}
                    alt={pl.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Badge top-left */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md backdrop-blur-md border bg-primary/20 text-primary border-primary/40 shadow-[0_0_12px_rgba(76,215,246,0.3)] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[11px]">person</span>
                      YOU
                    </span>
                  </div>

                  {/* Delete button top-right */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteCustomPlaylist(pl.id);
                    }}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-outline hover:text-red-400 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                    title="Delete playlist"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => handlePlaylistPlay(pl, e)}
                      className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.8)] hover:scale-110 active:scale-95 transition-all"
                      title={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
                    >
                      <span className="material-symbols-outlined text-[24px]">
                        {isPlaylistPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Playlist Metadata */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                    {pl.title}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                    {pl.description || `Playlist by ${pl.curator || "You"}`}
                  </p>
                </div>
              </div>

              {/* Card Footer: Displays total tracks count and total duration */}
              <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
                <span className="flex items-center gap-1 text-primary font-medium text-[10px]">
                  <span className="material-symbols-outlined text-[13px]">graphic_eq</span>
                  {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] text-outline">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  {formatPlaylistDuration(tracks)}
                </span>
              </div>
            </Link>
          );
        })}
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
