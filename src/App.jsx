import React, { useState } from "react";
import { MusicProvider, useMusic } from "./context/MusicContext";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Player from "./components/Player";
import QueueDrawer from "./components/QueueDrawer";
import MobileNav from "./components/MobileNav";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import LibraryPage from "./pages/LibraryPage";
import PlaylistPage from "./pages/PlaylistPage";

function AppContent() {
  const { activeTab, selectedPlaylistId } = useMusic();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Render active page based on navigation state
  const renderActivePage = () => {
    switch (activeTab) {
      case "home":
        return <HomePage />;
      case "search":
        return <SearchPage />;
      case "library":
        return <LibraryPage />;
      case "liked":
        return <PlaylistPage playlistId="liked" />;
      case "playlist":
        return <PlaylistPage playlistId={selectedPlaylistId} />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-white font-sans overflow-hidden">
      {/* Upper Area: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <Sidebar className="hidden md:flex" />

        {/* Mobile Slide-over Sidebar Backdrop */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity"
          />
        )}

        {/* Mobile Slide-over Sidebar */}
        <div
          className={`md:hidden fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 ease-in-out ${
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            className="h-full w-full"
            onClose={() => setIsMobileSidebarOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#121212] md:my-2 md:mr-2 md:rounded-xl overflow-hidden shadow-2xl relative">
          <Navbar
            onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
            isMobileSidebarOpen={isMobileSidebarOpen}
          />

          {/* Scrollable View Container */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-28 md:pb-24 scroll-smooth">
            {renderActivePage()}
          </div>
        </main>

        {/* Up-Next Playback Queue Drawer */}
        <QueueDrawer />
      </div>

      {/* Mobile Bottom Navigation (above player) */}
      <MobileNav />

      {/* Persistent Bottom Music Player */}
      <Player />
    </div>
  );
}

export default function App() {
  return (
    <MusicProvider>
      <AppContent />
    </MusicProvider>
  );
}
