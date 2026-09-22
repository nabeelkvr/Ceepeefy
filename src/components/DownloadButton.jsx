"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const QUALITY_OPTIONS = [
  {
    id: "premium",
    label: "Premium",
    tag: "Full HD",
    bitrate: "320 kbps",
    desc: "Studio Master Quality • Lossless AAC",
    sizeEst: "~8 - 12 MB",
    badgeClass: "bg-primary/20 text-primary border-primary/40",
    icon: "workspace_premium",
    iconColor: "text-primary",
  },
  {
    id: "high",
    label: "High",
    tag: "160 kbps",
    bitrate: "160 kbps",
    desc: "Crisp Audio • ~50% smaller",
    sizeEst: "~4 - 6 MB",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    icon: "high_quality",
    iconColor: "text-emerald-400",
  },
  {
    id: "medium",
    label: "Medium",
    tag: "96 kbps",
    bitrate: "96 kbps",
    desc: "Balanced Sound • ~70% smaller",
    sizeEst: "~2.5 - 3.5 MB",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: "graphic_eq",
    iconColor: "text-amber-400",
  },
  {
    id: "low",
    label: "Low",
    tag: "48 kbps",
    bitrate: "48 kbps",
    desc: "Data Saver • Minimal file size",
    sizeEst: "~1 - 1.8 MB",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    icon: "speed",
    iconColor: "text-purple-400",
  },
];

export default function DownloadButton({
  track,
  className = "",
  buttonSize = "p-1.5",
  iconSize = "text-[18px]",
  onDownloadStart = null,
}) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState(null);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate coordinates bounded strictly between navbar, sidebar, bottom player, and playing style card
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    const menuWidth = 240;
    const menuHeight = 246;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 1. Navbar boundary (Top): ensure menu never cuts behind the header
    const headerEl = document.querySelector("header");
    const headerRect = headerEl?.getBoundingClientRect();
    const minTop = Math.max(70, (headerRect ? headerRect.bottom : 64) + 6);

    // 2. Bottom boundary: ensure menu never clips into bottom player bar or playing card
    let maxBottom = viewportHeight - 12;
    const footerEl = document.querySelector("footer");
    if (footerEl) {
      const fRect = footerEl.getBoundingClientRect();
      if (fRect.top > 0) {
        maxBottom = Math.min(maxBottom, fRect.top - 8);
      }
    }

    // 3. Sidebar boundary (Left): ensure menu never spills inside the sidebar
    let minLeft = 12;
    const sidebarEl = document.querySelector("aside:not([aria-label='Now Playing Card'])");
    if (sidebarEl) {
      const sRect = sidebarEl.getBoundingClientRect();
      if (sRect.right > 50 && sRect.left >= 0) {
        minLeft = sRect.right + 12;
      }
    }

    // 4. Right boundary
    const maxRight = viewportWidth - 12;

    // Horizontal positioning:
    // Prefer aligning right edge of dropdown with right edge of button
    let left = rect.right - menuWidth;
    // If extending to the left crosses into the sidebar, flip to align with button's left edge
    if (left < minLeft) {
      left = rect.left;
    }
    // Clamp strictly within safe content boundaries [minLeft, maxRight - menuWidth]
    left = Math.max(minLeft, Math.min(left, maxRight - menuWidth));

    // Check if Now Playing card is open and overlaps this menu column
    const playingCardEl = document.querySelector("aside[aria-label='Now Playing Card']");
    if (playingCardEl) {
      const cRect = playingCardEl.getBoundingClientRect();
      if (cRect.top > 0 && left < cRect.right && left + menuWidth > cRect.left) {
        maxBottom = Math.min(maxBottom, cRect.top - 8);
      }
    }

    // Vertical positioning:
    // By default, open downwards below the button
    let top = rect.bottom + 8;

    // If opening downwards exceeds maxBottom (too close to player bar or card):
    if (top + menuHeight > maxBottom) {
      const topAbove = rect.top - menuHeight - 8;
      if (topAbove >= minTop) {
        top = topAbove;
      } else {
        // Safe clamp if neither fits completely
        top = Math.max(minTop, Math.min(top, maxBottom - menuHeight));
      }
    }

    // Auto-close if the trigger button has scrolled off-screen
    if (rect.bottom < minTop - 20 || rect.top > maxBottom + 20) {
      setIsOpen(false);
      return;
    }

    setCoords({ top, left });
  };

  // Reposition on scroll and resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDownloading) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelectQuality = async (qualityOpt, e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    setIsDownloading(true);
    setSelectedQuality(qualityOpt.label);

    if (onDownloadStart) {
      onDownloadStart(track, qualityOpt);
    }

    try {
      const params = new URLSearchParams({
        trackId: track.id || "",
        audioUrl: track.audioUrl || "",
        title: track.title || "",
        artist: track.artist || "",
        album: track.album || "",
        year: track.year ? String(track.year) : "",
        coverUrl: track.coverUrl || track.thumbnail || track.image || "",
        quality: qualityOpt.id,
      });

      const res = await fetch(`/api/audio/download?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;

      // Extract filename from Content-Disposition header if available
      let filename = "";
      const disposition = res.headers.get("Content-Disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=([^;]+)/);
        if (match && match[1]) {
          filename = match[1].trim();
        }
      }

      if (!filename) {
        const safeArtist = (track.artist || "Unknown").replace(/[\/\\?%*:|"<>]/g, "").trim();
        const safeTitle = (track.title || "Track").replace(/[\/\\?%*:|"<>]/g, "").trim();
        const ext = blob.type.includes("mp4") ? "m4a" : "mp3";
        filename = `${safeArtist} - ${safeTitle} [${qualityOpt.label}].${ext}`;
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Audio download error:", err);
      // Fallback: If direct stream is known, open in new tab
      if (track.audioUrl) {
        window.open(track.audioUrl, "_blank");
      }
    } finally {
      setIsDownloading(false);
      setSelectedQuality(null);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${isOpen ? "z-50" : ""}`}>
      {/* Trigger Download Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isDownloading}
        className={`${buttonSize} rounded-lg transition-all flex items-center justify-center cursor-pointer ${
          isDownloading
            ? "text-primary cursor-wait"
            : isOpen
            ? "text-primary bg-primary/10 ring-1 ring-primary/40"
            : "text-outline hover:text-white hover:bg-white/10"
        } ${className}`}
        title={
          isDownloading
            ? `Downloading ${selectedQuality || "audio"}...`
            : `Download "${track?.title || "song"}" in Premium, High, Medium, or Low`
        }
      >
        <span
          className={`material-symbols-outlined ${iconSize} ${
            isDownloading ? "animate-spin text-primary" : ""
          }`}
        >
          {isDownloading ? "progress_activity" : "download"}
        </span>
      </button>

      {/* Quality Options Dropdown Popup Menu rendered via Portal into body to escape any card stacking context */}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: "240px",
              zIndex: 999999,
            }}
            className="rounded-xl bg-surface-container-high/95 backdrop-blur-2xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-2 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150 select-none text-left"
          >
            {/* Header */}
            <div className="px-2 py-1 flex items-center justify-between border-b border-white/10 pb-1.5">
              <div className="flex flex-col min-w-0 pr-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary font-mono flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">download</span>
                  Select Quality
                </span>
                <span className="text-[11px] text-white font-medium truncate mt-0.5">
                  {track?.title || "Track"}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="p-1 rounded-full text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>

            {/* 4 Quality Options */}
            <div className="flex flex-col gap-1 pt-0.5">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => handleSelectQuality(opt, e)}
                  className="group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-surface-container/60 hover:bg-surface-container-highest border border-transparent hover:border-white/10 transition-all cursor-pointer text-left"
                >
                  {/* Left: Quality Icon + Label & Badge */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center bg-white/5 border border-white/5 group-hover:scale-105 transition-transform flex-shrink-0 ${opt.iconColor}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {opt.icon}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                        {opt.label}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold border ${opt.badgeClass}`}
                      >
                        {opt.tag}
                      </span>
                    </div>
                  </div>

                  {/* Right: Download Icon */}
                  <div className="flex items-center justify-center w-6 h-6 rounded-md group-hover:bg-primary/10 transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-primary/80 group-hover:text-primary transition-colors">
                      arrow_downward
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer note */}
            <div className="px-2 pt-1.5 pb-0.5 border-t border-white/5 flex items-center justify-between text-[9px] text-outline font-mono">
              <span>Cover art & tags</span>
              <span className="text-primary/70">.M4A / Lossless</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
