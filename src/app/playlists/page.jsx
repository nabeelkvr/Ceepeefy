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
    addedPlaylists,
    createPlaylist,
    deleteCustomPlaylist,
    removeAddedPlaylist,
    isPlaylistPinned,
    togglePinPlaylist,
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const createdList = (customPlaylists || []).filter((pl) => !pl.isSelfMix);
  const addedList = (addedPlaylists || []).filter((pl) => !pl.isSelfMix);

  const totalCount = createdList.length + addedList.length;

  const filterFn = (pl) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      pl.title?.toLowerCase().includes(q) ||
      pl.curator?.toLowerCase().includes(q) ||
      pl.artist?.toLowerCase().includes(q) ||
      pl.description?.toLowerCase().includes(q)
    );
  };

  const filteredCreated = createdList.filter(filterFn);
  const filteredAdded = addedList.filter(filterFn);

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
          <span className="text-[10px] md:text-[11px] text-outline">
            {totalCount} {totalCount === 1 ? "Collection" : "Collections"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-xl md:text-4xl font-extrabold text-white tracking-tight">
              Playlists
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-0.5 md:mt-1">
              Organize and stream your favorite tracks, custom collections, and pinned albums in studio master fidelity.
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

      {/* SECTION 1: Created by you */}
      <div className="flex flex-col gap-3.5 md:gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
            <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
              Created by you
            </h2>
            <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono font-bold">
              {createdList.length}
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant hidden sm:inline">
            Custom playlists and sequences created by you
          </span>
        </div>

        {/* 1. Mobile Horizontal List (< md) matching Image 2 */}
        <div className="flex flex-col gap-2.5 md:hidden">
          {/* 'Create New Playlist' Horizontal Card */}
          <div
            onClick={() => {
              setNewTitle("");
              setShowCreateModal(true);
            }}
            className="flex items-center gap-3.5 p-3 rounded-2xl glass-card border border-dashed border-cyan-500/40 hover:border-cyan-400 active:scale-[0.98] transition-all cursor-pointer shadow-lg group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0 group-hover:scale-105 group-hover:bg-primary group-hover:text-surface-container-lowest transition-all">
              <span className="material-symbols-outlined text-[24px]">add</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                  Create New Playlist
                </span>
                <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 flex-shrink-0">
                  LOSSLESS
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                Start a personal collection
              </p>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px] mr-1">
              chevron_right
            </span>
          </div>

          {/* User Created Playlists Horizontal Cards */}
          {filteredCreated.map((pl) => {
            const tracks = pl.tracks || [];
            const isPlaylistPlaying =
              isPlaying && tracks.some((t) => t.id === currentTrack?.id);

            return (
              <div
                key={pl.id}
                onClick={() => router.push(`/playlist/${pl.id}`)}
                className="flex items-center gap-3.5 p-3 rounded-2xl glass-card border border-white/5 hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer shadow-lg group"
              >
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container-highest flex-shrink-0 shadow border border-white/10">
                  <img
                    src={pl.coverUrl}
                    alt={pl.title}
                    className="w-full h-full object-cover"
                  />
                  {isPlaylistPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[16px] animate-pulse">
                        graphic_eq
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                      {pl.title}
                    </h3>
                    <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40 flex-shrink-0">
                      YOU
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                    {tracks.length} tracks • {formatPlaylistDuration(tracks)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => handlePlaylistPlay(pl, e)}
                    className="w-9 h-9 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.5)] active:scale-90 transition-transform cursor-pointer"
                    title={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isPlaylistPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomPlaylist(pl.id)}
                    className="w-8 h-8 rounded-full text-outline hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                    title="Delete playlist"
                  >
                    <span className="material-symbols-outlined text-[17px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2. Desktop Grid (md:) */}
        <div className="hidden md:flex md:flex-wrap items-start justify-start gap-5">
          {/* First Card: 'Create New Playlist' Box */}
          <div
            onClick={() => {
              setNewTitle("");
              setShowCreateModal(true);
            }}
            className="w-full sm:w-56 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl glass-card border border-white/10 hover:border-primary/50 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
          >
            <div>
              {/* Aspect Square Area matching playlist cover box */}
              <div className="relative aspect-square w-full rounded-lg sm:rounded-xl overflow-hidden border-2 border-dashed border-white/15 group-hover:border-primary/60 bg-surface-container-high/40 group-hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 sm:gap-1.5 mb-2.5 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-primary/10 border border-primary/30 group-hover:scale-110 group-hover:bg-primary text-primary group-hover:text-surface-container-lowest flex items-center justify-center transition-all shadow-[0_0_20px_rgba(76,215,246,0.3)]">
                  <span className="material-symbols-outlined text-[20px] sm:text-[24px]">add</span>
                </div>
                <span className="text-xs font-bold text-white/90 group-hover:text-primary transition-colors">
                  New Playlist
                </span>
                <span className="text-[9px] sm:text-[10px] text-outline font-mono uppercase tracking-wider">
                  Click to create
                </span>
              </div>

              {/* Title and metadata matching playlist card structure */}
              <div className="flex flex-col">
                <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                  Create New Playlist
                </h3>
                <p className="text-[10px] sm:text-[11px] text-on-surface-variant mt-0.5 truncate">
                  Start a personal collection
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2">
              <span className="flex items-center gap-1 font-mono text-[9px] sm:text-[10px] text-primary">
                <span className="material-symbols-outlined text-[12px] sm:text-[13px]">queue_music</span>
                Custom Playlist
              </span>
              <span className="font-mono text-[9px] sm:text-[10px]">Lossless</span>
            </div>
          </div>

          {/* User Created Playlists */}
          {filteredCreated.map((pl) => {
            const tracks = pl.tracks || [];
            const isPlaylistPlaying =
              isPlaying && tracks.some((t) => t.id === currentTrack?.id);

            return (
              <Link
                key={pl.id}
                href={`/playlist/${pl.id}`}
                className="w-full sm:w-56 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl relative overflow-hidden cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
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
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
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

                {/* Modern Audio Telemetry Capsule for Track Count & Duration */}
                <div className="pt-2 mt-2">
                  <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-surface-container-high/60 backdrop-blur-md border border-white/10 group-hover:border-primary/30 transition-all duration-300 shadow-inner overflow-hidden w-full">
                    <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[9.5px] sm:text-[10px] font-bold tracking-tight shadow-[0_0_10px_rgba(76,215,246,0.15)] flex-shrink-0">
                      <div className="flex items-end gap-[1.5px] h-2.5 flex-shrink-0">
                        <span className="w-[2px] h-full bg-primary rounded-full animate-pulse" />
                        <span className="w-[2px] h-2/3 bg-primary rounded-full animate-pulse delay-75" />
                        <span className="w-[2px] h-1/2 bg-primary rounded-full animate-pulse delay-150" />
                      </div>
                      <span className="tabular-nums whitespace-nowrap">
                        {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-white/80 text-[9.5px] sm:text-[10px] font-mono font-medium min-w-0 flex-shrink overflow-hidden">
                      <span className="material-symbols-outlined text-[12px] text-outline flex-shrink-0">schedule</span>
                      <span className="truncate">{formatPlaylistDuration(tracks)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Added by you */}
      <div className="flex flex-col gap-3.5 md:gap-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">push_pin</span>
            <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
              Added by you
            </h2>
            <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 font-mono font-bold">
              {addedList.length}
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant hidden sm:inline">
            Public playlists and albums pinned from search & library
          </span>
        </div>

        {filteredAdded.length === 0 ? (
          <div className="w-full py-10 px-4 rounded-2xl glass-card border border-white/5 flex flex-col items-center justify-center text-center gap-2.5">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[24px]">push_pin</span>
            </div>
            <h3 className="text-sm font-bold text-white">No playlists or albums added yet</h3>
            <p className="text-xs text-on-surface-variant max-w-sm">
              Search for songs, albums, or curated playlists and click <span className="text-primary font-semibold">"Pin to Library"</span> to save them here.
            </p>
            <button
              type="button"
              onClick={() => router.push("/search")}
              className="mt-1 px-4 py-2 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-xs font-bold transition-all cursor-pointer"
            >
              Explore in Search
            </button>
          </div>
        ) : (
          <>
            {/* 1. Mobile Horizontal List (< md) matching Image 2 */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {filteredAdded.map((pl) => {
                const tracks = pl.tracks || [];
                const isPlaylistPlaying =
                  isPlaying && tracks.some((t) => t.id === currentTrack?.id);
                const isAlbum = pl.type === "album" || pl.isAlbum;
                const linkUrl = isAlbum ? `/album/${pl.id}` : `/playlist/${pl.id}`;

                return (
                  <div
                    key={pl.id}
                    onClick={() => router.push(linkUrl)}
                    className="flex items-center gap-3.5 p-3 rounded-2xl glass-card border border-white/5 hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer shadow-lg group"
                  >
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container-highest flex-shrink-0 shadow border border-white/10">
                      <img
                        src={pl.coverUrl}
                        alt={pl.title}
                        className="w-full h-full object-cover"
                      />
                      {isPlaylistPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary text-[16px] animate-pulse">
                            graphic_eq
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                          {pl.title}
                        </h3>
                        <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-primary border border-primary/50 flex-shrink-0">
                          PINNED
                        </span>
                        {isAlbum && (
                          <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/40 flex-shrink-0">
                            ALBUM
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                        {pl.trackCount || tracks.length || 0} tracks • {pl.curator || "Official"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handlePlaylistPlay(pl, e)}
                        className="w-9 h-9 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(76,215,246,0.5)] active:scale-90 transition-transform cursor-pointer"
                        title={isPlaylistPlaying ? "Pause" : "Play"}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {isPlaylistPlaying ? "pause" : "play_arrow"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAddedPlaylist(pl.id)}
                        className="w-8 h-8 rounded-full text-outline hover:text-amber-400 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                        title="Unpin from library"
                      >
                        <span className="material-symbols-outlined text-[17px]">close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Desktop Grid (md:) */}
            <div className="hidden md:flex md:flex-wrap items-start justify-start gap-5">
              {filteredAdded.map((pl) => {
                const tracks = pl.tracks || [];
                const isPlaylistPlaying =
                  isPlaying && tracks.some((t) => t.id === currentTrack?.id);
                const isAlbum = pl.type === "album" || pl.isAlbum;
                const linkUrl = isAlbum ? `/album/${pl.id}` : `/playlist/${pl.id}`;

                return (
                  <Link
                    key={pl.id}
                    href={linkUrl}
                    className="w-full sm:w-56 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl relative overflow-hidden cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
                  >
                    <div>
                      {/* Cover Image with Play Overlay */}
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
                        <img
                          src={pl.coverUrl}
                          alt={pl.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />

                        {/* Badges top-left */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md backdrop-blur-md border bg-cyan-950/80 text-primary border-primary/50 shadow-[0_0_12px_rgba(76,215,246,0.3)] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[11px] rotate-45">push_pin</span>
                            PINNED
                          </span>
                          {isAlbum && (
                            <span className="text-[8.5px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-md backdrop-blur-md border bg-amber-950/80 text-amber-300 border-amber-600/40">
                              ALBUM
                            </span>
                          )}
                        </div>

                        {/* Unpin button top-right */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeAddedPlaylist(pl.id);
                          }}
                          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-outline hover:text-red-400 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                          title="Unpin from library"
                        >
                          <span className="material-symbols-outlined text-[15px]">close</span>
                        </button>

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => handlePlaylistPlay(pl, e)}
                            className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.8)] hover:scale-110 active:scale-95 transition-all"
                            title={isPlaylistPlaying ? "Pause" : "Play"}
                          >
                            <span className="material-symbols-outlined text-[24px]">
                              {isPlaylistPlaying ? "pause" : "play_arrow"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-col">
                        <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                          {pl.title}
                        </h3>
                        <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                          {pl.curator || pl.description || "Curated collection"}
                        </p>
                      </div>
                    </div>

                    {/* Modern Audio Telemetry Capsule for Track Count & Duration */}
                    <div className="pt-2 mt-2">
                      <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-surface-container-high/60 backdrop-blur-md border border-white/10 group-hover:border-primary/30 transition-all duration-300 shadow-inner overflow-hidden w-full">
                        <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[9.5px] sm:text-[10px] font-bold tracking-tight shadow-[0_0_10px_rgba(76,215,246,0.15)] flex-shrink-0">
                          <div className="flex items-end gap-[1.5px] h-2.5 flex-shrink-0">
                            <span className="w-[2px] h-full bg-primary rounded-full animate-pulse" />
                            <span className="w-[2px] h-2/3 bg-primary rounded-full animate-pulse delay-75" />
                            <span className="w-[2px] h-1/2 bg-primary rounded-full animate-pulse delay-150" />
                          </div>
                          <span className="tabular-nums whitespace-nowrap">
                            {pl.trackCount || tracks.length} {(pl.trackCount || tracks.length) === 1 ? "track" : "tracks"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-white/80 text-[9.5px] sm:text-[10px] font-mono font-medium min-w-0 flex-shrink overflow-hidden">
                          <span className="material-symbols-outlined text-[12px] text-outline flex-shrink-0">schedule</span>
                          <span className="truncate">{formatPlaylistDuration(tracks)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
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
