"use client";

import React, { useState, useMemo } from "react";
import { formatPlaylistDuration } from "../utils/playlistUtils";
import SongOptionsMenu from "./SongOptionsMenu";

export default function LocalPlaylistDetailView({
  playlist,
  allTracks = [],
  onBack,
  onPlaySong,
  onPlayAll,
  onShufflePlay,
  onEditPlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onReorderTracks,
  onOpenAddSongs,
  currentTrack,
  isPlaying,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default"); // 'default', 'title', 'artist', 'duration'
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Map playlist.trackIds to full track objects in order
  const trackMap = useMemo(() => new Map(allTracks.map((t) => [t.id, t])), [allTracks]);

  const playlistTracks = useMemo(() => {
    if (!playlist || !Array.isArray(playlist.trackIds)) return [];
    return playlist.trackIds.map((id) => trackMap.get(id)).filter(Boolean);
  }, [playlist, trackMap]);

  // Filtered & sorted view
  const displayedTracks = useMemo(() => {
    let list = [...playlistTracks];
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q)
      );
    }

    if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "artist") {
      list.sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));
    } else if (sortBy === "duration") {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }

    return list;
  }, [playlistTracks, searchQuery, sortBy]);

  const totalDuration = formatPlaylistDuration(playlistTracks);

  const cover =
    playlist.coverUrl ||
    playlistTracks[0]?.coverUrl ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";

  const handleMoveUp = (index) => {
    if (index <= 0 || !playlist.trackIds) return;
    const newIds = [...playlist.trackIds];
    const temp = newIds[index - 1];
    newIds[index - 1] = newIds[index];
    newIds[index] = temp;
    onReorderTracks(playlist.id, newIds);
  };

  const handleMoveDown = (index) => {
    if (!playlist.trackIds || index >= playlist.trackIds.length - 1) return;
    const newIds = [...playlist.trackIds];
    const temp = newIds[index + 1];
    newIds[index + 1] = newIds[index];
    newIds[index] = temp;
    onReorderTracks(playlist.id, newIds);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200 select-none pb-12">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high/60 hover:bg-surface-container-highest border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer hover:-translate-x-0.5"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Playlists</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEditPlaylist(playlist)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* Playlist Hero Banner */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6 p-4 sm:p-6 rounded-3xl glass-card border border-white/5 bg-gradient-to-b from-white/5 to-transparent">
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl shrink-0 ring-1 ring-white/10">
          <img src={cover} alt={playlist.name} className="w-full h-full object-cover" />
        </div>

        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-mono text-[9px] font-bold tracking-widest uppercase">
              LOCAL PLAYLIST
            </span>
            <span className="text-[10px] text-outline font-mono">OFFLINE</span>
          </div>

          <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight line-clamp-2">
            {playlist.name}
          </h1>

          {playlist.description && (
            <p className="text-xs text-on-surface-variant line-clamp-2 max-w-xl">
              {playlist.description}
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-outline pt-1">
            <span className="font-semibold text-white">
              {playlistTracks.length} {playlistTracks.length === 1 ? "track" : "tracks"}
            </span>
            <span>•</span>
            <span className="font-mono">{totalDuration}</span>
          </div>
        </div>
      </div>

      {/* Action Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => onPlayAll(playlistTracks)}
            disabled={playlistTracks.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(76,215,246,0.4)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>Play All</span>
          </button>

          <button
            type="button"
            onClick={() => onShufflePlay(playlistTracks)}
            disabled={playlistTracks.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-white font-semibold text-xs transition-all cursor-pointer disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[17px] text-primary">shuffle</span>
            <span>Shuffle</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddSongs}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-white/10 text-primary font-semibold text-xs transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">add</span>
            <span>Add Songs</span>
          </button>
        </div>

        {/* Search & Sort inside playlist */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[15px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search playlist..."
              className="w-full bg-surface-container-high/60 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-outline focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-surface-container-high/60 border border-white/10 text-on-surface-variant text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary/50 cursor-pointer"
          >
            <option value="default">Default Order</option>
            <option value="title">Title (A-Z)</option>
            <option value="artist">Artist (A-Z)</option>
            <option value="duration">Duration</option>
          </select>
        </div>
      </div>

      {/* Playlist Tracklist */}
      {displayedTracks.length === 0 ? (
        <div className="py-16 text-center text-outline text-xs flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-[32px] text-outline/50">queue_music</span>
          <span>
            {searchQuery
              ? `No tracks found matching "${searchQuery}" in this playlist.`
              : "This playlist is empty. Click 'Add Songs' to add local tracks from your library."}
          </span>
          {!searchQuery && (
            <button
              type="button"
              onClick={onOpenAddSongs}
              className="mt-1 px-4 py-2 rounded-xl bg-primary text-surface-container-lowest text-xs font-bold shadow-[0_0_15px_rgba(76,215,246,0.3)] cursor-pointer"
            >
              Add Songs
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-white/5 rounded-2xl glass-card border border-white/5 overflow-hidden">
          {displayedTracks.map((track, idx) => {
            const isTrackPlaying = isPlaying && String(currentTrack?.id) === String(track.id);
            const isCurrent = String(currentTrack?.id) === String(track.id);

            return (
              <div
                key={`${track.id}-${idx}`}
                onClick={() => onPlaySong(track, displayedTracks)}
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
                      src={track.coverUrl}
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

                  {/* Title & Artist */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className={`text-xs sm:text-sm font-semibold line-clamp-2 md:truncate break-words leading-tight ${
                        isCurrent
                          ? "text-primary font-bold"
                          : "text-white group-hover:text-primary transition-colors"
                      }`}
                    >
                      {track.title}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-outline truncate mt-0.5">
                      {track.artist} {track.album ? `• ${track.album}` : ""}
                    </span>
                  </div>
                </div>

                {/* Right: Duration, Reorder Controls, Actions */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                  {/* Reorder Buttons (only in default order without active search) */}
                  {sortBy === "default" && !searchQuery && (
                    <div
                      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="p-1 rounded text-outline hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === displayedTracks.length - 1}
                        className="p-1 rounded text-outline hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
                      </button>
                    </div>
                  )}

                  <span className="text-[11px] font-mono text-outline hidden sm:inline">
                    {track.durationFormatted}
                  </span>

                  {/* Remove from Playlist Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrackFromPlaylist(playlist.id, idx);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-outline hover:text-amber-400 p-1 rounded-md transition-all cursor-pointer"
                    title="Remove from this playlist (keeps file in library)"
                  >
                    <span className="material-symbols-outlined text-[16px]">playlist_remove</span>
                  </button>

                  {/* 3-dot Menu */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <SongOptionsMenu track={track} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setIsDeleteModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[#181818] border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <span className="material-symbols-outlined text-[26px]">delete</span>
            </div>
            <div className="flex flex-col text-center gap-1.5">
              <h3 className="text-base font-bold text-white">Delete Local Playlist?</h3>
              <p className="text-xs text-outline leading-relaxed">
                Are you sure you want to delete <strong className="text-white">"{playlist.name}"</strong>?
              </p>
              <p className="text-[11px] text-primary/80 bg-primary/10 border border-primary/20 rounded-lg p-2 mt-1">
                Your underlying local audio files will remain safe in your library.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2 rounded-xl border border-white/10 text-outline hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  onDeletePlaylist(playlist);
                }}
                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
