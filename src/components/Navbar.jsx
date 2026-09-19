import React from "react";
import { ChevronLeft, ChevronRight, Search, User, Menu, X } from "lucide-react";
import { useMusic } from "../context/MusicContext";

export default function Navbar({ onToggleMobileSidebar, isMobileSidebarOpen }) {
  const { activeTab, setActiveTab, searchQuery, setSearchQuery } = useMusic();

  return (
    <header className="h-16 px-4 md:px-8 flex items-center justify-between bg-[#121212]/90 backdrop-blur-md sticky top-0 z-20 border-b border-[#242424]/40">
      {/* Left: Navigation Buttons & Mobile Menu */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 text-spotify-subtext hover:text-white bg-[#242424] rounded-full transition-colors"
          aria-label="Toggle navigation menu"
        >
          {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* History Nav */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center transition-colors shadow-sm"
            title="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => window.history.forward()}
            className="w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center transition-colors shadow-sm opacity-60 hover:opacity-100"
            title="Go forward"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Search input in Navbar if on search page or quick search */}
        {activeTab === "search" && (
          <div className="relative flex items-center ml-2">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What do you want to play?"
              className="bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#2e2e2e] text-white text-sm rounded-full pl-10 pr-4 py-2 w-48 sm:w-72 md:w-80 outline-none border border-transparent focus:border-white/20 transition-all placeholder:text-neutral-400"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-neutral-400 hover:text-white text-xs bg-neutral-700/60 rounded-full w-4 h-4 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Quick actions and Profile */}
      <div className="flex items-center gap-3">
        {activeTab !== "search" && (
          <button
            onClick={() => setActiveTab("search")}
            className="sm:hidden p-2 text-spotify-subtext hover:text-white bg-[#242424] rounded-full"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 bg-black/60 hover:bg-black/90 p-1 pr-3 rounded-full border border-white/10 cursor-pointer transition-colors group">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-bold text-xs shadow-sm">
            <User className="w-4 h-4 text-black" />
          </div>
          <span className="text-xs font-semibold text-white group-hover:text-spotify-green transition-colors">
            Personal
          </span>
        </div>
      </div>
    </header>
  );
}
