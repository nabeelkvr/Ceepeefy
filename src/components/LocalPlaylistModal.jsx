"use client";

import React, { useState, useEffect } from "react";

const PRESET_COVERS = [
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&auto=format&fit=crop&q=80",
];

export default function LocalPlaylistModal({
  isOpen,
  onClose,
  onSave,
  playlist = null, // if editing, playlist object
  existingPlaylists = [],
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState(PRESET_COVERS[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (playlist) {
      setName(playlist.name || "");
      setDescription(playlist.description || "");
      setCoverUrl(playlist.coverUrl || PRESET_COVERS[0]);
    } else {
      setName("");
      setDescription("");
      setCoverUrl(PRESET_COVERS[Math.floor(Math.random() * PRESET_COVERS.length)]);
    }
    setError("");
  }, [playlist, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("Please enter a playlist name.");
      return;
    }

    // Check duplicate name
    const isDuplicate = existingPlaylists.some(
      (p) =>
        p.name.toLowerCase() === trimmed.toLowerCase() &&
        (!playlist || p.id !== playlist.id)
    );

    if (isDuplicate) {
      setError("A playlist with this name already exists. Please choose a different name.");
      return;
    }

    onSave({
      id: playlist?.id || `local-pl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: trimmed,
      description: description.trim(),
      coverUrl: coverUrl || PRESET_COVERS[0],
      trackIds: playlist?.trackIds || [],
      createdAt: playlist?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#181818] border border-[#282828] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#282828] bg-surface-container-high/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">
                {playlist ? "edit" : "playlist_add"}
              </span>
            </div>
            <h2 className="text-base font-bold text-white">
              {playlist ? "Edit Local Playlist" : "Create Local Playlist"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-outline hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white">Playlist Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Chill Beats, Road Trip, Gym Mix"
              maxLength={60}
              autoFocus
              className="w-full bg-surface-container-high/70 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-outline focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-outline">
              Description <span className="font-normal text-[10px]">(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give your playlist a short description..."
              rows={2}
              maxLength={200}
              className="w-full bg-surface-container-high/70 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-outline focus:outline-none focus:border-primary/60 transition-colors resize-none"
            />
          </div>

          {/* Cover Art selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-outline">Select Cover Artwork</label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COVERS.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setCoverUrl(url)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    coverUrl === url
                      ? "border-primary scale-105 shadow-[0_0_12px_rgba(76,215,246,0.5)]"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(76,215,246,0.35)] cursor-pointer"
            >
              {playlist ? "Save Changes" : "Create Playlist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
