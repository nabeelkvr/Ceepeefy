"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import { usePWA } from "../context/PWAContext";

export default function Sidebar({ className = "", onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentTrack, customPlaylists, createPlaylist, deleteCustomPlaylist, user, openAuthModal, isPlaylistPinned, lyricsMode, minimizeLyricsToCard } = useMusic();
  const { isInstalled, promptInstall } = usePWA();

  const handleNavClick = () => {
    if (lyricsMode === "full") {
      minimizeLyricsToCard();
    }
    if (onClose) onClose();
  };
  const [mounted, setMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, arrowTop: 18 });
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDismissed(localStorage.getItem("ceepeefy_pwa_dismissed") === "true");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverWidth = 260;
      const popoverHeight = 230;

      // Position right to the side of the plus button
      let left = rect.right + 12;
      let top = rect.top - 12;

      if (typeof window !== "undefined") {
        if (top + popoverHeight > window.innerHeight - 20) {
          top = Math.max(10, window.innerHeight - popoverHeight - 20);
        }
        if (top < 10) top = 10;

        // In case of very narrow screens, flip to left or clamp
        if (left + popoverWidth > window.innerWidth - 10) {
          if (rect.left - popoverWidth - 12 > 10) {
            left = rect.left - popoverWidth - 12;
          } else {
            left = Math.max(10, window.innerWidth - popoverWidth - 16);
          }
        }
      }

      const buttonCenterY = rect.top + rect.height / 2;
      let arrowTop = buttonCenterY - top - 6;
      arrowTop = Math.max(12, Math.min(popoverHeight - 20, arrowTop));

      setPopoverCoords({ top, left, arrowTop });
    }
  };

  const togglePopover = () => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    if (!isPopoverOpen) {
      updateCoords();
      setNewPlaylistTitle("");
      setIsPopoverOpen(true);
    } else {
      setIsPopoverOpen(false);
    }
  };

  useEffect(() => {
    if (!isPopoverOpen) return;
    updateCoords();
    const handleReposition = () => updateCoords();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isPopoverOpen]);

  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPopoverOpen]);

  useEffect(() => {
    if (isPopoverOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPopoverOpen]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const created = createPlaylist(newPlaylistTitle);
    setNewPlaylistTitle("");
    setIsPopoverOpen(false);
    handleNavClick();
    router.push(`/playlist/${created.id}`);
  };

  const navItems = [
    { label: "Home", href: "/", icon: "home" },
    { label: "Search", href: "/search", icon: "explore" },
    { label: "Playlists", href: "/playlists", icon: "queue_music" },
    { label: "Self Mix", href: "/self-mix", icon: "equalizer" },
    { label: "Liked Songs", href: "/liked", icon: "favorite" },
    { label: "Offline Songs", href: "/offline", icon: "download_for_offline" },
  ];

  return (
    <aside
      className={`w-64 bg-surface-container-lowest/95 backdrop-blur-2xl z-50 flex flex-col justify-between ${currentTrack ? "pb-28" : "pb-6"
        } pt-5 border-r border-white/5 shadow-2xl flex-shrink-0 select-none transition-[padding] duration-300 ${className}`}
    >
      <div className="flex flex-col gap-5 overflow-hidden">
        {/* Brand Header */}
        <div className="px-6 flex items-center justify-between">
          <Link href="/" onClick={handleNavClick} className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-cyan-500 to-secondary-container flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.45)] group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-surface-container-lowest text-[22px] font-bold">
                graphic_eq
              </span>
            </div>
            <span className="font-headline-md text-[20px] font-extrabold tracking-tight text-white flex items-center gap-1.5">
              Ceepeefy
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4cd7f6]" />
            </span>
          </Link>

          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-outline hover:text-white p-1 rounded-lg"
              title="Close menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col px-3 gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                (item.href === "/playlists" && pathname.startsWith("/playlist") && !pathname.startsWith("/playlist-mix")) ||
                (item.href === "/self-mix" &&
                  (pathname.startsWith("/self-mix") || pathname.startsWith("/artists") || pathname.startsWith("/artist")));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all group font-medium text-sm ${isActive
                  ? "bg-gradient-to-r from-primary/15 to-transparent text-primary font-bold border-l-[3px] border-primary shadow-[0_0_24px_-4px_rgba(6,182,212,0.25)]"
                  : "text-on-surface-variant hover:bg-surface-container/70 hover:text-white"
                  }`}
              >
                <span
                  className={`material-symbols-outlined text-[21px] transition-colors ${isActive
                    ? "text-primary"
                    : "text-outline group-hover:text-primary"
                    }`}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="px-6">
          <div className="h-[1px] w-full bg-surface-container-high/80" />
        </div>

        {/* Collections Section */}
        <div className="flex flex-col px-3 gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center justify-between px-3 py-1.5 relative">
            <div className="flex items-center gap-2 text-on-surface/90 font-semibold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-outline text-[18px]">
                library_music
              </span>
              <span>Your Collections</span>
            </div>

            {/* Plus Button with Compact Popover positioned at the right side of plus icon */}
            <div className="relative">
              <button
                ref={buttonRef}
                type="button"
                onClick={togglePopover}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isPopoverOpen
                  ? "bg-primary text-surface-container-lowest scale-110 shadow-[0_0_12px_rgba(76,215,246,0.6)]"
                  : "hover:bg-surface-container text-outline hover:text-primary"
                  }`}
                title={isPopoverOpen ? "Close popover" : "Create new playlist"}
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isPopoverOpen ? "close" : "add"}
                </span>
              </button>

              {/* Compact Mini Popover right at the side of plus icon */}
              {mounted && isPopoverOpen && typeof document !== "undefined" && createPortal(
                <div
                  ref={popoverRef}
                  style={{
                    position: "fixed",
                    top: `${popoverCoords.top}px`,
                    left: `${popoverCoords.left}px`,
                  }}
                  className="w-64 bg-[#0d172e]/98 backdrop-blur-2xl border border-primary/40 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-3.5 z-[100] animate-in fade-in zoom-in-95 duration-200 select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Left notch arrow pointing directly left to the plus button */}
                  <div
                    className="absolute -left-1.5 w-3 h-3 bg-[#0d172e] border-b border-l border-primary/40 rotate-45 pointer-events-none"
                    style={{ top: `${popoverCoords.arrowTop}px` }}
                  />

                  <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">
                        playlist_add
                      </span>
                      New Playlist
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPopoverOpen(false)}
                      className="text-outline hover:text-white p-0.5 rounded transition-colors"
                      title="Close"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  </div>

                  {/* Creation Form */}
                  <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2.5">
                    <div>
                      <input
                        ref={inputRef}
                        type="text"
                        value={newPlaylistTitle}
                        onChange={(e) => setNewPlaylistTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setIsPopoverOpen(false);
                        }}
                        placeholder="e.g. Midnight Vibe"
                        maxLength={35}
                        className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/40 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-outline/70 outline-none transition-all"
                      />
                    </div>

                    {/* Quick suggestion vibes */}
                    <div className="flex flex-wrap gap-1">
                      {["🌙 Night", "☕ Focus", "⚡ Vibes", "🎧 Chill"].map((vibe) => (
                        <button
                          key={vibe}
                          type="button"
                          onClick={() => setNewPlaylistTitle(vibe.replace(/^[^\s]+\s*/, "") + " Mix")}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary border border-white/5 hover:border-primary/30 transition-all"
                        >
                          {vibe}
                        </button>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsPopoverOpen(false)}
                        className="px-2.5 py-1 rounded-lg text-xs text-outline hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded-lg bg-primary text-surface-container-lowest text-xs font-bold shadow-[0_0_12px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
                      >
                        <span>Create</span>
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      </button>
                    </div>
                  </form>
                </div>,
                document.body
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {/* Custom User-Created Playlists */}
            {mounted && customPlaylists && customPlaylists.length > 0 ? (
              [...customPlaylists]
                .sort((a, b) => {
                  const aPinned = isPlaylistPinned ? isPlaylistPinned(a.id) : false;
                  const bPinned = isPlaylistPinned ? isPlaylistPinned(b.id) : false;
                  if (aPinned && !bPinned) return -1;
                  if (!aPinned && bPinned) return 1;
                  return 0;
                })
                .map((pl) => {
                  const isPinned = isPlaylistPinned ? isPlaylistPinned(pl.id) : false;
                  return (
                    <Link
                      key={pl.id}
                      href={`/playlist/${pl.id}`}
                      onClick={handleNavClick}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-surface-container/70 transition-colors group cursor-pointer relative"
                    >
                      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex-shrink-0 flex items-center justify-center overflow-hidden border border-primary/30 group-hover:border-primary transition-colors shadow-sm relative">
                        <img
                          alt={pl.title}
                          src={pl.coverUrl}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                        {isPinned ? (
                          <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-primary rounded-bl flex items-center justify-center shadow-sm">
                            <span className="material-symbols-outlined text-[10px] text-surface-container-lowest rotate-45 font-bold">push_pin</span>
                          </div>
                        ) : (
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-tl bg-primary" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">
                            {pl.title}
                          </span>
                          {isPinned && (
                            <span className="material-symbols-outlined text-primary text-[13px] rotate-45 flex-shrink-0" title="Pinned to Library">
                              push_pin
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-primary font-medium truncate">
                          {pl.tracks?.length || 0} songs • You
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteCustomPlaylist(pl.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-outline hover:text-red-400 hover:bg-white/10 rounded-md transition-all flex-shrink-0"
                        title="Delete playlist"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </Link>
                  );
                })
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (lyricsMode === "full") {
                    minimizeLyricsToCard();
                  }
                  updateCoords();
                  setIsPopoverOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 150);
                }}
                className="flex flex-col items-center justify-center py-4 px-3 rounded-xl border border-dashed border-white/10 hover:border-primary/40 hover:bg-surface-container/30 transition-all text-center group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-1.5">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </div>
                <span className="text-xs font-semibold text-white/90 group-hover:text-primary transition-colors">
                  Create Playlist
                </span>
                <span className="text-[10px] text-outline mt-0.5">
                  Tap here or click + above
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Install Ceepeefy App Banner (Hidden when already installed or running in standalone PWA mode) */}
        {!isInstalled && !isDismissed && (
          <div className="relative p-3 mx-2 my-2 rounded-xl bg-gradient-to-r from-primary/10 to-cyan-500/5 border border-primary/20 flex items-center justify-between gap-2 group/install">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[19px]">install_mobile</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">Install App</p>
                <p className="text-[10px] text-on-surface-variant truncate">Offline &amp; Fullscreen</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={promptInstall}
                className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs transition-colors cursor-pointer shadow-sm"
              >
                Get
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.setItem("ceepeefy_pwa_dismissed", "true");
                  } catch (e) {}
                  setIsDismissed(true);
                }}
                className="p-1 text-outline hover:text-white rounded-full transition-colors cursor-pointer"
                title="Dismiss"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
