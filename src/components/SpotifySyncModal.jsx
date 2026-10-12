"use client";

import React, { useState } from "react";

export default function SpotifySyncModal({
  isOpen,
  onClose,
  syncPlan,
  playlistTitle,
  onConfirmSync,
  isApplying = false,
}) {
  const [selectedAlternatives, setSelectedAlternatives] = useState({});
  const [skippedAddedIds, setSkippedAddedIds] = useState(new Set());
  const [activeReviewId, setActiveReviewId] = useState(null);

  if (!isOpen || !syncPlan) return null;

  const isUpToDate = Boolean(syncPlan.isUpToDate);
  const summary = syncPlan.summary || {};
  const addedMatches = syncPlan.addedMatches || [];
  const removedItems = syncPlan.diff?.removed || [];
  const reorderedItems = syncPlan.diff?.reordered || [];
  const unchangedCount = summary.unchangedCount || 0;
  const manualCount = summary.manualTracksCount || 0;

  const handleSelectCandidate = (sourceEntryId, candidate) => {
    setSelectedAlternatives((prev) => ({
      ...prev,
      [sourceEntryId]: candidate,
    }));
    setActiveReviewId(null);
  };

  const handleToggleSkip = (sourceEntryId) => {
    setSkippedAddedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceEntryId)) next.delete(sourceEntryId);
      else next.add(sourceEntryId);
      return next;
    });
  };

  const handleApply = () => {
    // Build user choice mappings
    const resolvedAdditions = [];
    const unresolvedAdditions = [];

    addedMatches.forEach((item) => {
      if (skippedAddedIds.has(item.sourceEntryId)) {
        return;
      }
      const userCand = selectedAlternatives[item.sourceEntryId];
      if (userCand) {
        resolvedAdditions.push({
          ...item,
          userSelectedTrack: userCand,
        });
      } else if (item.status === "matched" && item.matchedTrack) {
        resolvedAdditions.push(item);
      } else {
        unresolvedAdditions.push({
          sourceEntryId: item.sourceEntryId,
          spotifyTrack: item.spotifyTrack,
          status: "unresolved",
          alternatives: item.alternatives || [],
        });
      }
    });

    onConfirmSync({
      selectedAdditions: resolvedAdditions,
      unresolvedAdditions,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] bg-[#181818] border border-[#282828] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#282828] bg-surface-container-high/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              <span className="material-symbols-outlined text-[22px]">sync</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Spotify Playlist Sync</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  SPOTIFY
                </span>
              </h2>
              <p className="text-xs text-outline truncate max-w-[260px] sm:max-w-sm">
                {playlistTitle || "Imported Playlist"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
          {isUpToDate ? (
            /* Up-to-date notice */
            <div className="flex flex-col items-center justify-center text-center py-8 px-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                <span className="material-symbols-outlined text-[34px]">check_circle</span>
              </div>
              <h3 className="text-lg font-bold text-white">Your playlist is already up to date</h3>
              <p className="text-xs text-outline max-w-md leading-relaxed">
                Spotify has no added, deleted, or reordered songs compared to your last synchronized snapshot. All {unchangedCount} tracks remain preserved.
              </p>
            </div>
          ) : (
            /* Change Summary Preview */
            <>
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-surface-container/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <div className="text-emerald-400 font-extrabold text-lg leading-tight">
                    +{summary.addedCount || 0}
                  </div>
                  <div className="text-[10px] font-medium text-outline uppercase tracking-wider">
                    Added
                  </div>
                </div>

                <div className="bg-surface-container/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <div className="text-red-400 font-extrabold text-lg leading-tight">
                    -{summary.removedCount || 0}
                  </div>
                  <div className="text-[10px] font-medium text-outline uppercase tracking-wider">
                    Removed
                  </div>
                </div>

                <div className="bg-surface-container/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <div className="text-amber-400 font-extrabold text-lg leading-tight">
                    {summary.reorderedCount || 0}
                  </div>
                  <div className="text-[10px] font-medium text-outline uppercase tracking-wider">
                    Reordered
                  </div>
                </div>

                <div className="bg-surface-container/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <div className="text-primary font-extrabold text-lg leading-tight">
                    {unchangedCount}
                  </div>
                  <div className="text-[10px] font-medium text-outline uppercase tracking-wider">
                    Unchanged
                  </div>
                </div>
              </div>

              {/* Informative Preservation Banner */}
              <div className="px-3.5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5">
                  verified
                </span>
                <span className="text-[11px] leading-relaxed text-outline text-left">
                  <strong className="text-white font-medium">Smart Incremental Sync:</strong>{" "}
                  {unchangedCount} existing song{unchangedCount === 1 ? "" : "s"} will remain untouched with their exact JioSaavn IDs, audio streaming, and playback metadata.
                  {manualCount > 0 && ` ${manualCount} manually added Ceepeefy song(s) will be strictly preserved.`}
                </span>
              </div>

              {/* Newly Added Songs Section */}
              {addedMatches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      Songs Added to Spotify ({addedMatches.length})
                    </span>
                    <span className="text-[10px] text-outline font-normal">
                      Intelligently matched to JioSaavn
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar pr-0.5">
                    {addedMatches.map((item) => {
                      const isSkipped = skippedAddedIds.has(item.sourceEntryId);
                      const userPick = selectedAlternatives[item.sourceEntryId];
                      const activeTrack = userPick || item.matchedTrack;
                      const hasReview = (item.status === "review" || item.status === "unmatched") && !userPick;
                      const isReviewOpen = activeReviewId === item.sourceEntryId;

                      return (
                        <div
                          key={item.sourceEntryId}
                          className={`p-2.5 rounded-xl border text-xs transition-all ${
                            isSkipped
                              ? "bg-surface-container/30 border-white/5 opacity-50"
                              : hasReview
                              ? "bg-amber-950/20 border-amber-500/30"
                              : "bg-surface-container/70 border-white/10 hover:border-emerald-500/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {item.spotifyTrack.coverUrl ? (
                                <img
                                  src={item.spotifyTrack.coverUrl}
                                  alt=""
                                  className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-outline flex-shrink-0">
                                  <span className="material-symbols-outlined text-[16px]">music_note</span>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-white truncate text-xs flex items-center gap-2">
                                  <span>{item.spotifyTrack.name}</span>
                                  {userPick && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-mono">
                                      Custom Pick
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-outline truncate">
                                  {item.spotifyTrack.primaryArtist}
                                </div>
                              </div>
                            </div>

                            {/* Status badge & controls */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {hasReview ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  {item.status === "unmatched" ? "Unmatched" : "Needs Review"}
                                </span>
                              ) : activeTrack ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">check</span>
                                  <span>{Math.round(userPick?.matchScore || item.score || 95)}%</span>
                                </span>
                              ) : null}

                              {/* Alternatives button */}
                              {item.alternatives?.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveReviewId((prev) =>
                                      prev === item.sourceEntryId ? null : item.sourceEntryId
                                    )
                                  }
                                  className="px-2 py-1 rounded-lg bg-surface-container text-[10px] font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                                  title="View alternative matches"
                                >
                                  {isReviewOpen ? "Close" : "Alternatives"}
                                </button>
                              )}

                              {/* Skip toggle */}
                              <button
                                type="button"
                                onClick={() => handleToggleSkip(item.sourceEntryId)}
                                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                  isSkipped
                                    ? "text-outline hover:text-white"
                                    : "text-outline hover:text-red-400"
                                }`}
                                title={isSkipped ? "Include song" : "Skip this song"}
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  {isSkipped ? "undo" : "block"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Alternatives Dropdown List */}
                          {isReviewOpen && item.alternatives?.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5 animate-in fade-in duration-150">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-outline">
                                Select JioSaavn Match Alternative:
                              </div>
                              {item.alternatives.map((alt) => (
                                <div
                                  key={alt.id}
                                  onClick={() => handleSelectCandidate(item.sourceEntryId, alt)}
                                  className="p-1.5 rounded-lg bg-surface-container-high/60 hover:bg-primary/20 border border-white/5 hover:border-primary/40 flex items-center justify-between cursor-pointer transition-colors"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-semibold text-white truncate text-[11px]">
                                      {alt.title}
                                    </div>
                                    <div className="text-[10px] text-outline truncate">
                                      {alt.artist} • {alt.album}
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-primary flex-shrink-0">
                                    {Math.round(alt.matchScore || 80)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Removed Songs Section */}
              {removedItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-red-400">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                      Songs Removed from Spotify ({removedItems.length})
                    </span>
                    <span className="text-[10px] text-outline font-normal">
                      Will be safely removed from Ceepeefy playlist
                    </span>
                  </div>

                  <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar pr-0.5">
                    {removedItems.map((rem) => (
                      <div
                        key={rem.sourceEntryId}
                        className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-semibold text-white/90 truncate text-xs">
                            {rem.prevItem?.name || rem.existingTrack?.title}
                          </div>
                          <div className="text-[10px] text-outline truncate">
                            {rem.prevItem?.primaryArtist || rem.existingTrack?.artist}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                          To be removed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reordered Notice */}
              {reorderedItems.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px]">swap_vert</span>
                  <span className="text-[11px]">
                    {reorderedItems.length} track{reorderedItems.length === 1 ? "" : "s"} moved to match the new Spotify sequence without re-matching.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-surface-container-high/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isUpToDate ? "Close" : "Cancel"}
          </button>

          {!isUpToDate && (
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-surface-container-lowest hover:from-emerald-400 hover:to-cyan-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                  <span>Applying Changes...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">sync</span>
                  <span>Apply Changes</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
