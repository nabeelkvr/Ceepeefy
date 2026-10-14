"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import { usePWA } from "../context/PWAContext";
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
  const { isInstalled, promptInstall } = usePWA();
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

  // Debounce syncing localQuery to MusicContext searchQuery (only when NOT on /search)
  useEffect(() => {
    if (pathname?.startsWith("/search")) return;
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [localQuery, searchQuery, setSearchQuery, pathname]);

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
    <header className="h-16 2xl:h-20 bg-[#020202] z-40 flex items-center justify-between px-4 md:px-8 2xl:px-12 border-b border-[#141414] shadow-sm flex-shrink-0">
      {/* Left: Title & Mobile menu button */}
      <div className="flex items-center gap-2.5 sm:gap-3 2xl:gap-4">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden text-[#B3B3B3] hover:text-white p-1 rounded-lg hover:bg-[#181818] transition-colors"
          title="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        {/* Mobile Brand Identity matching Image 1 & 2 */}
        <div className="flex md:hidden items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
            <img
              src="/logo.png"
              alt="Ceepeefy"
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
            />
          </div>
          <span className="font-extrabold text-[17px] tracking-tight text-white flex items-center gap-1.5">
            Ceepeefy
          </span>
        </div>

        {/* Desktop Brand Identity */}
        <div className="hidden md:flex items-center gap-2">
          <h1 className="text-base md:text-lg 2xl:text-xl font-bold text-white tracking-tight flex items-center gap-2 whitespace-nowrap">
            Enjoy Music
            <span className="text-[10px] md:text-xs 2xl:text-sm px-2 2xl:px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
              Studio Mode
            </span>
          </h1>
        </div>
      </div>

      {/* Middle: Search bar with shortcut & live debouncing (Hidden on mobile and on /search) */}
      {!pathname?.startsWith("/search") ? (
        <div className="hidden md:flex flex-1 max-w-xl 2xl:max-w-2xl 3xl:max-w-3xl mx-3 md:mx-8 2xl:mx-12">
          <div className="flex items-center gap-2.5 2xl:gap-3 px-3.5 2xl:px-4 py-1.5 md:py-2 2xl:py-2.5 rounded-full bg-[#181818] hover:bg-[#242424] focus-within:bg-[#242424] border border-[#292929] text-white w-full transition-all group">
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
              className="text-[#B3B3B3] group-hover:text-white group-focus-within:text-white transition-colors flex items-center justify-center cursor-pointer"
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
              className="bg-transparent border-none outline-none text-xs md:text-sm 2xl:text-base text-white placeholder:text-[#8A8A8A] w-full"
            />
            {localQuery && (
              <button
                onClick={handleClear}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-[#8A8A8A] hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-[#8A8A8A] bg-[#242424] rounded border border-[#282828] select-none flex-shrink-0">
              ⌘K
            </kbd>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right: Actions and Avatar */}
      <div className="flex items-center gap-2 md:gap-3 2xl:gap-4 flex-shrink-0 relative">
        {/* Mobile Quick Search Button */}
        {pathname !== "/search" && (
          <Link
            href="/search"
            className="md:hidden w-8 h-8 rounded-full bg-[#181818] hover:bg-[#242424] border border-[#282828] flex items-center justify-center text-[#B3B3B3] hover:text-white transition-colors"
            title="Search"
          >
            <span className="material-symbols-outlined text-[19px]">search</span>
          </Link>
        )}
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen((prev) => !prev);
              setIsProfileOpen(false);
            }}
            className="relative w-8 h-8 md:w-9 md:h-9 2xl:w-10 2xl:h-10 rounded-full bg-[#181818] hover:bg-[#242424] border border-[#282828] flex items-center justify-center text-[#B3B3B3] hover:text-white transition-colors cursor-pointer"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[19px] 2xl:text-[21px]">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute top-12 right-0 w-72 sm:w-80 bg-[#181818] border border-[#282828] rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#282828]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">notifications</span>
                  <span className="text-xs font-bold text-white">Notifications</span>
                </div>
                <span className="text-[10px] text-primary font-mono">3 New</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded-xl bg-[#242424] border border-[#282828] flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">graphic_eq</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">Lossless Studio Audio Active</span>
                    <span className="text-[10px] text-[#8A8A8A]">Streaming at bit-perfect 24-bit/192kHz master quality.</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#242424] border border-[#282828] flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">queue_music</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">New Curated Mixes</span>
                    <span className="text-[10px] text-[#8A8A8A]">Ambient Cyberpunk & Nocturne Beats updated today.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Install PWA Button (Hidden when running in standalone mode) */}
        {!isInstalled && (
          <button
            type="button"
            onClick={promptInstall}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#181818] hover:bg-[#242424] border border-[#282828] text-primary text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
            title="Install Ceepeefy App"
          >
            <span className="material-symbols-outlined text-[17px]">download</span>
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}

        {/* Audio & App Settings */}
        <button
          type="button"
          onClick={() => {
            setIsProfileOpen(false);
            setIsNotificationsOpen(false);
            setIsSettingsModalOpen(true);
          }}
          className="w-8 h-8 md:w-9 md:h-9 2xl:w-10 2xl:h-10 rounded-full bg-[#181818] hover:bg-[#242424] border border-[#282828] flex items-center justify-center text-[#B3B3B3] hover:text-white transition-colors cursor-pointer"
          title="Audio & App Settings"
        >
          <span className="material-symbols-outlined text-[19px] 2xl:text-[21px]">settings</span>
        </button>

        {/* Profile Avatar & Dropdown */}
        <div className="relative">
          <div
            onClick={() => {
              setIsNotificationsOpen(false);
              setIsProfileOpen((prev) => !prev);
            }}
            className={`w-8 h-8 md:w-9 md:h-9 2xl:w-10 2xl:h-10 rounded-full p-0.5 cursor-pointer transition-all ${user
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
