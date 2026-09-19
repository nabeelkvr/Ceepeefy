"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../context/MusicContext";
import { formatPlaylistDuration } from "../../utils/playlistUtils";
import DownloadButton from "../../components/DownloadButton";
import {
  saveLocalAudioFile,
  getAudioFileDuration,
  formatFileSize,
} from "../../services/localAudioStorage";

function SelfMixContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeParamId = searchParams.get("id");

  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    toggleLike,
    isLiked,
    formatTime,
    selfMixes,
    createSelfMix,
    deleteSelfMix,
    addLocalTracksToSelfMix,
    removeTrackFromPlaylist,
  } = useMusic();

  const [selectedMixId, setSelectedMixId] = useState(activeParamId || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSavingMix, setIsSavingMix] = useState(false);
  const fileInputRef = useRef(null);
  const detailFileInputRef = useRef(null);

  // Sync selectedMixId with searchParams
  useEffect(() => {
    setSelectedMixId(activeParamId || null);
  }, [activeParamId]);

  const activeMix = selectedMixId
    ? (selfMixes || []).find((m) => String(m.id) === String(selectedMixId))
    : null;

  const filteredMixes = (selfMixes || []).filter((mix) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      mix.title?.toLowerCase().includes(q) ||
      mix.description?.toLowerCase().includes(q) ||
      mix.curator?.toLowerCase().includes(q)
    );
  });

  const handleFilesSelected = async (filesList) => {
    if (!filesList || filesList.length === 0) return;
    setIsProcessingFiles(true);

    const newEntries = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const isAudio =
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a|aac|flac|ogg|wma|opus)$/i.test(file.name);
      if (!isAudio) continue;

      const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_]+/g, " ");
      const durationSecs = await getAudioFileDuration(file);

      const mins = Math.floor(durationSecs / 60);
      const secs = durationSecs % 60;
      const formattedDuration = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

      newEntries.push({
        id: `pending-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
        file,
        title: cleanTitle,
        size: file.size,
        sizeStr: formatFileSize(file.size),
        duration: durationSecs,
        durationFormatted: formattedDuration,
      });
    }

    setPendingFiles((prev) => [...prev, ...newEntries]);
    setIsProcessingFiles(false);

    if (!newTitle && newEntries.length > 0) {
      setNewTitle(newEntries[0].title);
    }
  };

  const removePendingFile = (id) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleCreateSubmit = async (e) => {
    e?.preventDefault();
    if (isSavingMix) return;

    setIsSavingMix(true);

    try {
      const initialTracks = [];

      for (let i = 0; i < pendingFiles.length; i++) {
        const item = pendingFiles[i];
        const trackId = `local-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;

        await saveLocalAudioFile(trackId, item.file, {
          fileName: item.file.name,
          fileType: item.file.type || "audio/mpeg",
          fileSize: item.file.size,
        });

        initialTracks.push({
          id: trackId,
          title: item.title,
          artist: "Self Mix Upload",
          album: newTitle?.trim() || "Personal Self Mix",
          duration: item.duration || 180,
          durationFormatted: item.durationFormatted || "3:00",
          coverUrl:
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
          isLocal: true,
          source: "local-upload",
          fileName: item.file.name,
          fileSize: item.file.size,
          badge: "Self Mix",
          badgeType: "cyan",
        });
      }

      const created = createSelfMix(newTitle, initialTracks);
      setNewTitle("");
      setPendingFiles([]);
      setShowCreateModal(false);

      if (created?.id) {
        setSelectedMixId(created.id);
        router.push(`/self-mix?id=${created.id}`);
      }
    } catch (err) {
      console.error("Failed to create self mix with audio tracks:", err);
    } finally {
      setIsSavingMix(false);
    }
  };

  const handleAddTracksToActiveMix = async (filesList) => {
    if (!filesList || filesList.length === 0 || !activeMix) return;
    setIsProcessingFiles(true);

    try {
      const newEntries = [];
      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const isAudio =
          file.type.startsWith("audio/") ||
          /\.(mp3|wav|m4a|aac|flac|ogg|wma|opus)$/i.test(file.name);
        if (!isAudio) continue;

        const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_]+/g, " ");
        const durationSecs = await getAudioFileDuration(file);
        const mins = Math.floor(durationSecs / 60);
        const secs = durationSecs % 60;
        const formattedDuration = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
        const trackId = `local-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;

        await saveLocalAudioFile(trackId, file, {
          fileName: file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: file.size,
        });

        newEntries.push({
          id: trackId,
          title: cleanTitle,
          artist: "Self Mix Upload",
          album: activeMix.title,
          duration: durationSecs,
          durationFormatted: formattedDuration,
          coverUrl:
            activeMix.coverUrl ||
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
          isLocal: true,
          source: "local-upload",
          fileName: file.name,
          fileSize: file.size,
          badge: "Self Mix",
          badgeType: "cyan",
        });
      }

      if (newEntries.length > 0) {
        addLocalTracksToSelfMix(activeMix.id, newEntries);
      }
    } catch (err) {
      console.error("Failed to add tracks to self mix:", err);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleMixPlay = (mix, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const tracks = mix.tracks || [];
    if (tracks.length === 0) {
      setSelectedMixId(mix.id);
      router.push(`/self-mix?id=${mix.id}`);
      return;
    }
    const isThisPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
    if (isThisPlaying) {
      togglePlay();
    } else {
      playTrack(tracks[0], tracks);
    }
  };

  const handleMixCardClick = (mix) => {
    setSelectedMixId(mix.id);
    router.push(`/self-mix?id=${mix.id}`);
  };

  // -------------------------------------------------------------
  // VIEW 1: Detail View when a Self Mix is opened inside Self Mix section
  // -------------------------------------------------------------
  if (activeMix) {
    const tracks = activeMix.tracks || [];
    const isThisMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
    const totalDurationStr = formatPlaylistDuration(tracks);

    return (
      <div className="w-full px-4 md:px-8 py-6 flex flex-col gap-6 select-none animate-fade-in">
        {/* Back to All Self Mixes Button */}
        <button
          type="button"
          onClick={() => {
            setSelectedMixId(null);
            router.push("/self-mix");
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container/70 hover:bg-surface-container-high border border-white/10 hover:border-primary/40 text-xs font-semibold text-white/90 hover:text-white transition-all cursor-pointer shadow-md self-start group"
        >
          <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span>Back to Self Mixes</span>
        </button>

        {/* Hero Section */}
        <div className="flex flex-col md:flex-row items-start md:items-end gap-6 p-6 rounded-2xl glass-card border border-white/10 bg-gradient-to-br from-cyan-950/40 via-surface-container/80 to-surface-container/40">
          {/* Cover Art with Play Button */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden bg-surface-container-highest shadow-2xl flex-shrink-0 border border-white/10 group">
            <img
              src={activeMix.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"}
              alt={activeMix.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleMixPlay(activeMix, e)}
                className="w-14 h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.85)] hover:scale-105 transition-transform cursor-pointer"
                title={isThisMixPlaying ? "Pause Mix" : "Play Mix"}
              >
                <span className="material-symbols-outlined text-[32px]">
                  {isThisMixPlaying ? "pause" : "play_arrow"}
                </span>
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-1 rounded-md backdrop-blur-md border bg-cyan-950/90 text-cyan-300 border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.3)] flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">equalizer</span>
                SELF MIX
              </span>
              <span className="text-xs text-outline font-mono">
                Local Device Isolated
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight break-words">
              {activeMix.title}
            </h1>

            <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl">
              {activeMix.description || `Custom self mix by ${activeMix.curator || "You"}`}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-outline pt-1">
              <span className="flex items-center gap-1.5 text-primary font-bold">
                <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
              </span>
              <span>•</span>
              <span className="font-mono flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                {totalDurationStr}
              </span>
              <span>•</span>
              <span className="font-mono text-cyan-300">Lossless Local</span>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-3">
              {/* Play All Button */}
              <button
                type="button"
                onClick={(e) => handleMixPlay(activeMix, e)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_16px_rgba(76,215,246,0.5)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isThisMixPlaying ? "pause" : "play_arrow"}
                </span>
                <span>{isThisMixPlaying ? "Pause Mix" : "Play Mix"}</span>
              </button>

              {/* Upload More Tracks Button */}
              <input
                ref={detailFileInputRef}
                type="file"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleAddTracksToActiveMix(e.target.files);
                  }
                }}
              />
              <button
                type="button"
                disabled={isProcessingFiles}
                onClick={() => detailFileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/50 text-cyan-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                title="Add more audio files to this mix"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isProcessingFiles ? "progress_activity" : "upload_file"}
                </span>
                <span>{isProcessingFiles ? "Adding..." : "Add Audio Files"}</span>
              </button>

              {/* Delete Mix Button */}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${activeMix.title}"?`)) {
                    deleteSelfMix(activeMix.id);
                    setSelectedMixId(null);
                    router.push("/self-mix");
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 text-xs font-bold transition-all shadow-sm active:scale-95 ml-auto cursor-pointer"
                title="Delete this Self Mix"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span>Delete Mix</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tracklist Table */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
            <span className="text-center">#</span>
            <span>Title</span>
            <span className="hidden md:block">Artist</span>
            <span className="text-right flex items-center justify-end">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
            </span>
            <span className="text-center" />
          </div>

          {tracks.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) {
                  handleAddTracksToActiveMix(e.dataTransfer.files);
                }
              }}
              className={`p-10 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-white/15 bg-surface-container/30 hover:border-primary/50"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[26px]">upload_file</span>
              </div>
              <h3 className="text-sm font-bold text-white">
                This Self Mix is empty
              </h3>
              <p className="text-xs text-outline max-w-sm">
                Drag and drop audio files (.mp3, .wav, .m4a, .flac) here, or click below to upload.
              </p>
              <button
                type="button"
                onClick={() => detailFileInputRef.current?.click()}
                className="mt-2 px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                Browse Audio Files
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isCurrentPlaying = isCurrent && isPlaying;

                return (
                  <div
                    key={track.id || idx}
                    onClick={() => playTrack(track, tracks)}
                    className={`group grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer border ${
                      isCurrent
                        ? "bg-white/10 border-primary/30"
                        : "hover:bg-white/5 border-transparent hover:border-white/5"
                    }`}
                  >
                    {/* # Index / Visualizer */}
                    <div className="text-center flex items-center justify-center">
                      {isCurrentPlaying ? (
                        <div className="flex items-end gap-[2px] h-3">
                          <span className="w-0.5 bg-primary animate-pulse rounded-full h-full" />
                          <span className="w-0.5 bg-primary animate-pulse rounded-full h-2/3 delay-75" />
                          <span className="w-0.5 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
                        </div>
                      ) : (
                        <>
                          <span className="text-xs text-outline group-hover:hidden">
                            {idx + 1}
                          </span>
                          <span className="material-symbols-outlined text-primary text-[18px] hidden group-hover:block">
                            play_arrow
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title + Thumbnail */}
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high border border-white/5 shadow-inner">
                        <img
                          src={track.coverUrl || track.thumbnail || activeMix.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-xs sm:text-sm font-bold truncate ${
                            isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                          }`}
                        >
                          {track.title}
                        </span>
                        <span className="text-[11px] text-on-surface-variant truncate md:hidden">
                          {track.artist || "Self Mix"}
                        </span>
                      </div>
                    </div>

                    {/* Artist */}
                    <div className="hidden md:flex items-center min-w-0 pr-2">
                      <span className="text-xs text-on-surface-variant truncate">
                        {track.artist || "Self Mix"}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="text-right font-mono text-xs text-outline">
                      {track.durationFormatted || formatTime(track.duration || 180)}
                    </div>

                    {/* Action buttons (Download, Like, Remove) */}
                    <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
                      <DownloadButton track={track} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          isLiked(track.id)
                            ? "text-primary"
                            : "text-outline hover:text-white"
                        }`}
                        title={isLiked(track.id) ? "Liked" : "Like song"}
                      >
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{
                            fontVariationSettings: isLiked(track.id)
                              ? "'FILL' 1"
                              : "'FILL' 0",
                          }}
                        >
                          {isLiked(track.id) ? "favorite" : "favorite_border"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(activeMix.id, track.id);
                        }}
                        className="p-1 rounded-lg text-outline hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Remove track from this mix"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: Grid of all Self Mixes (With slightly reduced card sizes)
  // -------------------------------------------------------------
  return (
    <div className="w-full px-4 md:px-8 py-8 flex flex-col gap-8 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-[11px] uppercase tracking-widest text-cyan-400 font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">equalizer</span>
            Self Mix & Mashups
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] text-outline">
            {(selfMixes || []).length} {(selfMixes || []).length === 1 ? "Mix" : "Mixes"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
              Self Mix
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-1">
              Upload and manage your own audio mashups, custom cuts, and local track files in private offline storage.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Mix Search Input */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-container/70 border border-white/10 text-on-surface w-full md:w-60 shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter self mixes..."
                className="bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-outline/70 w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-outline hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Create New Self Mix Button */}
            <button
              onClick={() => {
                setNewTitle("");
                setPendingFiles([]);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Self Mix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Self Mixes Container: Reduced card size (w-48 sm:w-56 p-3 sm:p-3.5) */}
      <div className="flex flex-wrap items-start justify-start gap-4 sm:gap-5">
        {/* 1. First Card: 'Create New Self Mix' Box */}
        <div
          onClick={() => {
            setNewTitle("");
            setPendingFiles([]);
            setShowCreateModal(true);
          }}
          className="w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/10 hover:border-primary/50 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
        >
          <div>
            {/* Aspect Square Area */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden border-2 border-dashed border-white/15 group-hover:border-primary/60 bg-surface-container-high/40 group-hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1.5 mb-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/30 group-hover:scale-110 group-hover:bg-primary text-primary group-hover:text-surface-container-lowest flex items-center justify-center transition-all shadow-[0_0_20px_rgba(76,215,246,0.3)]">
                <span className="material-symbols-outlined text-[24px]">upload_file</span>
              </div>
              <span className="text-xs font-bold text-white/90 group-hover:text-primary transition-colors">
                New Self Mix
              </span>
              <span className="text-[10px] text-outline font-mono uppercase tracking-wider">
                Upload & Create
              </span>
            </div>

            {/* Title and metadata */}
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                Create Self Mix
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Upload audio mashups or mixes
              </p>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
            <span className="flex items-center gap-1 font-mono text-[10px] text-primary">
              <span className="material-symbols-outlined text-[13px]">tune</span>
              Custom Mix
            </span>
            <span className="font-mono text-[10px]">Audio Upload</span>
          </div>
        </div>

        {/* 2. Self Mix cards (Opens directly within Self Mix section) */}
        {filteredMixes.map((mix) => {
          const tracks = mix.tracks || [];
          const isThisPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
          const totalDurationStr = formatPlaylistDuration(tracks);

          return (
            <div
              key={mix.id}
              onClick={() => handleMixCardClick(mix)}
              className="w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/90 transition-all duration-300 hover:-translate-y-1.5 shadow-xl relative overflow-hidden cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none"
            >
              <div>
                {/* Cover Image with Play Overlay */}
                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
                  <img
                    src={mix.coverUrl}
                    alt={mix.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Top-left Badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md backdrop-blur-md border bg-cyan-950/80 text-cyan-300 border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.25)] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[11px]">equalizer</span>
                      SELF MIX
                    </span>
                  </div>

                  {/* Delete button top-right */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteSelfMix(mix.id);
                    }}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-outline hover:text-red-400 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                    title="Delete self mix"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => handleMixPlay(mix, e)}
                      className="w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.8)] hover:scale-110 active:scale-95 transition-all"
                      title={isThisPlaying ? "Pause Mix" : "Play Mix"}
                    >
                      <span className="material-symbols-outlined text-[24px]">
                        {isThisPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Mix Details */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                    {mix.title}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                    {mix.description || `Custom self mix by ${mix.curator || "You"}`}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
                <span className="flex items-center gap-1 text-primary font-medium text-[10px]">
                  <span className="material-symbols-outlined text-[13px]">graphic_eq</span>
                  {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] text-outline">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  {totalDurationStr}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Creation Modal with File Upload */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!isSavingMix) setShowCreateModal(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-container-high/95 border border-white/15 p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  equalizer
                </span>
                <h2 className="text-lg font-bold text-white">Create Self Mix</h2>
              </div>
              <button
                disabled={isSavingMix}
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-full text-outline hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
              {/* Mix Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-outline uppercase tracking-wider">
                  Mix Name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. YouTube Mashup 2026 / Synthwave Sunset"
                  autoFocus
                  maxLength={50}
                  className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-outline/60 outline-none transition-all"
                />
              </div>

              {/* Quick Vibe Suggestions */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-outline font-medium">Quick suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "🎧 YouTube Lo-Fi Mashup",
                    "⚡ Club DJ Set",
                    "🌙 Late Night Drive Mix",
                    "☕ Deep Focus Mix",
                    "🔥 Bass Boosted Mashup",
                  ].map((vibe) => (
                    <button
                      key={vibe}
                      type="button"
                      onClick={() => setNewTitle(vibe.replace(/^[^\s]+\s*/, ""))}
                      className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary border border-white/5 hover:border-primary/30 transition-all cursor-pointer"
                    >
                      {vibe}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Upload Dropzone */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      upload_file
                    </span>
                    Upload Audio Files (Mixes & Mashups)
                  </label>
                  <span className="text-[11px] text-outline">
                    {pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"} chosen
                  </span>
                </div>

                {/* Dropzone container */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2.5 transition-all text-center ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-white/15 bg-surface-container-lowest/50 hover:border-white/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesSelected(e.target.files);
                      }
                    }}
                  />
                  <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[24px]">
                      audio_file
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      Click to choose audio files
                    </button>
                    <span className="text-xs text-outline"> or drag and drop here</span>
                  </div>
                  <p className="text-[10px] text-outline">
                    Supports MP3, WAV, M4A, FLAC, AAC, OGG files directly from your computer
                  </p>
                </div>

                {/* Selected Files Preview */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto mt-2 pr-1">
                    {pendingFiles.map((pf) => (
                      <div
                        key={pf.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface-container border border-white/5 text-xs text-white"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0">
                            audio_file
                          </span>
                          <span className="truncate font-medium">{pf.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-mono text-outline">{pf.sizeStr}</span>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {pf.durationFormatted}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingFile(pf.id)}
                            className="text-outline hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Isolation & Offline Info Note */}
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-700/30 text-[11px] text-cyan-200/90 mt-1">
                  <span className="material-symbols-outlined text-cyan-400 text-[16px] flex-shrink-0 mt-0.5">
                    lock
                  </span>
                  <span>
                    <strong>Strictly Isolated:</strong> Audio files uploaded here are saved directly to your device storage (IndexedDB) and will only ever belong to this Self Mix playlist.
                  </span>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={isSavingMix}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMix}
                  className="px-5 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMix ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                      </span>
                      <span>Saving Audio...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Self Mix</span>
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SelfMixPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-outline text-xs">Loading Self Mixes...</div>}>
      <SelfMixContent />
    </Suspense>
  );
}
