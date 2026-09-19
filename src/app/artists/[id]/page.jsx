"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMusic } from "../../../context/MusicContext";
import {
  NOCTURNE_TRACKS,
  getArtistByIdOrSlug,
  getTracksByArtist,
} from "../../../data/nocturneData";
import { searchMusicTracks, fetchArtistImage } from "../../../services/audioService";
import DownloadButton from "../../../components/DownloadButton";

export default function ArtistPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params?.id || "artist-kendrick";
  const shouldAutoPlay = searchParams?.get("play") === "true";
  const hasAutoPlayedRef = useRef(false);

  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    toggleLike,
    isLiked,
    isShuffle,
    setIsShuffle,
    formatTime,
    addRecentSearch,
  } = useMusic();

  const [isArtistSaved, setIsArtistSaved] = useState(false);
  const [artistTracks, setArtistTracks] = useState([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  // Resolve artist by ID, slug, or synthesized profile
  const artist = getArtistByIdOrSlug(rawId) || {
    id: "artist-kendrick",
    name: "Kendrick Lamar",
    role: "Artist",
    genre: "Hip-Hop",
    followers: "42.8M",
    monthlyListeners: "68,410,200",
    avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDAoDFYuXN19sLqP_GrcesAcAuwLsE1AP14GF-sKp_jT5FXug1Vrw5EhjLnWEwRqKjEya4utnmCPI451cYilIC7N1kSIlW01XHl-sSKjsZL1oKW8yx6waaFSs8uyHVr6IVpSF3c_XlCGbrzfTWYpq81AAfs179zeSz5iEpKHH7w1va0qzxc2NU00p-odZphmeaUCzhrIzV6-NThvsQTEY_GrUiE_dj5waV_S8ah5tbNIbyrJje2e3QR",
    bio: "Pulitzer Prize-winning musical visionary bridging experimental poetry with seismic low-end frequencies."
  };

  const [artistAvatar, setArtistAvatar] = useState(artist?.avatar);

  // Fetch dynamic high-resolution profile photo
  useEffect(() => {
    let isCancelled = false;
    if (!artist?.name) return;

    const resolvePhoto = async () => {
      try {
        const photo = await fetchArtistImage(artist.name);
        if (!isCancelled && photo) {
          setArtistAvatar(photo);
        }
      } catch (err) {
        console.warn("Could not fetch artist avatar:", err);
      }
    };

    resolvePhoto();

    return () => {
      isCancelled = true;
    };
  }, [artist?.name]);

/**
 * Normalizes song title to filter out duplicate movie variants and releases
 */
function normalizeSongTitle(title) {
  if (!title) return "";
  return title
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|original|soundtrack|telugu|tamil|hindi|kannada|malayalam|version|remix|lyrical|video|audio|extended|slowed|reverb|ost|bgm)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|telugu|tamil|hindi|kannada|malayalam|remix|lyrical|version|soundtrack)[^\-]*/gi, "")
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

  // Automatically fetch live popular songs for this artist via the live search API
  useEffect(() => {
    let isCancelled = false;
    if (!artist?.name) return;

    const fetchSongs = async () => {
      setIsLoadingSongs(true);
      try {
        const liveResults = await searchMusicTracks(artist.name, { sort: "recent" });
        if (!isCancelled) {
          if (liveResults && liveResults.length > 0) {
            // 1. Sort by:
            // a) Primary artist match (tracks by this artist first)
            // b) Recency (latest release year first)
            const aName = (artist.name || "").toLowerCase();
            const sortedByRecency = [...liveResults].sort((a, b) => {
              const aMatch = a.artist?.toLowerCase().includes(aName);
              const bMatch = b.artist?.toLowerCase().includes(aName);
              if (aMatch && !bMatch) return -1;
              if (!aMatch && bMatch) return 1;

              const yearA = parseInt(a.year || "0", 10);
              const yearB = parseInt(b.year || "0", 10);
              if (yearB !== yearA) return yearB - yearA;

              return 0;
            });

            // 2. Strictly deduplicate to only keep original, unique songs (no duplicates)
            const seen = new Set();
            const uniqueTracks = [];
            for (const t of sortedByRecency) {
              const norm = normalizeSongTitle(t.title);
              if (!norm || seen.has(norm)) continue;
              seen.add(norm);
              uniqueTracks.push(t);
            }

            // Cap at 20 unique recent tracks
            const finalTracks = uniqueTracks.slice(0, 20);
            setArtistTracks(finalTracks);

            if (shouldAutoPlay && !hasAutoPlayedRef.current && finalTracks.length > 0) {
              hasAutoPlayedRef.current = true;
              playTrack(finalTracks[0], finalTracks);
            }
          } else {
            // Fallback to local catalog
            const localTracks = getTracksByArtist(artist.id);
            const resolved = localTracks.length > 0 ? localTracks : NOCTURNE_TRACKS.slice(0, 8);
            setArtistTracks(resolved.slice(0, 20));

            if (shouldAutoPlay && !hasAutoPlayedRef.current && resolved.length > 0) {
              hasAutoPlayedRef.current = true;
              playTrack(resolved[0], resolved);
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn("Failed to fetch live artist songs, using local catalog:", err);
          const localTracks = getTracksByArtist(artist.id);
          setArtistTracks((localTracks.length > 0 ? localTracks : NOCTURNE_TRACKS.slice(0, 8)).slice(0, 20));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSongs(false);
        }
      }
    };

    fetchSongs();

    return () => {
      isCancelled = true;
    };
  }, [artist?.name, artist?.id, shouldAutoPlay]);

  const displayTracks = artistTracks;

  const isCurrentArtistPlaying =
    isPlaying &&
    (currentTrack?.artist?.toLowerCase().includes(artist.name.toLowerCase()) ||
      displayTracks.some((t) => t.id === currentTrack?.id));

  const handleMasterPlay = () => {
    if (isCurrentArtistPlaying) {
      togglePlay();
    } else if (displayTracks.length > 0) {
      playTrack(displayTracks[0], displayTracks);
    }
  };

  const handleRowClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, displayTracks);
    }
  };

  const handleDownloadTrack = async (track, e) => {
    e?.stopPropagation?.();
    if (!track || downloadingId === track.id) return;
    setDownloadingId(track.id);
    try {
      const params = new URLSearchParams({
        audioUrl: track.audioUrl || "",
        title: track.title || "",
        artist: track.artist || artist.name || "",
        album: track.album || "",
        year: track.year ? String(track.year) : "",
        coverUrl: track.coverUrl || track.thumbnail || artistAvatar || "",
      });
      const res = await fetch(`/api/audio/download?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to download audio file");

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;

      const safeArtist = (track.artist || artist.name || "Unknown Artist").replace(/[\/\\?%*:|"<>]/g, "").trim();
      const safeTitle = (track.title || "Track").replace(/[\/\\?%*:|"<>]/g, "").trim();
      const filename = safeArtist && safeTitle ? `${safeArtist} - ${safeTitle}.m4a` : `${safeTitle || "audio"}.m4a`;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Error downloading track:", err);
      if (track.audioUrl) {
        const fallbackLink = document.createElement("a");
        fallbackLink.href = track.audioUrl;
        fallbackLink.download = `${track.title || "audio"}.mp4`;
        fallbackLink.target = "_blank";
        document.body.appendChild(fallbackLink);
        fallbackLink.click();
        document.body.removeChild(fallbackLink);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  // Calculate total duration
  const totalSeconds = displayTracks.reduce((acc, t) => acc + (t.duration || 210), 0);
  const totalMinutes = Math.floor(totalSeconds / 60);

  return (
    <div className="w-full flex flex-col pb-16 select-none animate-fade-in">
      {/* Dynamic Hero Banner */}
      <div className="relative w-full p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art */}
          <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 group ring-2 ring-primary/20 group-hover:ring-primary transition-all">
            <img
              src={artistAvatar || artist.avatar}
              alt={artist.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Metadata info */}
          <div className="flex flex-col gap-2.5 text-center md:text-left flex-1 min-w-0">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold tracking-wider uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Verified Artist • Studio Master
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              {artist.name}
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant line-clamp-3 max-w-2xl leading-relaxed">
              {artist.bio}
            </p>

            <div className="flex items-center justify-center md:justify-start gap-3 text-xs text-outline pt-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-white font-medium">
                <span className="material-symbols-outlined text-primary text-[15px]">graphic_eq</span>
                <span>{artist.genre || "Pop / Hip-Hop"}</span>
              </div>
              <span>•</span>
              <span>{displayTracks.length} Popular Songs</span>
              {totalMinutes > 0 && (
                <>
                  <span>•</span>
                  <span>{totalMinutes} min catalog</span>
                </>
              )}
              {artist.monthlyListeners && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline text-primary font-semibold">{artist.monthlyListeners} Monthly Listeners</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center gap-4 mt-8">
          {/* Master Play Button */}
          <button
            onClick={handleMasterPlay}
            disabled={displayTracks.length === 0}
            className="w-14 h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            title={isCurrentArtistPlaying ? "Pause audio" : `Play popular songs by ${artist.name}`}
          >
            <span className="material-symbols-outlined text-[32px]">
              {isCurrentArtistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>

          {/* Shuffle Button */}
          <button
            onClick={() => setIsShuffle((prev) => !prev)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isShuffle
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container"
            }`}
            title="Toggle Shuffle"
          >
            <span className="material-symbols-outlined text-[22px]">shuffle</span>
          </button>

          {/* Like Artist */}
          <button
            onClick={() => setIsArtistSaved((prev) => !prev)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isArtistSaved
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container"
            }`}
            title={isArtistSaved ? "Saved to Library" : "Save to Library"}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: isArtistSaved ? "'FILL' 1" : "'FILL' 0" }}
            >
              {isArtistSaved ? "favorite" : "favorite_border"}
            </span>
          </button>

          {/* Share */}
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all"
            title="Copy Artist Link"
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
          </button>
        </div>
      </div>

      {/* Popular Tracks Section */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Recent & Popular Songs</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase font-semibold">
              Recent Releases • Original Songs
            </span>
          </div>
          {isLoadingSongs && (
            <div className="flex items-center gap-2 text-xs text-primary font-mono animate-pulse">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Fetching popular tracks...</span>
            </div>
          )}
        </div>

        {/* Loading Skeletons */}
        {isLoadingSongs ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-surface-container/40 border border-white/5 animate-pulse flex items-center px-4 gap-4"
              >
                <div className="w-6 h-4 bg-white/10 rounded" />
                <div className="w-11 h-11 rounded-lg bg-white/10" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="w-1/3 h-4 bg-white/10 rounded" />
                  <div className="w-1/4 h-3 bg-white/5 rounded" />
                </div>
                <div className="w-16 h-4 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
              <span className="text-center">#</span>
              <span>Title</span>
              <span className="hidden md:block">Artist</span>
              <span className="text-right flex items-center justify-end">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
              </span>
              <span className="text-center" />
            </div>

            {/* Tracks List */}
            <div className="flex flex-col gap-1">
              {displayTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isCurrentPlaying = isCurrent && isPlaying;

                return (
                  <div
                    key={track.id || idx}
                    onClick={() => handleRowClick(track)}
                    className={`group grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-primary/15 border border-primary/40 text-primary shadow-[0_0_15px_rgba(76,215,246,0.15)]"
                        : "hover:bg-surface-container/70 hover:border-white/5 border border-transparent text-on-surface"
                    }`}
                  >
                    {/* Index / Animated Audio Wave when Playing */}
                    <div className="flex items-center justify-center w-full">
                      {isCurrentPlaying ? (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1 h-3 bg-primary rounded-full animate-pulse" />
                          <span className="w-1 h-4 bg-primary rounded-full animate-pulse delay-75" />
                          <span className="w-1 h-2 bg-primary rounded-full animate-pulse delay-150" />
                        </div>
                      ) : (
                        <>
                          <span className="group-hover:hidden text-xs font-mono text-outline">
                            {idx + 1}
                          </span>
                          <span className="material-symbols-outlined text-primary text-[20px] hidden group-hover:block">
                            play_arrow
                          </span>
                        </>
                      )}
                    </div>

                    {/* Thumbnail & Title */}
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high shadow relative">
                        <img
                          src={track.thumbnail || track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-sm font-semibold truncate transition-colors ${
                            isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                          }`}
                        >
                          {track.title}
                        </span>
                        <span className="text-xs text-on-surface-variant md:hidden truncate mt-0.5">
                          {track.artist}
                        </span>
                      </div>
                    </div>

                    {/* Artist Column */}
                    <div className="hidden md:block truncate text-xs text-on-surface-variant hover:text-white">
                      {track.artist}
                    </div>

                    {/* Duration Column */}
                    <div className="text-right text-xs font-mono text-outline">
                      {track.durationFormatted || formatTime(track.duration)}
                    </div>

                    {/* Actions: Download & Favorite Buttons */}
                    <div className="flex items-center justify-center gap-1">
                      <DownloadButton track={track} />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className={`p-1.5 rounded-full hover:bg-surface-container transition-colors ${
                          isLiked(track.id) ? "text-primary" : "text-outline hover:text-white"
                        }`}
                        title={isLiked(track.id) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {isLiked(track.id) ? "favorite" : "favorite_border"}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
