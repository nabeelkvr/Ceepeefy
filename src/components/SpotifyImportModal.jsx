"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import { getTrackFingerprint, createSnapshotEntry } from "../services/spotifySyncService";
import { parseSpotifyPlaylistId } from "../services/spotifyPlaylistService";
import { PLAYLIST_CATEGORIES } from "../utils/playlistUtils";

export default function SpotifyImportModal({ isOpen, onClose, defaultCategory = "Mixed" }) {
  const router = useRouter();
  const { importSpotifyPlaylist, playTrack, setQueue } = useMusic();

  // Mode: "url" or "manual_text"
  const [importMode, setImportMode] = useState("url");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Mixed");
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);

  // Workflow states: "input" | "fetching" | "matching" | "preview" | "complete"
  const [stage, setStage] = useState("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [clipboardNotice, setClipboardNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Fetched playlist data & matched results
  const [sourcePlaylist, setSourcePlaylist] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [matchingProgress, setMatchingProgress] = useState({ current: 0, total: 0 });

  // Filtering & Alternative picker
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "review" | "unmatched"
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [customSearchQuery, setCustomSearchQuery] = useState("");
  const [customSearchResults, setCustomSearchResults] = useState([]);
  const [isSearchingCustom, setIsSearchingCustom] = useState(false);
  const [customSearchError, setCustomSearchError] = useState("");
  const [hasPerformedCustomSearch, setHasPerformedCustomSearch] = useState(false);

  // Result summary after import
  const [importedPlaylist, setImportedPlaylist] = useState(null);
  const [importReport, setImportReport] = useState(null);

  const inputRef = useRef(null);

  // Close Category picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isCategoryPickerOpen && !e.target.closest('[data-moveto-container="true"]')) {
        setIsCategoryPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCategoryPickerOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStage("input");
      setPlaylistUrl("");
      setManualText("");
      setManualTitle("");
      setSelectedCategory(defaultCategory || "Mixed");
      setIsCategoryPickerOpen(false);
      setErrorMessage("");
      setClipboardNotice("");
      setSourcePlaylist(null);
      setMatchedItems([]);
      setEditingItemIndex(null);
      setImportedPlaylist(null);
      setImportReport(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultCategory]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && stage !== "matching") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, stage, onClose]);

  if (!isOpen) return null;

  // Handle Clipboard Paste
  const handlePasteClipboard = async () => {
    setClipboardNotice("");
    setErrorMessage("");
    try {
      if (!navigator?.clipboard?.readText) {
        setClipboardNotice("Clipboard API unavailable. Please paste directly using Ctrl+V / Cmd+V.");
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        setPlaylistUrl(text.trim());
      } else {
        setClipboardNotice("Clipboard is empty.");
      }
    } catch (err) {
      console.warn("Clipboard access error:", err);
      setClipboardNotice("Clipboard permission denied. Please paste manually using Ctrl+V / Cmd+V.");
    }
  };

  // Step 1: Fetch Spotify playlist metadata
  const handleFetchPlaylist = async (e) => {
    e?.preventDefault();
    setErrorMessage("");
    setClipboardNotice("");

    if (importMode === "url") {
      if (!playlistUrl.trim()) {
        setErrorMessage("Please enter a Spotify playlist link or URI.");
        return;
      }

      setStage("fetching");
      try {
        const res = await fetch(`/api/spotify/playlist?url=${encodeURIComponent(playlistUrl.trim())}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMessage(
            data.error ||
              "Could not access Spotify playlist. Please ensure the link is public, or try importing via text."
          );
          setStage("input");
          return;
        }

        const playlist = data.playlist;
        if (!playlist || !Array.isArray(playlist.tracks) || playlist.tracks.length === 0) {
          setErrorMessage("The Spotify playlist has no playable tracks.");
          setStage("input");
          return;
        }

        setSourcePlaylist(playlist);
        await startMatchingTracks(playlist.tracks);
      } catch (err) {
        console.error("Fetch playlist error:", err);
        setErrorMessage("Network error connecting to Spotify service. Please check your connection or try again.");
        setStage("input");
      }
    } else {
      // Manual text fallback
      if (!manualText.trim()) {
        setErrorMessage("Please enter at least one song name.");
        return;
      }

      setStage("fetching");
      try {
        const res = await fetch("/api/spotify/playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawText: manualText,
            playlistName: manualTitle.trim() || "My Imported Playlist",
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMessage(data.error || "Failed to process song list.");
          setStage("input");
          return;
        }

        setSourcePlaylist(data.playlist);
        await startMatchingTracks(data.playlist.tracks);
      } catch (err) {
        console.error("Manual text error:", err);
        setErrorMessage("Failed to process tracklist.");
        setStage("input");
      }
    }
  };

  // Step 2: Intelligent Matching against JioSaavn
  const startMatchingTracks = async (tracks) => {
    setStage("matching");
    setMatchingProgress({ current: 0, total: tracks.length });

    try {
      // Process matching in batches with live UI progress tracking
      const batchSize = 8;
      const allResults = [];

      for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);
        let retries = 0;
        let batchMatches = null;

        while (retries < 2 && !batchMatches) {
          try {
            const matchRes = await fetch("/api/spotify/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tracks: batch }),
            });

            if (matchRes.ok) {
              const matchData = await matchRes.json();
              if (Array.isArray(matchData.matches)) {
                batchMatches = matchData.matches;
              }
            } else {
              retries++;
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch (batchErr) {
            retries++;
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        if (batchMatches) {
          allResults.push(...batchMatches);
        } else {
          // If a batch fails after retries, retain every track as unmatched with proper original data
          for (const t of batch) {
            allResults.push({
              spotifyTrack: t,
              status: "unmatched",
              score: 0,
              matchedTrack: null,
              alternatives: [],
              userSelectedTrack: null,
              skipped: false,
            });
          }
        }

        setMatchingProgress({
          current: Math.min(i + batch.length, tracks.length),
          total: tracks.length,
        });
      }

      setMatchedItems(allResults);
      setStage("preview");
    } catch (err) {
      console.error("Matching error:", err);
      setErrorMessage("Error occurred while matching songs. You can review the songs below.");
      setStage("preview");
    }
  };

  // Action: Toggle Skip on track
  const toggleSkipTrack = (index) => {
    setMatchedItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], skipped: !next[index].skipped };
      return next;
    });
  };

  // Action: Retry matching for single track
  const retryTrack = async (index) => {
    const item = matchedItems[index];
    if (!item) return;

    try {
      const res = await fetch("/api/spotify/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: item.spotifyTrack }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result) {
          setMatchedItems((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: data.result.status,
              score: data.result.score,
              matchedTrack: data.result.matchedTrack,
              alternatives: data.result.alternatives,
              userSelectedTrack: null,
            };
            return next;
          });
        }
      }
    } catch (err) {
      console.warn("Retry failed:", err);
    }
  };

  // Action: Retry all unmatched tracks
  const retryAllUnmatched = async () => {
    const unmatchedIndices = matchedItems
      .map((item, idx) => (item.status === "unmatched" && !item.userSelectedTrack ? idx : null))
      .filter((idx) => idx !== null);

    for (const idx of unmatchedIndices) {
      await retryTrack(idx);
    }
  };

  // Helper: Perform custom candidate search via shared JioSaavn search pipeline
  const performCustomSearch = async (queryToSearch) => {
    const q = (queryToSearch || "").trim();
    if (!q) return;

    setIsSearchingCustom(true);
    setCustomSearchError("");
    setHasPerformedCustomSearch(true);

    try {
      const res = await fetch(`/api/spotify/match?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomSearchResults(Array.isArray(data.candidates) ? data.candidates : []);
      } else {
        setCustomSearchError("Search request failed. Please check your network and retry.");
        setCustomSearchResults([]);
      }
    } catch (err) {
      console.warn("Custom search error:", err);
      setCustomSearchError("Network error while searching JioSaavn. Please try again.");
      setCustomSearchResults([]);
    } finally {
      setIsSearchingCustom(false);
    }
  };

  // Action: Open alternative picker for track
  const openAlternativePicker = (index) => {
    setEditingItemIndex(index);
    const item = matchedItems[index];
    const rawName = item?.spotifyTrack?.name || "";
    const cleanTitle = rawName
      .replace(/\s*[\(\[](?:feat\.?|ft\.?|with|from)[^\)\]]*[\)\]]/gi, "")
      .replace(/\s*-\s*(?:remix|version|acoustic|edit|soundtrack|original).*$/gi, "")
      .trim();
    const artist = item?.spotifyTrack?.primaryArtist || "";
    const initialQuery = cleanTitle && artist ? `${cleanTitle} ${artist}`.trim() : (cleanTitle || rawName);
    setCustomSearchQuery(initialQuery);
    setCustomSearchResults([]);
    setCustomSearchError("");
    setHasPerformedCustomSearch(false);

    if (initialQuery) {
      performCustomSearch(initialQuery);
    }
  };

  // Action: Search custom JioSaavn candidates
  const handleCustomSearch = async (e) => {
    e?.preventDefault();
    if (!customSearchQuery.trim()) return;
    await performCustomSearch(customSearchQuery.trim());
  };

  // Action: Select alternative candidate
  const selectAlternative = (index, candidate) => {
    setMatchedItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        userSelectedTrack: candidate,
        status: "matched",
        score: candidate.matchScore || 95,
        skipped: false,
      };
      return next;
    });
    setEditingItemIndex(null);
  };

  // Action: Final Import
  const handleConfirmImport = async () => {
    // Collect all valid playable tracks (excluding skipped or completely unmatched without candidate)
    const tracksToImport = [];
    const occCounts = new Map();
    const syncedSnapshot = [];
    const unresolvedTracks = [];
    let importedCount = 0;
    let skippedCount = 0;
    let unresolvedCount = 0;
    let substitutedCount = 0;

    matchedItems.forEach((item) => {
      const fp = getTrackFingerprint(item.spotifyTrack);
      const occ = occCounts.get(fp) || 0;
      occCounts.set(fp, occ + 1);
      const sourceEntryId = `${fp}#${occ}`;

      if (item.skipped || item.blocked || item.rejected || item.excluded) {
        skippedCount++;
        const customStatus = item.blocked ? "blocked" : item.rejected ? "rejected" : item.status || "skipped";
        syncedSnapshot.push({
          ...createSnapshotEntry(item.spotifyTrack, occ, null, 0, customStatus),
          status: customStatus,
          skipped: true,
          excluded: true,
          skippedAt: Date.now(),
        });
        return;
      }

      const activeCandidate = item.userSelectedTrack || item.matchedTrack;

      if (activeCandidate && activeCandidate.id) {
        // Build playable JioSaavn track object with stable source tracking
        const playableTrack = {
          id: String(activeCandidate.id),
          title: activeCandidate.title || item.spotifyTrack.name,
          artist: activeCandidate.artist || item.spotifyTrack.primaryArtist || "Various Artists",
          album: activeCandidate.album || item.spotifyTrack.album || "Imported Album",
          duration: activeCandidate.duration || Math.round((item.spotifyTrack.duration_ms || 210000) / 1000),
          durationFormatted:
            activeCandidate.durationFormatted || item.spotifyTrack.durationFormatted || "3:30",
          audioUrl: activeCandidate.audioUrl || null,
          coverUrl: activeCandidate.coverUrl || sourcePlaylist?.coverUrl || item.spotifyTrack.coverUrl,
          year: activeCandidate.year || null,
          type: "song",
          source: "jiosaavn",
          sourceEntryId,
          isSpotifyTrack: true,
          spotifyId: item.spotifyTrack.spotifyId || null,
        };
        tracksToImport.push(playableTrack);
        importedCount++;

        syncedSnapshot.push(
          createSnapshotEntry(
            item.spotifyTrack,
            occ,
            playableTrack.id,
            activeCandidate.matchScore || item.score || 100
          )
        );

        if (item.userSelectedTrack) {
          substitutedCount++;
        }
      } else {
        unresolvedCount++;
        const customStatus = item.status || (item.blocked ? "blocked" : item.rejected ? "rejected" : "unavailable");
        unresolvedTracks.push({
          sourceEntryId,
          spotifyTrack: item.spotifyTrack,
          status: customStatus,
          alternatives: item.alternatives || [],
        });
        syncedSnapshot.push({
          ...createSnapshotEntry(item.spotifyTrack, occ, null, 0, customStatus),
          status: customStatus,
          skipped: true,
          excluded: true,
          unresolved: true,
          excludedAt: Date.now(),
        });
      }
    });

    if (tracksToImport.length === 0) {
      setErrorMessage("No songs available to import. Please match or select at least one song.");
      return;
    }

    const spotifyLink =
      (typeof playlistUrl === "string" && playlistUrl.trim()) ||
      (sourcePlaylist?.id ? `https://open.spotify.com/playlist/${sourcePlaylist.id}` : null);

    setIsSaving(true);
    setErrorMessage("");

    try {
      const created = await importSpotifyPlaylist({
        title: sourcePlaylist?.name || "Imported Spotify Playlist",
        description: sourcePlaylist?.description || "Imported Spotify playlist with JioSaavn audio streaming.",
        coverUrl: sourcePlaylist?.coverUrl || tracksToImport[0]?.coverUrl,
        tracks: tracksToImport,
        spotifyUrl: spotifyLink,
        category: selectedCategory,
        sourceMeta: {
          spotifyId: sourcePlaylist?.id || (playlistUrl ? parseSpotifyPlaylistId(playlistUrl) : null) || null,
          spotifyUrl: spotifyLink,
          spotifyLink: spotifyLink,
          snapshotId: sourcePlaylist?.snapshotId || null,
          lastSyncedAt: Date.now(),
          lastSyncStatus: unresolvedCount > 0 ? "partial" : "success",
          totalSourceTracks: sourcePlaylist?.totalTracks || matchedItems.length,
          syncedSnapshot,
          unresolvedTracks,
          excludedTracks: syncedSnapshot.filter(
            (s) =>
              s.skipped ||
              s.excluded ||
              s.status === "skipped" ||
              s.status === "unavailable" ||
              s.status === "blocked" ||
              s.status === "rejected" ||
              s.status === "unresolved"
          ),
          importedCount,
          skippedCount,
          unresolvedCount,
          substitutedCount,
          isPartial: Boolean(sourcePlaylist?.isPartial),
          partialError: sourcePlaylist?.partialError || null,
        },
      });

      setImportedPlaylist(created);
      setImportReport({
        total: sourcePlaylist?.totalTracks || matchedItems.length,
        retrieved: matchedItems.length,
        imported: importedCount,
        skipped: skippedCount,
        unresolved: unresolvedCount,
        substituted: substitutedCount,
        isPartial: Boolean(sourcePlaylist?.isPartial),
        partialError: sourcePlaylist?.partialError || null,
      });
      setStage("complete");
    } catch (saveErr) {
      console.error("Failed to complete Spotify playlist import to cloud:", saveErr);
      setErrorMessage(
        "Could not save the complete playlist to Supabase cloud. " +
          (saveErr?.message || "Please check your network and retry.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Counts
  const importableCount = matchedItems.filter(
    (m) => (m.userSelectedTrack || m.matchedTrack) && !m.skipped
  ).length;
  const confirmedCount = matchedItems.filter(
    (m) => (m.status === "matched" || m.userSelectedTrack) && !m.skipped
  ).length;
  const reviewCount = matchedItems.filter(
    (m) => m.status === "review" && !m.userSelectedTrack && !m.skipped
  ).length;
  const unmatchedCount = matchedItems.filter(
    (m) => m.status === "unmatched" && !m.userSelectedTrack && !m.skipped
  ).length;
  const skippedTotal = matchedItems.filter((m) => m.skipped).length;

  const filteredItems = matchedItems.filter((item) => {
    if (activeFilter === "review") return item.status === "review" && !item.userSelectedTrack && !item.skipped;
    if (activeFilter === "unmatched") return item.status === "unmatched" && !item.userSelectedTrack && !item.skipped;
    return true;
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-surface-container-high border border-outline-variant/30 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 bg-surface-container-highest/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954] shadow-[0_0_15px_rgba(29,185,84,0.2)]">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.464-1.027.25-2.812-1.718-6.353-2.107-10.525-1.155-.403.093-.805-.16-.897-.563-.092-.403.16-.805.563-.897 4.568-1.042 8.497-.6 11.636 1.338.353.214.464.674.25 1.027zm1.468-3.26c-.27.44-.847.578-1.287.308-3.22-1.979-8.128-2.552-11.936-1.396-.497.15-1.026-.134-1.176-.631-.15-.497.134-1.026.631-1.176 4.364-1.324 9.774-.679 13.46 1.588.44.27.578.847.308 1.307zm.126-3.41c-3.86-2.292-10.228-2.503-13.91-1.385-.593.18-1.223-.153-1.403-.746-.18-.593.153-1.223.746-1.403 4.234-1.285 11.272-1.04 15.688 1.583.534.317.708 1.01.391 1.544-.316.533-1.009.708-1.544.391z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Import Spotify Playlist
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] font-mono font-medium">
                  JioSaavn Audio
                </span>
              </h2>
              <p className="text-xs text-outline">Bring your Spotify playlist to Ceepeefy.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* STAGE 1: INPUT STATE */}
          {stage === "input" && (
            <div className="max-w-xl mx-auto py-4 space-y-6">
              <div className="flex rounded-lg bg-surface-container p-1 border border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode("url");
                    setErrorMessage("");
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                    importMode === "url"
                      ? "bg-primary text-surface-container-lowest shadow-sm"
                      : "text-outline hover:text-white"
                  }`}
                >
                  Spotify Playlist Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode("manual_text");
                    setErrorMessage("");
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                    importMode === "manual_text"
                      ? "bg-primary text-surface-container-lowest shadow-sm"
                      : "text-outline hover:text-white"
                  }`}
                >
                  Paste Song Names / Tracklist
                </button>
              </div>

              {/* Move to Category Selection */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954]">
                    <span className="material-symbols-outlined text-[18px]">drive_file_move</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">Move to Category</p>
                    <p className="text-[11px] text-outline">Target category for imported playlist</p>
                  </div>
                </div>

                <div className="relative" data-moveto-container="true">
                  <button
                    type="button"
                    onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-highest/80 hover:bg-surface-container-highest border border-outline-variant/30 hover:border-white/30 text-xs text-white transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#1DB954]">drive_file_move</span>
                    <span className="text-outline">Move to:</span>
                    <span className="font-bold text-white px-2 py-0.5 rounded bg-[#1DB954]/20 text-[#1DB954] text-[11px]">
                      {selectedCategory}
                    </span>
                    <span className={`material-symbols-outlined text-[15px] text-outline transition-transform duration-200 ${isCategoryPickerOpen ? "rotate-180" : ""}`}>
                      expand_more
                    </span>
                  </button>

                  {/* Dropdown displaying category names */}
                  {isCategoryPickerOpen && (
                    <div className="absolute top-full right-0 mt-1.5 z-50 w-44 bg-surface-container-highest/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1 text-[10px] font-bold text-outline uppercase tracking-wider border-b border-white/10 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px] text-[#1DB954]">drive_file_move</span>
                        <span>Move to</span>
                      </div>
                      {PLAYLIST_CATEGORIES.map((catName) => {
                        const isCurrent = selectedCategory === catName;
                        return (
                          <button
                            key={catName}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(catName);
                              setIsCategoryPickerOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                              isCurrent
                                ? "bg-[#1DB954]/20 text-[#1DB954] font-bold"
                                : "text-white/90 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <span>{catName}</span>
                            {isCurrent && (
                              <span className="material-symbols-outlined text-[14px] text-[#1DB954]">check</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {importMode === "url" ? (
                <form onSubmit={handleFetchPlaylist} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                      <span>Spotify Playlist Link or URI</span>
                      <span className="text-[11px] text-outline font-mono">Public or Shared Link</span>
                    </label>

                    <div className="relative flex items-center">
                      <input
                        ref={inputRef}
                        type="text"
                        value={playlistUrl}
                        onChange={(e) => {
                          setPlaylistUrl(e.target.value);
                          setErrorMessage("");
                          setClipboardNotice("");
                        }}
                        placeholder="https://open.spotify.com/playlist/... or spotify:playlist:..."
                        className="w-full pl-3.5 pr-24 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-white placeholder:text-outline/60 text-xs sm:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="absolute right-2 px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 text-primary hover:text-white text-xs font-medium flex items-center gap-1 transition-all active:scale-95 cursor-pointer border border-outline-variant/20"
                      >
                        <span className="material-symbols-outlined text-[15px]">content_paste</span>
                        <span>Paste</span>
                      </button>
                    </div>

                    {clipboardNotice && (
                      <p className="text-[11px] text-amber-400/90 font-sans">{clipboardNotice}</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-container/60 border border-outline-variant/15 text-xs text-outline space-y-1.5">
                    <div className="flex items-center gap-1.5 text-white font-medium">
                      <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                      <span>How it works:</span>
                    </div>
                    <p className="leading-relaxed">
                      Ceepeefy extracts the track names from Spotify and automatically matches them to JioSaavn’s high-resolution audio catalog so you can stream them completely free in studio fidelity.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-surface-container transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!playlistUrl.trim()}
                      className="px-6 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Find Playlist</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleFetchPlaylist} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant">Playlist Title</label>
                    <input
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="e.g. My Favorite Bangers"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-white placeholder:text-outline/60 text-xs sm:text-sm focus:border-primary outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                      <span>Song List (One per line)</span>
                      <span className="text-[11px] text-outline">Format: Song Title - Artist</span>
                    </label>
                    <textarea
                      rows={6}
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder={`Blinding Lights - The Weeknd\nMalare - Vijay Yesudas\nHukum - Anirudh Ravichander\nShape of You - Ed Sheeran`}
                      className="w-full p-3.5 rounded-xl bg-surface-container border border-outline-variant/30 text-white placeholder:text-outline/60 text-xs sm:text-sm font-mono focus:border-primary outline-none resize-none"
                    />
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-surface-container transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!manualText.trim()}
                      className="px-6 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Match Songs</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* STAGE 2: FETCHING / MATCHING PROGRESS */}
          {(stage === "fetching" || stage === "matching") && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                <div className="w-16 h-16 rounded-full border-3 border-primary/30 border-t-primary animate-spin flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[24px]">music_note</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">
                  {stage === "fetching"
                    ? "Retrieving Spotify Playlist Metadata..."
                    : `Matching Songs to JioSaavn Audio...`}
                </h3>
                <p className="text-xs text-outline max-w-md">
                  {stage === "fetching"
                    ? "Reading track names, artist credits, and duration..."
                    : `Intelligently scoring candidates using title, artist, duration, and version verification (${matchingProgress.current} / ${matchingProgress.total})`}
                </p>
              </div>

              {stage === "matching" && matchingProgress.total > 0 && (
                <div className="w-full max-w-md space-y-2">
                  <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden border border-outline-variant/20">
                    <div
                      className="h-full bg-gradient-to-r from-[#1DB954] to-primary transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.round((matchingProgress.current / matchingProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-outline">
                    <span>Processing batches...</span>
                    <span>{Math.round((matchingProgress.current / matchingProgress.total) * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE 3: PLAYLIST PREVIEW & REVIEW TABLE */}
          {stage === "preview" && sourcePlaylist && (
            <div className="space-y-5 animate-fade-in">
              {/* Playlist Summary Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container border border-outline-variant/20">
                <div className="flex items-center gap-3.5">
                  {sourcePlaylist.coverUrl ? (
                    <img
                      src={sourcePlaylist.coverUrl}
                      alt={sourcePlaylist.name}
                      className="w-16 h-16 rounded-lg object-cover shadow-md border border-outline-variant/30 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center text-primary flex-shrink-0">
                      <span className="material-symbols-outlined text-[28px]">playlist_play</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">{sourcePlaylist.name}</h3>
                    <p className="text-xs text-outline line-clamp-1">
                      {sourcePlaylist.description || `Curated by ${sourcePlaylist.owner}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-outline">
                      <span>
                        {sourcePlaylist.totalTracks && sourcePlaylist.totalTracks > matchedItems.length
                          ? `${matchedItems.length} of ${sourcePlaylist.totalTracks} tracks`
                          : `${matchedItems.length} total tracks`}
                      </span>
                      <span>•</span>
                      <span className="text-[#1DB954]">Spotify Source</span>
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{confirmedCount} Matched</span>
                  </div>
                  {reviewCount > 0 && (
                    <div className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-mono font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>{reviewCount} Review</span>
                    </div>
                  )}
                  {unmatchedCount > 0 && (
                    <div className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-mono font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      <span>{unmatchedCount} Unmatched</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Tabs & Bulk Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 rounded-lg bg-surface-container p-1 border border-outline-variant/20">
                  <button
                    onClick={() => setActiveFilter("all")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      activeFilter === "all"
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-outline hover:text-white"
                    }`}
                  >
                    All ({matchedItems.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter("review")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      activeFilter === "review"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "text-outline hover:text-white"
                    }`}
                  >
                    Needs Review ({reviewCount})
                  </button>
                  <button
                    onClick={() => setActiveFilter("unmatched")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      activeFilter === "unmatched"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-outline hover:text-white"
                    }`}
                  >
                    Unmatched ({unmatchedCount})
                  </button>
                </div>

                {unmatchedCount > 0 && (
                  <button
                    onClick={retryAllUnmatched}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 text-xs text-white font-medium flex items-center gap-1.5 transition-all border border-outline-variant/20 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">refresh</span>
                    <span>Retry Unmatched</span>
                  </button>
                )}
              </div>

              {/* Songs Comparison List */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredItems.map((item) => {
                  const realIndex = matchedItems.indexOf(item);
                  const isUserSubstituted = Boolean(item.userSelectedTrack);
                  const activeCandidate = item.userSelectedTrack || item.matchedTrack;

                  return (
                    <div
                      key={realIndex}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                        item.skipped
                          ? "bg-surface-container/30 border-outline-variant/10 opacity-50"
                          : item.status === "matched" || isUserSubstituted
                          ? "bg-surface-container/60 border-outline-variant/20 hover:border-outline-variant/40"
                          : item.status === "review"
                          ? "bg-amber-950/10 border-amber-500/30 hover:border-amber-500/50"
                          : "bg-red-950/10 border-red-500/20 hover:border-red-500/40"
                      }`}
                    >
                      {/* Left: Spotify Original Track */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-[11px] font-mono text-outline w-5 text-right flex-shrink-0">
                          {realIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate flex items-center gap-2">
                            <span>{item.spotifyTrack.name}</span>
                            {item.spotifyTrack.isManual && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface-container text-outline font-mono">
                                Manual
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-outline truncate">
                            {item.spotifyTrack.primaryArtist || item.spotifyTrack.artists?.join(", ")}
                            {item.spotifyTrack.album ? ` • ${item.spotifyTrack.album}` : ""}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Match Status Indicator */}
                      <div className="flex items-center gap-2 self-start sm:self-center px-2">
                        {item.skipped ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-outline/20 text-outline font-mono">
                            SKIPPED
                          </span>
                        ) : isUserSubstituted ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            <span>USER PICK</span>
                          </span>
                        ) : item.status === "matched" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                            <span>{item.score}% Match</span>
                          </span>
                        ) : item.status === "review" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">help</span>
                            <span>{item.score}% Review</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">close</span>
                            <span>Not Found</span>
                          </span>
                        )}
                      </div>

                      {/* Right: Matched JioSaavn Candidate & Controls */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 min-w-0 sm:w-[42%] flex-shrink-0">
                        {activeCandidate ? (
                          <div className="min-w-0 flex-1 text-left sm:text-right">
                            <p className="text-xs font-semibold text-primary truncate">
                              {activeCandidate.title}
                            </p>
                            <p className="text-[11px] text-outline truncate">
                              {activeCandidate.artist} ({activeCandidate.durationFormatted || "3:30"})
                            </p>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1 text-left sm:text-right">
                            <p className="text-xs text-red-400/80 italic">No JioSaavn track found</p>
                            <p className="text-[10px] text-outline">Search or pick substitute</p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Pick Alternative / Search */}
                          <button
                            onClick={() => openAlternativePicker(realIndex)}
                            className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 text-outline hover:text-white transition-all cursor-pointer"
                            title="Pick Alternative Song"
                          >
                            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                          </button>

                          {/* Retry */}
                          {item.status === "unmatched" && (
                            <button
                              onClick={() => retryTrack(realIndex)}
                              className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 text-outline hover:text-white transition-all cursor-pointer"
                              title="Retry Matching"
                            >
                              <span className="material-symbols-outlined text-[16px]">refresh</span>
                            </button>
                          )}

                          {/* Skip Toggle */}
                          <button
                            onClick={() => toggleSkipTrack(realIndex)}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              item.skipped
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-surface-container-highest hover:bg-surface-container-highest/80 text-outline hover:text-white"
                            }`}
                            title={item.skipped ? "Unskip Song" : "Skip Song"}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {item.skipped ? "undo" : "block"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Bottom Confirm Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-outline-variant/20">
                <div className="text-xs text-outline font-mono">
                  <span>
                    Will import <strong className="text-white">{importableCount}</strong> songs
                  </span>
                  {skippedTotal > 0 && <span> ({skippedTotal} skipped)</span>}
                  {unmatchedCount > 0 && (
                    <span className="text-amber-400"> • {unmatchedCount} unresolved will be omitted</span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
                  {/* Move to Category Selection */}
                  <div className="relative" data-moveto-container="true">
                    <button
                      type="button"
                      onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-container border border-outline-variant/30 hover:border-white/30 text-xs text-white transition-all cursor-pointer shadow-sm"
                      title="Select category to move imported playlist into"
                    >
                      <span className="material-symbols-outlined text-[17px] text-[#1DB954]">drive_file_move</span>
                      <span className="text-outline">Move to:</span>
                      <span className="font-bold text-white px-2 py-0.5 rounded bg-[#1DB954]/20 text-[#1DB954] text-[11px]">
                        {selectedCategory}
                      </span>
                      <span className={`material-symbols-outlined text-[16px] text-outline transition-transform duration-200 ${isCategoryPickerOpen ? "rotate-180" : ""}`}>
                        expand_more
                      </span>
                    </button>

                    {/* Dropdown displaying category names */}
                    {isCategoryPickerOpen && (
                      <div className="absolute bottom-full right-0 mb-1.5 z-50 w-44 bg-surface-container-highest/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-3 py-1 text-[10px] font-bold text-outline uppercase tracking-wider border-b border-white/10 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[12px] text-[#1DB954]">drive_file_move</span>
                          <span>Move to</span>
                        </div>
                        {PLAYLIST_CATEGORIES.map((catName) => {
                          const isCurrent = selectedCategory === catName;
                          return (
                            <button
                              key={catName}
                              type="button"
                              onClick={() => {
                                setSelectedCategory(catName);
                                setIsCategoryPickerOpen(false);
                              }}
                              className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                isCurrent
                                  ? "bg-[#1DB954]/20 text-[#1DB954] font-bold"
                                  : "text-white/90 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <span>{catName}</span>
                              {isCurrent && (
                                <span className="material-symbols-outlined text-[14px] text-[#1DB954]">check</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setStage("input")}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-surface-container transition-all cursor-pointer disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importableCount === 0 || isSaving}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-surface-container-lowest border-t-transparent animate-spin" />
                        <span>Saving to Cloud Database...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                        <span>Import Playlist ({importableCount} Tracks)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 4: COMPLETE / SUCCESS REPORT */}
          {stage === "complete" && importedPlaylist && (
            <div className="py-8 text-center space-y-6 max-w-lg mx-auto animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                <span className="material-symbols-outlined text-[32px]">check_circle</span>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Playlist Successfully Imported!</h3>
                <p className="text-xs text-outline">
                  "{importedPlaylist.title}" has been saved into your Ceepeefy library and is ready for lossless audio playback.
                </p>
              </div>

              {/* Import Statistics Box */}
              {importReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 text-center font-mono">
                    <div className="p-2 rounded-lg bg-surface-container-highest/40">
                      <p className="text-[10px] text-outline">Total</p>
                      <p className="text-base font-bold text-white">{importReport.total}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <p className="text-[10px] text-emerald-400">Imported</p>
                      <p className="text-base font-bold text-emerald-400">{importReport.imported}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <p className="text-[10px] text-amber-400">Unresolved</p>
                      <p className="text-base font-bold text-amber-400">{importReport.unresolved}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-highest/40">
                      <p className="text-[10px] text-outline">Skipped</p>
                      <p className="text-base font-bold text-outline">{importReport.skipped}</p>
                    </div>
                  </div>

                  {importReport.unresolved > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left flex items-start gap-2">
                      <span className="material-symbols-outlined text-[17px] flex-shrink-0 text-amber-400">info</span>
                      <span>
                        {importReport.unresolved} song{importReport.unresolved > 1 ? "s" : ""} could not be automatically matched on JioSaavn and {importReport.unresolved > 1 ? "were" : "was"} omitted from playback.
                      </span>
                    </div>
                  )}

                  {importReport.isPartial && importReport.partialError && (
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs text-left flex items-start gap-2">
                      <span className="material-symbols-outlined text-[17px] flex-shrink-0 text-cyan-400">sync_problem</span>
                      <span>{importReport.partialError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/playlist/${importedPlaylist.id}`);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container-highest hover:bg-surface-container-highest/80 text-white font-semibold text-xs border border-outline-variant/30 transition-all cursor-pointer"
                >
                  View Playlist
                </button>
                <button
                  onClick={() => {
                    if (importedPlaylist.tracks?.length > 0) {
                      playTrack(importedPlaylist.tracks[0]);
                      setQueue(importedPlaylist.tracks);
                    }
                    onClose();
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs shadow-[0_0_15px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[17px]">play_arrow</span>
                  <span>Play All Now</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL: ALTERNATIVE CANDIDATE PICKER SUB-PANEL */}
        {editingItemIndex !== null && matchedItems[editingItemIndex] && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-5 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div>
                <h4 className="text-sm font-bold text-white">Select Alternative Match</h4>
                <p className="text-xs text-outline truncate">
                  For Spotify track: "{matchedItems[editingItemIndex].spotifyTrack.name}" by{" "}
                  {matchedItems[editingItemIndex].spotifyTrack.primaryArtist}
                </p>
              </div>
              <button
                onClick={() => setEditingItemIndex(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-white hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Custom Search Input */}
            <form onSubmit={handleCustomSearch} className="my-3 flex items-center gap-2">
              <input
                type="text"
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                placeholder="Search JioSaavn catalog by song, artist, or movie..."
                className="flex-1 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30 text-white text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={isSearchingCustom}
                className="px-4 py-2 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                {isSearchingCustom ? (
                  <span>Searching...</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">search</span>
                    <span>Search</span>
                  </>
                )}
              </button>
            </form>

            {/* Candidates List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {/* Search Loading Indicator */}
              {isSearchingCustom && (
                <div className="py-8 text-center text-xs text-outline flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span>Searching full JioSaavn catalog...</span>
                </div>
              )}

              {/* Search Error State */}
              {!isSearchingCustom && customSearchError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{customSearchError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => performCustomSearch(customSearchQuery)}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* No Results Empty State */}
              {!isSearchingCustom && !customSearchError && hasPerformedCustomSearch && customSearchResults.length === 0 && (
                <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20 text-center space-y-1">
                  <p className="text-xs font-medium text-white">No matching songs found on JioSaavn</p>
                  <p className="text-[11px] text-outline">
                    No results for "{customSearchQuery}". Try searching with just the song title or an alternate spelling.
                  </p>
                </div>
              )}

              {/* Show Custom Search Results */}
              {!isSearchingCustom && customSearchResults.length > 0 && (
                <div className="space-y-1.5 pb-2">
                  <p className="text-[11px] font-mono text-primary font-bold flex items-center justify-between">
                    <span>Search Results ({customSearchResults.length}):</span>
                    <span className="text-[10px] text-outline font-normal">Click to select match</span>
                  </p>
                  {customSearchResults.map((cand) => (
                    <div
                      key={cand.id}
                      onClick={() => selectAlternative(editingItemIndex, cand)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-highest border border-outline-variant/20 hover:border-primary/50 cursor-pointer transition-all gap-3"
                    >
                      {/* Album Cover Thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0 relative">
                        {cand.coverUrl || cand.image ? (
                          <img
                            src={cand.coverUrl || cand.image}
                            alt={cand.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-outline">
                            <span className="material-symbols-outlined text-[18px]">music_note</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{cand.title}</p>
                        <p className="text-[11px] text-outline truncate">
                          {cand.artist} • {cand.album || "Single"} ({cand.durationFormatted || "3:30"})
                        </p>
                      </div>

                      <button className="px-3.5 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary hover:text-surface-container-lowest text-xs font-semibold flex-shrink-0 transition-all cursor-pointer">
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Top candidates discovered by algorithm */}
              {(!hasPerformedCustomSearch || customSearchResults.length === 0) && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-mono text-outline font-bold">Suggested Candidates:</p>
                  {[
                    matchedItems[editingItemIndex].matchedTrack,
                    ...(matchedItems[editingItemIndex].alternatives || []),
                  ]
                    .filter(Boolean)
                    .map((cand, cIdx) => (
                      <div
                        key={cand.id || cIdx}
                        onClick={() => selectAlternative(editingItemIndex, cand)}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-highest border border-outline-variant/20 hover:border-primary/50 cursor-pointer transition-all gap-3"
                      >
                        {/* Artwork */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0 relative">
                          {cand.coverUrl || cand.image ? (
                            <img
                              src={cand.coverUrl || cand.image}
                              alt={cand.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-outline">
                              <span className="material-symbols-outlined text-[18px]">music_note</span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-white truncate">{cand.title}</p>
                            {cand.matchScore && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-mono">
                                {cand.matchScore}%
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-outline truncate">
                            {cand.artist} • {cand.album || "Single"} ({cand.durationFormatted || "3:30"})
                          </p>
                        </div>
                        <button className="px-3.5 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary hover:text-surface-container-lowest text-xs font-semibold flex-shrink-0 transition-all cursor-pointer">
                          Select
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-outline-variant/20 flex justify-end">
              <button
                onClick={() => setEditingItemIndex(null)}
                className="px-4 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-highest text-xs text-outline hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
