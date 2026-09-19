"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import ProfileDropdown from "./ProfileDropdown";

export default function Header({ onToggleMobileMenu }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    searchQuery,
    setSearchQuery,
    addRecentSearch,
    user,
    setIsSettingsModalOpen,
  } = useMusic();
  const [localQuery, setLocalQuery] = useState(searchQuery || "");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const inputRef = useRef(null);
  const notificationsRef = useRef(null);

  // Close notifications on outside click
  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handleClick = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isNotificationsOpen]);

  // Keep localQuery in sync with context searchQuery (e.g. if updated from Search page)
  useEffect(() => {
    setLocalQuery(searchQuery || "");
  }, [searchQuery]);

  // Debounce syncing localQuery to MusicContext searchQuery
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [localQuery, searchQuery, setSearchQuery]);

  // Global ⌘K hotkey focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        if (pathname !== "/search") {
          router.push("/search");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setLocalQuery(val);

    // If typing from any page other than /search, navigate to /search immediately
    if (pathname !== "/search" && val.trim().length > 0) {
      router.push("/search");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (localQuery.trim()) {
        setSearchQuery(localQuery);
        addRecentSearch(localQuery.trim());
        if (pathname !== "/search") {
          router.push("/search");
        }
      }
    } else if (e.key === "Escape") {
      setLocalQuery("");
      setSearchQuery("");
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setLocalQuery("");
    setSearchQuery("");
    inputRef.current?.focus();
  };

  return (
    <header className="h-16 bg-surface-container-lowest/80 backdrop-blur-xl z-40 flex items-center justify-between px-4 md:px-8 border-b border-white/5 shadow-md flex-shrink-0">
      {/* Left: Title & Mobile menu button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden text-outline hover:text-white p-1.5 rounded-lg hover:bg-surface-container transition-colors"
          title="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2 whitespace-nowrap">
            Enjoy Music
            <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
              Studio Mode
            </span>
          </h1>
        </div>
      </div>

      {/* Middle: Search bar with shortcut & live debouncing (Hidden on /search to avoid duplicate search bars) */}
      {!pathname?.startsWith("/search") ? (
        <div className="flex-1 max-w-xl mx-3 md:mx-8">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 md:py-2 rounded-full bg-surface-container/80 border border-white/10 text-on-surface w-full shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all group">
            <button
              type="button"
              onClick={() => {
                if (localQuery.trim()) {
                  setSearchQuery(localQuery);
                  addRecentSearch(localQuery.trim(), "search");
                  if (pathname !== "/search") {
                    router.push("/search");
                  }
                }
              }}
              className="text-outline group-focus-within:text-primary transition-colors flex items-center justify-center cursor-pointer"
              title="Search"
            >
              <span className="material-symbols-outlined text-[18px]">
                search
              </span>
            </button>
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (pathname !== "/search") {
                  router.push("/search");
                }
              }}
              placeholder="Search by title, artist, or album..."
              className="bg-transparent border-none outline-none text-xs md:text-sm text-on-surface placeholder:text-outline/70 w-full"
            />
            {localQuery && (
              <button
                onClick={handleClear}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-outline hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-outline bg-surface-container-high rounded border border-white/5 select-none flex-shrink-0">
              ⌘K
            </kbd>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right: Actions and Avatar */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 relative">
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen((prev) => !prev);
              setIsProfileOpen(false);
            }}
            className="relative w-8 h-8 md:w-9 md:h-9 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors cursor-pointer"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[19px]">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_#4cd7f6]" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute top-12 right-0 w-72 sm:w-80 bg-[#11192b]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.65)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">notifications</span>
                  <span className="text-xs font-bold text-white">Notifications</span>
                </div>
                <span className="text-[10px] text-primary font-mono">3 New</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded-xl bg-surface-container/70 border border-white/5 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">graphic_eq</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">Lossless Studio Audio Active</span>
                    <span className="text-[10px] text-outline">Streaming at bit-perfect 24-bit/192kHz master quality.</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-container/70 border border-white/5 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">queue_music</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">New Curated Mixes</span>
                    <span className="text-[10px] text-outline">Ambient Cyberpunk & Nocturne Beats updated today.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Audio & App Settings */}
        <button
          type="button"
          onClick={() => {
            setIsProfileOpen(false);
            setIsNotificationsOpen(false);
            setIsSettingsModalOpen(true);
          }}
          className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors cursor-pointer"
          title="Audio & App Settings"
        >
          <span className="material-symbols-outlined text-[19px]">settings</span>
        </button>

        {/* Profile Avatar & Dropdown */}
        <div className="relative">
          <div
            onClick={() => {
              setIsNotificationsOpen(false);
              setIsProfileOpen((prev) => !prev);
            }}
            className={`w-8 h-8 md:w-9 md:h-9 rounded-full p-0.5 cursor-pointer transition-all ${
              user
                ? "bg-gradient-to-tr from-primary via-cyan-300 to-secondary shadow-[0_0_14px_rgba(76,215,246,0.45)] hover:scale-105"
                : "bg-gradient-to-tr from-primary to-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)] hover:scale-105"
            }`}
            title={user ? `Profile (${user.name})` : "Profile (New to Ceepeefy)"}
          >
            <div className="w-full h-full rounded-full bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-xs">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : user?.name ? (
                user.name[0].toUpperCase()
              ) : (
                <span className="material-symbols-outlined text-[19px]">person</span>
              )}
            </div>
          </div>

          <ProfileDropdown
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
          />
        </div>
      </div>
    </header>
  );
}
