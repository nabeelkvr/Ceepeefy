import { normalizeTitle, normalizeArtist, scoreCandidate, matchSingleTrack } from "./spotifyMatcherService.js";

/**
 * Generates a stable fingerprint for a Spotify track.
 * Uses Spotify ID if real, or normalized title + primary artist + duration bucket.
 */
export function getTrackFingerprint(track) {
  if (!track) return "unknown";

  // If real Spotify track ID or explicit ID
  const explicitSpotifyId =
    track.spotifyId ||
    (track.id &&
      typeof track.id === "string" &&
      !track.id.startsWith("embed-") &&
      !track.id.startsWith("spotify-track-") &&
      !track.id.startsWith("local-") &&
      !track.id.startsWith("meta_")
      ? track.id
      : null);

  if (explicitSpotifyId) {
    return `sp_${explicitSpotifyId}`;
  }

  const normTitle = normalizeTitle(track.name || track.title || "");
  const normArtist = normalizeArtist(
    track.primaryArtist ||
      track.artist ||
      (Array.isArray(track.artists) ? track.artists[0] : "") ||
      ""
  );
  const durSec = Math.round(
    ((track.duration_ms ? track.duration_ms / 1000 : (track.duration || 0))) / 5
  );

  return `meta_${normTitle}__${normArtist}__${durSec}`;
}

/**
 * Builds or backfills a synced snapshot entry for a single track.
 */
export function createSnapshotEntry(track, occurrenceIndex = 0, jioTrackId = null, matchScore = 100, customStatus = null) {
  const fingerprint = getTrackFingerprint(track);
  const sourceEntryId = `${fingerprint}#${occurrenceIndex}`;
  const artists = Array.isArray(track.artists)
    ? track.artists
    : [track.primaryArtist || track.artist || "Unknown Artist"];

  const resolvedStatus = customStatus || (jioTrackId ? "matched" : "unresolved");

  return {
    sourceEntryId,
    fingerprint,
    occurrenceIndex,
    spotifyId: track.spotifyId || (track.id && !String(track.id).startsWith("meta_") ? String(track.id) : null),
    name: track.name || track.title || "",
    primaryArtist: track.primaryArtist || track.artist || artists[0] || "Unknown Artist",
    artists,
    album: track.album || "",
    duration_ms: track.duration_ms || (track.duration ? track.duration * 1000 : 0),
    durationFormatted: track.durationFormatted || "3:30",
    coverUrl: track.coverUrl || "",
    jioTrackId: jioTrackId ? String(jioTrackId) : null,
    matchScore: matchScore || (resolvedStatus === "skipped" ? 0 : 100),
    status: resolvedStatus,
    skipped: resolvedStatus === "skipped",
    syncedAt: Date.now(),
  };
}

/**
 * Builds a baseline snapshot from an existing Ceepeefy playlist tracks array.
 * Used for legacy playlists imported before snapshot tracking was introduced.
 */
export function buildSnapshotFromExistingPlaylist(playlist) {
  if (!playlist || !Array.isArray(playlist.tracks)) return [];

  const occCounts = new Map();
  return playlist.tracks.map((t, idx) => {
    // If it already has sourceEntryId, keep it
    const fp = getTrackFingerprint(t);
    const occ = occCounts.get(fp) || 0;
    occCounts.set(fp, occ + 1);

    const sourceEntryId = t.sourceEntryId || `${fp}#${occ}`;
    return {
      sourceEntryId,
      fingerprint: fp,
      occurrenceIndex: occ,
      spotifyId: t.spotifyId || null,
      name: t.title || t.name || "",
      primaryArtist: t.artist || t.primaryArtist || "Unknown Artist",
      artists: Array.isArray(t.artists) ? t.artists : [t.artist || "Unknown Artist"],
      album: t.album || "",
      duration_ms: (t.duration || 0) * 1000,
      durationFormatted: t.durationFormatted || "3:30",
      coverUrl: t.coverUrl || "",
      jioTrackId: String(t.id),
      matchScore: 100,
      status: "matched",
      syncedAt: Date.now(),
    };
  });
}

/**
 * Computes Longest Common Subsequence of indices based on fingerprints.
 * Preserves the order of unchanged songs.
 */
function computeLCSIndices(oldItems, newItems) {
  const m = oldItems.length;
  const n = newItems.length;
  // DP table
  const dp = Array.from({ length: m + 1 }, () => new Int16Array(n + 1));

  for (let i = 0; i < m; i++) {
    const oldFp = oldItems[i].fingerprint;
    for (let j = 0; j < n; j++) {
      if (oldFp === newItems[j].fingerprint) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to find aligned pairs
  const alignedPairs = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldItems[i - 1].fingerprint === newItems[j - 1].fingerprint) {
      alignedPairs.unshift({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return alignedPairs;
}

/**
 * Compares current Spotify tracks with the previous synced snapshot.
 * Detects:
 * - unchanged: track present in both with same identity
 * - added: in current Spotify, not in previous snapshot
 * - removed: in previous snapshot, not in current Spotify
 * - reordered: existing tracks whose relative order shifted
 *
 * Occurrence-aware: tracks duplicate entries accurately.
 */
export function diffSpotifyPlaylist(previousSnapshot = [], currentSpotifyTracks = [], existingPlaylistTracks = []) {
  // 1. Prepare previous snapshot with fingerprints and occurrence indices
  const safePrev = Array.isArray(previousSnapshot) ? [...previousSnapshot] : [];
  const prevItems = safePrev.map((item, idx) => {
    const fp = item.fingerprint || getTrackFingerprint(item);
    return {
      ...item,
      fingerprint: fp,
      origPrevIndex: idx,
      sourceEntryId: item.sourceEntryId || `${fp}#${item.occurrenceIndex || 0}`,
    };
  });

  // 2. Prepare new Spotify tracks with fingerprints and occurrence indices
  const newOccCounts = new Map();
  const newItems = (Array.isArray(currentSpotifyTracks) ? currentSpotifyTracks : []).map((t, idx) => {
    const fp = getTrackFingerprint(t);
    const occ = newOccCounts.get(fp) || 0;
    newOccCounts.set(fp, occ + 1);
    const sourceEntryId = `${fp}#${occ}`;
    return {
      ...t,
      fingerprint: fp,
      occurrenceIndex: occ,
      origNewIndex: idx,
      sourceEntryId,
    };
  });

  // 3. Separate manually added Ceepeefy tracks from Spotify-managed tracks
  // A track is manual if it has isManual: true OR its sourceEntryId is not in previousSnapshot
  const prevSourceEntrySet = new Set(prevItems.map((p) => p.sourceEntryId));
  const manualTracks = [];
  const existingManagedMap = new Map(); // sourceEntryId -> Ceepeefy track object
  const assignedPrevEntries = new Set();

  (Array.isArray(existingPlaylistTracks) ? existingPlaylistTracks : []).forEach((t, idx) => {
    if (t.isManual) {
      manualTracks.push({ track: { ...t, isManual: true }, originalIndex: idx });
      return;
    }

    // 1. Direct match by sourceEntryId
    if (t.sourceEntryId && prevSourceEntrySet.has(t.sourceEntryId)) {
      existingManagedMap.set(t.sourceEntryId, t);
      assignedPrevEntries.add(t.sourceEntryId);
      return;
    }

    // 2. Fallback match for legacy imported tracks without sourceEntryId
    const matchedPrev = prevItems.find((p) => {
      if (assignedPrevEntries.has(p.sourceEntryId)) return false;
      if (p.jioTrackId && String(p.jioTrackId) === String(t.id)) return true;
      if (p.spotifyId && p.spotifyId === t.spotifyId) return true;
      if (p.fingerprint === getTrackFingerprint(t)) return true;
      return false;
    });

    if (matchedPrev) {
      existingManagedMap.set(matchedPrev.sourceEntryId, {
        ...t,
        sourceEntryId: matchedPrev.sourceEntryId,
      });
      assignedPrevEntries.add(matchedPrev.sourceEntryId);
    } else {
      // It is truly a manually added Ceepeefy track
      manualTracks.push({ track: { ...t, isManual: true }, originalIndex: idx });
    }
  });

  // Collect all excluded signatures and stable IDs from previous snapshot
  const excludedSourceEntryIds = new Set();
  const excludedSpotifyIds = new Set();
  const excludedFingerprints = new Set();
  const excludedNormSignatures = new Set();

  prevItems.forEach((p) => {
    const isExcluded =
      p.skipped ||
      p.excluded ||
      p.blocked ||
      p.rejected ||
      p.unresolved ||
      ["skipped", "unavailable", "blocked", "rejected", "unresolved", "unmatched"].includes(
        String(p.status || "").toLowerCase()
      );

    if (isExcluded) {
      if (p.sourceEntryId) excludedSourceEntryIds.add(p.sourceEntryId);
      if (p.spotifyId) excludedSpotifyIds.add(String(p.spotifyId));
      if (p.fingerprint) excludedFingerprints.add(p.fingerprint);
      const nTitle = normalizeTitle(p.name || p.title || "");
      const nArtist = normalizeArtist(p.primaryArtist || p.artist || "");
      if (nTitle && nArtist) {
        excludedNormSignatures.add(`${nTitle}:::${nArtist}`);
      }
    }
  });

  // Collect all existing playlist tracks signatures to avoid duplicating songs
  const existingSourceEntryIds = new Set();
  const existingSpotifyIds = new Set();
  const existingFingerprints = new Set();
  const existingNormSignatures = new Set();

  (Array.isArray(existingPlaylistTracks) ? existingPlaylistTracks : []).forEach((t) => {
    if (t.sourceEntryId) existingSourceEntryIds.add(t.sourceEntryId);
    if (t.spotifyId) existingSpotifyIds.add(String(t.spotifyId));
    const fp = getTrackFingerprint(t);
    if (fp) existingFingerprints.add(fp);
    const nTitle = normalizeTitle(t.title || t.name || "");
    const nArtist = normalizeArtist(t.artist || t.primaryArtist || "");
    if (nTitle && nArtist) {
      existingNormSignatures.add(`${nTitle}:::${nArtist}`);
    }
  });

  // 4. Compute LCS to find unchanged sequence
  const lcsPairs = computeLCSIndices(prevItems, newItems);
  const matchedPrevIndices = new Set(lcsPairs.map((p) => p.oldIdx));
  const matchedNewIndices = new Set(lcsPairs.map((p) => p.newIdx));

  // 5. Look for remaining pairs with identical fingerprints (these are reordered/moved)
  const reorderedPairs = [];
  for (let j = 0; j < newItems.length; j++) {
    if (matchedNewIndices.has(j)) continue;
    const newFp = newItems[j].fingerprint;
    // Find an unmatched old item with the same fingerprint
    const foundOldIdx = prevItems.findIndex(
      (oldItem, i) => !matchedPrevIndices.has(i) && oldItem.fingerprint === newFp
    );
    if (foundOldIdx !== -1) {
      matchedPrevIndices.add(foundOldIdx);
      matchedNewIndices.add(j);
      reorderedPairs.push({ oldIdx: foundOldIdx, newIdx: j });
    }
  }

  // 6. Categorize items
  const unchanged = [];
  const reordered = [];
  const removed = [];
  const added = [];
  const skipped = [];

  // Aligned pairs from LCS (relative sequence preserved)
  lcsPairs.forEach(({ oldIdx, newIdx }) => {
    const prevItem = prevItems[oldIdx];
    const newItem = newItems[newIdx];
    const existingCeepeefyTrack = existingManagedMap.get(prevItem.sourceEntryId) || null;

    const isExcluded =
      prevItem.status === "skipped" ||
      prevItem.skipped ||
      prevItem.excluded ||
      prevItem.blocked ||
      prevItem.rejected ||
      prevItem.status === "unavailable" ||
      prevItem.status === "blocked" ||
      prevItem.status === "rejected" ||
      prevItem.status === "unresolved";

    if (isExcluded) {
      skipped.push({
        sourceEntryId: prevItem.sourceEntryId,
        prevItem,
        newItem,
        status: prevItem.status || "skipped",
        fromIndex: oldIdx,
        targetIndex: newIdx,
        wasExcluded: true,
      });
      return;
    }

    unchanged.push({
      sourceEntryId: prevItem.sourceEntryId,
      prevItem,
      newItem,
      existingTrack: existingCeepeefyTrack,
      fromIndex: oldIdx,
      targetIndex: newIdx,
    });
  });

  // Reordered pairs
  reorderedPairs.forEach(({ oldIdx, newIdx }) => {
    const prevItem = prevItems[oldIdx];
    const newItem = newItems[newIdx];
    const existingCeepeefyTrack = existingManagedMap.get(prevItem.sourceEntryId) || null;

    const isExcluded =
      prevItem.status === "skipped" ||
      prevItem.skipped ||
      prevItem.excluded ||
      prevItem.blocked ||
      prevItem.rejected ||
      prevItem.status === "unavailable" ||
      prevItem.status === "blocked" ||
      prevItem.status === "rejected" ||
      prevItem.status === "unresolved";

    if (isExcluded) {
      skipped.push({
        sourceEntryId: prevItem.sourceEntryId,
        prevItem,
        newItem,
        status: prevItem.status || "skipped",
        fromIndex: oldIdx,
        targetIndex: newIdx,
        wasExcluded: true,
      });
      return;
    }

    reordered.push({
      sourceEntryId: prevItem.sourceEntryId,
      prevItem,
      newItem,
      existingTrack: existingCeepeefyTrack,
      fromIndex: oldIdx,
      targetIndex: newIdx,
    });
  });

  // Removed items: in previous snapshot but not matched in new
  prevItems.forEach((prevItem, idx) => {
    if (!matchedPrevIndices.has(idx)) {
      const existingCeepeefyTrack = existingManagedMap.get(prevItem.sourceEntryId) || null;
      removed.push({
        sourceEntryId: prevItem.sourceEntryId,
        prevItem,
        existingTrack: existingCeepeefyTrack,
        prevIndex: idx,
        wasSkipped: Boolean(
          prevItem.status === "skipped" ||
          prevItem.skipped ||
          prevItem.excluded ||
          prevItem.blocked ||
          prevItem.rejected ||
          prevItem.status === "unavailable"
        ),
      });
    }
  });

  // Added items: in new Spotify playlist but not matched in previous snapshot
  newItems.forEach((newItem, idx) => {
    if (matchedNewIndices.has(idx)) return;

    const nTitle = normalizeTitle(newItem.name || newItem.title || "");
    const nArtist = normalizeArtist(newItem.primaryArtist || newItem.artist || "");
    const normSig = nTitle && nArtist ? `${nTitle}:::${nArtist}` : null;
    const spId = newItem.spotifyId ? String(newItem.spotifyId) : (newItem.id ? String(newItem.id) : null);

    // Rule: Exclude previously blocked, skipped, rejected, or unavailable songs
    const isExplicitlyExcluded =
      excludedSourceEntryIds.has(newItem.sourceEntryId) ||
      (spId && excludedSpotifyIds.has(spId)) ||
      excludedFingerprints.has(newItem.fingerprint) ||
      (normSig && excludedNormSignatures.has(normSig));

    // Rule: Do not duplicate songs already imported into Ceepeefy playlist
    const isAlreadyImported =
      existingSourceEntryIds.has(newItem.sourceEntryId) ||
      (spId && existingSpotifyIds.has(spId)) ||
      existingFingerprints.has(newItem.fingerprint) ||
      (normSig && existingNormSignatures.has(normSig));

    if (isExplicitlyExcluded || isAlreadyImported) {
      skipped.push({
        sourceEntryId: newItem.sourceEntryId,
        newItem,
        targetIndex: idx,
        status: isExplicitlyExcluded ? "excluded" : "already_present",
        wasExcluded: Boolean(isExplicitlyExcluded),
        reason: isExplicitlyExcluded ? "previously_excluded" : "already_in_playlist",
      });
      return;
    }

    added.push({
      sourceEntryId: newItem.sourceEntryId,
      newItem,
      targetIndex: idx,
    });
  });

  // 7. Check if completely up to date
  const genuineRemoved = removed.filter((r) => !r.wasSkipped);
  const hasChanges = added.length > 0 || genuineRemoved.length > 0 || reordered.length > 0;
  const isUpToDate = !hasChanges;

  return {
    hasChanges,
    isUpToDate,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      reorderedCount: reordered.length,
      unchangedCount: unchanged.length,
      skippedCount: skipped.length,
      manualTracksCount: manualTracks.length,
      totalPrevious: prevItems.length,
      totalCurrent: newItems.length,
    },
    added,
    removed,
    reordered,
    unchanged,
    skipped,
    manualTracks,
    prevItems,
    newItems,
  };
}

/**
 * Builds the updated Ceepeefy playlist tracks array and new snapshot
 * from the diff plan and newly matched added tracks.
 *
 * CRITICAL RULE: Unchanged tracks keep their EXACT existing JioSaavn ID,
 * audio URL, duration, cover, and metadata. They are NOT re-matched or recreated.
 */
export function applySyncPlan({
  diff = {},
  matchedAddedItems = [],
  unresolvedAdditions = [],
  skippedAdditions = [],
  unskippedSourceEntryIds = [],
  existingTracks = [],
  playlistTitle = "",
}) {
  const removed = Array.isArray(diff?.removed) ? diff.removed : [];
  const added = Array.isArray(diff?.added) ? diff.added : [];
  const reordered = Array.isArray(diff?.reordered) ? diff.reordered : [];
  const unchanged = Array.isArray(diff?.unchanged) ? diff.unchanged : [];
  const manualTracks = Array.isArray(diff?.manualTracks) ? diff.manualTracks : [];
  const newItems = Array.isArray(diff?.newItems) ? diff.newItems : [];
  const diffSkipped = Array.isArray(diff?.skipped) ? diff.skipped : [];

  // Track skipped items from prior snapshot
  const prevSkippedMap = new Map();
  diffSkipped.forEach((s) => {
    if (s.sourceEntryId) prevSkippedMap.set(s.sourceEntryId, s.prevItem || s);
  });
  // Track newly skipped items from current sync review
  const newlySkippedMap = new Map();
  (Array.isArray(skippedAdditions) ? skippedAdditions : []).forEach((item) => {
    if (item?.sourceEntryId) {
      newlySkippedMap.set(item.sourceEntryId, item);
    }
  });

  const unskippedSet = new Set(unskippedSourceEntryIds || []);

  // Determine base list of tracks from existing playlist
  let baseList = [];
  if (Array.isArray(existingTracks) && existingTracks.length > 0) {
    baseList = [...existingTracks];
  } else {
    const seenIds = new Set();
    [...unchanged, ...reordered].forEach((item) => {
      if (item && item.existingTrack && !seenIds.has(item.existingTrack.id)) {
        seenIds.add(item.existingTrack.id);
        baseList.push(item.existingTrack);
      }
    });
    manualTracks.forEach(({ track }) => {
      if (track && !seenIds.has(track.id)) {
        seenIds.add(track.id);
        baseList.push(track);
      }
    });
  }

  // 1. Collect removed track identifiers to remove ONLY deleted songs
  const removedJioIds = new Set();
  const removedSpotifyIds = new Set();
  const removedEntryIds = new Set();
  const removedFingerprints = new Set();

  removed.forEach((r) => {
    if (r.existingTrack?.id) removedJioIds.add(String(r.existingTrack.id));
    if (r.prevItem?.jioTrackId) removedJioIds.add(String(r.prevItem.jioTrackId));
    if (r.prevItem?.spotifyId) removedSpotifyIds.add(String(r.prevItem.spotifyId));
    if (r.sourceEntryId) removedEntryIds.add(String(r.sourceEntryId));
    if (r.prevItem?.fingerprint) removedFingerprints.add(String(r.prevItem.fingerprint));
  });

  // Filter out ONLY the deleted tracks; keep ALL other existing songs in place!
  let workingTracks = baseList.filter((track) => {
    if (track.isManual) return true; // Keep manually added tracks intact
    const tid = String(track.id || "");
    const spId = String(track.spotifyId || track.sourceMeta?.spotifyId || "");
    const entryId = String(track.sourceEntryId || "");
    const fp = getTrackFingerprint(track);

    if (removedJioIds.has(tid)) return false;
    if (spId && removedSpotifyIds.has(spId)) return false;
    if (entryId && removedEntryIds.has(entryId)) return false;
    if (fp && removedFingerprints.has(fp)) return false;
    return true;
  });

  // 2. Add ONLY newly added songs that were matched
  const successfullyAdded = [];
  matchedAddedItems.forEach((item) => {
    if (!item || !item.playableTrack) return;
    const playable = item.playableTrack;
    const entryId = item.sourceEntryId;
    const newPlayableTrack = {
      ...playable,
      sourceEntryId: entryId,
      isSpotifyTrack: true,
      spotifyId: item.spotifyTrack?.id || playable.spotifyId || null,
    };

    successfullyAdded.push(newPlayableTrack);

    // Prevent duplicate insertion if already in workingTracks
    const alreadyExists = workingTracks.some(
      (t) =>
        String(t.id) === String(newPlayableTrack.id) ||
        (entryId && t.sourceEntryId === entryId)
    );
    if (alreadyExists) return;

    const targetIdx = item.targetIndex;
    if (typeof targetIdx === "number" && targetIdx >= 0 && targetIdx <= workingTracks.length) {
      workingTracks.splice(targetIdx, 0, newPlayableTrack);
    } else {
      workingTracks.push(newPlayableTrack);
    }
  });

  // 3. Reorder if tracks were moved on Spotify and newItems order is available
  if (reordered.length > 0 && newItems.length > 0) {
    const orderMap = new Map();
    newItems.forEach((item, idx) => {
      if (item.sourceEntryId) orderMap.set(item.sourceEntryId, idx);
      if (item.fingerprint) orderMap.set(item.fingerprint, idx);
      if (item.id) orderMap.set(String(item.id), idx);
    });

    const manualTracksList = workingTracks.filter((t) => t.isManual);
    const spotifyTracksList = workingTracks.filter((t) => !t.isManual);

    spotifyTracksList.sort((a, b) => {
      const idxA =
        orderMap.get(a.sourceEntryId) ??
        orderMap.get(getTrackFingerprint(a)) ??
        orderMap.get(String(a.spotifyId || "")) ??
        9999;
      const idxB =
        orderMap.get(b.sourceEntryId) ??
        orderMap.get(getTrackFingerprint(b)) ??
        orderMap.get(String(b.spotifyId || "")) ??
        9999;
      return idxA - idxB;
    });

    workingTracks = [...spotifyTracksList, ...manualTracksList];
  }

  // 4. Build new snapshot
  const newSnapshot = [];
  if (newItems.length > 0) {
    const trackMapByEntry = new Map();
    workingTracks.forEach((t) => {
      if (t.sourceEntryId) trackMapByEntry.set(t.sourceEntryId, t);
      trackMapByEntry.set(getTrackFingerprint(t), t);
      if (t.spotifyId) trackMapByEntry.set(String(t.spotifyId), t);
    });

    newItems.forEach((targetItem) => {
      const entryId = targetItem.sourceEntryId;
      const fp = targetItem.fingerprint || getTrackFingerprint(targetItem);
      const spId = String(targetItem.spotifyId || targetItem.id || "");
      const matched =
        trackMapByEntry.get(entryId) ||
        trackMapByEntry.get(fp) ||
        (spId ? trackMapByEntry.get(spId) : null);

      if (matched) {
        newSnapshot.push(
          createSnapshotEntry(
            targetItem,
            targetItem.occurrenceIndex || 0,
            matched.id,
            matched.matchScore || 100
          )
        );
      } else {
        const skippedInfo =
          (!unskippedSet.has(entryId) && (newlySkippedMap.get(entryId) || prevSkippedMap.get(entryId) || (spId && prevSkippedMap.get(spId)))) ||
          diffSkipped.find(
            (s) =>
              s.sourceEntryId === entryId ||
              s.prevItem?.sourceEntryId === entryId ||
              s.newItem?.sourceEntryId === entryId ||
              s.prevItem?.fingerprint === fp ||
              (spId && (s.prevItem?.spotifyId === spId || s.newItem?.spotifyId === spId || s.spotifyId === spId))
          );

        const customStatus =
          skippedInfo?.status ||
          skippedInfo?.prevItem?.status ||
          (skippedInfo?.wasExcluded ? "skipped" : "unresolved");

        newSnapshot.push({
          ...createSnapshotEntry(targetItem, targetItem.occurrenceIndex || 0, null, 0, customStatus),
          status: customStatus,
          skipped: true,
          excluded: true,
          skippedAt: skippedInfo?.skippedAt || Date.now(),
        });
      }
    });
  } else {
    const autoSnap = buildSnapshotFromExistingPlaylist({ tracks: workingTracks });
    newSnapshot.push(...autoSnap);
  }

  return {
    updatedTracks: workingTracks,
    newSnapshot,
    successfullyAdded,
    pendingUnresolved: Array.isArray(unresolvedAdditions) ? unresolvedAdditions : [],
    removedCount: removed.length,
    addedCount: successfullyAdded.length,
    unresolvedCount: Array.isArray(unresolvedAdditions) ? unresolvedAdditions.length : 0,
    skippedCount: diffSkipped.length + newlySkippedMap.size,
  };
}
