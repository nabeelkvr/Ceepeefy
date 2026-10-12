"use client";

import React, { useState } from "react";

export default function AddToLocalPlaylistModal({
  isOpen,
  onClose,
  tracksToAdd = [], // Array of track objects
  playlists = [],
  onAddToPlaylist,
  onCreateNewPlaylist,
}) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen || !tracksToAdd || tracksToAdd.length === 0) return null;

  const handleConfirm = async () => {
    if (!selectedPlaylistId) return;
    const trackIds = tracksToAdd.map((t) => t.id);
    await onAddToPlaylist(selectedPlaylistId, trackIds);

    const targetPl = playlists.find((p) => p.id === selectedPlaylistId);
    setSuccessMsg(
      `Added ${tracksToAdd.length} ${
        tracksToAdd.length === 1 ? "song" : "songs"
      } to "${targetPl?.name || "Playlist"}"`
    );
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#101010] border border-[#1b1b1b] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b1b1b] bg-surface-container-high/40">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              playlist_add
            </span>
            <h2 className="text-sm font-bold text-white">Add to Local Playlist</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-outline hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          <div className="text-xs text-outline px-1">
            Adding <strong className="text-white">{tracksToAdd.length}</strong>{" "}
            {tracksToAdd.length === 1 ? "track" : "tracks"} to:
          </div>

          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-center text-emerald-400">
              <span className="material-symbols-outlined text-[36px] animate-bounce">
                check_circle
              </span>
              <span className="text-xs font-bold">{successMsg}</span>
            </div>
          ) : (
            <>
              {/* Playlists list */}
              <div className="max-h-60 overflow-y-auto no-scrollbar space-y-1.5 pr-0.5">
                {playlists.length === 0 ? (
                  <div className="py-6 text-center text-xs text-outline">
                    No local playlists yet. Create your first one below!
                  </div>
                ) : (
                  playlists.map((pl) => {
                    const isSelected = selectedPlaylistId === pl.id;
                    const songCount = Array.isArray(pl.trackIds) ? pl.trackIds.length : 0;
                    return (
                      <div
                        key={pl.id}
                        onClick={() => setSelectedPlaylistId(pl.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/15 border-primary/60 shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                            : "bg-surface-container/60 border-white/5 hover:border-white/20 hover:bg-surface-container"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={
                              pl.coverUrl ||
                              "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80"
                            }
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-white truncate">
                              {pl.name}
                            </span>
                            <span className="text-[10px] text-outline">
                              {songCount} {songCount === 1 ? "song" : "songs"}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`material-symbols-outlined text-[18px] ${
                            isSelected ? "text-primary" : "text-outline/40"
                          }`}
                        >
                          {isSelected ? "check_circle" : "radio_button_unchecked"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* + Create New Playlist Option */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateNewPlaylist();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-white/20 hover:border-primary/50 text-xs font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Create New Playlist</span>
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        {!isSuccess && (
          <div className="px-4 py-3 border-t border-white/10 bg-surface-container-high/40 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-outline hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedPlaylistId}
              className="px-4 py-1.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Add to Playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
