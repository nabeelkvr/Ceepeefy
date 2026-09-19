"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Player from "./Player";
import QueueDrawer from "./QueueDrawer";
import FullLyricsPanel from "./FullLyricsPanel";
import DeviceModal from "./DeviceModal";
import SettingsModal from "./SettingsModal";
import AuthModal from "./AuthModal";
import { useMusic } from "../context/MusicContext";

export default function AppShell({ children }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { currentTrack, lyricsMode } = useMusic();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b1326] text-on-surface font-sans overflow-hidden selection:bg-primary-container selection:text-on-primary-container">
      {/* Upper area: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <Sidebar className="hidden md:flex" />

        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity"
          />
        )}

        {/* Mobile Slide-over Sidebar */}
        <div
          className={`md:hidden fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          <Sidebar
            className="h-full w-full"
            onClose={() => setIsMobileSidebarOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-[#0b1326] via-[#0d172e] to-[#070e1e] md:my-2 md:mr-2 md:rounded-2xl overflow-hidden shadow-2xl relative border border-white/5">
          <Header onToggleMobileMenu={() => setIsMobileSidebarOpen((prev) => !prev)} />
          <main className={`flex-1 overflow-y-auto ${currentTrack ? "pb-28 md:pb-28" : "pb-8 md:pb-8"} scroll-smooth transition-[padding] duration-300`}>
            {children}
          </main>

          {/* Full-Width Lyrics View (takes width of main content area, Image 3) */}
          {lyricsMode === "full" && <FullLyricsPanel />}
        </div>

        {/* Up-Next Queue Drawer */}
        <QueueDrawer />
      </div>

      {/* Persistent Bottom Player Bar */}
      <Player />

      {/* Floating Modals */}
      <DeviceModal />
      <SettingsModal />
      <AuthModal />
    </div>
  );
}
