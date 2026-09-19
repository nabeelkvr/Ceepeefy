import React, { useState, useMemo } from "react";
import { Search, Play, Pause, Music2, Disc } from "lucide-react";
import { useMusic } from "../context/MusicContext";
import { MOCK_SONGS, GENRE_CATEGORIES } from "../data/mockData";
import SongRow from "../components/SongRow";

export default function SearchPage() {
  const { searchQuery, setSearchQuery, playSong, currentSong, isPlaying, togglePlay } = useMusic();
  const [selectedGenre, setSelectedGenre] = useState("All");

  const genres = ["All", "Synthwave", "Lo-Fi", "Electronic", "Ambient", "Jazz", "Workout", "Acoustic"];

  // Filter songs based on search query and selected genre
  const filteredSongs = useMemo(() => {
    let result = MOCK_SONGS;

    if (selectedGenre !== "All") {
      result = result.filter(
        (song) => song.genre.toLowerCase() === selectedGenre.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (song) =>
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          song.album.toLowerCase().includes(q) ||
          song.genre.toLowerCase().includes(q)
      );
    }

    return result;
  }, [searchQuery, selectedGenre]);

  // Top result (first match)
  const topResult = filteredSongs.length > 0 ? filteredSongs[0] : null;
  const isTopPlaying = topResult && currentSong?.id === topResult.id && isPlaying;

  return (
    <div className="flex flex-col gap-6 pb-12 select-none">
      {/* Search Input Bar (Visible directly on page for mobile / quick access) */}
      <div className="relative flex items-center max-w-xl">
        <Search className="w-5 h-5 text-neutral-400 absolute left-4 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by songs, artists, albums, or genres..."
          className="w-full bg-[#242424] hover:bg-[#2c2c2c] focus:bg-[#323232] text-white text-sm rounded-full pl-12 pr-10 py-3 outline-none border border-transparent focus:border-spotify-green/40 transition-all placeholder:text-neutral-400 shadow-lg"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 text-neutral-400 hover:text-white text-xs bg-neutral-700/60 rounded-full w-5 h-5 flex items-center justify-center"
          >
            ✕
          </button>
        )}
      </div>

      {/* Genre Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {genres.map((genre) => (
          <button
            key={genre}
            onClick={() => setSelectedGenre(genre)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedGenre === genre
                ? "bg-white text-black shadow-md"
                : "bg-[#242424] text-white hover:bg-[#2e2e2e]"
            }`}
          >
            {genre}
          </button>
        ))}
      </div>

      {/* When actively searching or filtered */}
      {(searchQuery.trim() || selectedGenre !== "All") ? (
        <div>
          {filteredSongs.length > 0 ? (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Spotify-style "Top Result" Box on Desktop */}
              {topResult && (
                <div className="w-full lg:w-96 flex-shrink-0">
                  <h2 className="text-xl font-bold text-white mb-3">Top result</h2>
                  <div
                    onClick={() => {
                      if (isTopPlaying) {
                        togglePlay();
                      } else {
                        playSong(topResult, filteredSongs);
                      }
                    }}
                    className="bg-[#181818] hover:bg-[#282828] p-5 rounded-xl cursor-pointer group transition-all duration-300 relative shadow-xl hover:shadow-black/60 flex flex-col justify-between h-56"
                  >
                    <div>
                      <img
                        src={topResult.coverUrl}
                        alt={topResult.title}
                        className="w-24 h-24 rounded-lg object-cover shadow-lg mb-4"
                      />
                      <h3 className="text-2xl font-black text-white truncate group-hover:text-spotify-green transition-colors">
                        {topResult.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1">
                        <span className="font-semibold text-white">{topResult.artist}</span>
                        <span>•</span>
                        <span className="bg-black/50 px-2 py-0.5 rounded-full uppercase text-[10px] tracking-wider text-spotify-green font-bold">
                          {topResult.genre}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isTopPlaying) {
                          togglePlay();
                        } else {
                          playSong(topResult, filteredSongs);
                        }
                      }}
                      className="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black flex items-center justify-center shadow-2xl transition-all duration-200 transform group-hover:scale-105"
                      aria-label="Play top result"
                    >
                      {isTopPlaying ? (
                        <Pause className="w-5 h-5 fill-black" />
                      ) : (
                        <Play className="w-5 h-5 fill-black translate-x-0.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Songs List */}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white mb-3">Matching Songs</h2>
                <div className="bg-[#181818]/50 rounded-xl p-2 border border-white/5 flex flex-col">
                  {filteredSongs.map((song, idx) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      index={idx}
                      tracklist={filteredSongs}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-[#181818]/40 rounded-xl border border-white/5 my-6">
              <Disc className="w-12 h-12 text-neutral-600 animate-spin-slow" />
              <h3 className="text-lg font-bold text-white">No results found</h3>
              <p className="text-sm text-neutral-400 max-w-sm">
                Please check your spelling or try searching for another artist, song title, or genre tag.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Browse All Categories Grid */
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-white">Browse All Genres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {GENRE_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                onClick={() => {
                  setSelectedGenre(cat.name.split(" ")[0]);
                }}
                className={`${cat.color} aspect-video sm:aspect-square rounded-xl p-4 cursor-pointer relative overflow-hidden transition-transform duration-200 hover:scale-[1.02] shadow-lg group select-none`}
              >
                <h3 className="text-white font-extrabold text-lg md:text-xl leading-tight drop-shadow">
                  {cat.name}
                </h3>
                <div className="absolute -bottom-2 -right-2 w-16 h-16 sm:w-20 sm:h-20 bg-black/20 rounded-full flex items-center justify-center transform rotate-12 group-hover:rotate-0 transition-transform duration-300">
                  <Music2 className="w-8 h-8 text-white/80" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
