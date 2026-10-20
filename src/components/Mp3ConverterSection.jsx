"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMusic } from "../context/MusicContext";
import {
  identifyAudioSourceUrl,
  QUALITY_PRESETS,
  formatDurationSeconds,
  sanitizeMediaFilename,
  parseFilenameFromDisposition,
} from "../services/mp3ConverterService";
import { saveLocalAudioFile } from "../services/localAudioStorage";

export default function Mp3ConverterSection({ onPlaylistUpdated }) {
  const {
    selfMixes,
    addLocalTracksToSelfMix,
    createSelfMix,
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
  } = useMusic();

  const [activeTab, setActiveTab] = useState("link"); // 'link' | 'upload'
  const [urlInput, setUrlInput] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("320");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [convertedTrack, setConvertedTrack] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");

  // Local File Upload State
  const localFileInputRef = useRef(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState(null);

  // Add to Self Mix Modal State
  const [showAddToMixModal, setShowAddToMixModal] = useState(false);
  const [isCreatingNewMix, setIsCreatingNewMix] = useState(false);
  const [newMixTitle, setNewMixTitle] = useState("");
  const [isSavingToMix, setIsSavingToMix] = useState(false);
  const [addedSuccessMessage, setAddedSuccessMessage] = useState("");

  // Local Audio Preview inside Card
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef(null);

  // Real-time link validation
  const detectedSource = urlInput.trim() ? identifyAudioSourceUrl(urlInput) : null;

  // Reset audio preview when converted track changes
  useEffect(() => {
    setIsPreviewPlaying(false);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
  }, [convertedTrack]);

  // Clean progress animation helper
  const animateProgress = async (stages) => {
    for (const stage of stages) {
      setProgressStage(stage.text);
      setConversionProgress(stage.pct);
      await new Promise((r) => setTimeout(r, stage.delay || 400));
    }
  };

  // Convert Web Link (YouTube / Spotify)
  const handleConvertLink = async (e) => {
    e?.preventDefault?.();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) {
      setErrorMessage("Please paste a valid YouTube or Spotify link.");
      return;
    }

    const check = identifyAudioSourceUrl(cleanUrl);
    if (check.type === "invalid") {
      setErrorMessage(
        "Unsupported URL format. Please paste a valid YouTube (e.g. https://www.youtube.com/watch?v=...) or Spotify track link (e.g. https://open.spotify.com/track/...)."
      );
      return;
    }

    setErrorMessage("");
    setNoticeMessage("");
    setIsConverting(true);
    setConversionProgress(10);
    setProgressStage("Analyzing source URL and verifying permissions...");

    try {
      // Step 1: Validate URL & fetch metadata
      await animateProgress([
        { pct: 25, text: `Connecting to ${check.type === "spotify" ? "Spotify" : "YouTube"} metadata service...`, delay: 350 },
        { pct: 50, text: "Extracting official title, artist & album artwork...", delay: 400 },
      ]);

      const res = await fetch("/api/audio/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          quality: selectedQuality,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to convert audio from the provided link.");
      }

      await animateProgress([
        { pct: 75, text: `Matching high-fidelity audio stream (${selectedQuality} kbps)...`, delay: 400 },
        { pct: 90, text: `Encoding MP3 at ${selectedQuality} kbps with embedded ID3 tags...`, delay: 450 },
        { pct: 100, text: "Conversion successful! MP3 file ready.", delay: 200 },
      ]);

      setConvertedTrack(data.track);
      if (data.note) {
        setNoticeMessage(data.note);
      }
    } catch (err) {
      console.error("[MP3 Converter] Link conversion error:", err);
      setErrorMessage(err.message || "Conversion failed. Please verify the URL or try uploading an audio file.");
    } finally {
      setIsConverting(false);
    }
  };

  // Convert Local Audio File (.wav, .m4a, .aac, .ogg, etc.)
  const handleConvertLocalFile = async () => {
    if (!selectedLocalFile) {
      setErrorMessage("Please select an audio file to convert.");
      return;
    }

    setErrorMessage("");
    setNoticeMessage("");
    setIsConverting(true);
    setConversionProgress(15);
    setProgressStage(`Decoding "${selectedLocalFile.name}" via FFmpeg Audio Engine...`);

    try {
      const formData = new FormData();
      formData.append("file", selectedLocalFile);
      formData.append("quality", selectedQuality);

      await animateProgress([
        { pct: 35, text: "Analyzing input audio samples and structure...", delay: 300 },
        { pct: 65, text: `Encoding into genuine ${selectedQuality} kbps MP3 via FFmpeg...`, delay: 400 },
        { pct: 90, text: "Verifying MPEG Layer-III frame structure & tags...", delay: 300 },
      ]);

      const res = await fetch("/api/audio/convert", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to convert local audio file.");
      }

      await animateProgress([
        { pct: 100, text: "MP3 conversion complete!", delay: 200 },
      ]);

      // Retrieve converted MP3 binary blob so local playback and self-mix have real MP3
      let mp3Blob = null;
      if (data.track?.downloadUrl) {
        try {
          const blobRes = await fetch(data.track.downloadUrl);
          if (blobRes.ok) {
            mp3Blob = await blobRes.blob();
          }
        } catch {}
      }

      const localTrackObj = {
        ...data.track,
        blob: mp3Blob || selectedLocalFile,
        audioUrl: mp3Blob ? URL.createObjectURL(mp3Blob) : data.track.audioUrl,
        downloadUrl: data.track.downloadUrl,
        originalFilename: selectedLocalFile.name,
      };

      setConvertedTrack(localTrackObj);
      setNoticeMessage(`Successfully converted "${selectedLocalFile.name}" to ${selectedQuality} kbps MP3 format.`);
    } catch (err) {
      console.error("[MP3 Converter] Local file error:", err);
      setErrorMessage(err.message || "Failed to process local audio file. Please ensure it is a valid audio format.");
    } finally {
      setIsConverting(false);
    }
  };

  // Trigger MP3 Browser Download
  const handleDownloadMp3 = async () => {
    if (!convertedTrack) return;

    try {
      // Determine default clean filename: original media title with .mp3
      const defaultFilename = sanitizeMediaFilename(
        convertedTrack.originalFilename || convertedTrack.title || "Song",
        "mp3"
      );

      // Download via Download API route
      const downloadHref =
        convertedTrack.downloadUrl ||
        `/api/audio/download?audioUrl=${encodeURIComponent(convertedTrack.audioUrl)}&title=${encodeURIComponent(convertedTrack.title)}&artist=${encodeURIComponent(convertedTrack.artist)}&quality=${convertedTrack.bitrate || 320}&coverUrl=${encodeURIComponent(convertedTrack.coverUrl || "")}&format=mp3&filename=${encodeURIComponent(defaultFilename)}`;

      const res = await fetch(downloadHref, { credentials: "include" });
      if (!res.ok) {
        let errMessage = `Download failed with HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch {}
        throw new Error(errMessage);
      }

      // Respect the exact filename provided by the server in Content-Disposition
      const disposition = res.headers.get("Content-Disposition");
      const resolvedFilename = parseFilenameFromDisposition(disposition, defaultFilename);

      const audioBlob = await res.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = resolvedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    } catch (err) {
      console.error("[MP3 Converter] Download error:", err);
      setErrorMessage(err.message || "Failed to download MP3 file. Please try again.");
    }
  };

  // Add Converted Song to Self Mix
  const handleAddToSelfMix = async (targetMixId) => {
    if (!convertedTrack || !targetMixId) return;

    // Check for duplicates in target playlist
    const targetMix = selfMixes.find((m) => String(m.id) === String(targetMixId));
    if (targetMix) {
      const isDuplicate = (targetMix.tracks || []).some(
        (t) =>
          t.title?.toLowerCase().trim() === convertedTrack.title?.toLowerCase().trim() &&
          t.artist?.toLowerCase().trim() === convertedTrack.artist?.toLowerCase().trim()
      );
      if (isDuplicate) {
        alert(`"${convertedTrack.title}" is already in "${targetMix.title}".`);
        return;
      }
    }

    setIsSavingToMix(true);
    try {
      const trackId = `selfmix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // 1. Ensure actual audio binary is retrieved and stored into IndexedDB
      let audioBlob = convertedTrack.blob;
      if (!audioBlob && convertedTrack.audioUrl) {
        try {
          const directFetch = await fetch(convertedTrack.audioUrl);
          if (directFetch.ok) {
            audioBlob = await directFetch.blob();
          }
        } catch {
          // Cross-origin fallback: use same-origin download proxy
          try {
            const proxyUrl = convertedTrack.downloadUrl || `/api/audio/download?audioUrl=${encodeURIComponent(convertedTrack.audioUrl)}&title=${encodeURIComponent(convertedTrack.title)}&artist=${encodeURIComponent(convertedTrack.artist)}&quality=${convertedTrack.bitrate || 320}&format=mp3`;
            const proxyFetch = await fetch(proxyUrl);
            if (proxyFetch.ok) {
              audioBlob = await proxyFetch.blob();
            }
          } catch (proxyErr) {
            console.warn("[MP3 Converter] Audio blob proxy retrieval warning:", proxyErr);
          }
        }
      }

      if (audioBlob) {
        await saveLocalAudioFile(trackId, audioBlob, {
          fileName: `${convertedTrack.title}.mp3`,
          fileType: "audio/mpeg",
          fileSize: audioBlob.size,
        });
      }

      // 2. Prepare normalized track model compatible with Self Mix
      const isTransientBlobUrl = typeof convertedTrack.audioUrl === "string" && convertedTrack.audioUrl.startsWith("blob:");
      const songForMix = {
        id: trackId,
        title: convertedTrack.title,
        artist: convertedTrack.artist,
        album: targetMix?.title || convertedTrack.album || "Self Mix Audio",
        duration: convertedTrack.duration || 210,
        durationFormatted: convertedTrack.durationFormatted || "3:30",
        coverUrl: convertedTrack.coverUrl,
        audioUrl: isTransientBlobUrl ? null : convertedTrack.audioUrl,
        isLocal: true,
        source: "local-upload",
        badge: `${convertedTrack.quality || "320 kbps"} MP3`,
        badgeType: "cyan",
        fileName: `${convertedTrack.title}.mp3`,
        fileSize: audioBlob?.size || 0,
      };

      // 3. Add to target Self Mix playlist
      addLocalTracksToSelfMix(targetMixId, [songForMix]);

      setAddedSuccessMessage(`Added "${convertedTrack.title}" to ${targetMix?.title || "Self Mix"}!`);
      if (onPlaylistUpdated) {
        onPlaylistUpdated(targetMixId);
      }

      setTimeout(() => {
        setAddedSuccessMessage("");
        setShowAddToMixModal(false);
      }, 1500);
    } catch (err) {
      console.error("[MP3 Converter] Add to Self Mix error:", err);
      alert("Failed to add track to Self Mix: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingToMix(false);
    }
  };

  // Create New Self Mix and Add Track
  const handleCreateNewMixAndAdd = async (e) => {
    e?.preventDefault?.();
    const title = newMixTitle.trim() || `${convertedTrack.title} Mix`;

    setIsSavingToMix(true);
    try {
      const trackId = `selfmix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      let audioBlob = convertedTrack.blob;

      if (!audioBlob && convertedTrack.audioUrl) {
        try {
          const directFetch = await fetch(convertedTrack.audioUrl);
          if (directFetch.ok) {
            audioBlob = await directFetch.blob();
          }
        } catch {
          try {
            const proxyUrl = convertedTrack.downloadUrl || `/api/audio/download?audioUrl=${encodeURIComponent(convertedTrack.audioUrl)}&title=${encodeURIComponent(convertedTrack.title)}&artist=${encodeURIComponent(convertedTrack.artist)}&quality=${convertedTrack.bitrate || 320}&format=mp3`;
            const proxyFetch = await fetch(proxyUrl);
            if (proxyFetch.ok) {
              audioBlob = await proxyFetch.blob();
            }
          } catch (proxyErr) {
            console.warn("[MP3 Converter] Audio blob proxy retrieval warning:", proxyErr);
          }
        }
      }

      if (audioBlob) {
        await saveLocalAudioFile(trackId, audioBlob, {
          fileName: `${convertedTrack.title}.mp3`,
          fileType: "audio/mpeg",
          fileSize: audioBlob.size,
        });
      }

      const isTransientBlobUrl = typeof convertedTrack.audioUrl === "string" && convertedTrack.audioUrl.startsWith("blob:");
      const songForMix = {
        id: trackId,
        title: convertedTrack.title,
        artist: convertedTrack.artist,
        album: title,
        duration: convertedTrack.duration || 210,
        durationFormatted: convertedTrack.durationFormatted || "3:30",
        coverUrl: convertedTrack.coverUrl,
        audioUrl: isTransientBlobUrl ? null : convertedTrack.audioUrl,
        isLocal: true,
        source: "local-upload",
        badge: `${convertedTrack.quality || "320 kbps"} MP3`,
        badgeType: "cyan",
        fileName: `${convertedTrack.title}.mp3`,
        fileSize: audioBlob?.size || 0,
      };

      const newMix = createSelfMix(title, [songForMix], convertedTrack.coverUrl);

      setAddedSuccessMessage(`Created "${title}" and added your converted MP3!`);
      if (onPlaylistUpdated) {
        onPlaylistUpdated(newMix?.id);
      }

      setTimeout(() => {
        setAddedSuccessMessage("");
        setShowAddToMixModal(false);
        setIsCreatingNewMix(false);
        setNewMixTitle("");
      }, 1500);
    } catch (err) {
      console.error("[MP3 Converter] Create mix error:", err);
      alert("Failed to create new Self Mix: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingToMix(false);
    }
  };

  return (
    <div className="w-full mt-10 pt-10 border-t border-white/10 flex flex-col gap-6">
      {/* Hidden Audio Element for Song Preview */}
      {convertedTrack?.audioUrl && (
        <audio
          ref={previewAudioRef}
          src={convertedTrack.audioUrl}
          onPlay={() => setIsPreviewPlaying(true)}
          onPause={() => setIsPreviewPlaying(false)}
          onEnded={() => setIsPreviewPlaying(false)}
          preload="none"
        />
      )}

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              transform
            </span>
            <span className="text-[11px] font-bold text-primary uppercase tracking-widest">
              Audio Utility
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            MP3 Converter
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider font-mono">
              Lossless Engine
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-outline max-w-2xl leading-relaxed">
            Convert YouTube & Spotify links or raw audio stems into studio-quality MP3 files (up to 320 kbps). Stream in-app, download directly, or add instantly to your Self Mix playlists.
          </p>
        </div>

        {/* Tab Switcher: Web Link vs Local File */}
        <div className="flex items-center p-1 rounded-xl bg-surface-container border border-white/5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab("link");
              setErrorMessage("");
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "link"
                ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)]"
                : "text-outline hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
            <span>Web Link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("upload");
              setErrorMessage("");
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "upload"
                ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)]"
                : "text-outline hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            <span>Local Audio</span>
          </button>
        </div>
      </div>

      {/* Main Conversion Control Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-container-high/60 border border-white/10 backdrop-blur-md shadow-xl flex flex-col gap-5">
        {/* TAB 1: Link Converter (YouTube / Spotify) */}
        {activeTab === "link" && (
          <form onSubmit={handleConvertLink} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">
                    music_cast
                  </span>
                  Song URL (YouTube or Spotify)
                </label>
                {detectedSource && detectedSource.type !== "invalid" && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    detectedSource.type === "spotify"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                  }`}>
                    <span className="material-symbols-outlined text-[13px]">
                      {detectedSource.type === "spotify" ? "album" : "smart_display"}
                    </span>
                    {detectedSource.type === "spotify" ? "Spotify Track Link" : "YouTube Video Link"}
                  </span>
                )}
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (errorMessage) setErrorMessage("");
                  }}
                  disabled={isConverting}
                  placeholder="Paste YouTube or Spotify link here..."
                  className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder:text-outline/60 outline-none transition-all"
                />
                {urlInput && (
                  <button
                    type="button"
                    onClick={() => setUrlInput("")}
                    className="absolute right-3 text-outline hover:text-white p-1 rounded-full cursor-pointer"
                    title="Clear URL"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quality Presets Selector & Convert Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-outline uppercase tracking-wider">
                  Target Audio Quality
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {QUALITY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isConverting}
                      onClick={() => setSelectedQuality(preset.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedQuality === preset.id
                          ? "bg-primary/15 border-primary text-primary shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                          : "bg-surface-container border-white/5 text-outline hover:text-white hover:border-white/15"
                      }`}
                      title={preset.desc}
                    >
                      <span>{preset.label}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-outline uppercase font-mono">
                        {preset.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isConverting || !urlInput.trim()}
                className="px-6 py-3 rounded-xl bg-primary text-surface-container-lowest font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(76,215,246,0.45)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:self-end"
              >
                {isConverting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">
                      progress_activity
                    </span>
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <span>Convert to MP3</span>
                    <span className="material-symbols-outlined text-[18px]">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Local Audio File Converter */}
        {activeTab === "upload" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">
                  audio_file
                </span>
                Select Local Audio File (.WAV, .M4A, .AAC, .OGG, .FLAC)
              </label>

              <input
                ref={localFileInputRef}
                type="file"
                accept="audio/*,.wav,.m4a,.aac,.flac,.ogg,.webm"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedLocalFile(e.target.files[0]);
                    setErrorMessage("");
                  }
                }}
              />

              <div
                onClick={() => localFileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-primary/50 bg-surface-container-lowest/60 hover:bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[26px]">
                    upload
                  </span>
                </div>
                {selectedLocalFile ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-bold text-white">
                      {selectedLocalFile.name}
                    </span>
                    <span className="text-xs text-cyan-300 font-mono">
                      {(selectedLocalFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for MP3 conversion
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-white">
                      Click to choose an audio file from your device
                    </span>
                    <span className="text-xs text-outline">
                      Supports .wav, .m4a, .aac, .ogg, and .webm formats
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quality Presets Selector & Local Convert Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-outline uppercase tracking-wider">
                  Target Audio Quality
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {QUALITY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isConverting}
                      onClick={() => setSelectedQuality(preset.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedQuality === preset.id
                          ? "bg-primary/15 border-primary text-primary shadow-[0_0_12px_rgba(76,215,246,0.25)]"
                          : "bg-surface-container border-white/5 text-outline hover:text-white hover:border-white/15"
                      }`}
                      title={preset.desc}
                    >
                      <span>{preset.label}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-outline uppercase font-mono">
                        {preset.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleConvertLocalFile}
                disabled={isConverting || !selectedLocalFile}
                className="px-6 py-3 rounded-xl bg-primary text-surface-container-lowest font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(76,215,246,0.45)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:self-end"
              >
                {isConverting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">
                      progress_activity
                    </span>
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <span>Encode to MP3</span>
                    <span className="material-symbols-outlined text-[18px]">
                      precision_manufacturing
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Conversion Progress Bar */}
        {isConverting && (
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-lowest border border-primary/20 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  sync
                </span>
                {progressStage}
              </span>
              <span className="text-cyan-300 font-mono font-bold">
                {conversionProgress}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-primary to-secondary rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(76,215,246,0.6)]"
                style={{ width: `${conversionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-700/40 flex items-start gap-2.5 text-xs text-red-200 animate-in fade-in duration-150">
            <span className="material-symbols-outlined text-red-400 text-[18px] flex-shrink-0 mt-0.5">
              error
            </span>
            <div className="flex-1">
              <strong className="block font-bold mb-0.5 text-red-300">Conversion Alert:</strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Informative Source Notice */}
        {noticeMessage && (
          <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-2.5 text-xs text-cyan-200/90 animate-in fade-in duration-150">
            <span className="material-symbols-outlined text-cyan-400 text-[18px] flex-shrink-0 mt-0.5">
              info
            </span>
            <span>{noticeMessage}</span>
          </div>
        )}

        {/* Converted Song Preview Card & Action Buttons */}
        {convertedTrack && (
          <div className="mt-2 p-4 sm:p-5 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-[0_0_25px_rgba(76,215,246,0.15)] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">
                  check_circle
                </span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  Conversion Complete
                </span>
              </div>
              <span className="text-[11px] text-outline font-mono">
                Audio Bitrate: {convertedTrack.quality}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Song Information */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden flex-shrink-0 border border-white/15 shadow-md">
                  <img
                    src={convertedTrack.coverUrl}
                    alt={convertedTrack.title}
                    className="w-full h-full object-cover"
                  />
                  {/* In-Card Preview Audio Trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      if (previewAudioRef.current) {
                        if (isPreviewPlaying) {
                          previewAudioRef.current.pause();
                        } else {
                          previewAudioRef.current.play().catch(() => {});
                        }
                      }
                    }}
                    className="absolute inset-0 bg-black/50 hover:bg-black/40 flex items-center justify-center text-white transition-opacity cursor-pointer"
                    title={isPreviewPlaying ? "Pause preview" : "Play preview"}
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      {isPreviewPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {convertedTrack.title}
                  </h3>
                  <p className="text-xs text-outline truncate">
                    {convertedTrack.artist}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold">
                      {convertedTrack.quality} MP3
                    </span>
                    <span className="text-[10px] font-mono text-outline">
                      {convertedTrack.durationFormatted}
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      • {convertedTrack.sourcePlatform}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Download MP3 & Add to Self Mix */}
              <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={handleDownloadMp3}
                  className="px-4 py-2.5 rounded-xl bg-surface-container border border-white/15 hover:border-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm hover:scale-102 cursor-pointer flex-1 sm:flex-none justify-center"
                  title="Download MP3 file to your device"
                >
                  <span className="material-symbols-outlined text-[17px] text-cyan-400">
                    download
                  </span>
                  <span>Download MP3</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddToMixModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-black text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(76,215,246,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer flex-1 sm:flex-none justify-center"
                  title="Add converted MP3 directly into Self Mix playlists"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    library_add
                  </span>
                  <span>Add to Self Mix</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add to Self Mix Modal */}
      {showAddToMixModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isSavingToMix) setShowAddToMixModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-container-high/95 border border-white/15 p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  library_add
                </span>
                <h3 className="text-base font-bold text-white">
                  Add to Self Mix Playlist
                </h3>
              </div>
              <button
                disabled={isSavingToMix}
                onClick={() => setShowAddToMixModal(false)}
                className="p-1 rounded-full text-outline hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Success message banner */}
            {addedSuccessMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">
                  check_circle
                </span>
                <span>{addedSuccessMessage}</span>
              </div>
            )}

            {!isCreatingNewMix ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-outline">
                  Select an existing Self Mix playlist or create a new one:
                </p>

                {/* List of Existing Self Mix Playlists */}
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto no-scrollbar pr-1">
                  {selfMixes && selfMixes.length > 0 ? (
                    selfMixes.map((mix) => (
                      <button
                        key={mix.id}
                        type="button"
                        disabled={isSavingToMix}
                        onClick={() => handleAddToSelfMix(mix.id)}
                        className="w-full p-2.5 rounded-xl bg-surface-container-lowest hover:bg-white/10 border border-white/5 hover:border-primary/40 flex items-center justify-between transition-all cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={mix.coverUrl || mix.cover_url || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80"}
                            alt={mix.title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-white truncate">
                              {mix.title}
                            </span>
                            <span className="text-[10px] text-outline">
                              {mix.tracks?.length || 0} tracks
                            </span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[18px] text-primary">
                          add_circle
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl bg-surface-container text-center text-xs text-outline">
                      No Self Mix playlists yet. Click below to create one.
                    </div>
                  )}
                </div>

                {/* Create New Playlist Option */}
                <button
                  type="button"
                  disabled={isSavingToMix}
                  onClick={() => setIsCreatingNewMix(true)}
                  className="mt-1 w-full py-2.5 rounded-xl border border-dashed border-primary/40 hover:border-primary bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    add
                  </span>
                  <span>Create New Self Mix Playlist</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateNewMixAndAdd} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-outline uppercase tracking-wider">
                    New Playlist Name
                  </label>
                  <input
                    type="text"
                    value={newMixTitle}
                    onChange={(e) => setNewMixTitle(e.target.value)}
                    placeholder={`${convertedTrack?.title || "My Converted"} Mix`}
                    autoFocus
                    maxLength={50}
                    className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-outline/60 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    disabled={isSavingToMix}
                    onClick={() => setIsCreatingNewMix(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-outline hover:text-white cursor-pointer"
                  >
                    Back to Playlists
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingToMix}
                    className="px-4 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {isSavingToMix ? "Creating & Adding..." : "Create & Add"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
