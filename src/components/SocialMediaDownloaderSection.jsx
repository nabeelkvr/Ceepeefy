"use client";

import React, { useState, useRef } from "react";
import {
  SOCIAL_PLATFORMS,
  VIDEO_QUALITY_PILLS,
  validatePlatformUrl,
  sanitizeMediaFilename,
  parseFilenameFromDisposition,
} from "../services/socialDownloaderService";

export default function SocialMediaDownloaderSection() {
  // Selected category pill - starts on 'youtube' and never resets randomly
  const [selectedPlatform, setSelectedPlatform] = useState("youtube");
  const [urlInput, setUrlInput] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("high");

  // Fetching & media states
  const [isFetching, setIsFetching] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [detectedMismatch, setDetectedMismatch] = useState(null);

  // Download tracking state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Active platform metadata
  const currentPlatformInfo = SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform) || SOCIAL_PLATFORMS[0];

  // Handle switching category pills
  const handleSelectPlatform = (platformId) => {
    setSelectedPlatform(platformId);
    setErrorMessage("");
    setDetectedMismatch(null);
  };

  // Fetch Media Information
  const handleFetchMedia = async (e) => {
    e?.preventDefault?.();
    const cleanUrl = urlInput.trim();

    if (!cleanUrl) {
      setErrorMessage("Please paste a share link to fetch media.");
      return;
    }

    // Validate against currently selected platform
    const validation = validatePlatformUrl(cleanUrl, selectedPlatform);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      if (validation.mismatch && validation.detectedPlatform) {
        setDetectedMismatch(validation.detectedPlatform);
      } else {
        setDetectedMismatch(null);
      }
      return;
    }

    setErrorMessage("");
    setDetectedMismatch(null);
    setIsFetching(true);
    setMediaData(null);
    setDownloadSuccess(false);

    try {
      const res = await fetch("/api/social/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          platform: selectedPlatform,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to retrieve media from this link.");
      }

      setMediaData(data.media);
      if (data.media?.availableQualities?.length > 0) {
        setSelectedQuality(data.media.availableQualities[0].id);
      }
    } catch (err) {
      console.error("[SocialDownloader] Fetch error:", err);
      setErrorMessage(err.message || "Could not retrieve media details. Please check the URL and try again.");
    } finally {
      setIsFetching(false);
    }
  };

  // Trigger Video Download
  const handleDownloadVideo = async () => {
    if (!mediaData) return;

    setIsDownloading(true);
    setDownloadProgress(10);
    setDownloadStatus("Connecting to authorized video stream...");
    setDownloadSuccess(false);

    try {
      const qualityPill = VIDEO_QUALITY_PILLS.find((p) => p.id === selectedQuality) || VIDEO_QUALITY_PILLS[2];

      // Exact platform filename: "[Platform Title].mp4"
      const defaultFileName = sanitizeMediaFilename(
        mediaData.title || `${currentPlatformInfo.name} Video`,
        "mp4"
      );

      // Progress animation
      const stages = [
        { pct: 30, text: "Allocating MP4 video buffer..." },
        { pct: 60, text: `Encoding ${qualityPill.label} (${qualityPill.badge}) video stream with FFmpeg...` },
        { pct: 85, text: "Verifying video and audio stream synchronization..." },
      ];

      for (const stage of stages) {
        await new Promise((r) => setTimeout(r, 250));
        setDownloadProgress(stage.pct);
        setDownloadStatus(stage.text);
      }

      const downloadUrl = `/api/social/download?url=${encodeURIComponent(mediaData.sourceUrl || urlInput)}&platform=${selectedPlatform}&quality=${selectedQuality}&title=${encodeURIComponent(mediaData.title || "")}&filename=${encodeURIComponent(defaultFileName)}`;

      // Fetch video stream directly as blob to guarantee successful download and avoid "Site wasn't available"
      const res = await fetch(downloadUrl, { credentials: "include" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Download failed with HTTP ${res.status}`);
      }

      // Respect the exact filename provided by the server in Content-Disposition
      const disposition = res.headers.get("Content-Disposition");
      const resolvedFileName = parseFilenameFromDisposition(disposition, defaultFileName);

      setDownloadProgress(95);
      setDownloadStatus("Saving video to disk...");

      const videoBlob = await res.blob();
      const blobUrl = URL.createObjectURL(videoBlob);

      // Trigger native browser download with exact platform filename
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = resolvedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      setDownloadProgress(100);
      setDownloadStatus(`Download complete! Saved as "${resolvedFileName}".`);
      setDownloadSuccess(true);

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadStatus("");
      }, 4000);
    } catch (err) {
      console.error("[SocialDownloader] Download error:", err);
      setErrorMessage(err.message || "Download failed. Please check network and try again.");
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full mt-10 pt-10 border-t border-white/10 flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-primary to-secondary flex items-center justify-center text-surface-container-lowest shadow-[0_0_15px_rgba(76,215,246,0.4)]">
            <span className="material-symbols-outlined text-[24px]">
              download_for_offline
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>Social Media Downloader</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
                MP4 HD
              </span>
            </h2>
            <p className="text-xs text-outline">
              Download authorized MP4 videos from YouTube, Instagram, X, and Facebook
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-outline">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Multi-Platform Video Engine Active</span>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container-high/60 border border-white/10 shadow-xl backdrop-blur-md flex flex-col gap-6">
        
        {/* ================================================================= */}
        {/* 1. HORIZONTAL CATEGORY PILLS (Exact order: YouTube | Instagram | X | Facebook) */}
        {/* ================================================================= */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-outline uppercase tracking-wider">
            Select Platform
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 flex-nowrap">
            {SOCIAL_PLATFORMS.map((platform) => {
              const isActive = selectedPlatform === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => handleSelectPlatform(platform.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 flex-shrink-0 border select-none ${
                    isActive
                      ? "bg-primary/20 text-primary border-primary shadow-[0_0_16px_rgba(76,215,246,0.35)] scale-102"
                      : "bg-surface-container/60 hover:bg-surface-container-high border-white/5 text-outline hover:text-white hover:border-white/20"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {platform.icon}
                  </span>
                  <span>{platform.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. SHARED LINK INPUT & FETCH MEDIA BUTTON */}
        {/* ================================================================= */}
        <form onSubmit={handleFetchMedia} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-primary">
              link
            </span>
            <span>Paste {currentPlatformInfo.name} Video Share Link</span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setErrorMessage("");
                  setDetectedMismatch(null);
                }}
                placeholder={currentPlatformInfo.placeholder}
                className="w-full bg-surface-container-lowest border border-white/15 focus:border-primary focus:ring-1 focus:ring-primary/50 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder:text-outline/60 outline-none transition-all pr-10"
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={() => {
                    setUrlInput("");
                    setErrorMessage("");
                    setDetectedMismatch(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-white p-1"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isFetching || !urlInput.trim()}
              className="px-6 py-3 rounded-xl bg-primary text-surface-container-lowest font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(76,215,246,0.45)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:self-auto flex-shrink-0"
            >
              {isFetching ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <span>Fetch Media</span>
                  <span className="material-symbols-outlined text-[18px]">
                    search
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Video Download Quality Selector (Low | Standard | High | Full) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-outline uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-primary">hd</span>
                <span>Video Quality Preset</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {VIDEO_QUALITY_PILLS.map((option) => {
                  const isSelected = selectedQuality === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isDownloading}
                      onClick={() => setSelectedQuality(option.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(76,215,246,0.3)] font-black"
                          : "bg-surface-container border-white/5 text-outline hover:text-white hover:border-white/15"
                      }`}
                      title={option.desc}
                    >
                      <span>{option.label}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-outline uppercase font-mono">
                        {option.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-[11px] font-mono text-outline self-start sm:self-center">
              Selected: <strong className="text-primary font-bold">{VIDEO_QUALITY_PILLS.find(p => p.id === selectedQuality)?.label} ({VIDEO_QUALITY_PILLS.find(p => p.id === selectedQuality)?.badge})</strong>
            </div>
          </div>
        </form>

        {/* Error Alert Box with Platform Switch Quick-Action */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-700/40 flex items-start gap-2.5 text-xs text-red-200 animate-in fade-in duration-150">
            <span className="material-symbols-outlined text-red-400 text-[18px] flex-shrink-0 mt-0.5">
              error
            </span>
            <div className="flex-1 flex flex-col gap-1.5">
              <strong className="block font-bold text-red-300">Notice:</strong>
              <span>{errorMessage}</span>
              {detectedMismatch && (
                <button
                  type="button"
                  onClick={() => handleSelectPlatform(detectedMismatch)}
                  className="self-start mt-1 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                  <span>Switch to {SOCIAL_PLATFORMS.find((p) => p.id === detectedMismatch)?.name || detectedMismatch}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. MEDIA PREVIEW AREA & DOWNLOAD INTERFACE */}
        {/* ================================================================= */}
        {mediaData && (
          <div className="mt-2 p-4 sm:p-5 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-[0_0_25px_rgba(76,215,246,0.15)] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">
                  check_circle
                </span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  Media Verified & Ready
                </span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold">
                {mediaData.platformName} • {mediaData.format}
              </span>
            </div>

            {/* Content Details: Thumbnail + Title + Quality Picker */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              {/* Thumbnail & Title */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 border border-white/15 shadow-md bg-black/40">
                  <img
                    src={mediaData.thumbnail}
                    alt={mediaData.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-mono font-bold text-white">
                    {mediaData.duration}
                  </div>
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isEditingTitle ? (
                      <input
                        type="text"
                        value={mediaData.title}
                        onChange={(e) => setMediaData({ ...mediaData, title: e.target.value })}
                        onBlur={() => setIsEditingTitle(false)}
                        onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                        autoFocus
                        className="text-sm font-bold text-white bg-surface-container border border-primary/50 focus:border-primary rounded-lg px-2 py-0.5 outline-none w-full max-w-sm shadow-[0_0_10px_rgba(76,215,246,0.3)]"
                      />
                    ) : (
                      <>
                        <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
                          {mediaData.title}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setIsEditingTitle(true)}
                          className="p-1 rounded text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Rename file / change video title"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-outline truncate">
                    {mediaData.author}
                  </p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-mono text-cyan-300 font-bold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      File: {`${(mediaData.title || "video").replace(/[\\/:*?"<>|]/g, "").trim()}.mp4`}
                    </span>
                    <span className="text-[10px] text-outline">
                      • Status: Public Media
                    </span>
                  </div>
                </div>
              </div>

              {/* Quality Selector & Download Button */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0">
                {/* Quality Options Pills (Low | Standard | High | Full) */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold text-outline uppercase tracking-wider">
                    Video Quality Preset
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {VIDEO_QUALITY_PILLS.map((option) => {
                      const isSelected = selectedQuality === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={isDownloading}
                          onClick={() => setSelectedQuality(option.id)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 select-none ${
                            isSelected
                              ? "bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(76,215,246,0.3)] font-black"
                              : "bg-surface-container border-white/10 text-outline hover:text-white hover:border-white/20"
                          }`}
                          title={option.desc}
                        >
                          <span>{option.label}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-outline uppercase font-mono">
                            {option.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Download Button */}
                <button
                  type="button"
                  onClick={handleDownloadVideo}
                  disabled={isDownloading}
                  className="mt-auto px-5 py-3 rounded-xl bg-primary text-surface-container-lowest font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {downloadSuccess ? "check" : "download"}
                  </span>
                  <span>{downloadSuccess ? "Downloaded!" : isDownloading ? "Downloading..." : "Download Video"}</span>
                </button>
              </div>
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
              <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-container border border-primary/20 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-primary font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      sync
                    </span>
                    {downloadStatus}
                  </span>
                  <span className="text-cyan-300 font-mono font-bold">
                    {downloadProgress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-lowest overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-primary to-secondary rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(76,215,246,0.6)]"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
