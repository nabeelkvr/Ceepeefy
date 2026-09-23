"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMusic } from "../context/MusicContext";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { lyricsMode, minimizeLyricsToCard } = useMusic();

  const handleNavClick = () => {
    if (lyricsMode === "full") {
      minimizeLyricsToCard();
    }
  };

  const navItems = [
    {
      label: "Home",
      href: "/",
      icon: "home",
      isActive: pathname === "/",
    },
    {
      label: "Search",
      href: "/search",
      icon: "search",
      isActive: pathname === "/search",
    },
    {
      label: "Playlists",
      href: "/playlists",
      icon: "queue_music",
      isActive:
        pathname === "/playlists" ||
        (pathname.startsWith("/playlist") && !pathname.startsWith("/playlist-mix")),
    },
    {
      label: "Self Mix",
      href: "/self-mix",
      icon: "equalizer",
      isActive:
        pathname.startsWith("/self-mix") ||
        pathname.startsWith("/artists") ||
        pathname.startsWith("/artist"),
    },
    {
      label: "Liked",
      href: "/liked",
      icon: "favorite",
      isActive: pathname === "/liked",
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 h-16 pb-safe box-content bg-[#070e1e]/98 backdrop-blur-2xl border-t border-white/10 z-40 flex items-center justify-around px-2 md:hidden select-none shadow-[0_-8px_25px_rgba(0,0,0,0.7)]"
    >
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={handleNavClick}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all group ${
            item.isActive ? "text-primary font-bold" : "text-outline hover:text-white"
          }`}
        >
          <div className="relative flex items-center justify-center">
            <span
              className={`material-symbols-outlined text-[23px] transition-transform group-active:scale-90 ${
                item.isActive ? "text-primary drop-shadow-[0_0_8px_rgba(76,215,246,0.6)]" : ""
              }`}
            >
              {item.icon}
            </span>
          </div>
          <span
            className={`text-[10px] tracking-tight mt-0.5 transition-colors ${
              item.isActive ? "text-primary font-bold" : "text-outline"
            }`}
          >
            {item.label}
          </span>
          {item.isActive && (
            <span className="w-1 h-1 bg-primary rounded-full shadow-[0_0_6px_#4cd7f6] mt-0.5" />
          )}
        </Link>
      ))}
    </nav>
  );
}
