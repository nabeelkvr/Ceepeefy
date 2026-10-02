"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMusic } from "../context/MusicContext";

/**
 * SongOptionsMenu
 * 
 * 3-Dot context menu component matching Image 5:
 * - Play next
 * - Add to queue
 * - [Divider]
 * - Add to Favorites / Remove from Favorites
 * - Add to playlist > (Submenu with custom playlists)
 * - Download to device (Offline download)
 * - (Optional) Remove from this playlist (when inside a custom playlist)
 */
export default function SongOptionsMenu({
  track,
  playlistId = null,
  buttonClassName = "",
  iconClassName = "text-[20px]",
  iconName = "more_vert",
  title = "More options",
}) {
  const {
    playNext,
    addToQueue,
    toggleLike,
    isLiked,
    customPlaylists,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    downloadTrack,
    removeOfflineTrack,
    offlineTrackIds,
    showOfflineNotice,
    createPlaylist,
  } = useMusic();

  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState("main"); // "main" | "playlists"
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, openUpwards: false });
  const [isMounted, setIsMounted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const tid = String(track?.id || track?.trackId || "");
  const liked = isLiked(tid);
  const isDownloaded = offlineTrackIds?.has(tid);

  const calculatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 250;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

    let top = openUpwards ? rect.top - menuHeight - 4 : rect.bottom + 6;
    if (top < 10) top = 10;
    if (top + menuHeight > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - menuHeight - 10);
    }
    let left = rect.right - menuWidth;
    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }

    setMenuCoords({ top, left, openUpwards });
  };

  const handleToggleMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isOpen) {
      setIsOpen(false);
      setCurrentView("main");
    } else {
      calculatePosition();
      setIsOpen(true);
      setCurrentView("main");
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setCurrentView("main");
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setCurrentView("main");
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
      setShowPlaylistSubmenu(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  const handlePlayNext = (e) => {
    e.stopPropagation();
    if (playNext && track) {
      playNext(track);
      if (showOfflineNotice) {
        showOfflineNotice(`Playing "${track.title}" next`);
      }
    }
    setIsOpen(false);
  };

  const handleAddToQueue = (e) => {
    e.stopPropagation();
    if (addToQueue && track) {
      addToQueue(track);
      if (showOfflineNotice) {
        showOfflineNotice(`Added "${track.title}" to queue`);
      }
    }
    setIsOpen(false);
  };

  const handleToggleFavorite = (e) => {
    e.stopPropagation();
    if (toggleLike && track) {
      toggleLike(track);
    }
    setIsOpen(false);
  };

  const handleAddToSpecificPlaylist = (e, targetPlaylist) => {
    e.stopPropagation();
    if (addTrackToPlaylist && track) {
      addTrackToPlaylist(targetPlaylist.id, track);
      if (showOfflineNotice) {
        showOfflineNotice(`Added to "${targetPlaylist.title || targetPlaylist.name}"`);
      }
    }
    setIsOpen(false);
    setCurrentView("main");
  };

  const handleCreateAndAddToPlaylist = (e) => {
    e.stopPropagation();
    const title = window.prompt("Enter new playlist name:");
    if (title && title.trim()) {
      const newPl = createPlaylist ? createPlaylist(title.trim()) : null;
      if (newPl && newPl.id && addTrackToPlaylist) {
        addTrackToPlaylist(newPl.id, track);
        if (showOfflineNotice) {
          showOfflineNotice(`Created playlist "${title.trim()}" and added track`);
        }
      }
    }
    setIsOpen(false);
    setCurrentView("main");
  };

  const handleToggleDownload = async (e) => {
    e.stopPropagation();
    if (isDownloading) return;

    if (isDownloaded) {
      await removeOfflineTrack(tid);
      if (showOfflineNotice) {
        showOfflineNotice(`Removed "${track.title}" from device storage`);
      }
    } else {
      setIsDownloading(true);
      if (showOfflineNotice) {
        showOfflineNotice(`Downloading "${track.title}" to device...`);
      }
      try {
        // 1. Save track to in-app offline storage (IndexedDB)
        await downloadTrack(track);

        // 2. Trigger native file download to device's downloads folder
        const params = new URLSearchParams({
          trackId: String(track.id || track.trackId || ""),
          audioUrl: track.audioUrl || "",
          title: track.title || "",
          artist: track.artist || "",
          album: track.album || "",
          year: track.year ? String(track.year) : "",
          coverUrl: track.coverUrl || track.thumbnail || track.image || "",
          quality: "premium",
        });

        const dlRes = await fetch(`/api/audio/download?${params.toString()}`);
        if (dlRes.ok) {
          const blob = await dlRes.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          const safeArtist = (track.artist || "").replace(/[\/\\?%*:|"<>]/g, "").trim();
          const safeTitle = (track.title || "Track").replace(/[\/\\?%*:|"<>]/g, "").trim();
          const ext = blob.type.includes("mp4") ? "m4a" : "mp3";
          link.download = safeArtist ? `${safeTitle} - ${safeArtist}.${ext}` : `${safeTitle}.${ext}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        } else if (track.audioUrl) {
          const link = document.createElement("a");
          link.href = track.audioUrl;
          link.download = `${track.title || "audio"}.mp3`;
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        if (showOfflineNotice) {
          showOfflineNotice(`"${track.title}" downloaded and saved to offline library`);
        }
      } catch (err) {
        console.error("Audio download error:", err);
        if (track.audioUrl) {
          window.open(track.audioUrl, "_blank");
        }
      } finally {
        setIsDownloading(false);
      }
    }
    setIsOpen(false);
  };

  const handleRemoveFromThisPlaylist = (e) => {
    e.stopPropagation();
    if (playlistId && removeTrackFromPlaylist) {
      removeTrackFromPlaylist(playlistId, tid);
      if (showOfflineNotice) {
        showOfflineNotice(`Removed "${track.title}" from playlist`);
      }
    }
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggleMenu}
        className={`p-1.5 rounded-lg text-outline hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center ${buttonClassName}`}
        title={title}
        aria-label={title}
      >
        <span className={`material-symbols-outlined ${iconClassName}`}>
          {iconName}
        </span>
      </button>

      {isOpen && isMounted && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${menuCoords.top}px`,
            left: `${menuCoords.left}px`,
            zIndex: 9999,
          }}
          className="w-56 bg-[#16171d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] py-1.5 px-1 animate-in fade-in zoom-in-95 duration-150 select-none text-sm text-neutral-200"
          onClick={(e) => e.stopPropagation()}
        >
          {currentView === "playlists" ? (
            /* Drill-down: Select Playlist View (always fully visible on screen) */
            <div className="flex flex-col py-0.5">
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 mb-1">
                <button
                  type="button"
                  onClick={() => setCurrentView("main")}
                  className="p-1 rounded-lg text-outline hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                  title="Back"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </button>
                <span className="text-xs font-bold text-white tracking-wide">
                  Add to Playlist
                </span>
              </div>

              <button
                type="button"
                onClick={handleCreateAndAddToPlaylist}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-xs text-primary hover:bg-primary/10 transition-colors font-semibold cursor-pointer mb-1"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>New Playlist</span>
              </button>

              <div className="max-h-56 overflow-y-auto no-scrollbar flex flex-col gap-0.5">
                {customPlaylists && customPlaylists.length > 0 ? (
                  customPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={(e) => handleAddToSpecificPlaylist(e, pl)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-white/10 transition-colors truncate cursor-pointer group"
                    >
                      <span className="material-symbols-outlined text-[17px] text-primary flex-shrink-0">
                        queue_music
                      </span>
                      <span className="truncate">{pl.title || pl.name || "Untitled Playlist"}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-xs text-outline italic text-center">
                    No custom playlists
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Main Menu View */
            <>
              {/* Play next */}
              <button
                type="button"
                onClick={handlePlayNext}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <span className="material-symbols-outlined text-[20px] text-neutral-400 group-hover:text-primary transition-colors">
                  playlist_play
                </span>
                <span className="font-medium text-[13px]">Play next</span>
              </button>

              {/* Add to queue */}
              <button
                type="button"
                onClick={handleAddToQueue}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <span className="material-symbols-outlined text-[20px] text-neutral-400 group-hover:text-primary transition-colors">
                  queue
                </span>
                <span className="font-medium text-[13px]">Add to queue</span>
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-white/10 mx-2" />

              {/* Add to Favorites / Liked */}
              <button
                type="button"
                onClick={handleToggleFavorite}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <span
                  className={`material-symbols-outlined text-[20px] transition-colors ${
                    liked ? "text-primary" : "text-neutral-400 group-hover:text-primary"
                  }`}
                  style={{ fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {liked ? "favorite" : "favorite_border"}
                </span>
                <span className="font-medium text-[13px]">
                  {liked ? "Remove from Favorites" : "Add to Favorites"}
                </span>
              </button>

              {/* Add to playlist button (transitions to playlist view) */}
              <button
                type="button"
                onClick={() => setCurrentView("playlists")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-neutral-400 group-hover:text-primary transition-colors">
                    playlist_add
                  </span>
                  <span className="font-medium text-[13px]">Add to playlist</span>
                </div>
                <span className="material-symbols-outlined text-[16px] text-neutral-400 group-hover:text-white transition-transform group-hover:translate-x-0.5">
                  chevron_right
                </span>
              </button>

              {/* Download to device */}
              <button
                type="button"
                onClick={handleToggleDownload}
                disabled={isDownloading}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
              >
                {isDownloading ? (
                  <div className="w-5 h-5 flex items-center justify-center">
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <span
                    className={`material-symbols-outlined text-[20px] transition-colors ${
                      isDownloaded ? "text-cyan-400" : "text-neutral-400 group-hover:text-primary"
                    }`}
                  >
                    {isDownloaded ? "download_done" : "download"}
                  </span>
                )}
                <span className="font-medium text-[13px]">
                  {isDownloading
                    ? "Downloading..."
                    : isDownloaded
                    ? "Downloaded to device"
                    : "Download to device"}
                </span>
              </button>

              {/* Optional: Remove from this playlist (if in custom playlist) */}
              {playlistId && (
                <>
                  <div className="my-1 border-t border-white/10 mx-2" />
                  <button
                    type="button"
                    onClick={handleRemoveFromThisPlaylist}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      delete_outline
                    </span>
                    <span className="font-medium text-[13px]">Remove from playlist</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
