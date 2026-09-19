"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMusic } from "../context/MusicContext";

export default function Header({ onToggleMobileMenu }) {
  const router = useRouter();
  const pathname = usePathname();
  const { searchQuery, setSearchQuery, addRecentSearch } = useMusic();
  const [localQuery, setLocalQuery] = useState(searchQuery || "");
  const inputRef = useRef(null);

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
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <button
          className="relative w-8 h-8 md:w-9 md:h-9 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[19px]">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_#4cd7f6]" />
        </button>

        <button
          className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-surface-container/80 hover:bg-surface-container-high border border-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
          title="Audio Settings"
        >
          <span className="material-symbols-outlined text-[19px]">settings</span>
        </button>

        <div
          className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-tr from-primary to-cyan-300 p-0.5 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.4)] hover:scale-105 transition-transform"
          title="Curator Profile (Raees)"
        >
          <div className="w-full h-full rounded-full bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-xs">
            <span className="material-symbols-outlined text-[19px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
}
