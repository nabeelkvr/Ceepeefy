"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "../../../context/MusicContext";
import { NOCTURNE_PLAYLISTS, NOCTURNE_TRACKS, getPlaylistById } from "../../../data/nocturneData";
import DownloadButton from "../../../components/DownloadButton";
import { formatPlaylistDuration } from "../../../utils/playlistUtils";
import {
  saveLocalAudioFile,
  getAudioFileDuration,
  formatFileSize,
} from "../../../services/localAudioStorage";

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlistId = params?.id || "midnight-reverie";
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
    customPlaylists,
    deleteCustomPlaylist,
    selfMixes,
    deleteSelfMix,
    addTrackToPlaylist,
    addLocalTracksToSelfMix,
    removeTrackFromPlaylist,
  } = useMusic();

  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [remotePlaylist, setRemotePlaylist] = useState(null);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  const localMatch =
    customPlaylists?.find((p) => String(p.id) === String(playlistId)) ||
    selfMixes?.find((p) => String(p.id) === String(playlistId)) ||
    getPlaylistById(playlistId) ||
    NOCTURNE_PLAYLISTS.find((p) => p.id.toLowerCase() === String(playlistId).toLowerCase());

  useEffect(() => {
    if (!localMatch && playlistId) {
      setIsLoadingRemote(true);
      fetch(`/api/audio/playlist?id=${encodeURIComponent(playlistId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.tracks && data.tracks.length > 0) {
            setRemotePlaylist(data);
          }
        })
        .catch((err) => console.warn("Error fetching remote playlist:", err))
        .finally(() => setIsLoadingRemote(false));
    }
  }, [playlistId, localMatch]);

  const playlist = localMatch || remotePlaylist || NOCTURNE_PLAYLISTS[0];

  const isCustomPlaylist = Boolean(
    playlist?.isCustom ||
    customPlaylists?.some((p) => p.id === playlistId) ||
    selfMixes?.some((p) => p.id === playlistId)
  );

  const isSelfMix = Boolean(
    playlist?.isSelfMix ||
    selfMixes?.some((p) => p.id === playlistId)
  );

  const tracks = playlist.tracks || (isCustomPlaylist ? [] : NOCTURNE_TRACKS);

  // Auto-play when opened with ?play=true query param
  useEffect(() => {
    if (shouldAutoPlay && !hasAutoPlayedRef.current && tracks && tracks.length > 0) {
      hasAutoPlayedRef.current = true;
      playTrack(tracks[0], tracks);
    }
  }, [shouldAutoPlay, tracks, playTrack]);

  const isCurrentPlaylistPlaying =
    isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  const handleMasterPlay = () => {
    if (tracks.length === 0) return;
    if (isCurrentPlaylistPlaying) {
      togglePlay();
    } else {
      playTrack(tracks[0], tracks);
    }
  };

  const handleRowClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  const handleFilesSelected = async (filesList) => {
    if (!filesList || filesList.length === 0 || !isSelfMix) return;
    setIsUploading(true);

    try {
      const newTracks = [];
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

        // Save blob to IndexedDB
        await saveLocalAudioFile(trackId, file, {
          fileName: file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: file.size,
        });

        newTracks.push({
          id: trackId,
          title: cleanTitle,
          artist: "Self Mix Upload",
          album: playlist.title || "Personal Self Mix",
          duration: durationSecs || 180,
          durationFormatted: formattedDuration,
          coverUrl:
            playlist.coverUrl ||
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
          isLocal: true,
          source: "local-upload",
          fileName: file.name,
          fileSize: file.size,
          badge: "Self Mix",
          badgeType: "cyan",
        });
      }

      if (newTracks.length > 0) {
        addLocalTracksToSelfMix(playlist.id, newTracks);
      }
    } catch (err) {
      console.error("Error uploading audio files into self mix:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const totalDurationStr = formatPlaylistDuration(tracks);

  return (
    <div className="w-full flex flex-col pb-12 select-none">
      {/* Dynamic Hero Banner */}
      <div className="relative w-full p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art */}
          <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 group">
            <img
              src={playlist.coverUrl}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Metadata info */}
          <div className="flex flex-col gap-2.5 text-center md:text-left flex-1 min-w-0">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wider uppercase ${
                  isSelfMix
                    ? "bg-cyan-950/80 text-cyan-300 border-cyan-700/60"
                    : "bg-primary/15 border-primary/30 text-primary"
                }`}
              >
                {isSelfMix ? "Self Mix • Hi-Res Lossless" : (playlist.fidelity || "Public Playlist • Hi-Res Lossless")}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-tertiary/15 text-tertiary text-[10px] font-mono font-bold">
                {playlist.spec || "24-Bit • 192kHz"}
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {playlist.title}
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant line-clamp-2 max-w-2xl">
              {playlist.description}
            </p>

            <div className="flex items-center justify-center md:justify-start gap-3 text-xs text-outline pt-2">
              <div className="flex items-center gap-2">
                <img
                  src={playlist.curatorAvatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS"}
                  alt="Curator"
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span className="text-white font-medium">{playlist.curator}</span>
              </div>
              <span>•</span>
              <span className="font-semibold text-white">
                {tracks.length} {tracks.length === 1 ? "Track" : "Tracks"}
              </span>
              <span>•</span>
              <span className="font-mono text-outline">{totalDurationStr}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{playlist.updatedDate || "Updated today"}</span>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center gap-4 mt-8 flex-wrap">
          {/* Master Play Button */}
          <button
            onClick={handleMasterPlay}
            disabled={tracks.length === 0}
            className="w-14 h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={isCurrentPlaylistPlaying ? "Pause playlist" : "Play playlist"}
          >
            <span className="material-symbols-outlined text-[32px]">
              {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
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

          {/* Like Playlist */}
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer"
            title="Save to library"
          >
            <span className="material-symbols-outlined text-[22px]">favorite_border</span>
          </button>

          {/* Download offline */}
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-outline hover:text-white bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer"
            title="Download for offline playback"
          >
            <span className="material-symbols-outlined text-[22px]">download_for_offline</span>
          </button>

          {/* Upload Tracks Button (Only for Self Mix) */}
          {isSelfMix && (
            <>
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
              <button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/40 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                title="Upload audio mix files into this Self Mix"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isUploading ? "progress_activity" : "upload_file"}
                </span>
                <span>{isUploading ? "Uploading..." : "Upload Mix"}</span>
              </button>
            </>
          )}

          {/* Delete Playlist Button (if custom or self mix) */}
          {isCustomPlaylist && (
            <button
              onClick={() => {
                if (isSelfMix) {
                  deleteSelfMix(playlist.id);
                  router.push("/self-mix");
                } else {
                  deleteCustomPlaylist(playlist.id);
                  router.push("/playlists");
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 text-xs font-bold transition-all shadow-sm active:scale-95 ml-auto sm:ml-2 cursor-pointer"
              title="Delete this playlist"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>{isSelfMix ? "Delete Self Mix" : "Delete Playlist"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tracklist Table */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-2">
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
          {tracks.length === 0 ? (
            isSelfMix ? (
              /* Empty state with audio upload dropzone for Self Mix */
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
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center py-16 text-center gap-3 rounded-2xl border-2 border-dashed transition-all my-4 cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-white/15 hover:border-primary/50 bg-surface-container-high/40 hover:bg-surface-container-high/60"
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-3xl">upload_file</span>
                </div>
                <p className="text-white font-bold text-base">This Self Mix is empty</p>
                <p className="text-xs text-outline max-w-sm">
                  Drag and drop your audio files (MP3, WAV, FLAC, M4A) or click here to upload your YouTube mixes and DJ mashups.
                </p>
                <span className="px-4 py-1.5 rounded-full bg-primary text-surface-container-lowest font-bold text-xs mt-1 shadow-md">
                  Choose Audio Files
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3 glass-card rounded-2xl border border-white/5 my-4">
                <span className="material-symbols-outlined text-4xl text-outline">queue_music</span>
                <p className="text-white font-bold text-base">This playlist is empty</p>
                <p className="text-xs text-outline max-w-sm">
                  Add recommended tracks below or search songs to build your personalized playlist.
                </p>
              </div>
            )
          ) : (
            tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => handleRowClick(track)}
                  className={`group grid grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_4.5rem] items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                    isCurrent
                      ? "bg-surface-container-high/80 border border-primary/30"
                      : "hover:bg-surface-container/60 hover:border-white/5 border border-transparent"
                  }`}
                >
                  {/* Index / Play status */}
                  <div className="flex items-center justify-center w-full">
                    {isCurrentPlaying ? (
                      <span className="text-primary flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                          <rect height="10" rx="1.5" width="3" x="3" y="10">
                            <animate
                              attributeName="height"
                              dur="0.8s"
                              repeatCount="indefinite"
                              values="10;4;14;10"
                            />
                            <animate
                              attributeName="y"
                              dur="0.8s"
                              repeatCount="indefinite"
                              values="10;16;6;10"
                            />
                          </rect>
                          <rect height="15" rx="1.5" width="3" x="8.5" y="5">
                            <animate
                              attributeName="height"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="15;8;18;15"
                            />
                            <animate
                              attributeName="y"
                              dur="0.6s"
                              repeatCount="indefinite"
                              values="5;12;2;5"
                            />
                          </rect>
                          <rect height="12" rx="1.5" width="3" x="14" y="8">
                            <animate
                              attributeName="height"
                              dur="0.7s"
                              repeatCount="indefinite"
                              values="12;16;6;12"
                            />
                            <animate
                              attributeName="y"
                              dur="0.7s"
                              repeatCount="indefinite"
                              values="8;4;14;8"
                            />
                          </rect>
                          <rect height="8" rx="1.5" width="3" x="19.5" y="12">
                            <animate
                              attributeName="height"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="8;14;5;8"
                            />
                            <animate
                              attributeName="y"
                              dur="0.9s"
                              repeatCount="indefinite"
                              values="12;6;15;12"
                            />
                          </rect>
                        </svg>
                      </span>
                    ) : (
                      <>
                        <span className="group-hover:hidden text-xs font-mono text-outline">
                          {idx + 1}
                        </span>
                        <span className="hidden group-hover:block text-white">
                          <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                        </span>
                      </>
                    )}
                  </div>

                  {/* Cover & Title */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high shadow">
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
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

                  {/* Artist */}
                  <div className="hidden md:block truncate text-xs text-on-surface-variant hover:text-white">
                    {track.artist}
                  </div>

                  {/* Duration */}
                  <div className="text-right text-xs font-mono text-outline">
                    {track.durationFormatted || formatTime(track.duration)}
                  </div>

                  {/* Actions: Download, Like, & Remove from playlist */}
                  <div className="flex items-center justify-end gap-1">
                    {!track.isLocal && (
                      <DownloadButton track={track} buttonSize="p-1" iconSize="text-[18px]" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(track.id);
                      }}
                      className={`p-1 hover:scale-110 transition-transform ${
                        isLiked(track.id) ? "text-primary" : "text-outline hover:text-white"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: isLiked(track.id) ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        favorite
                      </span>
                    </button>
                    {isCustomPlaylist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(playlist.id, track.id);
                        }}
                        className="p-1 text-outline hover:text-red-400 hover:bg-white/10 rounded-md transition-colors"
                        title="Remove from playlist"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Upload Dropzone below tracklist for Self Mix */}
        {isSelfMix && tracks.length > 0 && (
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
            onClick={() => fileInputRef.current?.click()}
            className={`mt-6 p-4 rounded-xl border border-dashed transition-all flex items-center justify-between gap-4 cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-white/15 hover:border-primary/40 bg-surface-container/40 hover:bg-surface-container/70"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Add more tracks to this Self Mix</span>
                <span className="text-[11px] text-outline">
                  Drop MP3, WAV, FLAC, or M4A mixes here or click to browse
                </span>
              </div>
            </div>

            <button
              type="button"
              className="px-3.5 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-xs font-bold whitespace-nowrap hover:bg-primary hover:text-surface-container-lowest transition-all"
            >
              Upload Audio
            </button>
          </div>
        )}

        {/* Recommended songs to add ONLY if regular custom playlist (NOT Self Mix) */}
        {isCustomPlaylist && !isSelfMix && (
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">add_circle</span>
                  Add Songs to "{playlist.title}"
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Quickly sequence more tracks into your custom playlist</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {NOCTURNE_TRACKS.filter((nt) => !tracks.some((t) => t.id === nt.id))
                .slice(0, 6)
                .map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container/50 border border-white/5 hover:border-primary/30 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={track.coverUrl} alt={track.title} className="w-10 h-10 rounded-lg object-cover" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-white truncate">{track.title}</span>
                        <span className="text-[11px] text-on-surface-variant truncate">{track.artist}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => addTrackToPlaylist(playlist.id, track)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-surface-container-lowest border border-primary/30 text-xs font-bold transition-all ml-2 flex-shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      <span>Add</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
