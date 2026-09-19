import React, { useState } from "react";
import { 
  Heart, 
  Plus, 
  LayoutGrid, 
  List, 
  Search,
  Music2,
  ListMusic
} from "lucide-react";
import { useMusic } from "../context/MusicContext";
import { MOCK_SONGS } from "../data/mockData";
import SongCard from "../components/SongCard";

export default function LibraryPage() {
  const { 
    playlists, 
    likedSongIds, 
    setActiveTab, 
    navigateToPlaylist, 
    createPlaylist 
  } = useMusic();

  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'playlists' | 'liked' | 'artists'
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [libSearch, setLibSearch] = useState("");

  const likedCount = likedSongIds.length;

  // Filtered playlists
  const filteredPlaylists = playlists.filter((pl) =>
    pl.name.toLowerCase().includes(libSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 pb-12 select-none">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Your Library</h1>
          <p className="text-xs text-neutral-400">Playlists, saved tracks, and custom collections</p>
        </div>

        <button
          onClick={createPlaylist}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black hover:bg-neutral-200 font-bold text-xs transition-colors self-start sm:self-auto shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Filter Chips & View Mode Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-[#242424]">
        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {["all", "playlists", "liked"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                activeFilter === filter
                  ? "bg-white text-black"
                  : "bg-[#242424] text-white hover:bg-[#2e2e2e]"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Search within library & Grid/List View switch */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5" />
            <input
              type="text"
              value={libSearch}
              onChange={(e) => setLibSearch(e.target.value)}
              placeholder="Filter library..."
              className="bg-[#242424] text-xs text-white rounded-full pl-8 pr-3 py-1.5 outline-none w-36 sm:w-48 placeholder:text-neutral-500"
            />
          </div>

          <div className="flex items-center bg-[#242424] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded ${viewMode === "grid" ? "bg-[#333] text-white" : "text-neutral-400"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded ${viewMode === "list" ? "bg-[#333] text-white" : "text-neutral-400"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* Liked Songs Special Tile (Shown if all or liked filter) */}
          {(activeFilter === "all" || activeFilter === "liked") && (
            <div
              onClick={() => setActiveTab("liked")}
              className="bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-600 p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform duration-200 flex flex-col justify-between aspect-square shadow-xl group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/80">
                  Collection
                </span>
                <Heart className="w-5 h-5 fill-white text-white" />
              </div>

              <div>
                <h3 className="text-xl font-black text-white">Liked Songs</h3>
                <p className="text-xs text-white/80 mt-1 font-medium">
                  {likedCount} {likedCount === 1 ? "song" : "songs"}
                </p>
              </div>
            </div>
          )}

          {/* User & Curated Playlists */}
          {activeFilter !== "liked" &&
            filteredPlaylists.map((pl) => (
              <SongCard key={pl.id} item={pl} type="playlist" />
            ))}
        </div>
      ) : (
        /* List View */
        <div className="flex flex-col gap-1 bg-[#181818]/40 rounded-xl p-2 border border-white/5">
          {/* Liked songs row */}
          {(activeFilter === "all" || activeFilter === "liked") && (
            <div
              onClick={() => setActiveTab("liked")}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white">
                  <Heart className="w-6 h-6 fill-white" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Liked Songs</h4>
                  <p className="text-xs text-neutral-400">Playlist • {likedCount} songs</p>
                </div>
              </div>
            </div>
          )}

          {activeFilter !== "liked" &&
            filteredPlaylists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => navigateToPlaylist(pl.id)}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={pl.coverUrl}
                    alt={pl.name}
                    className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-white truncate">{pl.name}</h4>
                    <p className="text-xs text-neutral-400 truncate">{pl.description}</p>
                  </div>
                </div>
                <span className="text-xs text-neutral-400 font-mono hidden sm:inline">
                  {pl.songIds.length} tracks
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
