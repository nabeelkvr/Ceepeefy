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
import {
  isSupabaseConfigured,
  uploadAudioToCloud,
  saveSelfMixToCloud,
  fetchSelfMixesFromCloud,
  deleteSelfMixFromCloud,
} from "../../services/supabaseClient";

const COVER_ART_OPTIONS = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
];

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

  // Cloud State
  const [cloudMixes, setCloudMixes] = useState([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(true);
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Local / Mixed state
  const [selectedMixId, setSelectedMixId] = useState(activeParamId || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedCover, setSelectedCover] = useState(COVER_ART_OPTIONS[0]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSavingMix, setIsSavingMix] = useState(false);

  const fileInputRef = useRef(null);
  const cardDropInputRef = useRef(null);
  const detailFileInputRef = useRef(null);

  // Sync selectedMixId with searchParams
  useEffect(() => {
    setSelectedMixId(activeParamId || null);
  }, [activeParamId]);

  // Check Supabase configuration & load cloud tracks on page mount
  useEffect(() => {
    const configured = isSupabaseConfigured();
    setIsCloudConfigured(configured);
    loadCloudTracks();
  }, []);

  const loadCloudTracks = async () => {
    setIsLoadingCloud(true);
    setUploadError(null);
    try {
      if (isSupabaseConfigured()) {
        const records = await fetchSelfMixesFromCloud("nabeeyl");
        setCloudMixes(records || []);
      } else {
        setCloudMixes([]);
      }
    } catch (err) {
      console.error("[SelfMix] Failed to fetch cloud mixes from Supabase:", err);
      setUploadError(
        "Could not connect to Supabase cloud storage. Check your project URL and keys."
      );
    } finally {
      setIsLoadingCloud(false);
    }
  };

  // Filter allowed audio files (.mp3 and .wav strictly)
  const filterAudioFiles = (filesList) => {
    const valid = [];
    const invalid = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isMp3OrWav =
        ext === "mp3" ||
        ext === "wav" ||
        file.type === "audio/mpeg" ||
        file.type === "audio/wav" ||
        file.type === "audio/x-wav";

      if (isMp3OrWav) {
        valid.push(file);
      } else {
        invalid.push(file.name);
      }
    }

    if (invalid.length > 0) {
      setUploadError(
        `Only .mp3 and .wav audio files are supported for Cloud Self Mix. Skipped: ${invalid.join(", ")}`
      );
    } else {
      setUploadError(null);
    }

    return valid;
  };

  const handleFilesSelected = async (filesList) => {
    if (!filesList || filesList.length === 0) return;
    const validFiles = filterAudioFiles(filesList);
    if (validFiles.length === 0) return;

    setIsProcessingFiles(true);
    const newEntries = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
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

  // Upload pending audio files to Supabase Cloud Storage & save to DB
  const handleCreateSubmit = async (e) => {
    e?.preventDefault();
    if (isSavingMix || pendingFiles.length === 0) return;

    setIsSavingMix(true);
    setUploadError(null);

    try {
      if (isSupabaseConfigured()) {
        const newlyUploaded = [];

        for (let i = 0; i < pendingFiles.length; i++) {
          const item = pendingFiles[i];
          const displayTitle =
            pendingFiles.length === 1 && newTitle.trim()
              ? newTitle.trim()
              : item.title;

          setCloudUploadProgress(
            `Uploading ${item.file.name} to cloud (${i + 1}/${pendingFiles.length})...`
          );

          // 1. Upload audio file directly to Supabase Storage bucket 'self-mixes'
          const { publicUrl } = await uploadAudioToCloud(item.file, "nabeeyl");

          setCloudUploadProgress(
            `Saving ${displayTitle} to cloud database...`
          );

          // 2. Insert record into Supabase 'self_mixes' table
          const record = await saveSelfMixToCloud({
            id: `cloud-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`,
            title: displayTitle,
            audioUrl: publicUrl,
            owner: "nabeeyl",
            duration: item.duration || 180,
            durationFormatted: item.durationFormatted || "3:00",
            fileName: item.file.name,
            fileSize: item.file.size,
            coverUrl: selectedCover,
          });

          newlyUploaded.push(record);
        }

        // Prepend new records to cloudMixes
        setCloudMixes((prev) => [...newlyUploaded, ...prev]);
        setPendingFiles([]);
        setNewTitle("");
        setShowCreateModal(false);
      } else {
        // Fallback to local storage if Supabase credentials are not configured yet
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
            coverUrl: selectedCover,
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
      }
    } catch (err) {
      console.error("[SelfMix] Failed to upload or save audio track:", err);
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      setIsSavingMix(false);
      setCloudUploadProgress("");
    }
  };

  // Seamless Playback of Cloud Track
  const handlePlayCloudTrack = (mix, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const isThisPlaying = isPlaying && currentTrack?.id === mix.id;
    if (isThisPlaying) {
      togglePlay();
      return;
    }

    // Build the track object for global audio player
    const trackObj = {
      id: mix.id,
      title: mix.title,
      artist: mix.owner ? `@${mix.owner}` : "@nabeeyl",
      album: "Cloud Self Mix",
      audioUrl: mix.audio_url,
      duration: mix.duration || 180,
      durationFormatted: mix.duration_formatted || "3:00",
      coverUrl:
        mix.cover_url ||
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
      isCloud: true,
      isLocal: false,
      source: "supabase-cloud",
      fileName: mix.file_name,
      fileSize: mix.file_size,
      badge: "Cloud Mix",
      badgeType: "cyan",
    };

    // Full cloud playlist queue
    const allCloudTrackObjs = cloudMixes.map((m) => ({
      id: m.id,
      title: m.title,
      artist: m.owner ? `@${m.owner}` : "@nabeeyl",
      album: "Cloud Self Mix",
      audioUrl: m.audio_url,
      duration: m.duration || 180,
      durationFormatted: m.duration_formatted || "3:00",
      coverUrl:
        m.cover_url ||
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
      isCloud: true,
      isLocal: false,
      source: "supabase-cloud",
      fileName: m.file_name,
      fileSize: m.file_size,
      badge: "Cloud Mix",
      badgeType: "cyan",
    }));

    playTrack(trackObj, allCloudTrackObjs);
  };

  // Delete Cloud Track
  const handleDeleteCloudTrack = async (mix, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!confirm(`Delete "${mix.title}" from cloud storage?`)) return;

    try {
      await deleteSelfMixFromCloud(mix.id, mix.audio_url);
      setCloudMixes((prev) => prev.filter((m) => m.id !== mix.id));
    } catch (err) {
      console.error("[SelfMix] Failed to delete cloud mix:", err);
      alert("Failed to delete track: " + err.message);
    }
  };

  // Playback for legacy local playlist
  const handleLocalMixPlay = (mix, e) => {
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

  // Filter cloud tracks by search query
  const filteredCloudMixes = (cloudMixes || []).filter((mix) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      mix.title?.toLowerCase().includes(q) ||
      mix.file_name?.toLowerCase().includes(q) ||
      mix.owner?.toLowerCase().includes(q)
    );
  });

  const activeMix = selectedMixId
    ? (selfMixes || []).find((m) => String(m.id) === String(selectedMixId))
    : null;

  // -------------------------------------------------------------
  // VIEW 1: Detail View when a legacy local mix is opened
  // -------------------------------------------------------------
  if (activeMix) {
    const tracks = activeMix.tracks || [];
    const isThisMixPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
    const totalDurationStr = formatPlaylistDuration(tracks);

    return (
      <div className="w-full px-4 md:px-8 py-6 flex flex-col gap-6 select-none animate-fade-in">
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

        <div className="flex flex-col md:flex-row items-start md:items-end gap-6 p-6 rounded-2xl glass-card border border-white/10 bg-gradient-to-br from-cyan-950/40 via-surface-container/80 to-surface-container/40">
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden bg-surface-container-highest shadow-2xl flex-shrink-0 border border-white/10 group">
            <img
              src={
                activeMix.coverUrl ||
                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
              }
              alt={activeMix.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleLocalMixPlay(activeMix, e)}
                className="w-14 h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.85)] hover:scale-105 transition-transform cursor-pointer"
                title={isThisMixPlaying ? "Pause Mix" : "Play Mix"}
              >
                <span className="material-symbols-outlined text-[32px]">
                  {isThisMixPlaying ? "pause" : "play_arrow"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-1 rounded-md backdrop-blur-md border bg-cyan-950/90 text-cyan-300 border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.3)] flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">equalizer</span>
                LOCAL MIX
              </span>
              <span className="text-xs text-outline font-mono">
                Device Storage
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
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3">
              <button
                type="button"
                onClick={(e) => handleLocalMixPlay(activeMix, e)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_16px_rgba(76,215,246,0.5)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isThisMixPlaying ? "pause" : "play_arrow"}
                </span>
                <span>{isThisMixPlaying ? "Pause Mix" : "Play Mix"}</span>
              </button>

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
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span>Delete Mix</span>
              </button>
            </div>
          </div>
        </div>

        {/* Local Tracklist */}
        <div className="flex flex-col gap-2">
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
                <div className="text-center flex items-center justify-center">
                  {isCurrentPlaying ? (
                    <div className="flex items-end gap-[2px] h-3">
                      <span className="w-0.5 bg-primary animate-pulse rounded-full h-full" />
                      <span className="w-0.5 bg-primary animate-pulse rounded-full h-2/3 delay-75" />
                      <span className="w-0.5 bg-primary animate-pulse rounded-full h-1/2 delay-150" />
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-outline group-hover:hidden">{idx + 1}</span>
                      <span className="material-symbols-outlined text-primary text-[18px] hidden group-hover:block">
                        play_arrow
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high border border-white/5 shadow-inner">
                    <img
                      src={
                        track.coverUrl ||
                        track.thumbnail ||
                        activeMix.coverUrl ||
                        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"
                      }
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

                <div className="hidden md:flex items-center min-w-0 pr-2">
                  <span className="text-xs text-on-surface-variant truncate">
                    {track.artist || "Self Mix"}
                  </span>
                </div>

                <div className="text-right font-mono text-xs text-outline">
                  {track.durationFormatted || formatTime(track.duration || 180)}
                </div>

                <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
                  <DownloadButton track={track} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLike(track);
                    }}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ${
                      isLiked(track.id) ? "text-primary" : "text-outline hover:text-white"
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{
                        fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0",
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
                  >
                    <span className="material-symbols-outlined text-[17px]">close</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: Grid of all Self Mixes (Cloud First)
  // -------------------------------------------------------------
  return (
    <div className="w-full px-4 md:px-8 py-8 flex flex-col gap-8 select-none">
      {/* Cloud Status Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-surface-container/60 to-surface-container/30 border border-cyan-700/30 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-cyan-400 text-[18px]">
              cloud_done
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                Cloud Sync Active
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-600/50 text-cyan-300">
                @nabeeyl
              </span>
              {isCloudConfigured ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="Connected to Supabase" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" title="Credentials pending in .env.local" />
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant truncate">
              {isCloudConfigured
                ? "Audio files stored in Supabase bucket 'self-mixes' — accessible across all your devices."
                : "Supabase credentials not detected in .env.local. Click 'Setup Instructions' to configure."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-auto">
          {!isCloudConfigured && (
            <button
              onClick={() => setShowSetupModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600/60 text-cyan-300 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">help</span>
              <span>Setup Instructions</span>
            </button>
          )}

          <button
            onClick={loadCloudTracks}
            disabled={isLoadingCloud}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-high/80 hover:bg-surface-container-highest border border-white/10 text-outline hover:text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Refresh cloud library"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                isLoadingCloud ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Upload Error / Warning Banner */}
      {uploadError && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-400">warning</span>
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-outline hover:text-white cursor-pointer ml-3"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-[11px] uppercase tracking-widest text-cyan-400 font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">equalizer</span>
            Self Mix • Cross-Device Cloud
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] text-outline">
            {filteredCloudMixes.length}{" "}
            {filteredCloudMixes.length === 1 ? "Cloud Track" : "Cloud Tracks"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
              Self Mix
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mt-1">
              Upload .mp3 and .wav files to your private cloud storage. Stream your tracks on any device when logged into your account.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Search */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-container/70 border border-white/10 text-on-surface w-full md:w-60 shadow-inner focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter cloud tracks..."
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

            {/* Upload Button */}
            <button
              onClick={() => {
                setNewTitle("");
                setPendingFiles([]);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all whitespace-nowrap flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              <span>New Self Mix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input for drag & drop onto the 'New Self Mix' card */}
      <input
        ref={cardDropInputRef}
        type="file"
        multiple
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(e.target.files);
            setShowCreateModal(true);
          }
        }}
      />

      {/* Grid of Self Mixes: 1 Upload Box + Cloud Track Cards */}
      <div className="flex flex-wrap items-start justify-start gap-4 sm:gap-5">
        {/* 1. First Card: 'New Self Mix' Upload Box with Drag & Drop */}
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
              setShowCreateModal(true);
            }
          }}
          onClick={() => {
            setNewTitle("");
            setPendingFiles([]);
            setShowCreateModal(true);
          }}
          className={`w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border transition-all duration-300 hover:-translate-y-1.5 shadow-xl cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none ${
            isDragging
              ? "border-primary bg-primary/10 shadow-[0_0_24px_rgba(76,215,246,0.3)]"
              : "border-white/10 hover:border-primary/50 hover:bg-surface-container/90"
          }`}
        >
          <div>
            {/* Aspect Square Area */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden border-2 border-dashed border-white/15 group-hover:border-primary/60 bg-surface-container-high/40 group-hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1.5 mb-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/30 group-hover:scale-110 group-hover:bg-primary text-primary group-hover:text-surface-container-lowest flex items-center justify-center transition-all shadow-[0_0_20px_rgba(76,215,246,0.3)]">
                <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
              </div>
              <span className="text-xs font-bold text-white/90 group-hover:text-primary transition-colors">
                New Self Mix
              </span>
              <span className="text-[10px] text-cyan-300 font-mono uppercase tracking-wider">
                .MP3 / .WAV Drop
              </span>
            </div>

            {/* Title and metadata */}
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                Upload to Cloud
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Drop .mp3 or .wav audio files
              </p>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
            <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-400">
              <span className="material-symbols-outlined text-[13px]">cloud</span>
              Supabase Storage
            </span>
            <span className="font-mono text-[10px] text-outline">Cross-Device</span>
          </div>
        </div>

        {/* 2. Loading State */}
        {isLoadingCloud && cloudMixes.length === 0 && (
          <div className="w-48 sm:w-56 p-6 rounded-2xl glass-card border border-white/5 flex flex-col items-center justify-center gap-3 text-center">
            <span className="material-symbols-outlined text-primary text-[28px] animate-spin">
              progress_activity
            </span>
            <span className="text-xs text-outline font-medium">
              Fetching cloud mixes...
            </span>
          </div>
        )}

        {/* 3. Cloud Self Mix Cards (Playable Track Cards) */}
        {filteredCloudMixes.map((mix) => {
          const isThisCurrent = currentTrack?.id === mix.id;
          const isThisPlaying = isThisCurrent && isPlaying;

          return (
            <div
              key={mix.id}
              onClick={(e) => handlePlayCloudTrack(mix, e)}
              className={`w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border transition-all duration-300 hover:-translate-y-1.5 shadow-xl relative overflow-hidden cursor-pointer group flex flex-col justify-between flex-shrink-0 select-none ${
                isThisCurrent
                  ? "border-primary/70 bg-surface-container/90 ring-1 ring-primary/40 shadow-[0_0_24px_rgba(76,215,246,0.2)]"
                  : "border-white/5 hover:border-primary/40 hover:bg-surface-container/90"
              }`}
            >
              <div>
                {/* Cover Image with Play Overlay */}
                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3">
                  <img
                    src={
                      mix.cover_url ||
                      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"
                    }
                    alt={mix.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Top-left Cloud Badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md backdrop-blur-md border bg-cyan-950/85 text-cyan-300 border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.3)] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[11px]">cloud_done</span>
                      CLOUD MIX
                    </span>
                  </div>

                  {/* Delete button top-right */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCloudTrack(mix, e)}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-outline hover:text-red-400 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                    title="Delete track from cloud"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>

                  {/* Play Button Overlay & Visualizer */}
                  <div
                    className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${
                      isThisPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => handlePlayCloudTrack(mix, e)}
                      className="w-11 h-11 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.85)] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                      title={isThisPlaying ? "Pause Track" : "Play Track"}
                    >
                      <span className="material-symbols-outlined text-[26px]">
                        {isThisPlaying ? "pause" : "play_arrow"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Track Details */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <h3
                      className={`text-sm font-bold truncate ${
                        isThisCurrent
                          ? "text-primary"
                          : "text-white group-hover:text-primary transition-colors"
                      }`}
                      title={mix.title}
                    >
                      {mix.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-on-surface-variant">
                    <span className="text-cyan-400 font-medium">@{mix.owner || "nabeeyl"}</span>
                    <span>•</span>
                    <span className="truncate">{mix.file_name || "Audio File"}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-outline mt-2.5">
                <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-300">
                  <span className="material-symbols-outlined text-[12px]">graphic_eq</span>
                  {mix.duration_formatted || "3:00"}
                </span>

                <div className="flex items-center gap-2">
                  {mix.file_size ? (
                    <span className="font-mono text-[10px] text-outline">
                      {formatFileSize(mix.file_size)}
                    </span>
                  ) : null}
                  <DownloadButton
                    track={{
                      id: mix.id,
                      title: mix.title,
                      artist: `@${mix.owner || "nabeeyl"}`,
                      audioUrl: mix.audio_url,
                      fileName: mix.file_name,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State when no tracks in Cloud */}
      {!isLoadingCloud && cloudMixes.length === 0 && (
        <div className="p-8 rounded-2xl border border-dashed border-cyan-500/20 bg-cyan-950/20 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
          </div>
          <h3 className="text-base font-bold text-white">
            No Cloud Tracks Yet
          </h3>
          <p className="text-xs text-outline max-w-md">
            Click <strong>New Self Mix</strong> to upload your first .mp3 or .wav audio file to Supabase. Once uploaded, your music will be synced to all devices under your account (<strong>nabeeyl</strong>).
          </p>
          <button
            onClick={() => {
              setNewTitle("");
              setPendingFiles([]);
              setShowCreateModal(true);
            }}
            className="mt-1 px-4 py-2 rounded-full bg-primary text-surface-container-lowest font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Upload First Mix
          </button>
        </div>
      )}

      {/* Legacy Local Mixes (if any exist from offline usage) */}
      {(selfMixes || []).length > 0 && (
        <div className="mt-8 pt-8 border-t border-white/10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-outline text-[18px]">
                phonelink_ring
              </span>
              <h2 className="text-base font-bold text-white">
                Local Device Mixes (Offline Storage)
              </h2>
              <span className="text-xs text-outline">
                ({selfMixes.length})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-start gap-4 sm:gap-5">
            {selfMixes.map((mix) => {
              const tracks = mix.tracks || [];
              const isThisPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

              return (
                <div
                  key={mix.id}
                  onClick={() => {
                    setSelectedMixId(mix.id);
                    router.push(`/self-mix?id=${mix.id}`);
                  }}
                  className="w-48 sm:w-56 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/5 hover:border-white/20 hover:bg-surface-container/90 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest mb-3">
                    <img
                      src={mix.coverUrl}
                      alt={mix.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-surface-container/90 text-outline border border-white/10">
                        OFFLINE
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-white truncate">{mix.title}</h4>
                    <p className="text-[10px] text-outline mt-0.5">
                      {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Creation Modal with Direct Cloud Upload */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
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
                  cloud_upload
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">New Self Mix</h2>
                  <p className="text-[11px] text-on-surface-variant">
                    Upload audio to cloud storage • Account: @nabeeyl
                  </p>
                </div>
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
                  Track / Mix Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Midnight Synth Remix / Acoustic Mashup"
                  autoFocus
                  maxLength={60}
                  className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-outline/60 outline-none transition-all"
                />
              </div>

              {/* Cover Art Picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-outline uppercase tracking-wider">
                  Select Cover Artwork
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {COVER_ART_OPTIONS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedCover(url)}
                      className={`relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${
                        selectedCover === url
                          ? "border-primary scale-105 shadow-[0_0_12px_rgba(76,215,246,0.5)]"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={url} alt="Cover option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Upload Dropzone: Accepts .mp3 and .wav */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      audio_file
                    </span>
                    Audio Files (.MP3 or .WAV)
                  </label>
                  <span className="text-[11px] text-cyan-300 font-mono">
                    {pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"} selected
                  </span>
                </div>

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
                    accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesSelected(e.target.files);
                      }
                    }}
                  />
                  <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[24px]">
                      cloud_upload
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      Click to select .mp3 or .wav files
                    </button>
                    <span className="text-xs text-outline"> or drag and drop</span>
                  </div>
                  <p className="text-[10px] text-outline">
                    Strictly accepts <strong>.mp3</strong> and <strong>.wav</strong> files for cloud streaming
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
                            audiotrack
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

                {/* Status Notice */}
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-700/30 text-[11px] text-cyan-200/90 mt-1">
                  <span className="material-symbols-outlined text-cyan-400 text-[16px] flex-shrink-0 mt-0.5">
                    cloud_done
                  </span>
                  <span>
                    <strong>Cross-Device Persistence:</strong> Uploaded audio files are stored in the Supabase <code>self-mixes</code> cloud bucket and automatically linked to <strong>nabeeyl</strong>.
                  </span>
                </div>
              </div>

              {/* Upload Progress Status */}
              {isSavingMix && cloudUploadProgress && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  <span>{cloudUploadProgress}</span>
                </div>
              )}

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
                  disabled={isSavingMix || pendingFiles.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMix ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                      </span>
                      <span>Uploading to Cloud...</span>
                    </>
                  ) : (
                    <>
                      <span>Upload & Save to Cloud</span>
                      <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Setup Helper Modal */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowSetupModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-surface-container-high/95 border border-white/15 p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto no-scrollbar text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-400 text-[22px]">
                  database
                </span>
                <h2 className="text-base font-bold">Supabase Cloud Setup (Free Tier)</h2>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="p-1 rounded-full text-outline hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              To allow uploading audio files that persist across devices on your Vercel deployment, follow these 3 quick steps:
            </p>

            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                <span className="font-bold text-cyan-300">1. Run this in Supabase SQL Editor:</span>
                <div className="relative mt-2">
                  <pre className="p-2.5 rounded-lg bg-black/60 text-[11px] text-cyan-200 font-mono overflow-x-auto">
{`create table if not exists public.self_mixes (
  id text primary key,
  title text not null,
  audio_url text not null,
  owner text not null default 'nabeeyl',
  duration integer default 180,
  duration_formatted text default '3:00',
  file_name text,
  file_size bigint,
  cover_url text,
  created_at timestamptz default now()
);

alter table public.self_mixes enable row level security;
create policy "Allow public read" on public.self_mixes for select using (true);
create policy "Allow insert" on public.self_mixes for insert with check (true);
create policy "Allow delete" on public.self_mixes for delete using (true);`}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`create table if not exists public.self_mixes (
  id text primary key,
  title text not null,
  audio_url text not null,
  owner text not null default 'nabeeyl',
  duration integer default 180,
  duration_formatted text default '3:00',
  file_name text,
  file_size bigint,
  cover_url text,
  created_at timestamptz default now()
);

alter table public.self_mixes enable row level security;
create policy "Allow public read" on public.self_mixes for select using (true);
create policy "Allow insert" on public.self_mixes for insert with check (true);
create policy "Allow delete" on public.self_mixes for delete using (true);`);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2000);
                    }}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-all cursor-pointer"
                  >
                    {copiedSql ? "Copied!" : "Copy SQL"}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                <span className="font-bold text-cyan-300">2. Create Storage Bucket:</span>
                <p className="text-outline text-[11px] mt-1">
                  In your Supabase dashboard, go to <strong>Storage</strong> → <strong>New Bucket</strong>. Name it <code>self-mixes</code> and enable <strong>Public bucket</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface-container border border-white/5">
                <span className="font-bold text-cyan-300">3. Set Environment Variables:</span>
                <p className="text-outline text-[11px] mt-1">
                  In your <code>.env.local</code> (and on Vercel under Project Settings → Environment Variables):
                </p>
                <pre className="p-2 rounded-lg bg-black/60 text-[11px] text-cyan-200 font-mono mt-1">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setShowSetupModal(false)}
                className="px-4 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SelfMixPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-outline text-xs">
          Loading Self Mixes...
        </div>
      }
    >
      <SelfMixContent />
    </Suspense>
  );
}
