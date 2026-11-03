/**
 * Queue Session & History Manager
 * 
 * Manages playback history, quick-skip blacklists, duplicate deduplication,
 * manual vs auto queue segregation, and graceful history reset when library runs out.
 */

import { SMART_QUEUE_CONFIG } from "./config.js";
import { cleanStr, extractArtists, extractSongFeatures } from "./scorer.js";

/**
 * Normalizes title for duplicate and remix detection
 */
export function normalizeBaseTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&quot;|&#039;|&#39;|&amp;|&lt;|&gt;/g, " ")
    .replace(
      /\s*[\(\[][^\)\]]*(?:remix|mix|edit|acoustic|live|slowed|reverb|version|deluxe|audio|video|lyric|theme|bgm|ost|feat|ft|club|soundtrack)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*.*?(?:remix|mix|edit|acoustic|live|slowed|reverb|version|deluxe|audio|video|lyric|theme|bgm|ost|club|soundtrack).*/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates composite identity key for deduplication (same title + artist)
 */
export function getTrackIdentityKey(track) {
  if (!track) return "";
  const baseTitle = normalizeBaseTitle(track.title || track.song || track.name || "");
  const artists = extractArtists(track);
  const primary = artists[0] || cleanStr(track.artist || track.primary_artist || "");
  return `${baseTitle}:::${primary}`;
}

export class QueueSessionManager {
  constructor(config = SMART_QUEUE_CONFIG) {
    this.config = config;
    this.playedHistory = [];          // Chronological history of completed/played tracks
    this.playedTrackIds = new Set();  // Set of track IDs played in this session
    this.playedCompositeKeys = new Set(); // Set of composite keys (title:::artist)
    
    // Quick skip blacklist (<30s) and profile penalties
    this.quickSkippedTrackIds = new Set();
    this.quickSkippedProfiles = [];   // Array of { primaryArtist, mood, genres }
    
    // Queue segregation
    this.manualQueue = [];            // High-priority user-added songs
    this.autoQueue = [];              // Smart auto-generated queue
    this.currentTrack = null;
  }

  /**
   * Set current playing track
   */
  setCurrentTrack(track) {
    this.currentTrack = track;
    if (track && track.id) {
      const id = String(track.id).replace(/^track-/, "").trim();
      this.playedTrackIds.add(id);
      const key = getTrackIdentityKey(track);
      if (key) this.playedCompositeKeys.add(key);
    }
  }

  /**
   * Records a track played to completion or listened beyond the skip threshold
   */
  recordPlaybackFinished(track, durationListenedSec) {
    if (!track) return;
    const id = String(track.id).replace(/^track-/, "").trim();
    const key = getTrackIdentityKey(track);

    this.playedHistory.push(track);
    this.playedTrackIds.add(id);
    if (key) this.playedCompositeKeys.add(key);

    // If listened under 30 seconds, treat as quick skip
    if (durationListenedSec < this.config.thresholds.quickSkipDurationSec) {
      this.recordQuickSkip(track);
    }
  }

  /**
   * Records a quick skip (<30 seconds):
   * Blacklists song from this session & notes its acoustic profile to dampen similar songs
   */
  recordQuickSkip(track) {
    if (!track) return;
    const id = String(track.id).replace(/^track-/, "").trim();
    this.quickSkippedTrackIds.add(id);

    const feat = extractSongFeatures(track, this.config);
    if (feat) {
      this.quickSkippedProfiles.push({
        id,
        primaryArtist: feat.primaryArtist,
        mood: feat.mood,
        genres: feat.genres,
        timestamp: Date.now(),
      });
      // Keep only last 10 skip profiles
      if (this.quickSkippedProfiles.length > 10) {
        this.quickSkippedProfiles.shift();
      }
    }
  }

  /**
   * Checks if track is excluded from entering auto-queue
   */
  isExcluded(track) {
    if (!track || !track.id) return true;
    const id = String(track.id).replace(/^track-/, "").trim();

    // 1. Quick-skipped in this session -> strictly blacklisted
    if (this.quickSkippedTrackIds.has(id)) return true;

    // 2. Currently playing song
    if (this.currentTrack && String(this.currentTrack.id).replace(/^track-/, "").trim() === id) {
      return true;
    }

    // 3. Already in manual queue
    if (this.manualQueue.some((t) => String(t.id).replace(/^track-/, "").trim() === id)) {
      return true;
    }

    // 4. Already in auto queue
    if (this.autoQueue.some((t) => String(t.id).replace(/^track-/, "").trim() === id)) {
      return true;
    }

    // 5. Already played in this session
    if (this.playedTrackIds.has(id)) return true;

    // 6. Duplicate song check (same title + artist)
    const key = getTrackIdentityKey(track);
    if (key) {
      if (this.playedCompositeKeys.has(key)) return true;
      if (this.currentTrack && getTrackIdentityKey(this.currentTrack) === key) return true;
      if (this.manualQueue.some((t) => getTrackIdentityKey(t) === key)) return true;
      if (this.autoQueue.some((t) => getTrackIdentityKey(t) === key)) return true;
    }

    return false;
  }

  /**
   * Resets session history when the library runs out of fresh candidates,
   * but strictly retains the last 20 played tracks as excluded.
   */
  resetHistoryExceptRecent(keepRecent = this.config.thresholds.historyResetKeepRecent) {
    const recentToKeep = this.playedHistory.slice(-keepRecent);

    this.playedTrackIds.clear();
    this.playedCompositeKeys.clear();

    for (const t of recentToKeep) {
      const id = String(t.id).replace(/^track-/, "").trim();
      this.playedTrackIds.add(id);
      const key = getTrackIdentityKey(t);
      if (key) this.playedCompositeKeys.add(key);
    }

    this.playedHistory = recentToKeep;
  }

  /**
   * Manual Queue Management: User-added tracks ("Play Next" or "Add to Queue")
   */
  addToManualQueue(track, atHead = false) {
    if (!track) return;
    const manualTrack = { ...track, isManual: true };
    if (atHead) {
      this.manualQueue.unshift(manualTrack);
    } else {
      this.manualQueue.push(manualTrack);
    }
  }

  /**
   * Consumes the next track according to strict queue priority:
   * 1. Manual Queue first
   * 2. Auto Queue second
   */
  popNextTrack() {
    if (this.manualQueue.length > 0) {
      const track = this.manualQueue.shift();
      this.setCurrentTrack(track);
      return { track, wasManual: true };
    }

    if (this.autoQueue.length > 0) {
      const track = this.autoQueue.shift();
      this.setCurrentTrack(track);
      return { track, wasManual: false };
    }

    return null;
  }

  /**
   * Pop previous track for Previous button support
   */
  popPreviousTrack() {
    if (this.playedHistory.length > 0) {
      return this.playedHistory.pop();
    }
    return null;
  }

  /**
   * Returns current combined queue (Manual precedes Auto)
   */
  getCombinedQueue() {
    return [...this.manualQueue, ...this.autoQueue];
  }
}
