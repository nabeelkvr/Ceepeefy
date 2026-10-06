"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import { usePWA } from "../context/PWAContext";
import PlaylistCover from "./PlaylistCover";

export default function Sidebar({ className = "", onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentTrack,
    customPlaylists,
    createPlaylist,
    deleteCustomPlaylist,
    user,
    openAuthModal,
    isPlaylistPinned,
    lyricsMode,
    minimizeLyricsToCard,
  } = useMusic();
  const { isInstalled, promptInstall } = usePWA();

  const isMobile = Boolean(onClose);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, arrowTop: 18 });
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const inputRef = useRef(null);

  // Expanded if mobile drawer or desktop hover
  const isExpanded = isMobile || isHovered;

  const handleNavClick = () => {
    if (lyricsMode === "full") {
      minimizeLyricsToCard();
    }
    if (onClose) onClose();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDismissed(localStorage.getItem("ceepeefy_pwa_dismissed") === "true");
    }
    setMounted(true);
  }, []);

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverWidth = 260;
      const popoverHeight = 230;

      let left = rect.right + 12;
      let top = rect.top - 12;

      if (typeof window !== "undefined") {
        if (top + popoverHeight > window.innerHeight - 20) {
          top = Math.max(10, window.innerHeight - popoverHeight - 20);
        }
        if (top < 10) top = 10;

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

  const togglePopover = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
    { label: "Music Player", href: "/music-player", icon: "music_note" },
  ];

  // Colors for playlist thumbnails fallback
  const playlistGradients = [
    "from-indigo-600/80 to-purple-800/80",
    "from-teal-600/80 to-emerald-800/80",
    "from-cyan-600/80 to-blue-800/80",
    "from-amber-600/80 to-rose-800/80",
    "from-violet-600/80 to-fuchsia-800/80",
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between overflow-hidden">
      <div className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
        {/* Brand Header */}
        <div
          className={`h-14 flex items-center ${
            isExpanded ? "px-4 justify-between" : "justify-center w-full px-0"
          } transition-all duration-200 flex-shrink-0`}
        >
          <Link
            href="/"
            onClick={handleNavClick}
            className={`flex items-center group select-none ${
              isExpanded ? "gap-3 min-w-0" : "justify-center w-11 h-11 mx-auto"
            }`}
            title="Ceepeefy"
          >
            {/* Logo Icon Container matching Image 2 & 3 */}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-indigo-500/20 border border-primary/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(76,215,246,0.3)] group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(76,215,246,0.5)] transition-all mx-auto">
              <img
                src="/logo.png"
                alt="Ceepeefy"
                className="w-6 h-6 object-contain filter drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]"
              />
            </div>

            {/* Brand Text (shown when expanded) */}
            {isExpanded && (
              <div className="flex items-center gap-1.5 transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]">
                <span className="font-headline-md text-[20px] font-extrabold tracking-tight text-white whitespace-nowrap">
                  Ceepeefy
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4cd7f6] flex-shrink-0" />
              </div>
            )}
          </Link>

          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-outline hover:text-white p-1 rounded-lg transition-colors"
              title="Close menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav
          className={`flex flex-col gap-1.5 flex-shrink-0 transition-all duration-200 ${
            isExpanded ? "px-3" : "px-2.5 items-center"
          }`}
        >
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  (item.href === "/playlists" &&
                    pathname.startsWith("/playlist") &&
                    !pathname.startsWith("/playlist-mix")) ||
                  (item.href === "/self-mix" &&
                    (pathname.startsWith("/self-mix") ||
                      pathname.startsWith("/artists") ||
                      pathname.startsWith("/artist"))) ||
                  (item.href === "/music-player" && pathname.startsWith("/music-player"));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                title={!isExpanded ? item.label : undefined}
                className={`relative flex items-center rounded-2xl transition-all duration-200 group select-none ${
                  isExpanded ? "w-full h-11 px-3.5 gap-3.5" : "w-11 h-11 justify-center"
                } ${
                  isActive
                    ? "bg-[#1d233d] text-primary font-semibold border border-primary/30 shadow-[0_0_18px_rgba(76,215,246,0.22)]"
                    : "text-on-surface-variant hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5"
                }`}
              >
                {/* Active left indicator glow pill on expanded state */}
                {isActive && isExpanded && (
                  <span className="absolute -left-3 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_10px_#4cd7f6]" />
                )}

                {/* Nav Icon */}
                <span
                  className={`material-symbols-outlined text-[22px] flex-shrink-0 transition-all duration-200 ${
                    isActive
                      ? "text-primary drop-shadow-[0_0_6px_rgba(76,215,246,0.6)]"
                      : "text-outline group-hover:text-white group-hover:scale-105"
                  }`}
                >
                  {item.icon}
                </span>

                {/* Nav Label */}
                <span
                  className={`text-sm font-medium tracking-tight whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded
                      ? "opacity-100 translate-x-0 block flex-1 truncate"
                      : "opacity-0 -translate-x-2 hidden pointer-events-none w-0"
                  } ${isActive ? "text-white font-semibold" : "text-neutral-300 group-hover:text-white"}`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Subtle Divider */}
        <div className={`transition-all duration-200 ${isExpanded ? "px-5" : "px-3"}`}>
          <div className="h-[1px] w-full bg-white/[0.08]" />
        </div>

        {/* Collections / Playlists Section */}
        <div
          className={`flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar transition-all duration-200 ${
            isExpanded ? "px-3 gap-2" : "px-2.5 items-center gap-2"
          }`}
        >
          {/* Section Header (Expanded) or Compact Divider (Collapsed) */}
          {isExpanded ? (
            <div className="flex items-center justify-between px-2 py-1 select-none flex-shrink-0">
              <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
                Your playlists
              </span>

              {/* Plus Button with Compact Popover */}
              <div className="relative">
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={togglePopover}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                    isPopoverOpen
                      ? "bg-primary text-surface-container-lowest scale-110 shadow-[0_0_12px_rgba(76,215,246,0.6)]"
                      : "hover:bg-white/10 text-outline hover:text-primary"
                  }`}
                  title={isPopoverOpen ? "Close popover" : "Create new playlist"}
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {isPopoverOpen ? "close" : "add"}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={togglePopover}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-primary/20 text-outline hover:text-primary border border-white/5 hover:border-primary/30 flex items-center justify-center transition-all flex-shrink-0 my-0.5"
              title="Create new playlist"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
            </button>
          )}

          {/* Popover Portal */}
          {mounted &&
            isPopoverOpen &&
            typeof document !== "undefined" &&
            createPortal(
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
                <div className="absolute -left-1.5 w-3 h-3 bg-[#0d172e] border-b border-l border-primary/40 rotate-45 pointer-events-none"
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

          {/* Playlists List */}
          <div className="flex flex-col gap-1.5 w-full">
            {mounted && customPlaylists && customPlaylists.length > 0 ? (
              [...customPlaylists]
                .sort((a, b) => {
                  const aPinned = isPlaylistPinned ? isPlaylistPinned(a.id) : false;
                  const bPinned = isPlaylistPinned ? isPlaylistPinned(b.id) : false;
                  if (aPinned && !bPinned) return -1;
                  if (!aPinned && bPinned) return 1;
                  return 0;
                })
                .map((pl, idx) => {
                  const isPinned = isPlaylistPinned ? isPlaylistPinned(pl.id) : false;
                  const gradientClass = playlistGradients[idx % playlistGradients.length];

                  return (
                    <Link
                      key={pl.id}
                      href={`/playlist/${pl.id}`}
                      onClick={handleNavClick}
                      title={!isExpanded ? pl.title : undefined}
                      className={`flex items-center rounded-2xl hover:bg-white/[0.06] transition-all group cursor-pointer relative select-none ${
                        isExpanded ? "p-2 gap-3" : "w-11 h-11 justify-center mx-auto"
                      }`}
                    >
                      {/* Playlist Artwork / Square with border radius and no stroke (Image 1) */}
                      <div className="w-10 h-10 aspect-square rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border-0 outline-none group-hover:scale-105 transition-all shadow-md relative bg-surface-container-high">
                        <PlaylistCover
                          tracks={pl.tracks || []}
                          fallbackUrl={pl.coverUrl || pl.image}
                          alt={pl.title}
                          className="w-full h-full object-cover rounded-xl"
                        />

                        {isPinned && (
                          <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-primary rounded-bl-md flex items-center justify-center shadow-sm z-10">
                            <span className="material-symbols-outlined text-[9px] text-surface-container-lowest rotate-45 font-bold">
                              push_pin
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Playlist Name & Track Count (shown when expanded) */}
                      {isExpanded && (
                        <div className="flex flex-col min-w-0 flex-1 transition-opacity duration-200">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-white truncate group-hover:text-primary transition-colors">
                              {pl.title}
                            </span>
                            {isPinned && (
                              <span
                                className="material-symbols-outlined text-primary text-[12px] rotate-45 flex-shrink-0"
                                title="Pinned to Library"
                              >
                                push_pin
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-outline truncate mt-0.5">
                            {pl.tracks?.length || 0} songs
                          </span>
                        </div>
                      )}

                      {/* Delete Playlist Button (expanded hover) */}
                      {isExpanded && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteCustomPlaylist(pl.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-outline hover:text-red-400 hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
                          title="Delete playlist"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      )}
                    </Link>
                  );
                })
            ) : isExpanded ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (lyricsMode === "full") minimizeLyricsToCard();
                  updateCoords();
                  setIsPopoverOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 150);
                }}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl border border-dashed border-white/10 hover:border-primary/40 hover:bg-white/[0.03] transition-all text-center group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-1">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </div>
                <span className="text-[11px] font-semibold text-white/90 group-hover:text-primary transition-colors">
                  Create Playlist
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Install Ceepeefy App Card / Icon matching Image 2 & 3 */}
      {!isInstalled && !isDismissed && (
        <div
          className={`flex-shrink-0 transition-all duration-250 ${
            isExpanded ? "p-3 mx-2 my-2" : "py-2 px-2.5 flex justify-center"
          }`}
        >
          {isExpanded ? (
            <div className="p-3 rounded-2xl bg-[#10172a]/90 backdrop-blur-xl border border-white/10 flex items-center justify-between gap-2 shadow-lg group/install select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">install_mobile</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Install app</p>
                  <p className="text-[10px] text-on-surface-variant truncate">Offline and fullscreen</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={promptInstall}
                  className="px-3 py-1 rounded-xl bg-[#6f7bf7] hover:bg-[#818cf8] text-white font-bold text-xs transition-all shadow-[0_0_12px_rgba(111,123,247,0.4)] hover:brightness-110 active:scale-95 cursor-pointer"
                >
                  Get
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem("ceepeefy_pwa_dismissed", "true");
                    } catch (e) {}
                    setIsDismissed(true);
                  }}
                  className="p-1 text-outline hover:text-white rounded-full transition-colors cursor-pointer"
                  title="Dismiss"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={promptInstall}
              className="w-10 h-10 rounded-2xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary flex items-center justify-center transition-all shadow-sm hover:scale-105"
              title="Install Ceepeefy App"
            >
              <span className="material-symbols-outlined text-[20px]">install_mobile</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  // If rendered as mobile slide-over sidebar drawer
  if (isMobile) {
    return (
      <aside
        className={`w-72 bg-[#080d1a]/98 backdrop-blur-3xl z-50 flex flex-col justify-between ${
          currentTrack ? "pb-28" : "pb-6"
        } pt-4 border-r border-white/10 shadow-2xl flex-shrink-0 select-none ${className}`}
      >
        {sidebarContent}
      </aside>
    );
  }

  // Desktop Floating/Overlay Collapsible Sidebar
  return (
    <div
      className={`hidden md:block w-[72px] flex-shrink-0 relative z-50 ${className}`}
    >
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`absolute inset-y-0 left-0 z-50 flex flex-col justify-between ${
          currentTrack ? "pb-28" : "pb-5"
        } pt-4 bg-[#080d1a]/96 backdrop-blur-3xl border-r border-white/[0.08] select-none transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isHovered
            ? "w-[248px] shadow-[0_20px_50px_rgba(0,0,0,0.85)] border-r-white/20"
            : "w-[72px] shadow-lg"
        }`}
        style={{
          fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
        }}
      >
        {sidebarContent}
      </aside>
    </div>
  );
}

