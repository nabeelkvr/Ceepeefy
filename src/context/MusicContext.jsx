"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  NOCTURNE_TRACKS,
  NOCTURNE_ARTISTS,
  NOCTURNE_MIXES,
  NOCTURNE_PLAYLISTS,
  INITIAL_RECENT_SEARCHES
} from "../data/nocturneData";
import { getDirectAudioStreamUrl } from "../services/audioService";
import {
  getLocalAudioUrl,
  deleteLocalAudioFile,
  deleteLocalAudioFiles,
  getAllLocalAudioRecords,
} from "../services/localAudioStorage";
import { getLocalDeviceTrackUrl } from "../services/localMusicService";
import {
  getOfflineAudioUrl,
  getOfflineTracks,
  getOfflineTrackIds,
  isTrackOffline,
  downloadTrack as serviceDownloadTrack,
  removeOfflineTrack as serviceRemoveOfflineTrack,
  downloadPlaylist as serviceDownloadPlaylist,
  removePlaylistOffline as serviceRemovePlaylistOffline,
  getPlaylistOfflineStatus as serviceGetPlaylistOfflineStatus,
  getOfflineStorageStats,
  getOfflinePlaylists,
} from "../services/offlineStorage";
import { formatPlaylistDuration } from "../utils/playlistUtils";
import {
  applySyncPlan,
  buildSnapshotFromExistingPlaylist,
} from "../services/spotifySyncService";
import {
  DEFAULT_USER_ID,
  getAccountUserId,
  getAccountStorageKey,
} from "../config/authConfig";
import {
  fetchUserPlaylistsFromCloud,
  savePlaylistToCloud,
  deletePlaylistFromCloud,
  addTrackToPlaylistCloud,
  removeTrackFromPlaylistCloud,
  fetchLikedSongsFromCloud,
  saveLikedSongToCloud,
  removeLikedSongFromCloud,
  fetchRecentlyPlayedFromCloud,
  recordRecentlyPlayedToCloud,
  clearRecentlyPlayedInCloud,
  migrateLocalDataToSupabase,
  fetchPlaylistTracksFromCloud,
  saveAccountDataToCloud,
  fetchAccountDataFromCloud,
} from "../services/cloudStorageService";
import {
  deleteSelfMixFromCloud,
  fetchSelfMixesFromCloud,
} from "../services/supabaseClient";
import { generateRecommendedQueue, extractLanguage, classifySongMood } from "../utils/recommendationEngine";

export const DEFAULT_MOCK_TRACK_IDS = new Set([
  "track-midnight-pulse",
  "track-aether-resonance",
  "track-shadows-in-blue",
  "track-kuroshio-current",
  "track-continuum-shift",
]);

export const normalizeTrack = (track) => {
  if (!track) return null;
  const rawId = track.id || track._id || track.trackId;
  const rawTitle = track.title || track.name || "Unknown Track";
  const rawArtist = track.artist || track.subtitle || track.artistName || track.singers || "Unknown Artist";
  let rawCover = "";
  if (Array.isArray(track.image) && track.image.length > 0) {
    const last = track.image[track.image.length - 1];
    if (typeof last === "string") rawCover = last;
    else if (last && typeof last.url === "string") rawCover = last.url;
    else if (last && typeof last.link === "string") rawCover = last.link;
  } else if (Array.isArray(track.images) && track.images.length > 0) {
    const last = track.images[track.images.length - 1];
    if (typeof last === "string") rawCover = last;
    else if (last && typeof last.url === "string") rawCover = last.url;
  }

  if (!rawCover) {
    const candidates = [
      track.coverUrl,
      track.thumbnail,
      typeof track.image === "string" ? track.image : null,
      typeof track.image === "object" && track.image?.url ? track.image.url : null,
      track.imageUrl,
      track.albumArt,
      track.artwork,
      track.more_info?.image,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) {
        rawCover = c.trim();
        break;
      }
    }
  }

  if (!rawCover) {
    rawCover = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
  }

  if (typeof rawCover === "string") {
    rawCover = rawCover.replace(/^http:\/\//i, "https://");
    if (rawCover.includes("saavncdn.com") || rawCover.includes("jiosaavn.com")) {
      rawCover = rawCover.replace(/50x50|150x150/g, "500x500");
    }
  }

  let formattedDuration = track.durationFormatted;
  if (!formattedDuration && track.duration) {
    const durNum = Number(track.duration);
    if (!isNaN(durNum) && durNum > 0) {
      const mins = Math.floor(durNum / 60);
      const secs = Math.floor(durNum % 60);
      formattedDuration = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
  }
  if (!formattedDuration) {
    formattedDuration = "3:30";
  }

  const isLocal = Boolean(
    track.isLocal ||
    String(rawId).startsWith("local-") ||
    track.source === "local-upload"
  );

  return {
    id: String(rawId || `track-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`),
    title: rawTitle,
    artist: rawArtist,
    primary_artist: track.primary_artist || track.primaryArtist || rawArtist,
    primaryArtist: track.primary_artist || track.primaryArtist || rawArtist,
    album: track.album || track.albumName || "",
    album_id: track.album_id || track.albumId || track.more_info?.album_id || "",
    albumId: track.album_id || track.albumId || track.more_info?.album_id || "",
    coverUrl: rawCover,
    audioUrl: track.audioUrl || "",
    duration: typeof track.duration === "number" ? track.duration : 210,
    durationFormatted: formattedDuration,
    badge: track.badge || (isLocal ? "Self Mix" : "Lossless"),
    badgeType: track.badgeType || (isLocal ? "cyan" : "primary"),
    year: track.year || track.releaseDate?.slice(0, 4) || "",
    genre: track.genre || (isLocal ? "Mix / Mashup" : ""),
    language: track.language || track.more_info?.language || "",
    play_count: track.play_count || track.playCount || track.plays || 0,
    playCount: track.play_count || track.playCount || track.plays || 0,
    tier: track.tier || null,
    tierReason: track.tierReason || "",
    isLocal,
    isCloud: Boolean(track.isCloud),
    source: track.source || (isLocal ? "local-upload" : "remote"),
    fileName: track.fileName || "",
    fileSize: track.fileSize || 0,
  };
};

const MusicContext = createContext(null);

export const MusicProvider = ({ children }) => {
  // Navigation & filter state
  const [activeFilter, setActiveFilter] = useState("All songs");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState(INITIAL_RECENT_SEARCHES);

  // Playback state - Initially null so bottom player is hidden until first play
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // 'off' | 'all' | 'one'

  // Autoplay / Infinite Smart Queue state
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [isAutoplayLoading, setIsAutoplayLoading] = useState(false);
  const isAutoplayEnabledRef = useRef(true);
  const isFetchingAutoplayRef = useRef(false);
  const prefetchedRecommendationsRef = useRef(null);
  const isPrefetchingRef = useRef(false);
  const sessionPlayedTrackIdsRef = useRef(new Set());
  const sessionPlayedKeysRef = useRef(new Set());
  const originalPlaylistTracksRef = useRef([]);

  // Pinned Playlists State
  const [pinnedPlaylistIds, setPinnedPlaylistIds] = useState([]);
  const [addedPlaylists, setAddedPlaylists] = useState([]);

  // Modals & Drawers
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [lyricsMode, setLyricsMode] = useState("hidden"); // 'hidden' | 'full' | 'mini'
  const [playerMode, setPlayerMode] = useState("bar"); // 'bar' | 'mini' | 'card'

  const minimizeLyricsToCard = () => {
    setLyricsMode("mini");
    setPlayerMode("card");
  };

  const [syncedLyrics, setSyncedLyrics] = useState([]);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsError, setLyricsError] = useState(null);
  const isLyricsOpen = lyricsMode !== "hidden";
  const setIsLyricsOpen = (val) => {
    if (typeof val === "function") {
      setLyricsMode((prev) => (val(prev !== "hidden") ? "full" : "hidden"));
    } else {
      setLyricsMode(val ? "full" : "hidden");
    }
  };
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [currentDevice, setCurrentDevice] = useState("Studio Monitors (Analog DAC)");

  // Modals for Settings & Auth
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("signup"); // 'signup' | 'login'

  const openAuthModal = (tab = "signup") => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  // User Authentication State (Strict Personal Instance: centralized account identity)
  const [user, setUser] = useState(null);

  // Cloud sync helper to refresh playlists, liked songs, and recently played from Supabase
  const syncAccountDataWithCloud = async (userId = DEFAULT_USER_ID) => {
    try {
      // 1. Run one-time migration if not yet completed
      await migrateLocalDataToSupabase(userId);

      // 2. Query fresh cloud data from Supabase (individual tables + central account snapshot)
      const [cloudPlaylists, cloudLiked, cloudRecents, cloudSelfMixes, cloudAccountData] = await Promise.all([
        fetchUserPlaylistsFromCloud(userId),
        fetchLikedSongsFromCloud(userId),
        fetchRecentlyPlayedFromCloud(userId),
        fetchSelfMixesFromCloud(userId).catch(() => []),
        fetchAccountDataFromCloud(userId).catch(() => null),
      ]);

      // 3. Apply state updates non-destructively: NEVER overwrite playlists with tracks by empty playlists
      if (cloudPlaylists !== null || cloudAccountData?.customPlaylists) {
        setCustomPlaylists((prev) => {
          const localList = Array.isArray(prev) ? prev : [];
          const localMap = new Map(localList.map((p) => [String(p.id), p]));

          const acctList = Array.isArray(cloudAccountData?.customPlaylists) ? cloudAccountData.customPlaylists : [];
          const acctMap = new Map(acctList.map((p) => [String(p.id), p]));

          const cloudList = Array.isArray(cloudPlaylists)
            ? cloudPlaylists.filter((pl) => !pl.isSelfMix && pl.badge !== "SELF MIX")
            : [];
          const cloudMap = new Map(cloudList.map((p) => [String(p.id), p]));

          const allIds = new Set([
            ...cloudList.map((p) => String(p.id)),
            ...acctList.map((p) => String(p.id)),
            ...localList.map((p) => String(p.id)),
          ]);

          const merged = [];
          for (const id of allIds) {
            const cl = cloudMap.get(id);
            const ac = acctMap.get(id);
            const lc = localMap.get(id);
            const base = cl || ac || lc;

            // Prioritize non-empty tracks from any available source
            let tracks = (cl?.tracks && cl.tracks.length > 0)
              ? cl.tracks
              : (ac?.tracks && ac.tracks.length > 0)
                ? ac.tracks
                : (lc?.tracks && lc.tracks.length > 0)
                  ? lc.tracks
                  : [];

            // If local or account snapshot had tracks, but cloud row didn't, heal Supabase in background!
            if (tracks.length > 0 && (!cl?.tracks || cl.tracks.length === 0)) {
              savePlaylistToCloud({ ...base, tracks }, userId).catch(() => {});
            }

            merged.push({
              ...base,
              tracks,
              songsCount: tracks.length,
              duration: formatPlaylistDuration(tracks),
              subtitle: base.subtitle?.replace(/\d+\s+tracks/, `${tracks.length} tracks`) || `By ${base.curator || "You"} • ${tracks.length} tracks`,
              source: base.source || ac?.source || lc?.source || (base.badge === "SPOTIFY" ? "spotify_import" : "custom"),
              sourceMeta: base.sourceMeta || ac?.sourceMeta || lc?.sourceMeta || null,
              coverUrl: base.coverUrl || ac?.coverUrl || lc?.coverUrl,
              customCover: base.customCover || ac?.customCover || lc?.customCover || base.coverUrl,
              isCustom: true,
            });
          }

          try {
            const accountStorageKey = getAccountStorageKey("userData", userId);
            const stored = JSON.parse(localStorage.getItem(accountStorageKey) || "{}");
            localStorage.setItem(accountStorageKey, JSON.stringify({ ...stored, customPlaylists: merged }));
          } catch {}

          return merged;
        });
      }

      // 4. Merge self-mixes across cloud tables, central account data, and local storage
      const selfMixPlaylists = Array.isArray(cloudPlaylists)
        ? cloudPlaylists.filter((pl) => pl.isSelfMix || pl.badge === "SELF MIX")
        : [];
      const acctMixes = Array.isArray(cloudAccountData?.selfMixes) ? cloudAccountData.selfMixes : [];

      setSelfMixes((prev) => {
        const localList = Array.isArray(prev) ? prev : [];
        const localMap = new Map(localList.map((m) => [String(m.id), m]));
        const acctMap = new Map(acctMixes.map((m) => [String(m.id), m]));
        const cloudMap = new Map(selfMixPlaylists.map((m) => [String(m.id), m]));

        const allMixIds = new Set([
          ...selfMixPlaylists.map((m) => String(m.id)),
          ...acctMixes.map((m) => String(m.id)),
          ...localList.map((m) => String(m.id)),
        ]);

        const mergedMixes = [];
        for (const id of allMixIds) {
          const cl = cloudMap.get(id);
          const ac = acctMap.get(id);
          const lc = localMap.get(id);
          const base = cl || ac || lc;

          let tracks = (cl?.tracks && cl.tracks.length > 0)
            ? cl.tracks
            : (ac?.tracks && ac.tracks.length > 0)
              ? ac.tracks
              : (lc?.tracks && lc.tracks.length > 0)
                ? lc.tracks
                : [];

          if (tracks.length > 0 && (!cl?.tracks || cl.tracks.length === 0)) {
            savePlaylistToCloud({ ...base, tracks, isSelfMix: true }, userId).catch(() => {});
          }

          mergedMixes.push({
            ...base,
            isSelfMix: true,
            isCustom: true,
            tracks,
            songsCount: tracks.length,
            duration: formatPlaylistDuration(tracks),
            subtitle: `By ${base.curator || "You"} • ${tracks.length} tracks`,
          });
        }

        // Also merge orphan cloud tracks from self_mixes storage table
        if (Array.isArray(cloudSelfMixes) && cloudSelfMixes.length > 0) {
          const existingTrackIds = new Set(
            mergedMixes.flatMap((m) => (m.tracks || []).map((t) => String(t.id)))
          );
          const orphanCloudTracks = cloudSelfMixes.filter(
            (cm) => !existingTrackIds.has(String(cm.id))
          );
          if (orphanCloudTracks.length > 0) {
            const cloudArchivePlaylist = {
              id: "cloud-archive-playlist",
              title: "Cloud Audio Tracks",
              subtitle: `By You • ${orphanCloudTracks.length} tracks`,
              description: "Audio tracks synced from Supabase cloud storage",
              curator: "You",
              coverUrl: orphanCloudTracks[0]?.cover_url || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
              tracks: orphanCloudTracks.map((cm) => ({
                id: cm.id,
                title: cm.title,
                artist: `@${cm.owner || userId}`,
                album: "Cloud Audio",
                audioUrl: cm.audio_url,
                duration: cm.duration || 180,
                durationFormatted: cm.duration_formatted || "3:00",
                coverUrl: cm.cover_url || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
                isCloud: true,
                isLocal: false,
                source: "supabase-cloud",
                fileName: cm.file_name,
                fileSize: cm.file_size,
                badge: "Cloud Mix",
                badgeType: "cyan",
              })),
              isSelfMix: true,
              isCustom: true,
            };
            return [cloudArchivePlaylist, ...mergedMixes.filter((m) => m.id !== "cloud-archive-playlist")];
          }
        }

        return mergedMixes;
      });

      // 5. Merge liked songs
      if (cloudLiked !== null || cloudAccountData?.likedSongIds) {
        const mergedLikedIds = Array.from(new Set([
          ...(cloudLiked?.likedSongIds || []),
          ...(cloudAccountData?.likedSongIds || []),
        ]));
        const mergedLikedMap = {
          ...(cloudAccountData?.likedSongsMap || {}),
          ...(cloudLiked?.likedSongsMap || {}),
        };
        if (mergedLikedIds.length > 0) {
          setLikedSongIds(mergedLikedIds);
          setLikedSongsMap(mergedLikedMap);
        }
      }

      // 6. Recently played tracks
      if (cloudRecents !== null) {
        const valid = cloudRecents
          .map(normalizeTrack)
          .filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)));
        setRecentlyPlayedTracks(valid);
        setRecentlyPlayed(valid.map((t) => t.id));
      }

      // 7. Pinned playlists
      if (Array.isArray(cloudAccountData?.pinnedPlaylistIds) && cloudAccountData.pinnedPlaylistIds.length > 0) {
        setPinnedPlaylistIds((prev) => Array.from(new Set([...(prev || []), ...cloudAccountData.pinnedPlaylistIds])));
      }
    } catch (err) {
      console.error("[MusicContext] Cloud sync error:", err);
    }
  };

  const login = (userData) => {
    const userObj = {
      username: DEFAULT_USER_ID,
      name: userData?.name || DEFAULT_USER_ID,
      email: userData?.email || `${DEFAULT_USER_ID}@ceepeefy.audio`,
      plan: "Owner / Studio Master",
      isLoggedIn: true,
      activeUser: DEFAULT_USER_ID,
      joinedAt: userData?.joinedAt || "2024-01-15",
    };
    setUser(userObj);

    try {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("activeUser", DEFAULT_USER_ID);
      localStorage.setItem("ceepeefy_user", JSON.stringify(userObj));

      // Restore or initialize account-bound storage
      const accountStorageKey = getAccountStorageKey("userData", DEFAULT_USER_ID);
      const accountDataStr = localStorage.getItem(accountStorageKey);
      if (accountDataStr) {
        const accountData = JSON.parse(accountDataStr);
        if (Array.isArray(accountData.likedSongIds)) setLikedSongIds(accountData.likedSongIds);
        if (accountData.likedSongsMap && typeof accountData.likedSongsMap === "object") {
          setLikedSongsMap(accountData.likedSongsMap);
        }
        if (Array.isArray(accountData.customPlaylists)) setCustomPlaylists(accountData.customPlaylists);
        if (Array.isArray(accountData.recentlyPlayedTracks)) {
          const valid = accountData.recentlyPlayedTracks
            .map(normalizeTrack)
            .filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)));
          setRecentlyPlayedTracks(valid);
          setRecentlyPlayed(valid.map((t) => t.id));
        }
        let mixesToRestore = [];
        if (Array.isArray(accountData.selfMixes) && accountData.selfMixes.length > 0) {
          mixesToRestore = accountData.selfMixes;
        } else {
          try {
            const standaloneMixes = JSON.parse(localStorage.getItem("ceepeefy_self_mixes") || "[]");
            if (Array.isArray(standaloneMixes) && standaloneMixes.length > 0) {
              mixesToRestore = standaloneMixes;
            }
          } catch { }
        }
        setSelfMixes(mixesToRestore);

        // Recover any orphaned local audio records from IndexedDB
        recoverLocalUploadedTracksAsMix(mixesToRestore).then((recovered) => {
          if (recovered && recovered.length > mixesToRestore.length) {
            setSelfMixes(recovered);
            persistAccountData({ selfMixes: recovered });
          }
        });
      } else {

        const legacyLiked = JSON.parse(localStorage.getItem("nocturne_liked") || "[]");
        const legacyLikedMap = JSON.parse(localStorage.getItem("nocturne_liked_map") || "{}");
        const legacyPlaylists = JSON.parse(localStorage.getItem("nocturne_custom_playlists") || "[]");
        const legacyRecents = JSON.parse(localStorage.getItem("nocturne_recent_tracks") || "[]");
        let fallbackMixes = [];
        try {
          const standaloneMixes = JSON.parse(localStorage.getItem("ceepeefy_self_mixes") || "[]");
          if (Array.isArray(standaloneMixes) && standaloneMixes.length > 0) {
            fallbackMixes = standaloneMixes;
          }
        } catch { }

        const initialAccountData = {
          likedSongIds: Array.isArray(legacyLiked) && legacyLiked.length > 0
            ? legacyLiked
            : ["track-midnight-pulse", "track-shadows-in-blue"],
          likedSongsMap: legacyLikedMap,
          customPlaylists: Array.isArray(legacyPlaylists) ? legacyPlaylists : [],
          recentlyPlayedTracks: Array.isArray(legacyRecents) && legacyRecents.length > 0
            ? legacyRecents.map(normalizeTrack).filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)))
            : [],
          recentlyPlayed: Array.isArray(legacyRecents) && legacyRecents.length > 0
            ? legacyRecents.map((t) => t.id).filter((id) => !DEFAULT_MOCK_TRACK_IDS.has(String(id)))
            : [],
          selfMixes: fallbackMixes,
        };
        localStorage.setItem(accountStorageKey, JSON.stringify(initialAccountData));
        setLikedSongIds(initialAccountData.likedSongIds);
        setLikedSongsMap(initialAccountData.likedSongsMap);
        setCustomPlaylists(initialAccountData.customPlaylists);
        setRecentlyPlayedTracks(initialAccountData.recentlyPlayedTracks);
        setRecentlyPlayed(initialAccountData.recentlyPlayed);
        setSelfMixes(fallbackMixes);

        recoverLocalUploadedTracksAsMix(fallbackMixes).then((recovered) => {
          if (recovered && recovered.length > fallbackMixes.length) {
            setSelfMixes(recovered);
            persistAccountData({ selfMixes: recovered });
          }
        });
      }

      // Sync cloud state in the background immediately on login
      syncAccountDataWithCloud(DEFAULT_USER_ID);
    } catch (e) {
      console.warn("Login persistence error:", e);
    }
    return userObj;
  };

  const signUp = () => {
    return null;
  };

  const logout = () => {
    setUser(null);
    setLikedSongIds([]);
    setLikedSongsMap({});
    setCustomPlaylists([]);
    setRecentlyPlayedTracks([]);
    setRecentlyPlayed([]);
    setSelfMixes([]);
    try {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("activeUser");
      localStorage.removeItem("ceepeefy_user");
    } catch (e) { }
  };

  // Audiophile App & Playback Settings
  const DEFAULT_APPEARANCE_SETTINGS = {
    backgroundId: "sunset-mountains",
    customBackgroundUrl: null,
    customPalette: null,
    intensityPreset: "cinematic", // "chill" | "cinematic" | "immersive" | "custom"
    bgOpacity: 90,
    overlayOpacity: 25,
    ambientGlowIntensity: 55,
    bgBlur: 0,
    accentMode: "auto", // "auto" | "manual"
    manualAccentColor: "#4cd7f6",
  };

  const [settings, setSettings] = useState({
    audioQuality: "lossless", // "lossless" | "high" | "normal" | "saver"
    normalizeVolume: true,
    spatialAudio: true,
    bitPerfect: true,
    crossfade: 4,
    gapless: true,
    automix: true,
    themeAccent: "cyan",
    showLiveLyrics: true,
    ambientGlow: true,
    ...DEFAULT_APPEARANCE_SETTINGS,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ceepeefy_settings");
      if (saved) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch (e) {
      console.warn("Could not load settings from localStorage", e);
    }
  }, []);

  const updateSetting = (key, val) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: val };
      try {
        localStorage.setItem("ceepeefy_settings", JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });
  };

  const updateSettings = (partial) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem("ceepeefy_settings", JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });
  };

  const resetAppearance = () => {
    updateSettings({
      ...DEFAULT_APPEARANCE_SETTINGS,
      themeAccent: "cyan",
    });
  };

  // Segregated Queue Architecture:
  // 1. Manual Queue: tracks added manually via "Add to Queue" (takes absolute priority)
  // 2. Automatic Queue: tracks queued via 6-tier Priority Algorithm
  const [manualQueue, setManualQueue] = useState([]);
  const [autoQueue, setAutoQueue] = useState([]);
  const queue = useMemo(() => [...manualQueue, ...autoQueue], [manualQueue, autoQueue]);
  const [currentTracklist, setCurrentTracklist] = useState(NOCTURNE_TRACKS);

  // Restore persisted queue and player state
  useEffect(() => {
    try {
      const savedManual = localStorage.getItem("ceepeefy_manual_queue");
      if (savedManual) {
        const parsed = JSON.parse(savedManual);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setManualQueue(parsed);
        }
      }
      const savedAuto = localStorage.getItem("ceepeefy_auto_queue");
      if (savedAuto) {
        const parsed = JSON.parse(savedAuto);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAutoQueue(parsed);
        }
      }
      // Strictly runtime player state: ensure no stale song is restored on refresh
      localStorage.removeItem("ceepeefy_current_track");
    } catch (e) {
      console.warn("[MusicContext] Could not load persisted queue state:", e);
    }
  }, []);

  // Persist queues to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ceepeefy_manual_queue", JSON.stringify(manualQueue));
    } catch (e) { }
  }, [manualQueue]);

  useEffect(() => {
    try {
      localStorage.setItem("ceepeefy_auto_queue", JSON.stringify(autoQueue));
    } catch (e) { }
  }, [autoQueue]);

  // Account-bound features: accessible only when logged in
  const [likedSongIds, setLikedSongIds] = useState([]);
  const [likedSongsMap, setLikedSongsMap] = useState({});
  const [recentlyPlayedTracks, setRecentlyPlayedTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [customPlaylists, setCustomPlaylists] = useState([]);
  const [selfMixes, setSelfMixes] = useState([]);
  const hasLoadedStorageRef = useRef(false);

  // Offline Songs & Device Storage State
  const [offlineTrackIds, setOfflineTrackIds] = useState(new Set());
  const [offlineTracks, setOfflineTracks] = useState([]);
  const [offlinePlaylists, setOfflinePlaylists] = useState([]);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [offlineNotice, setOfflineNotice] = useState(null);
  const offlineNoticeTimerRef = useRef(null);

  const showOfflineNotice = (message) => {
    if (offlineNoticeTimerRef.current) clearTimeout(offlineNoticeTimerRef.current);
    setOfflineNotice(message);
    offlineNoticeTimerRef.current = setTimeout(() => {
      setOfflineNotice(null);
    }, 4500);
  };

  const refreshOfflineState = async () => {
    try {
      const [tracks, ids, playlists] = await Promise.all([
        getOfflineTracks(),
        getOfflineTrackIds(),
        getOfflinePlaylists(),
      ]);
      setOfflineTracks(tracks);
      setOfflineTrackIds(ids);
      setOfflinePlaylists(playlists);
    } catch (e) {
      console.warn("[MusicContext] Could not refresh offline state:", e);
    }
  };

  useEffect(() => {
    refreshOfflineState();

    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      setIsNetworkOnline(navigator.onLine);
    }

    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => {
      setIsNetworkOnline(false);
      showOfflineNotice("Network disconnected. You are in offline mode.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (offlineNoticeTimerRef.current) clearTimeout(offlineNoticeTimerRef.current);
    };
  }, []);

  const isOffline = (trackId) => {
    if (!trackId) return false;
    return offlineTrackIds.has(String(trackId));
  };

  const downloadTrack = async (track, playlistId = null) => {
    const res = await serviceDownloadTrack(track, playlistId);
    if (res.success) {
      await refreshOfflineState();
    }
    return res;
  };

  const removeOfflineTrack = async (trackId, playlistId = null) => {
    const res = await serviceRemoveOfflineTrack(trackId, playlistId);
    if (res) {
      await refreshOfflineState();
    }
    return res;
  };

  const downloadPlaylist = async (playlist, onProgress) => {
    const res = await serviceDownloadPlaylist(playlist, onProgress);
    await refreshOfflineState();
    return res;
  };

  const removePlaylistOffline = async (playlistId, tracks = []) => {
    const res = await serviceRemovePlaylistOffline(playlistId, tracks);
    await refreshOfflineState();
    return res;
  };

  const getPlaylistOfflineStatus = async (playlistId, tracks = []) => {
    return await serviceGetPlaylistOfflineStatus(playlistId, tracks);
  };

  const recoverLocalUploadedTracksAsMix = async (existingMixes = []) => {
    try {
      const records = await getAllLocalAudioRecords();
      if (!Array.isArray(records) || records.length === 0) return existingMixes;

      const currentList = Array.isArray(existingMixes) ? existingMixes : [];
      const existingTrackIds = new Set(
        currentList.flatMap((m) => (m.tracks || []).map((t) => String(t.id)))
      );
      const orphanRecords = records.filter(
        (rec) => !existingTrackIds.has(String(rec.trackId))
      );
      if (orphanRecords.length === 0) return currentList;

      const restoredMix = {
        id: "local-uploads-playlist",
        title: "Device Uploads",
        subtitle: `By You • ${orphanRecords.length} tracks`,
        description: "Audio tracks uploaded and stored on this device in Ceepeefy Studio Mode.",
        curator: "You",
        coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
        tracks: orphanRecords.map((rec) => {
          const cleanTitle = (rec.fileName || "Uploaded Audio")
            .replace(/\.[^/.]+$/, "")
            .replace(/[_]+/g, " ");
          return {
            id: rec.trackId,
            title: cleanTitle,
            artist: "Self Mix Upload",
            album: "Device Uploads",
            duration: 180,
            durationFormatted: "3:00",
            coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
            isLocal: true,
            isCloud: false,
            source: "local-upload",
            fileName: rec.fileName || "upload.mp3",
            fileSize: rec.fileSize || 0,
            badge: "Self Mix",
            badgeType: "cyan",
          };
        }),
        isCustom: true,
        isSelfMix: true,
      };

      return [restoredMix, ...currentList.filter((m) => m.id !== "local-uploads-playlist")];
    } catch (e) {
      console.warn("Failed to recover local uploaded tracks:", e);
      return existingMixes;
    }
  };

  // Central Account-Bound Data Persister (localStorage cache)
  const persistAccountData = (overrides = {}) => {
    if (typeof window === "undefined") return;
    try {
      const storedLoggedIn = localStorage.getItem("isLoggedIn") === "true";
      const storedActiveUser = localStorage.getItem("activeUser") || DEFAULT_USER_ID;
      if (!storedLoggedIn || storedActiveUser !== DEFAULT_USER_ID) return;

      const accountStorageKey = getAccountStorageKey("userData", DEFAULT_USER_ID);
      const currentStored = JSON.parse(localStorage.getItem(accountStorageKey) || "{}");
      const nextLikedIds = overrides.likedSongIds ?? likedSongIds;
      const nextLikedMap = overrides.likedSongsMap ?? likedSongsMap;
      const nextPlaylists = overrides.customPlaylists ?? customPlaylists;
      const nextRecents = overrides.recentlyPlayedTracks ?? recentlyPlayedTracks;

      let nextMixes = overrides.selfMixes ?? selfMixes;
      if (!Array.isArray(nextMixes) || nextMixes.length === 0) {
        try {
          const standaloneMixes = JSON.parse(localStorage.getItem("ceepeefy_self_mixes") || "[]");
          if (Array.isArray(standaloneMixes) && standaloneMixes.length > 0) {
            nextMixes = standaloneMixes;
          } else if (Array.isArray(currentStored.selfMixes) && currentStored.selfMixes.length > 0) {
            nextMixes = currentStored.selfMixes;
          }
        } catch { }
      }

      const accountData = {
        ...currentStored,
        likedSongIds: nextLikedIds,
        likedSongsMap: nextLikedMap,
        customPlaylists: nextPlaylists,
        recentlyPlayedTracks: nextRecents,
        recentlyPlayed: nextRecents.map((t) => t.id),
        selfMixes: nextMixes,
        lastUpdated: new Date().toISOString(),
      };

      localStorage.setItem(accountStorageKey, JSON.stringify(accountData));
      if (Array.isArray(nextMixes) && nextMixes.length > 0) {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(nextMixes));
      }
      // Also update legacy fallback keys
      localStorage.setItem("nocturne_liked", JSON.stringify(nextLikedIds));
      localStorage.setItem("nocturne_liked_map", JSON.stringify(nextLikedMap));
      localStorage.setItem("nocturne_custom_playlists", JSON.stringify(nextPlaylists));
      localStorage.setItem("nocturne_recent_tracks", JSON.stringify(nextRecents));

      // Debounce saving full account snapshot to Supabase for seamless cross-computer sync
      if (typeof window !== "undefined") {
        if (window._persistCloudTimer) clearTimeout(window._persistCloudTimer);
        window._persistCloudTimer = setTimeout(() => {
          saveAccountDataToCloud(accountData, DEFAULT_USER_ID).catch(() => {});
        }, 1000);
      }
    } catch (e) {
      console.warn("Failed to write account data to localStorage:", e);
    }
  };

  // Safely hydrate from localStorage on client mount, then fetch fresh data from Supabase cloud
  useEffect(() => {
    try {
      const storedLoggedIn = localStorage.getItem("isLoggedIn") === "true";
      const storedActiveUser = localStorage.getItem("activeUser") || DEFAULT_USER_ID;

      if (storedLoggedIn && storedActiveUser === DEFAULT_USER_ID) {
        const savedUserStr = localStorage.getItem("ceepeefy_user");
        const userObj = savedUserStr
          ? JSON.parse(savedUserStr)
          : {
            username: DEFAULT_USER_ID,
            name: DEFAULT_USER_ID,
            email: `${DEFAULT_USER_ID}@ceepeefy.audio`,
            plan: "Owner / Studio Master",
            isLoggedIn: true,
            activeUser: DEFAULT_USER_ID,
          };
        setUser(userObj);

        // Instant local cache hydration for zero UI flicker
        const accountStorageKey = getAccountStorageKey("userData", storedActiveUser);
        const accountDataStr = localStorage.getItem(accountStorageKey);
        if (accountDataStr) {
          const accountData = JSON.parse(accountDataStr);
          if (Array.isArray(accountData.likedSongIds)) setLikedSongIds(accountData.likedSongIds);
          if (accountData.likedSongsMap && typeof accountData.likedSongsMap === "object") {
            setLikedSongsMap(accountData.likedSongsMap);
          }
          if (Array.isArray(accountData.customPlaylists)) setCustomPlaylists(accountData.customPlaylists);
          if (Array.isArray(accountData.recentlyPlayedTracks)) {
            const valid = accountData.recentlyPlayedTracks
              .map(normalizeTrack)
              .filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)));
            setRecentlyPlayedTracks(valid);
            setRecentlyPlayed(valid.map((t) => t.id));
          }
          let mixesToHydrate = [];
          if (Array.isArray(accountData.selfMixes) && accountData.selfMixes.length > 0) {
            mixesToHydrate = accountData.selfMixes;
          } else {
            try {
              const standaloneMixes = JSON.parse(localStorage.getItem("ceepeefy_self_mixes") || "[]");
              if (Array.isArray(standaloneMixes) && standaloneMixes.length > 0) {
                mixesToHydrate = standaloneMixes;
              }
            } catch { }
          }
          setSelfMixes(mixesToHydrate);

          // Recover any orphaned local audio records from IndexedDB
          recoverLocalUploadedTracksAsMix(mixesToHydrate).then((recovered) => {
            if (recovered && recovered.length > mixesToHydrate.length) {
              setSelfMixes(recovered);
              persistAccountData({ selfMixes: recovered });
            }
          });
        } else {
          // Fallback to legacy keys
          const legacyLiked = JSON.parse(localStorage.getItem("nocturne_liked") || "[]");
          const legacyLikedMap = JSON.parse(localStorage.getItem("nocturne_liked_map") || "{}");
          const legacyPlaylists = JSON.parse(localStorage.getItem("nocturne_custom_playlists") || "[]");
          const legacyRecents = JSON.parse(localStorage.getItem("nocturne_recent_tracks") || "[]");
          let fallbackMixes = [];
          try {
            const standaloneMixes = JSON.parse(localStorage.getItem("ceepeefy_self_mixes") || "[]");
            if (Array.isArray(standaloneMixes) && standaloneMixes.length > 0) {
              fallbackMixes = standaloneMixes;
            }
          } catch { }

          const initialAccountData = {
            likedSongIds: Array.isArray(legacyLiked) && legacyLiked.length > 0
              ? legacyLiked
              : ["track-midnight-pulse", "track-shadows-in-blue"],
            likedSongsMap: legacyLikedMap,
            customPlaylists: Array.isArray(legacyPlaylists) ? legacyPlaylists : [],
            recentlyPlayedTracks: Array.isArray(legacyRecents) && legacyRecents.length > 0
              ? legacyRecents.map(normalizeTrack).filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)))
              : [],
            recentlyPlayed: Array.isArray(legacyRecents) && legacyRecents.length > 0
              ? legacyRecents.map((t) => t.id).filter((id) => !DEFAULT_MOCK_TRACK_IDS.has(String(id)))
              : [],
            selfMixes: fallbackMixes,
          };
          localStorage.setItem(accountStorageKey, JSON.stringify(initialAccountData));
          setLikedSongIds(initialAccountData.likedSongIds);
          setLikedSongsMap(initialAccountData.likedSongsMap);
          setCustomPlaylists(initialAccountData.customPlaylists);
          setRecentlyPlayedTracks(initialAccountData.recentlyPlayedTracks);
          setRecentlyPlayed(initialAccountData.recentlyPlayed);
          setSelfMixes(fallbackMixes);

          recoverLocalUploadedTracksAsMix(fallbackMixes).then((recovered) => {
            if (recovered && recovered.length > fallbackMixes.length) {
              setSelfMixes(recovered);
              persistAccountData({ selfMixes: recovered });
            }
          });
        }

        // Fresh cloud state fetch from Supabase (cross-device sync)
        syncAccountDataWithCloud(DEFAULT_USER_ID);
      } else {
        // Logged out: features are locked, personal arrays remain empty
        setUser(null);
        setLikedSongIds([]);
        setLikedSongsMap({});
        setCustomPlaylists([]);
        setRecentlyPlayedTracks([]);
        setRecentlyPlayed([]);
      }

      const savedSearches = localStorage.getItem("nocturne_recent_searches");
      if (savedSearches) {
        const parsed = JSON.parse(savedSearches);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentSearches(parsed);
        }
      }

      const savedAutoplay = localStorage.getItem("nocturne_autoplay");
      if (savedAutoplay !== null) {
        try {
          setIsAutoplayEnabled(Boolean(JSON.parse(savedAutoplay)));
        } catch { }
      }

      const savedPinned = localStorage.getItem("ceepeefy_pinned_playlists");
      if (savedPinned) {
        try {
          const parsedPinned = JSON.parse(savedPinned);
          if (Array.isArray(parsedPinned)) {
            setPinnedPlaylistIds(parsedPinned);
          }
        } catch { }
      }

      const savedAdded = localStorage.getItem("ceepeefy_added_playlists");
      if (savedAdded) {
        try {
          const parsedAdded = JSON.parse(savedAdded);
          if (Array.isArray(parsedAdded)) {
            setAddedPlaylists(parsedAdded);
          }
        } catch { }
      }
    } catch (e) {
      console.warn("Failed to load saved state from localStorage:", e);
    } finally {
      hasLoadedStorageRef.current = true;
    }
  }, []);

  // Automatically update persistent storage whenever state changes while logged in
  useEffect(() => {
    if (!hasLoadedStorageRef.current || typeof window === "undefined") return;
    if (!user || user.username !== DEFAULT_USER_ID) return;

    persistAccountData();
  }, [likedSongIds, likedSongsMap, customPlaylists, recentlyPlayedTracks, selfMixes, user]);

  const createPlaylist = (title) => {
    const currentUserId = getAccountUserId(user);
    if (!user || currentUserId !== DEFAULT_USER_ID) {
      openAuthModal("login");
      return null;
    }
    const count = customPlaylists.length + 1;
    const cleanTitle = title?.trim() || `My Playlist #${count}`;
    const id = `playlist-custom-${Date.now()}`;
    const coverOptions = [
      "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCcDTMe8ntb6aO4tcOQpRPu3QUvWw_EwqggOB0rt2BPCE9RXX9RMOcsu8cCoPX7rxBxCWoxXDvUVZhu4OTJaxyowAQxxZPFA1eJ_Ht3i-NyQPtVuprnz34_7wT6X9aHhhyGYv5_Zr8C2q5BHrpq9uDQOiO54gi7HT64pnABbWyqQYAaqRs0Lwmpg6IgIngc1LiaVSXVOEIrfY4ziVPlkGlPbmpzG-2NL_mmw38az_1R12N95EsPe32N",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuB877pPBeqfb_rWG3KB0Vi9eX-I-HNAdtT5rjg9xi8ZU04WTDS_rbBm5B4nnDHct3mdidfEo6sU6h6fk4eqOMr_NpZfz33J3UGu9cc6rq7hR2nTKzuv_x_41O7xsM2X-mSgtKdzhSlFFfCpJ4U__q9m7qwEh95BZwe_Z2AafojZCHFZaP9d7ECgmtMtuLH3sTGYUvW0Mtq1wO09MAmI13FKfMOK98vIDEQ9yZ6HDQqTbX0TuDIYOU3u",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD8glzFml8cPJEMXGv9lpYXDW9v2axG1Ida-stV8VC-lxMEigRM_YblNnhKgus_u0wxfNHbtrWfBpGCklqEuECIruqPFohG5S6CvBJVJyNjc7RuBrA1vo6aQhawpQF1bxRN7rHU4GhsV4xXW9XpriXJ2dTKNMK_7yhPfLxCU7n0XNI5OhoRlhYPwky2EY1CR8HJRvJJrrI-hQlsMoekpTJdPLMnHUwZae0SdMDpHZtWtaSY-PIUJ9PY",
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBWgKJxWVfm0NGxI9YvjLWbvkUhq05PqXhrl4fYxVaNqzpsNt1an3vtwddkrTy-COHWsxMxDKZyKduuP2ezowzdAouUwVNVIJc7_QUATevFwE9Ym3estJwrbdekpKNBE5NvbqdQlYVqzj8lrO6P2X9o3Rl8dqMHurEmaYUMdm1gDer0ok1boZyj0KxEkSLRrxbXDnlbueqQkJtNIGlak8ssImS8iazj2h5UcfdTvd5174d5nnvWgf6h"
    ];
    const coverUrl = coverOptions[customPlaylists.length % coverOptions.length];

    const newPlaylist = {
      id,
      title: cleanTitle,
      subtitle: `By You • 0 tracks`,
      description: `Personal playlist "${cleanTitle}" created in Ceepeefy Studio Mode. High-resolution lossless playback.`,
      curator: "You",
      curatorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS",
      songsCount: 0,
      duration: "0 min",
      updatedDate: "Created today",
      fidelity: "Personal Playlist • Hi-Res Lossless",
      spec: "24-Bit • 192kHz",
      badge: "CUSTOM",
      badgeVariant: "purple",
      stat: "1 Like",
      coverUrl,
      tracks: [],
      isCustom: true
    };

    setCustomPlaylists((prev) => [newPlaylist, ...prev]);

    // Persist to Supabase cloud
    savePlaylistToCloud(newPlaylist, currentUserId).catch((err) => {
      console.error("[MusicContext] Failed to persist playlist to Supabase:", err);
    });

    return newPlaylist;
  };

  const importSpotifyPlaylist = ({
    title,
    description,
    coverUrl,
    tracks,
    sourceMeta,
  }) => {
    const currentUserId = getAccountUserId(user);
    const count = customPlaylists.length + 1;
    const cleanTitle = title?.trim() || `Imported Playlist #${count}`;
    const id = `playlist-custom-${Date.now()}`;

    const safeTracks = Array.isArray(tracks)
      ? tracks.map(normalizeTrack).filter(Boolean)
      : [];

    const fallbackCovers = [
      "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    ];

    const finalCover =
      coverUrl ||
      safeTracks[0]?.coverUrl ||
      fallbackCovers[customPlaylists.length % fallbackCovers.length];

    const formattedDuration = formatPlaylistDuration(safeTracks);

    const newPlaylist = {
      id,
      title: cleanTitle,
      subtitle: `Imported • ${safeTracks.length} tracks`,
      description:
        description ||
        `Spotify playlist "${cleanTitle}" imported to Ceepeefy Studio Mode with JioSaavn lossless audio streaming.`,
      curator: "You",
      curatorAvatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS",
      songsCount: safeTracks.length,
      duration: formattedDuration,
      updatedDate: "Imported today",
      fidelity: "Imported Playlist • Hi-Res Lossless",
      spec: "24-Bit • 192kHz",
      badge: "SPOTIFY",
      badgeVariant: "emerald",
      stat: `${safeTracks.length} tracks`,
      coverUrl: finalCover,
      customCover: finalCover,
      tracks: safeTracks,
      isCustom: true,
      source: "spotify_import",
      sourceMeta: sourceMeta || null,
    };

    setCustomPlaylists((prev) => {
      const updated = [newPlaylist, ...prev];
      try {
        localStorage.setItem(getAccountStorageKey("ceepeefy_custom_playlists", currentUserId), JSON.stringify(updated));
      } catch {}
      persistAccountData({ customPlaylists: updated });
      return updated;
    });

    savePlaylistToCloud(newPlaylist, currentUserId).catch((err) => {
      console.error("[MusicContext] Failed to persist imported playlist to Supabase:", err);
    });

    return newPlaylist;
  };

  // Set of playlist IDs currently undergoing Spotify synchronization
  const [syncingPlaylistIds, setSyncingPlaylistIds] = useState(new Set());

  /**
   * Fetches the Spotify sync preview/diff plan for a given playlist.
   * Compares the current Spotify playlist with the last synced snapshot.
   */
  const fetchSpotifySyncPlan = async (playlistId) => {
    if (!playlistId) return { success: false, error: "Playlist ID is required." };
    if (syncingPlaylistIds.has(playlistId)) {
      return { success: false, error: "Sync operation is already in progress for this playlist." };
    }

    const playlist = customPlaylists.find((p) => String(p.id) === String(playlistId));
    if (!playlist) {
      return { success: false, error: "Playlist not found in your custom playlists." };
    }

    const spotifyId = playlist.sourceMeta?.spotifyId;
    if (!spotifyId) {
      return { success: false, error: "This playlist is not linked to a Spotify source." };
    }

    setSyncingPlaylistIds((prev) => new Set([...prev, playlistId]));

    try {
      const baselineSnapshot =
        Array.isArray(playlist.sourceMeta?.syncedSnapshot) && playlist.sourceMeta.syncedSnapshot.length > 0
          ? playlist.sourceMeta.syncedSnapshot
          : buildSnapshotFromExistingPlaylist(playlist);

      const res = await fetch("/api/spotify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId,
          spotifyId,
          currentSnapshot: baselineSnapshot,
          existingTracks: playlist.tracks || [],
        }),
      });

      const data = await res.json();
      return data;
    } catch (err) {
      console.error("[MusicContext] fetchSpotifySyncPlan error:", err);
      return {
        success: false,
        error: "Failed to connect to Spotify sync service. Please check your network connection.",
      };
    } finally {
      setSyncingPlaylistIds((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    }
  };

  /**
   * Commits the reviewed/accepted sync plan to the playlist.
   * Updates only what changed without rebuilding unchanged tracks.
   */
  const commitSpotifySync = async (playlistId, syncPlanResult, options = {}) => {
    if (!playlistId || !syncPlanResult?.diff) {
      return { success: false, error: "Invalid sync plan data." };
    }

    const currentUserId = getAccountUserId(user);
    const playlist = customPlaylists.find((p) => String(p.id) === String(playlistId));
    if (!playlist) {
      return { success: false, error: "Playlist not found." };
    }

    const matchedAddedItems =
      options.selectedAdditions ||
      syncPlanResult.addedMatches?.filter(
        (m) => m.status === "matched" || m.userSelectedTrack
      ) ||
      [];
    const unresolvedAdditions =
      options.unresolvedAdditions ||
      syncPlanResult.addedMatches?.filter(
        (m) => m.status !== "matched" && !m.userSelectedTrack
      ) ||
      [];

    const planOutput = applySyncPlan({
      diff: syncPlanResult.diff,
      matchedAddedItems: matchedAddedItems.map((m) => ({
        sourceEntryId: m.sourceEntryId,
        playableTrack: m.userSelectedTrack || m.matchedTrack,
        targetIndex: m.targetIndex,
        spotifyTrack: m.spotifyTrack,
      })),
      unresolvedAdditions,
      existingTracks: playlist.tracks || [],
      playlistTitle: playlist.title,
    });

    const formattedDuration = formatPlaylistDuration(planOutput.updatedTracks);

    const updatedSourceMeta = {
      ...(playlist.sourceMeta || {}),
      spotifyId: syncPlanResult.spotifyMetadata?.id || playlist.sourceMeta?.spotifyId,
      snapshotId: syncPlanResult.spotifyMetadata?.snapshotId || playlist.sourceMeta?.snapshotId,
      lastSyncedAt: Date.now(),
      lastSyncStatus: planOutput.unresolvedCount > 0 ? "partial" : "success",
      totalSourceTracks:
        syncPlanResult.spotifyMetadata?.totalTracks || planOutput.newSnapshot.length,
      syncedSnapshot: planOutput.newSnapshot,
      unresolvedTracks: planOutput.pendingUnresolved,
    };

    const updatedPlaylist = {
      ...playlist,
      tracks: planOutput.updatedTracks,
      songsCount: planOutput.updatedTracks.length,
      duration: formattedDuration,
      subtitle: `Imported • ${planOutput.updatedTracks.length} tracks`,
      updatedDate: "Synced today",
      sourceMeta: updatedSourceMeta,
    };

    setCustomPlaylists((prev) => {
      const next = prev.map((p) =>
        String(p.id) === String(playlistId) ? updatedPlaylist : p
      );
      try {
        localStorage.setItem(
          getAccountStorageKey("ceepeefy_custom_playlists", currentUserId),
          JSON.stringify(next)
        );
      } catch {}
      persistAccountData({ customPlaylists: next });
      return next;
    });

    // Save to Supabase cloud
    savePlaylistToCloud(updatedPlaylist, currentUserId).catch((err) => {
      console.warn("[MusicContext] Failed to persist synced playlist to Supabase:", err);
    });

    return {
      success: true,
      updatedPlaylist,
      summary: {
        added: planOutput.addedCount,
        removed: planOutput.removedCount,
        reordered: syncPlanResult.summary?.reorderedCount || 0,
        unchanged: syncPlanResult.summary?.unchangedCount || 0,
        unresolved: planOutput.unresolvedCount,
      },
    };
  };

  const deleteCustomPlaylist = (id) => {
    if (!id) return;
    const currentUserId = getAccountUserId(user);
    const idStr = String(id);

    // 1. Remove from customPlaylists immediately and persist
    setCustomPlaylists((prev) => {
      const next = prev.filter((p) => String(p.id) !== idStr);
      try {
        localStorage.setItem(
          getAccountStorageKey("ceepeefy_custom_playlists", currentUserId),
          JSON.stringify(next)
        );
      } catch { }
      try {
        persistAccountData({ customPlaylists: next });
      } catch { }
      return next;
    });

    // 2. Remove from addedPlaylists immediately and persist
    setAddedPlaylists((prev) => {
      const next = prev.filter((p) => String(p.id) !== idStr);
      try {
        localStorage.setItem("ceepeefy_added_playlists", JSON.stringify(next));
      } catch { }
      return next;
    });

    // 3. Remove from pinnedPlaylistIds immediately and persist
    setPinnedPlaylistIds((prev) => {
      const next = prev.filter((pid) => String(pid) !== idStr);
      try {
        localStorage.setItem("ceepeefy_pinned_playlists", JSON.stringify(next));
      } catch { }
      return next;
    });

    // 4. Remove from selfMixes in case it was a selfMix
    setSelfMixes((prev) => {
      const next = prev.filter((m) => String(m.id) !== idStr);
      try {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(next));
        persistAccountData({ selfMixes: next });
      } catch { }
      return next;
    });

    // 5. Clean up local title/cover overrides
    try {
      const titles = JSON.parse(localStorage.getItem("ceepeefy_playlist_titles") || "{}");
      if (titles[idStr]) {
        delete titles[idStr];
        localStorage.setItem("ceepeefy_playlist_titles", JSON.stringify(titles));
      }
      const covers = JSON.parse(localStorage.getItem("ceepeefy_playlist_covers") || "{}");
      if (covers[idStr]) {
        delete covers[idStr];
        localStorage.setItem("ceepeefy_playlist_covers", JSON.stringify(covers));
      }
    } catch { }

    // 6. Delete from Supabase cloud
    deletePlaylistFromCloud(idStr, currentUserId).catch((err) => {
      console.error("[MusicContext] Failed to delete playlist from Supabase:", err);
    });
  };

  const deletePlaylist = (id) => {
    deleteCustomPlaylist(id);
  };

  const updatePlaylistCover = (id, newCoverUrl) => {
    if (!id || !newCoverUrl) return false;
    const currentUserId = getAccountUserId(user);
    const idStr = String(id);

    // 1. Update in customPlaylists
    let foundInCustom = false;
    let updatedCustomPlaylist = null;
    setCustomPlaylists((prev) => {
      const idx = prev.findIndex((p) => String(p.id) === idStr);
      if (idx !== -1) {
        foundInCustom = true;
        const current = prev[idx];
        updatedCustomPlaylist = {
          ...current,
          coverUrl: newCoverUrl,
          customCover: newCoverUrl,
        };
        const next = [...prev];
        next[idx] = updatedCustomPlaylist;
        try {
          localStorage.setItem(
            getAccountStorageKey("ceepeefy_custom_playlists", currentUserId),
            JSON.stringify(next)
          );
          persistAccountData({ customPlaylists: next });
        } catch { }
        return next;
      }
      return prev;
    });

    if (foundInCustom && updatedCustomPlaylist) {
      savePlaylistToCloud(updatedCustomPlaylist, currentUserId).catch((err) => {
        console.warn("[MusicContext] Failed to sync updated cover to Supabase:", err);
      });
    }

    // 2. Update in selfMixes
    let foundInSelfMix = false;
    let updatedSelfMix = null;
    setSelfMixes((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === idStr);
      if (idx !== -1) {
        foundInSelfMix = true;
        const current = prev[idx];
        updatedSelfMix = {
          ...current,
          coverUrl: newCoverUrl,
          customCover: newCoverUrl,
        };
        const next = [...prev];
        next[idx] = updatedSelfMix;
        try {
          localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(next));
          persistAccountData({ selfMixes: next });
        } catch { }
        return next;
      }
      return prev;
    });

    if (foundInSelfMix && updatedSelfMix) {
      savePlaylistToCloud(updatedSelfMix, currentUserId).catch((err) => {
        console.warn("[MusicContext] Failed to sync updated self mix cover to Supabase:", err);
      });
    }

    // 3. Update in addedPlaylists
    setAddedPlaylists((prev) => {
      const next = prev.map((p) =>
        String(p.id) === idStr ? { ...p, coverUrl: newCoverUrl, customCover: newCoverUrl } : p
      );
      try {
        localStorage.setItem("ceepeefy_added_playlists", JSON.stringify(next));
      } catch { }
      return next;
    });

    // 4. Save to persistent overrides map (works across all playlist types)
    try {
      const storedOverrides = JSON.parse(localStorage.getItem("ceepeefy_playlist_covers") || "{}");
      storedOverrides[idStr] = newCoverUrl;
      localStorage.setItem("ceepeefy_playlist_covers", JSON.stringify(storedOverrides));
    } catch { }

    return true;
  };

  const renamePlaylist = (id, newTitle) => {
    if (!id || !newTitle?.trim()) return false;
    const cleanTitle = newTitle.trim();
    const currentUserId = getAccountUserId(user);
    const idStr = String(id);

    // 1. Check customPlaylists
    let foundInCustom = false;
    let updatedCustomPlaylist = null;
    setCustomPlaylists((prev) => {
      const idx = prev.findIndex((p) => String(p.id) === idStr);
      if (idx !== -1) {
        foundInCustom = true;
        const current = prev[idx];
        updatedCustomPlaylist = {
          ...current,
          title: cleanTitle,
          description: current.description
            ? current.description.replace(current.title, cleanTitle)
            : `Personal playlist "${cleanTitle}" created in Ceepeefy Studio Mode. High-resolution lossless playback.`,
        };
        const next = [...prev];
        next[idx] = updatedCustomPlaylist;
        try {
          persistAccountData({ customPlaylists: next });
        } catch { }
        return next;
      }
      return prev;
    });

    if (foundInCustom && updatedCustomPlaylist) {
      savePlaylistToCloud(updatedCustomPlaylist, currentUserId).catch((err) => {
        console.warn("[MusicContext] Failed to sync renamed playlist to Supabase:", err);
      });
      return true;
    }

    // 2. Check selfMixes
    let foundInSelfMix = false;
    let updatedSelfMix = null;
    setSelfMixes((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === idStr);
      if (idx !== -1) {
        foundInSelfMix = true;
        const current = prev[idx];
        updatedSelfMix = {
          ...current,
          title: cleanTitle,
        };
        const next = [...prev];
        next[idx] = updatedSelfMix;
        try {
          localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(next));
          persistAccountData({ selfMixes: next });
        } catch { }
        return next;
      }
      return prev;
    });

    if (foundInSelfMix && updatedSelfMix) {
      savePlaylistToCloud(updatedSelfMix, currentUserId).catch((err) => {
        console.warn("[MusicContext] Failed to sync renamed self mix to Supabase:", err);
      });
      return true;
    }

    // 3. Check addedPlaylists
    setAddedPlaylists((prev) =>
      prev.map((p) => (String(p.id) === idStr ? { ...p, title: cleanTitle } : p))
    );

    // 4. Also store in custom playlist titles override (for built-in or cached playlists)
    try {
      const storedOverrides = JSON.parse(localStorage.getItem("ceepeefy_playlist_titles") || "{}");
      storedOverrides[idStr] = cleanTitle;
      localStorage.setItem("ceepeefy_playlist_titles", JSON.stringify(storedOverrides));
    } catch { }

    return true;
  };

  const bumpPlaylistToTop = (playlistId) => {
    if (!playlistId) return;
    const idStr = String(playlistId);

    // 1. Move to top in customPlaylists
    setCustomPlaylists((prev) => {
      const idx = prev.findIndex((p) => String(p.id) === idStr);
      if (idx <= 0) return prev; // already at top or not found
      const target = prev[idx];
      const updated = [target, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      try {
        persistAccountData({ customPlaylists: updated });
      } catch { }
      return updated;
    });

    // 2. Move to top in selfMixes
    setSelfMixes((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === idStr);
      if (idx <= 0) return prev;
      const target = prev[idx];
      const updated = [target, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      try {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(updated));
        persistAccountData({ selfMixes: updated });
      } catch { }
      return updated;
    });

    // 3. Move to top in addedPlaylists
    setAddedPlaylists((prev) => {
      const idx = prev.findIndex((p) => String(p.id) === idStr);
      if (idx <= 0) return prev;
      return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });

    try {
      localStorage.setItem("ceepeefy_last_played_playlist_id", idStr);
    } catch { }
  };

  const createSelfMix = (title, initialTracks = [], customCover = null) => {
    const count = selfMixes.length + 1;
    const cleanTitle = title?.trim() || `Self Mix #${count}`;
    const id = `mix-${Date.now()}`;
    const coverOptions = [
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80"
    ];
    const coverUrl = customCover || coverOptions[selfMixes.length % coverOptions.length];

    const safeTracks = Array.isArray(initialTracks)
      ? initialTracks.map(normalizeTrack).filter(Boolean)
      : [];
    const formattedDuration = formatPlaylistDuration(safeTracks);

    const newMix = {
      id,
      title: cleanTitle,
      subtitle: `By You • ${safeTracks.length} tracks`,
      description: `Personal self mix "${cleanTitle}" blended by You in Ceepeefy Studio Mode. High-resolution lossless playback.`,
      curator: "You",
      curatorAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS",
      songsCount: safeTracks.length,
      duration: formattedDuration,
      updatedDate: "Created today",
      fidelity: "Self Mix • Hi-Res Lossless",
      spec: "24-Bit • 192kHz",
      badge: "SELF MIX",
      badgeVariant: "cyan",
      stat: "Personal Mix",
      coverUrl,
      tracks: safeTracks,
      isCustom: true,
      isSelfMix: true,
    };

    setSelfMixes((prev) => {
      const updated = [newMix, ...prev];
      try {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(updated));
      } catch { }
      persistAccountData({ selfMixes: updated });
      return updated;
    });

    // Sync Self Mix to Supabase cloud so it's accessible across all devices
    savePlaylistToCloud(newMix, currentUserId).catch((err) => {
      console.warn("[MusicContext] Cloud sync error for self mix:", err);
    });

    return newMix;
  };

  const deleteSelfMix = (id) => {
    if (!id) return;
    const target = selfMixes.find((m) => String(m.id) === String(id));
    if (target && target.tracks && target.tracks.length > 0) {
      // 1. Delete local audio files from IndexedDB
      const localTrackIds = target.tracks
        .filter((t) => t.isLocal || String(t.id).startsWith("local-") || t.source === "local-upload")
        .map((t) => t.id);
      if (localTrackIds.length > 0) {
        deleteLocalAudioFiles(localTrackIds).catch((e) =>
          console.warn("Failed to delete local audio files:", e)
        );
      }

      // 2. Delete cloud audio tracks from Supabase if present
      const cloudTracks = target.tracks.filter(
        (t) => t.isCloud || t.source === "supabase-cloud" || (t.audioUrl && t.audioUrl.includes("supabase"))
      );
      cloudTracks.forEach((t) => {
        deleteSelfMixFromCloud(t.id, t.audioUrl).catch((e) =>
          console.warn("Failed to delete cloud track:", e)
        );
      });
    }

    setSelfMixes((prev) => {
      const updated = prev.filter((m) => String(m.id) !== String(id));
      try {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(updated));
      } catch { }
      persistAccountData({ selfMixes: updated });
      return updated;
    });
    setCustomPlaylists((prev) => prev.filter((p) => String(p.id) !== String(id)));

    // Delete from Supabase cloud
    deletePlaylistFromCloud(id, currentUserId).catch((err) => {
      console.warn("[MusicContext] Cloud delete error for self mix:", err);
    });
  };

  const addLocalTracksToSelfMix = (mixId, newTracks = []) => {
    if (!mixId || !Array.isArray(newTracks) || newTracks.length === 0) return;
    const normalizedNew = newTracks.map(normalizeTrack).filter(Boolean);

    let updatedTarget = null;
    setSelfMixes((prev) => {
      const updated = prev.map((mix) => {
        if (mix.id !== mixId) return mix;
        const existing = mix.tracks || [];
        const existingIds = new Set(existing.map((t) => String(t.id)));
        const toAdd = normalizedNew.filter((t) => !existingIds.has(String(t.id)));
        const nextTracks = [...existing, ...toAdd];
        const nextMix = {
          ...mix,
          tracks: nextTracks,
          songsCount: nextTracks.length,
          duration: formatPlaylistDuration(nextTracks),
          subtitle: `By You • ${nextTracks.length} tracks`,
        };
        updatedTarget = nextMix;
        return nextMix;
      });
      try {
        localStorage.setItem("ceepeefy_self_mixes", JSON.stringify(updated));
      } catch { }
      persistAccountData({ selfMixes: updated });
      return updated;
    });

    if (updatedTarget) {
      savePlaylistToCloud(updatedTarget, currentUserId).catch((err) => {
        console.warn("[MusicContext] Cloud update error for self mix:", err);
      });
    }
  };

  const addTrackToPlaylist = (playlistId, track) => {
    if (!playlistId || !track) return;
    const norm = normalizeTrack(track);
    if (!norm) return;

    let isCustom = false;
    let targetIndex = 0;

    setCustomPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        isCustom = true;
        const existing = pl.tracks || [];
        if (existing.some((t) => String(t.id) === String(norm.id))) return pl;
        targetIndex = existing.length;
        const updated = [...existing, norm];
        return {
          ...pl,
          tracks: updated,
          songsCount: updated.length,
          duration: formatPlaylistDuration(updated),
          subtitle: `By You • ${updated.length} tracks`,
        };
      })
    );
    setSelfMixes((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const existing = pl.tracks || [];
        if (existing.some((t) => String(t.id) === String(norm.id))) return pl;
        const updated = [...existing, norm];
        return {
          ...pl,
          tracks: updated,
          songsCount: updated.length,
          duration: formatPlaylistDuration(updated),
          subtitle: `By You • ${updated.length} tracks`,
        };
      })
    );

    if (isCustom) {
      addTrackToPlaylistCloud(playlistId, norm, targetIndex).catch((err) => {
        console.error("[MusicContext] Failed to add track to playlist in Supabase:", err);
      });
    }
  };

  const removeTrackFromPlaylist = (playlistId, trackId) => {
    if (!playlistId || !trackId) return;
    if (String(trackId).startsWith("local-")) {
      deleteLocalAudioFile(trackId).catch((e) =>
        console.warn("Failed to delete local audio file:", e)
      );
    }
    let isCustom = false;
    setCustomPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        isCustom = true;
        const updated = (pl.tracks || []).filter((t) => String(t.id) !== String(trackId));
        return {
          ...pl,
          tracks: updated,
          songsCount: updated.length,
          duration: formatPlaylistDuration(updated),
          subtitle: `By You • ${updated.length} tracks`,
        };
      })
    );
    setSelfMixes((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const updated = (pl.tracks || []).filter((t) => String(t.id) !== String(trackId));
        return {
          ...pl,
          tracks: updated,
          songsCount: updated.length,
          duration: formatPlaylistDuration(updated),
          subtitle: `By You • ${updated.length} tracks`,
        };
      })
    );

    if (isCustom) {
      removeTrackFromPlaylistCloud(playlistId, trackId).catch((err) => {
        console.error("[MusicContext] Failed to remove track from playlist in Supabase:", err);
      });
    }
  };

  // HTML5 Audio Reference & State
  const audioRef = useRef(null);
  const repeatModeRef = useRef(repeatMode);
  const currentTrackRef = useRef(currentTrack);
  const currentTracklistRef = useRef(currentTracklist);
  const manualQueueRef = useRef(manualQueue);
  const autoQueueRef = useRef(autoQueue);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const playRequestIdRef = useRef(0);
  const queueRequestIdRef = useRef(0);
  const recentRecommendedTrackIdsRef = useRef(new Set());
  const isTransitioningTrackRef = useRef(false);

  // Centralized Playback History (tracks played prior to current song)
  const [playbackHistory, setPlaybackHistory] = useState([]);
  const playbackHistoryRef = useRef([]);
  const prevSongQueueRef = useRef([]);
  useEffect(() => { playbackHistoryRef.current = playbackHistory; }, [playbackHistory]);

  // Derived queue availability for Next/Previous button states across all devices
  const hasNextTrack = Boolean((queue && queue.length > 0) || isAutoplayEnabled);
  const hasPrevTrack = Boolean(
    (playbackHistory && playbackHistory.length > 0) ||
    (currentTracklist &&
      currentTracklist.length > 0 &&
      currentTracklist.findIndex((t) => String(t.id) === String(currentTrack?.id)) > 0) ||
    currentTime > 3
  );

  // Sync ref values to avoid stale closures in audio callbacks
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { currentTracklistRef.current = currentTracklist; }, [currentTracklist]);
  useEffect(() => { manualQueueRef.current = manualQueue; }, [manualQueue]);
  useEffect(() => { autoQueueRef.current = autoQueue; }, [autoQueue]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { isAutoplayEnabledRef.current = isAutoplayEnabled; }, [isAutoplayEnabled]);

  // Sync volume and mute with HTML5 Audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Save liked songs & track metadata map
  useEffect(() => {
    if (hasLoadedStorageRef.current && typeof window !== "undefined") {
      try {
        localStorage.setItem("nocturne_liked", JSON.stringify(likedSongIds));
        localStorage.setItem("nocturne_liked_map", JSON.stringify(likedSongsMap));
      } catch { }
    }
  }, [likedSongIds, likedSongsMap]);

  // =========================================================================
  // Background Queue Pre-download & Caching Engine
  // Automatically pre-downloads/caches the exact next song in the playback queue
  // while the current song is playing, guaranteeing zero-buffering transitions.
  // =========================================================================
  const prefetchCacheRef = useRef(new Map()); // Map<trackId, { audioUrl, blobUrl, preloader }>
  const currentPrefetchAbortRef = useRef(null);
  const currentPrefetchTrackIdRef = useRef(null);

  // Computes the exact next track that will play based on strict queue priority:
  // 1. Manual Queue -> 2. Auto Queue -> 3. Tracklist Sequence
  const resolveNextTrackInQueue = useCallback(() => {
    const mQ = manualQueueRef.current || [];
    if (mQ.length > 0) {
      return mQ[0];
    }
    const aQ = autoQueueRef.current || [];
    if (aQ.length > 0) {
      return aQ[0];
    }
    const cur = currentTrackRef.current;
    const tracklist = currentTracklistRef.current || [];
    if (cur && tracklist.length > 0) {
      const idx = tracklist.findIndex((t) => String(t.id) === String(cur.id));
      if (idx !== -1) {
        if (idx + 1 < tracklist.length) {
          return tracklist[idx + 1];
        } else if (repeatModeRef.current === "all") {
          return tracklist[0];
        }
      }
    }
    return null;
  }, []);

  // Pre-download effect: runs whenever current track, queue, or tracklist changes
  useEffect(() => {
    if (!currentTrack) return;

    const nextTrack = resolveNextTrackInQueue();
    if (!nextTrack || !nextTrack.id) return;

    const nextTrackId = String(nextTrack.id);

    // If next track is the song currently playing, skip
    if (String(currentTrack.id) === nextTrackId) return;

    // If next track is already the active prefetch and is already cached, skip
    if (currentPrefetchTrackIdRef.current === nextTrackId && prefetchCacheRef.current.has(nextTrackId)) {
      return;
    }

    // If the queue changed (e.g. user added song to queue), abort previous in-flight prefetch
    if (currentPrefetchAbortRef.current && currentPrefetchTrackIdRef.current !== nextTrackId) {
      try {
        currentPrefetchAbortRef.current.abort();
      } catch { }
      currentPrefetchAbortRef.current = null;
    }

    // If next song is already downloaded in offline storage, do not download again
    if (offlineTrackIds?.has(nextTrackId)) {
      return;
    }

    // If already pre-cached in memory, do not download again
    if (prefetchCacheRef.current.has(nextTrackId)) {
      return;
    }

    currentPrefetchTrackIdRef.current = nextTrackId;
    const abortController = new AbortController();
    currentPrefetchAbortRef.current = abortController;

    // Delay 650ms so current playing song cleanly establishes its connection without competition
    const prefetchTimer = setTimeout(async () => {
      if (abortController.signal.aborted) return;

      try {
        // 1. Check local audio storage (e.g. self mix)
        let resolvedAudioUrl = nextTrack.audioUrl;
        if (!resolvedAudioUrl) {
          try {
            const localUrl = await getLocalAudioUrl(nextTrack.id);
            if (localUrl) resolvedAudioUrl = localUrl;
          } catch { }
        }

        // 2. Resolve remote streaming URL via audio search service
        if (!resolvedAudioUrl && typeof navigator !== "undefined" && navigator.onLine) {
          try {
            const streamData = await getDirectAudioStreamUrl(
              nextTrack.title,
              nextTrack.artist,
              nextTrack.id
            );
            if (streamData?.audioUrl) {
              resolvedAudioUrl = streamData.audioUrl;
            }
          } catch (streamErr) {
            console.warn("[Background Pre-download] Stream URL resolution skipped:", streamErr);
          }
        }

        if (abortController.signal.aborted || !resolvedAudioUrl) return;

        // 3. Cache entry object
        const cacheEntry = {
          trackId: nextTrackId,
          audioUrl: resolvedAudioUrl,
          blobUrl: null,
          preloader: null,
        };

        // Cache eviction: keep max 3 entries in memory to prevent excessive storage/memory
        if (prefetchCacheRef.current.size >= 3) {
          const oldestKey = prefetchCacheRef.current.keys().next().value;
          const oldEntry = prefetchCacheRef.current.get(oldestKey);
          if (oldEntry?.blobUrl) {
            try { URL.revokeObjectURL(oldEntry.blobUrl); } catch { }
          }
          if (oldEntry?.preloader) {
            try { oldEntry.preloader.src = ""; } catch { }
          }
          prefetchCacheRef.current.delete(oldestKey);
        }

        // 4. Download and cache audio in background
        try {
          const resp = await fetch(resolvedAudioUrl, {
            signal: abortController.signal,
          });

          if (resp.ok) {
            const blob = await resp.blob();
            if (!abortController.signal.aborted) {
              cacheEntry.blobUrl = URL.createObjectURL(blob);
            }
          }
        } catch (fetchErr) {
          // If fetch fails (e.g. CORS), fallback to HTML5 Audio element background preloading
          if (!abortController.signal.aborted && typeof window !== "undefined") {
            try {
              const bgAudio = new Audio();
              bgAudio.preload = "auto";
              bgAudio.src = resolvedAudioUrl;
              bgAudio.load();
              cacheEntry.preloader = bgAudio;
            } catch { }
          }
        }

        if (!abortController.signal.aborted) {
          prefetchCacheRef.current.set(nextTrackId, cacheEntry);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.warn("[Background Pre-download] Gracefully handled error:", err);
        }
      }
    }, 650);

    return () => {
      clearTimeout(prefetchTimer);
      if (abortController) {
        try {
          abortController.abort();
        } catch { }
      }
    };
  }, [currentTrack?.id, manualQueue, autoQueue, currentTracklist, repeatMode, offlineTrackIds, resolveNextTrackInQueue]);

  // Synchronized Lyrics Fetching
  useEffect(() => {
    if (!currentTrack) {
      setSyncedLyrics([]);
      setIsLoadingLyrics(false);
      setLyricsError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingLyrics(true);
    setLyricsError(null);

    const trackTitle = currentTrack.title || "";
    const artistName = currentTrack.artist || "";
    const trackDuration = currentTrack.duration || 210;
    const trackId = currentTrack.id || "";

    const fetchLyrics = async () => {
      try {
        const params = new URLSearchParams({
          id: trackId,
          track: trackTitle,
          artist: artistName,
          duration: String(trackDuration),
        });
        const res = await fetch(`/api/audio/lyrics?${params.toString()}`);
        if (!res.ok) throw new Error(`Lyrics request failed with status ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          if (data.lines && Array.isArray(data.lines) && data.lines.length > 0) {
            setSyncedLyrics(data.lines);
          } else if (currentTrack.lyrics && typeof currentTrack.lyrics === "string") {
            const rawLines = currentTrack.lyrics
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            if (rawLines.length > 0) {
              const dur = trackDuration > 10 ? trackDuration : 210;
              const step = dur / (rawLines.length + 1);
              setSyncedLyrics(
                rawLines.map((text, idx) => ({
                  time: Math.round((idx * step + step * 0.5) * 10) / 10,
                  text,
                }))
              );
            } else {
              setSyncedLyrics([]);
            }
          } else {
            setSyncedLyrics([]);
          }
          setIsLoadingLyrics(false);
        }
      } catch (err) {
        if (isMounted) {
          console.warn("[Lyrics] Failed to fetch lyrics:", err);
          if (currentTrack.lyrics && typeof currentTrack.lyrics === "string") {
            const rawLines = currentTrack.lyrics
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const dur = trackDuration > 10 ? trackDuration : 210;
            const step = dur / (rawLines.length + 1);
            setSyncedLyrics(
              rawLines.map((text, idx) => ({
                time: Math.round((idx * step + step * 0.5) * 10) / 10,
                text,
              }))
            );
          } else {
            setSyncedLyrics([]);
          }
          setLyricsError(err.message);
          setIsLoadingLyrics(false);
        }
      }
    };

    fetchLyrics();

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id]);

  // Stall & Network Recovery Tracking
  const retryCountRef = useRef(0);
  const isRecoveringRef = useRef(false);
  const lastProgressTimeRef = useRef(0);
  const stallTimeoutRef = useRef(null);

  /**
   * Stall Recovery & Network Retry Engine
   * Captures audioRef.current.currentTime, re-applies the direct CDN src URL,
   * and automatically resumes playback from the exact timestamp without restarting.
   */
  const recoverPlayback = (reason = "stall_or_error") => {
    const audio = audioRef.current;
    if (!audio || isRecoveringRef.current) return;

    if (retryCountRef.current >= 4) {
      console.warn(`[AudioEngine] Max stall recovery attempts (4) reached for reason: ${reason}`);
      setIsBuffering(false);
      return;
    }

    isRecoveringRef.current = true;
    retryCountRef.current += 1;

    // 1. Capture current playback timestamp and source URL
    const savedTime =
      audio.currentTime && !isNaN(audio.currentTime) && audio.currentTime > 0
        ? audio.currentTime
        : lastProgressTimeRef.current || 0;
    const currentSrc = audio.src;

    if (!currentSrc) {
      isRecoveringRef.current = false;
      setIsBuffering(false);
      return;
    }

    console.warn(
      `[AudioEngine] Recovering playback (${reason}) at timestamp ${savedTime.toFixed(2)}s | Attempt ${retryCountRef.current}/4`
    );
    setIsBuffering(true);

    try {
      // 2. Re-apply the direct CDN src URL to flush broken socket/HTTP range connection
      audio.src = currentSrc;
      audio.preload = "auto";
      audio.load();

      // 3. Once browser has buffered sufficient data, seek to saved timestamp and resume
      const handleReadyToResume = async () => {
        audio.removeEventListener("canplay", handleReadyToResume);
        audio.removeEventListener("loadeddata", handleReadyToResume);

        try {
          if (savedTime > 0) {
            audio.currentTime = savedTime;
          }
          await audio.play();
          setIsPlaying(true);
          setIsBuffering(false);
          console.log(`[AudioEngine] Successfully recovered and resumed playback at ${savedTime.toFixed(2)}s`);
        } catch (resumeErr) {
          console.warn("[AudioEngine] Error auto-resuming playback after recovery:", resumeErr);
        } finally {
          isRecoveringRef.current = false;
        }
      };

      audio.addEventListener("canplay", handleReadyToResume, { once: true });
      audio.addEventListener("loadeddata", handleReadyToResume, { once: true });
    } catch (err) {
      console.error("[AudioEngine] Recovery execution failed:", err);
      isRecoveringRef.current = false;
      setIsBuffering(false);
    }
  };

  // Web Media Session API: Extract genuine track artwork (never empty or placeholder)
  const getMediaSessionArtwork = (track) => {
    if (!track) return [];

    let coverUrlStr = "";

    // 1. Array of images (e.g. JioSaavn returns image: [{ quality: '500x500', url: '...' }, ...])
    if (Array.isArray(track.image) && track.image.length > 0) {
      const last = track.image[track.image.length - 1];
      if (typeof last === "string") coverUrlStr = last;
      else if (last && typeof last.url === "string") coverUrlStr = last.url;
      else if (last && typeof last.link === "string") coverUrlStr = last.link;
    } else if (Array.isArray(track.images) && track.images.length > 0) {
      const last = track.images[track.images.length - 1];
      if (typeof last === "string") coverUrlStr = last;
      else if (last && typeof last.url === "string") coverUrlStr = last.url;
    }

    // 2. Direct string properties
    if (!coverUrlStr) {
      const candidates = [
        track.coverUrl,
        track.thumbnail,
        typeof track.image === "string" ? track.image : null,
        typeof track.image === "object" && track.image?.url ? track.image.url : null,
        track.imageUrl,
        track.albumArt,
        track.artwork,
        track.more_info?.image,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          coverUrlStr = candidate.trim();
          break;
        }
      }
    }

    // 3. Fallback to default high-res music artwork if missing so notification artwork is never empty
    if (!coverUrlStr) {
      coverUrlStr = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=512&auto=format&fit=crop&q=80";
    }

    let absoluteUrl = coverUrlStr.replace(/^http:\/\//i, "https://");
    if (absoluteUrl.includes("saavncdn.com") || absoluteUrl.includes("jiosaavn.com")) {
      absoluteUrl = absoluteUrl.replace(/50x50|150x150/g, "500x500");
    }

    try {
      if (
        !absoluteUrl.startsWith("http://") &&
        !absoluteUrl.startsWith("https://") &&
        !absoluteUrl.startsWith("blob:") &&
        !absoluteUrl.startsWith("data:")
      ) {
        if (typeof window !== "undefined") {
          absoluteUrl = new URL(absoluteUrl, window.location.origin).href;
        }
      }
    } catch {
      return [];
    }

    const ext = absoluteUrl.split("?")[0].split(".").pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return [
      { src: absoluteUrl, sizes: "96x96", type: mimeType },
      { src: absoluteUrl, sizes: "128x128", type: mimeType },
      { src: absoluteUrl, sizes: "192x192", type: mimeType },
      { src: absoluteUrl, sizes: "256x256", type: mimeType },
      { src: absoluteUrl, sizes: "384x384", type: mimeType },
      { src: absoluteUrl, sizes: "512x512", type: mimeType },
    ];
  };

  // Immediate Web Media Session metadata synchronization
  const updateMediaSessionMetadata = (track) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (!track) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      } catch { }
      return;
    }

    const title = track.title || "Unknown Title";
    const artist = track.artist || track.subtitle || track.primaryArtist || track.primary_artist || "Ceepeefy Artist";
    const album = track.album || track.albumName || track.movie || "Ceepeefy";
    const artwork = getMediaSessionArtwork(track);

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    } catch (e) {
      console.warn("[MediaSession] Metadata error, falling back:", e);
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
        });
      } catch { }
    }
  };

  // Synchronize Media Session Playback Position
  const updateMediaSessionPositionState = (customPosition = null) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!("setPositionState" in navigator.mediaSession)) return;
    const dur = audioRef.current?.duration ?? durationRef.current ?? 0;
    const cur = customPosition !== null ? customPosition : (audioRef.current?.currentTime ?? currentTimeRef.current ?? 0);
    if (!dur || isNaN(dur) || dur <= 0) return;

    try {
      const validDuration = Number(dur);
      const validPosition = Math.max(0, Math.min(Number(cur) || 0, validDuration));
      if (validDuration > 0 && isFinite(validDuration) && isFinite(validPosition)) {
        navigator.mediaSession.setPositionState({
          duration: validDuration,
          playbackRate: 1.0,
          position: validPosition,
        });
      }
    } catch { }
  };

  // HTML5 Audio Event Handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      setCurrentTime(cur);
      lastProgressTimeRef.current = cur;

      // Smart Background Autoplay Injection & Continuation:
      // When the active queue is nearly exhausted (<= 2 songs left),
      // and playback reaches within 25s before ending (or 75% progress), silently fetch & append next similar tracks!
      if (
        isAutoplayEnabledRef.current &&
        (manualQueueRef.current.length + autoQueueRef.current.length) <= 2 &&
        dur > 15 &&
        (cur >= dur - 25 || cur >= dur * 0.75) &&
        !isFetchingAutoplayRef.current
      ) {
        const currentSong = currentTrackRef.current;
        if (currentSong?.id) {
          fetchAndInjectAutoplayQueue(currentSong, { mode: "append" });
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0) {
      setDuration(audioRef.current.duration);
    }
    setIsBuffering(false);
    if (currentTrackRef.current) {
      updateMediaSessionMetadata(currentTrackRef.current);
    }
    updateMediaSessionPositionState();
  };

  const handleDurationChange = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0) {
      setDuration(audioRef.current.duration);
    }
    updateMediaSessionPositionState();
  };

  const handlePlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    isTransitioningTrackRef.current = false;
    if (currentTrackRef.current) {
      updateMediaSessionMetadata(currentTrackRef.current);
    }
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch { }
    }
    updateMediaSessionPositionState();
  };

  const handlePause = () => {
    // Only pause if this is an intentional pause, not a background track transition
    if (!isTransitioningTrackRef.current) {
      setIsPlaying(false);
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "paused";
        } catch { }
      }
      updateMediaSessionPositionState();
    }
  };

  const handleWaiting = () => {
    setIsBuffering(true);
  };

  const handlePlaying = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    isTransitioningTrackRef.current = false;
    isRecoveringRef.current = false;
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
    if (currentTrackRef.current) {
      updateMediaSessionMetadata(currentTrackRef.current);
    }
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch { }
    }
    updateMediaSessionPositionState();
  };

  // Stall Event Listener: Handles connection stalls where no data is incoming from CDN
  const handleStalled = () => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    console.warn("[AudioEngine] Audio stream stalled mid-song. Verifying buffer progress...");
    setIsBuffering(true);

    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
    }

    // Debounce: If stalled for > 1.5s while playback was supposed to continue, re-apply src & resume
    stallTimeoutRef.current = setTimeout(() => {
      if (audioRef.current && isPlaying && !isRecoveringRef.current) {
        const timeDiff = Math.abs((audioRef.current.currentTime || 0) - lastProgressTimeRef.current);
        if (timeDiff < 0.25) {
          recoverPlayback("stalled_timeout");
        }
      }
    }, 1500);
  };

  const consecutiveErrorsRef = useRef(0);

  // Error Event Listener: Recovers from Network drops or skips unplayable tracks
  const handleAudioError = (e) => {
    const audio = audioRef.current;
    const err = audio?.error;
    const code = err?.code; // 1 = MEDIA_ERR_ABORTED, 2 = MEDIA_ERR_NETWORK, 3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
    console.warn(`[AudioEngine] HTML5 audio error event triggered (code: ${code}):`, err?.message || e);

    // If load was deliberately aborted due to switching songs, ignore
    if (code === 1) {
      return;
    }

    if (code === 2 || !code) {
      if (retryCountRef.current < 2) {
        retryCountRef.current++;
        console.warn(`[AudioEngine] Network/Connection drop detected. Retrying playback attempt ${retryCountRef.current}...`);
        recoverPlayback(`network_error_${code || "drop"}`);
        return;
      }
    }

    // Skip unplayable song if retries exhausted or decode/source error occurs (graceful recovery without infinite loop)
    if (consecutiveErrorsRef.current < 3 && (queueRef.current?.length > 0 || isAutoplayEnabledRef.current)) {
      consecutiveErrorsRef.current++;
      console.warn(`[AudioEngine] Advancing to next track in queue due to unplayable audio source (attempt ${consecutiveErrorsRef.current}/3)...`);
      setTimeout(() => {
        handleNextTrack();
      }, 350);
    } else {
      consecutiveErrorsRef.current = 0;
      isTransitioningTrackRef.current = false;
      setIsBuffering(false);
      setIsPlaying(false);
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "none";
        } catch { }
      }
    }
  };

  // Toggle Autoplay State and persist in localStorage
  const toggleAutoplay = () => {
    setIsAutoplayEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("nocturne_autoplay", JSON.stringify(next));
      } catch { }
      return next;
    });
  };

  /**
   * ListenFree-style Seed Metadata Extraction:
   * Extracts id, album_id, album, primary_artist, genre, mood, language, year, title, and artist of the seed song.
   */
  const extractSeedMetadata = (seedTrack) => {
    if (!seedTrack) return null;
    const isLocalSong = Boolean(
      seedTrack.isLocal ||
      String(seedTrack.id).startsWith("local-") ||
      seedTrack.source === "local-upload" ||
      seedTrack.source === "local-device"
    );
    if (isLocalSong) {
      console.log("[Autoplay] Seed track is a local track; queue finished.");
      return null;
    }

    const detectedLang = seedTrack.language || seedTrack.more_info?.language || extractLanguage(seedTrack) || "";
    const moodObj = classifySongMood(seedTrack);

    return {
      id: String(seedTrack.id || ""),
      cleanId: String(seedTrack.id || "").replace(/^track-/, "").trim(),
      album_id: String(seedTrack.album_id || seedTrack.albumId || seedTrack.more_info?.album_id || ""),
      album: String(seedTrack.album || seedTrack.albumName || seedTrack.more_info?.album || ""),
      primary_artist: String(seedTrack.primary_artist || seedTrack.primaryArtist || seedTrack.artist || seedTrack.singers || ""),
      genre: String(seedTrack.genre || seedTrack.more_info?.genre || ""),
      mood: String(seedTrack.mood || seedTrack.more_info?.mood || moodObj.primary || ""),
      language: detectedLang,
      year: String(seedTrack.year || seedTrack.releaseDate?.slice(0, 4) || ""),
      title: String(seedTrack.title || seedTrack.song || ""),
      artist: String(seedTrack.artist || ""),
    };
  };

  /**
   * Spotify-Inspired Intelligent Queue Manager:
   * 1. Extracts seed metadata (id, album_id, album, primary_artist, genre, mood, language, year, title).
   * 2. Fetches candidate tracks ranked by the strict recommendation engine (Same Language + Same Mood + Popular Hits).
   * 3. Mode "initial": User played a song. Populates upcoming queue with highest-priority recommendations.
   * 4. Mode "append": Queue is running low (<= 5 tracks). Seamlessly fetches and appends next recommendations if Autoplay is ON.
   * 5. Mode "transition": Current queue depleted and Autoplay is ON; transitions to next recommendation with zero downtime.
   */
  const fetchAndInjectAutoplayQueue = async (seedTrack, options = {}) => {
    if (!seedTrack) return;

    let mode = "append";
    if (typeof options === "boolean") {
      mode = options ? "append" : "transition";
    } else if (options?.mode) {
      mode = options.mode;
    }

    // If Autoplay is OFF, allow initial queue generation, but skip append/transition
    if (mode !== "initial" && !isAutoplayEnabledRef.current) return;

    const seedMeta = extractSeedMetadata(seedTrack);
    if (!seedMeta || (!seedMeta.id && !seedMeta.cleanId)) return;

    // Track request ID to safely prevent race conditions when users switch songs rapidly
    const reqId = ++queueRequestIdRef.current;
    isFetchingAutoplayRef.current = true;
    setIsAutoplayLoading(true);

    try {
      let rawTracks = [];

      // Use prefetched recommendations if available for this seed song
      if (
        prefetchedRecommendationsRef.current &&
        String(prefetchedRecommendationsRef.current.seedId) === String(seedMeta.id) &&
        Array.isArray(prefetchedRecommendationsRef.current.tracks) &&
        prefetchedRecommendationsRef.current.tracks.length > 0
      ) {
        rawTracks = prefetchedRecommendationsRef.current.tracks;
        prefetchedRecommendationsRef.current = null;
      } else {
        const params = new URLSearchParams();
        params.set("songId", seedMeta.cleanId || seedMeta.id);
        params.set("id", seedMeta.cleanId || seedMeta.id);
        if (seedMeta.album_id) params.set("album_id", seedMeta.album_id);
        if (seedMeta.album) params.set("album", seedMeta.album);
        if (seedMeta.primary_artist) params.set("primary_artist", seedMeta.primary_artist);
        if (seedMeta.genre) params.set("genre", seedMeta.genre);
        if (seedMeta.mood) params.set("mood", seedMeta.mood);
        if (seedMeta.language) params.set("language", seedMeta.language);
        if (seedMeta.year) params.set("year", seedMeta.year);
        if (seedMeta.title) params.set("title", seedMeta.title);
        if (seedMeta.artist) params.set("artist", seedMeta.artist);

        // Exclude currently playing track & manual queue tracks
        const excludeSet = new Set();
        if (seedMeta.id) excludeSet.add(String(seedMeta.id));
        if (seedMeta.cleanId) excludeSet.add(String(seedMeta.cleanId));
        if (currentTrackRef.current?.id) excludeSet.add(String(currentTrackRef.current.id));
        (manualQueueRef.current || []).forEach((t) => { if (t.id) excludeSet.add(String(t.id)); });

        const excludeList = Array.from(excludeSet).join(",");
        if (excludeList) params.set("excludeIds", excludeList);

        // Pass rolling session recommendation history for anti-repetition frequency damping (Section 15)
        const recentRecos = Array.from(recentRecommendedTrackIdsRef.current).slice(-40).join(",");
        if (recentRecos) params.set("recentQueueTrackIds", recentRecos);

        console.log(
          `[Autoplay] Querying intelligent recommendations for seed: "${seedMeta.title}" (${seedMeta.cleanId || seedMeta.id}) | Mode: ${mode} | Artist: ${seedMeta.primary_artist} | Lang: ${seedMeta.language || "N/A"}`
        );
        const res = await fetch(`/api/audio/recommendations?${params.toString()}`);

        if (reqId !== queueRequestIdRef.current) {
          console.log("[Autoplay] Stale request discarded; superseded by newer song click.");
          return;
        }

        if (!res.ok) {
          throw new Error(`Recommendations endpoint returned status ${res.status}`);
        }

        const data = await res.json();
        rawTracks = data.tracks || [];
      }

      if (reqId !== queueRequestIdRef.current) return;

      // Filter out seedTrack, currently playing track, and current queue duplicates
      const playedIds = sessionPlayedTrackIdsRef.current;
      const playedKeys = sessionPlayedKeysRef.current;
      const currentQueueIds = new Set((queueRef.current || []).map((t) => String(t.id)));
      const curId = String(currentTrackRef.current?.id || "");
      const seedId = String(seedMeta.id);
      const cleanSeedId = String(seedMeta.cleanId || "");

      let candidateTracks = rawTracks
        .map(normalizeTrack)
        .filter((t) => {
          if (!t || !t.id) return false;
          const tid = String(t.id);
          if (tid === seedId || tid === cleanSeedId || tid === curId) return false;
          if (mode !== "initial" && currentQueueIds.has(tid)) return false;
          return true;
        });

      // Filter session played tracks if enough fresh tracks exist
      const freshTracks = candidateTracks.filter((t) => {
        const tid = String(t.id);
        if (playedIds.has(tid)) return false;
        const cleanT = (t.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        const cleanA = (t.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        if (cleanT && cleanA && playedKeys.has(`${cleanT}:::${cleanA}`)) return false;
        return true;
      });

      // Ensure exactly 20 ranked tracks for initial queue, or 10 tracks for append
      const countToTake = mode === "initial" ? 20 : 10;
      let tracksToUse = [...freshTracks];
      if (tracksToUse.length < countToTake && candidateTracks.length > tracksToUse.length) {
        const usedIds = new Set(tracksToUse.map((t) => String(t.id)));
        for (const cand of candidateTracks) {
          if (!usedIds.has(String(cand.id))) {
            tracksToUse.push(cand);
            usedIds.add(String(cand.id));
            if (tracksToUse.length >= countToTake) break;
          }
        }
      }

      let topRankedTracks = tracksToUse.slice(0, countToTake);

      if (topRankedTracks.length > 0) {
        if (mode === "initial") {
          console.log(
            `[Autoplay] Initializing intelligent queue with ${topRankedTracks.length} tracks for "${seedMeta.title}":`,
            topRankedTracks.map((t) => `[Tier ${t.tier || 1}: ${t.tierReason || "Recommended"}] ${t.title}`).join(", ")
          );
          // Set automatic queue with high-affinity ranked tracks in strict order
          setAutoQueue(topRankedTracks);
          setCurrentTracklist([...topRankedTracks]);
          prevSongQueueRef.current = topRankedTracks;

          // Track recommended tracks for anti-repetition across subsequent clicks
          topRankedTracks.forEach((t) => {
            if (t.id) recentRecommendedTrackIdsRef.current.add(String(t.id));
          });
          if (recentRecommendedTrackIdsRef.current.size > 60) {
            const arr = Array.from(recentRecommendedTrackIdsRef.current).slice(-40);
            recentRecommendedTrackIdsRef.current = new Set(arr);
          }
        } else if (mode === "append") {
          console.log(
            `[Autoplay] Silently appending ${topRankedTracks.length} ranked candidate tracks to active queue:`,
            topRankedTracks.map((t) => `[Tier ${t.tier}: ${t.tierReason}] ${t.title}`).join(", ")
          );
          setAutoQueue((prev) => {
            const existingIds = new Set(prev.map((t) => String(t.id)));
            const fresh = topRankedTracks.filter((t) => !existingIds.has(String(t.id)));
            return [...prev, ...fresh];
          });
          setCurrentTracklist((prev) => [...prev, ...topRankedTracks]);
        } else if (mode === "transition") {
          const nextTrack = topRankedTracks[0];
          const upcomingQueue = topRankedTracks.slice(1);
          console.log(
            `[Autoplay] Seamlessly transitioning to: "${nextTrack.title}" [Tier ${nextTrack.tier}: ${nextTrack.tierReason}]. Queueing ${upcomingQueue.length} tracks.`
          );
          setAutoQueue(upcomingQueue);
          setCurrentTracklist((prev) => [...prev, nextTrack, ...upcomingQueue]);
          await playTrack(nextTrack, null, { fromQueue: true });
        }
      } else {
        console.warn("[Autoplay] No suitable recommendations found.");
        if (mode === "transition") {
          isTransitioningTrackRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          if (typeof window !== "undefined" && "mediaSession" in navigator) {
            try { navigator.mediaSession.playbackState = "none"; } catch { }
          }
        }
      }
    } catch (err) {
      if (reqId !== queueRequestIdRef.current) return;
      console.error("[Autoplay] Error during autoplay queue injection:", err);
      if (mode === "transition") {
        const fallbackList = NOCTURNE_TRACKS.filter((t) => String(t.id) !== String(seedTrack.id));
        if (fallbackList.length > 0) {
          const fallback = fallbackList[Math.floor(Math.random() * fallbackList.length)];
          playTrack(fallback);
        } else {
          isTransitioningTrackRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          if (typeof window !== "undefined" && "mediaSession" in navigator) {
            try { navigator.mediaSession.playbackState = "none"; } catch { }
          }
        }
      }
    } finally {
      if (reqId === queueRequestIdRef.current) {
        isFetchingAutoplayRef.current = false;
        setIsAutoplayLoading(false);
      }
    }
  };

  // Keep triggerAutoplayTransition as alias for backwards compatibility
  const triggerAutoplayTransition = async (seedTrack) => {
    return fetchAndInjectAutoplayQueue(seedTrack, { mode: "transition" });
  };

  const handleEnded = () => {
    // Prevent duplicate triggers if already transitioning
    if (isTransitioningTrackRef.current) return;
    isTransitioningTrackRef.current = true;

    // 1. Single track repeat mode: Replay current track
    if (repeatModeRef.current === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          isTransitioningTrackRef.current = false;
          updateMediaSessionPositionState();
        }).catch((err) => {
          console.warn("[MediaSession] Loop play error:", err);
          isTransitioningTrackRef.current = false;
        });
        setIsPlaying(true);
      } else {
        isTransitioningTrackRef.current = false;
      }
      return;
    }

    // 2. Continuous playback: Keep Android notification / lock-screen player active
    setIsBuffering(true);
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch { }
    }

    // 3. Automatically advance to next eligible song according to queue & recommendation logic
    handleNextTrack();
  };

  // Recent searches management
  const addRecentSearch = (label, icon = "search") => {
    if (!label) return;
    const cleanLabel = (typeof label === "string" ? label : label?.label || "").trim();
    if (!cleanLabel) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => {
        const itemLabel = typeof item === "string" ? item : item.label;
        return itemLabel.toLowerCase() !== cleanLabel.toLowerCase();
      });

      const newChip = {
        id: "s-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        label: cleanLabel,
        icon: icon || (typeof label === "object" && label.icon ? label.icon : "search")
      };

      const updated = [newChip, ...filtered].slice(0, 10);
      try {
        localStorage.setItem("nocturne_recent_searches", JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });
  };

  const removeRecentSearch = (id) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => (s.id || s) !== id && s.label !== id);
      try {
        localStorage.setItem("nocturne_recent_searches", JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem("nocturne_recent_searches");
    } catch (e) { }
  };

  // Play a specific track: fetches raw direct audio streaming URL from open-source music search
  const playTrack = async (track, tracklist = null, options = {}) => {
    if (!track) return;

    const isLocalTrack = Boolean(
      track.isLocal ||
      String(track.id).startsWith("local-") ||
      track.source === "local-upload" ||
      track.source === "local-device"
    );

    if (!user && !offlineTrackIds.has(String(track.id)) && !isLocalTrack) {
      openAuthModal("login");
      return;
    }

    // If clicking current track while paused, simply resume playback
    if (currentTrack?.id === track.id && !isPlaying && audioRef.current && audioRef.current.src) {
      try {
        await audioRef.current.play();
        return;
      } catch (err) {
        console.warn("Audio play resume error:", err);
      }
    }

    // Monotonic request ID: prevents race conditions when rapidly switching songs
    const requestId = ++playRequestIdRef.current;

    // Record previous song to history for backwards navigation (unless navigating backwards)
    if (!options?.fromHistory && currentTrackRef.current && String(currentTrackRef.current.id) !== String(track.id)) {
      setPlaybackHistory((prev) => [...prev.slice(-30), currentTrackRef.current]);
    }

    const norm = normalizeTrack(track);
    const resolvedTrack = norm || track;

    setCurrentTrack(resolvedTrack);
    currentTrackRef.current = resolvedTrack;
    updateMediaSessionMetadata(resolvedTrack);
    setCurrentTime(0);
    setDuration(resolvedTrack.duration || 210);
    setIsBuffering(true);
    setIsPlaying(true);
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch { }
    }

    // If playing a new song from search or standalone (not consuming from existing queue),
    // preserve current active queue into prevSongQueueRef so the queue algorithm can pick a random matching track
    if (!options?.fromQueue && !options?.fromHistory) {
      const existingQueue = autoQueueRef.current || [];
      if (existingQueue.length > 0) {
        prevSongQueueRef.current = [...existingQueue];
      } else if (currentTracklistRef.current && currentTracklistRef.current.length > 0) {
        prevSongQueueRef.current = [...currentTracklistRef.current];
      }
    }

    const isExplicitSequentialPlaylist = Boolean(
      options?.context === "playlist" ||
      options?.isSequentialPlaylist ||
      (options?.context === "album" && options?.isAlbumPlay)
    );

    if (tracklist && tracklist.length > 0 && isExplicitSequentialPlaylist) {
      originalPlaylistTracksRef.current = tracklist;
      setCurrentTracklist(tracklist);
      const trackIdStr = String(track.id);
      const idx = tracklist.findIndex((t) => String(t.id) === trackIdStr);

      if (isShuffleRef.current) {
        const remaining = tracklist.filter((t) => String(t.id) !== trackIdStr).sort(() => Math.random() - 0.5);
        setAutoQueue(remaining);
      } else if (idx !== -1) {
        // Normal playlist queue: all results after selected song become upcoming queue in exact order
        const remaining = tracklist.slice(idx + 1);
        setAutoQueue(remaining);
      } else {
        const remaining = tracklist.filter((t) => String(t.id) !== trackIdStr);
        setAutoQueue(remaining);
      }
    } else if (options?.fromQueue) {
      if (options?.refreshQueueForTrack) {
        // User clicked a song directly inside the queue drawer: regenerate queue for this new song!
        setAutoQueue([]);
        fetchAndInjectAutoplayQueue(track, { mode: "initial" });
      } else if (isAutoplayEnabledRef.current && autoQueueRef.current.length <= 5) {
        fetchAndInjectAutoplayQueue(track, { mode: "append" });
      }
    } else {
      // Individual track played (Search, Home page, SongCard, RecommendationCard, etc.):
      if (tracklist && Array.isArray(tracklist) && tracklist.length > 1) {
        const seedLang = (track.language || track.more_info?.language || "").toLowerCase().trim();
        const initialSeed = tracklist
          .filter((t) => {
            if (!t || String(t.id) === String(track.id)) return false;
            const tLang = (t.language || t.more_info?.language || "").toLowerCase().trim();
            if (seedLang && tLang && tLang !== seedLang) return false;
            return true;
          })
          .slice(0, 20);
        if (initialSeed.length > 0) {
          setAutoQueue(initialSeed);
        } else {
          setAutoQueue([]);
        }
      } else {
        setAutoQueue([]);
      }
      fetchAndInjectAutoplayQueue(track, { mode: "initial" });
    }

    // Reset retry counters on new track play
    retryCountRef.current = 0;
    isRecoveringRef.current = false;
    prefetchedRecommendationsRef.current = null;
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }

    // Add to recently played tracks with full metadata (local tracks are strictly isolated to their Self Mix)
    if (norm && !isLocalTrack) {
      // Record into current session history for filtering in ListenFree tiered recommendations
      if (norm.id) {
        sessionPlayedTrackIdsRef.current.add(String(norm.id));
      }
      const cleanT = (norm.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      const cleanA = (norm.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      if (cleanT && cleanA) {
        sessionPlayedKeysRef.current.add(`${cleanT}:::${cleanA}`);
      }

      setRecentlyPlayedTracks((prev) => {
        const filtered = prev.filter((t) => {
          const tid = String(t.id || "");
          const nid = String(norm.id || "");
          const sameId = tid && nid && tid === nid;
          const sameTitleArtist =
            t.title?.toLowerCase().trim() === norm.title?.toLowerCase().trim() &&
            t.artist?.toLowerCase().trim() === norm.artist?.toLowerCase().trim();
          return !sameId && !sameTitleArtist;
        });
        const updated = [norm, ...filtered].slice(0, 25);
        try {
          localStorage.setItem("nocturne_recent_tracks", JSON.stringify(updated));
        } catch (e) { }
        return updated;
      });

      setRecentlyPlayed((prev) => {
        const filtered = prev.filter((id) => (typeof id === "object" ? id.id : id) !== norm.id);
        return [norm.id, ...filtered].slice(0, 25);
      });

      // Cloud persistence for recently played (only when network is online)
      const currentUserId = getAccountUserId(user);
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (user && currentUserId === DEFAULT_USER_ID && isOnline) {
        recordRecentlyPlayedToCloud(norm, currentUserId).catch((err) => {
          console.error("[MusicContext] Failed to record recently played track to Supabase:", err);
        });
      }
    }

    try {
      // Hit IndexedDB for local offline audio, local uploads, or remote streams
      let rawAudioUrl = track.audioUrl;

      // 0. Check Queue Background Pre-download Cache for 0ms Instant Playback!
      const prefetchHit = prefetchCacheRef.current?.get(String(track.id));
      if (prefetchHit) {
        if (prefetchHit.blobUrl) {
          rawAudioUrl = prefetchHit.blobUrl;
        } else if (prefetchHit.audioUrl) {
          rawAudioUrl = prefetchHit.audioUrl;
        }
      }

      // 1. Check local offline storage (IndexedDB)
      try {
        const offlineUrl = await getOfflineAudioUrl(track.id);
        if (offlineUrl) {
          rawAudioUrl = offlineUrl;
        }
      } catch (offlineErr) {
        console.warn("[OfflineStorage] Offline track check error:", offlineErr);
      }

      // 2. Check local user uploads (Self Mix & Local Music Player) if not found in offline storage
      if (!rawAudioUrl && isLocalTrack) {
        try {
          const localUrl = await getLocalAudioUrl(track.id);
          if (localUrl) {
            rawAudioUrl = localUrl;
          } else {
            const localDeviceUrl = await getLocalDeviceTrackUrl(track.id);
            if (localDeviceUrl) {
              rawAudioUrl = localDeviceUrl;
            }
          }
        } catch (localErr) {
          console.warn("[LocalAudio] Error retrieving local audio from IndexedDB:", localErr);
        }
      }

      if (requestId !== playRequestIdRef.current) return;

      // 3. Graceful offline detection: if no local/offline audio and browser is disconnected
      const isOnlineNow = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (!rawAudioUrl && !isOnlineNow) {
        if (requestId === playRequestIdRef.current) {
          setIsBuffering(false);
          isTransitioningTrackRef.current = false;
        }
        showOfflineNotice("This track is not downloaded for offline listening. Connect to the internet or play your offline songs.");
        return;
      }

      // 4. Remote stream resolution if online
      if (!rawAudioUrl) {
        const streamData = await getDirectAudioStreamUrl(track.title, track.artist, track.id);
        rawAudioUrl = streamData.audioUrl;
      }

      if (requestId !== playRequestIdRef.current) return;

      if (!rawAudioUrl) {
        console.warn("[MusicContext] No playable audio URL found for track:", resolvedTrack.title);
        if (requestId === playRequestIdRef.current) {
          setIsBuffering(false);
          isTransitioningTrackRef.current = false;
          if (queueRef.current?.length > 0 || isAutoplayEnabledRef.current) {
            handleNextTrack();
          } else {
            setIsPlaying(false);
            if (typeof window !== "undefined" && "mediaSession" in navigator) {
              try { navigator.mediaSession.playbackState = "none"; } catch { }
            }
          }
        }
        return;
      }

      if (rawAudioUrl && norm && !isLocalTrack) {
        setRecentlyPlayedTracks((prev) =>
          prev.map((t) => (String(t.id) === String(norm.id) ? { ...t, audioUrl: rawAudioUrl } : t))
        );
      }

      if (audioRef.current && rawAudioUrl) {
        audioRef.current.src = rawAudioUrl;
        audioRef.current.preload = "auto";
        audioRef.current.load();
        try {
          await audioRef.current.play();
          if (requestId === playRequestIdRef.current) {
            setIsPlaying(true);
            setIsBuffering(false);
            isTransitioningTrackRef.current = false;
            updateMediaSessionMetadata(resolvedTrack);
            updateMediaSessionPositionState();
          }
        } catch (playErr) {
          console.warn("HTML5 audio play was prevented by browser policy or error:", playErr);
          if (requestId === playRequestIdRef.current) {
            setIsBuffering(false);
            isTransitioningTrackRef.current = false;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load and play audio stream:", err);
      if (requestId === playRequestIdRef.current) {
        setIsBuffering(false);
        isTransitioningTrackRef.current = false;
      }
    }
  };

  // Toggle Play/Pause bound to audioRef.current.play() and audioRef.current.pause()
  const togglePlay = () => {
    if (!user) {
      openAuthModal("login");
      return;
    }

    if (!currentTrack) {
      if (NOCTURNE_TRACKS.length > 0) {
        playTrack(NOCTURNE_TRACKS[0]);
      }
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((err) => {
          console.warn("Audio play error:", err);
        });
      }
    } else {
      playTrack(currentTrack);
    }
  };

  // Next track: Strict Manual Queue Priority over Automatic Priority Queue
  const handleNextTrack = () => {
    const mQ = manualQueueRef.current || [];
    const aQ = autoQueueRef.current || [];

    // 1. Consume from Manual Queue first (Strict Priority Rule)
    if (mQ.length > 0) {
      const next = mQ[0];
      const remainingManual = mQ.slice(1);
      manualQueueRef.current = remainingManual;
      setManualQueue(remainingManual);
      playTrack(next, null, { fromQueue: true, wasManual: true });
      return;
    }

    // 2. Consume from Automatic Priority Queue only after Manual Queue is empty
    if (aQ.length > 0) {
      const next = aQ[0];
      const remainingAuto = aQ.slice(1);
      autoQueueRef.current = remainingAuto;
      setAutoQueue(remainingAuto);
      if (isAutoplayEnabledRef.current && remainingAuto.length <= 5) {
        fetchAndInjectAutoplayQueue(next, { mode: "append" });
      }
      playTrack(next, null, { fromQueue: true, wasManual: false });
      return;
    }

    const cur = currentTrackRef.current;
    const tracklist = currentTracklistRef.current || [];
    if (!cur) {
      if (tracklist.length > 0) {
        playTrack(tracklist[0]);
      } else {
        isTransitioningTrackRef.current = false;
        setIsPlaying(false);
        setIsBuffering(false);
        if (typeof window !== "undefined" && "mediaSession" in navigator) {
          try { navigator.mediaSession.playbackState = "none"; } catch { }
        }
      }
      return;
    }

    const currentIndex = tracklist.findIndex((t) => String(t.id) === String(cur?.id));
    if (currentIndex !== -1) {
      let nextIndex = currentIndex + 1;
      if (nextIndex >= tracklist.length) {
        if (repeatModeRef.current === "all") {
          nextIndex = 0;
          playTrack(tracklist[nextIndex]);
        } else if (isAutoplayEnabledRef.current && cur) {
          triggerAutoplayTransition(cur);
        } else {
          isTransitioningTrackRef.current = false;
          setIsPlaying(false);
          setIsBuffering(false);
          if (typeof window !== "undefined" && "mediaSession" in navigator) {
            try { navigator.mediaSession.playbackState = "none"; } catch { }
          }
          if (audioRef.current) {
            try {
              audioRef.current.pause();
            } catch { }
          }
        }
        return;
      }
      playTrack(tracklist[nextIndex]);
    } else if (isAutoplayEnabledRef.current && cur) {
      triggerAutoplayTransition(cur);
    } else {
      isTransitioningTrackRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "none"; } catch { }
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch { }
      }
    }
  };

  // Play upcoming item directly from queue
  const playFromQueue = (track, index) => {
    if (!track) return;
    const tid = String(track.id);
    const mQ = manualQueueRef.current || [];
    const aQ = autoQueueRef.current || [];

    const mIdx = mQ.findIndex((t) => String(t.id) === tid);
    if (mIdx !== -1) {
      // User clicked item inside Manual Queue: consume up to and including this item
      setManualQueue((prev) => prev.slice(mIdx + 1));
      playTrack(track, null, { fromQueue: true, wasManual: true });
      return;
    }

    const aIdx = aQ.findIndex((t) => String(t.id) === tid);
    if (aIdx !== -1) {
      // User clicked into Automatic Queue: play selected track, and immediately regenerate upcoming queue matching this clicked song!
      playTrack(track, null, { fromQueue: true, wasManual: false, refreshQueueForTrack: true });
      return;
    }

    playTrack(track, null, { fromQueue: true, refreshQueueForTrack: true });
  };

  // Clear upcoming queue without stopping current playback
  const clearQueue = () => {
    setManualQueue([]);
    setAutoQueue([]);
  };

  // Clear all recently played history (both locally and in cloud)
  const clearRecentlyPlayed = () => {
    setRecentlyPlayedTracks([]);
    setRecentlyPlayed([]);
    persistAccountData({ recentlyPlayedTracks: [], recentlyPlayed: [] });
    try {
      localStorage.removeItem("ceepeefy_recently_played_tracks");
      localStorage.removeItem("ceepeefy_recently_played");
    } catch { }
    if (user?.id) {
      clearRecentlyPlayedInCloud(user.id).catch((err) => {
        console.warn("[MusicContext] Failed to clear cloud recents:", err);
      });
    }
  };

  // Remove specific track from queue
  const removeFromQueue = (trackId, e) => {
    e?.stopPropagation?.();
    const tid = String(trackId);
    setManualQueue((prev) => prev.filter((t) => String(t.id) !== tid));
    setAutoQueue((prev) => prev.filter((t) => String(t.id) !== tid));
  };

  // Backward-compatible setQueue that preserves segregation
  const setQueue = (action) => {
    if (typeof action === "function") {
      const currentCombined = [...manualQueueRef.current, ...autoQueueRef.current];
      const result = action(currentCombined);
      if (Array.isArray(result)) {
        setManualQueue(result.filter((t) => t.isManual));
        setAutoQueue(result.filter((t) => !t.isManual));
      }
    } else if (Array.isArray(action)) {
      setManualQueue(action.filter((t) => t.isManual));
      setAutoQueue(action.filter((t) => !t.isManual));
    }
  };

  // Add track to queue: Append to the end of the existing manual queue
  // Manual queue order: Song X -> Song Y -> Song Z ...
  // Always precedes the automatic priority queue
  const addToQueue = (track) => {
    if (!track) return;
    const norm = normalizeTrack(track);
    if (!norm) return;
    const manualTrack = { ...norm, isManual: true };
    setManualQueue((prev) => [...prev, manualTrack]);
    if (showOfflineNotice) {
      showOfflineNotice(`Added "${manualTrack.title}" to queue`);
    }
  };

  // Play track immediately next in queue: Insert at head of manual queue
  const playNext = (track) => {
    if (!track) return;
    const norm = normalizeTrack(track);
    if (!norm) return;
    const manualTrack = { ...norm, isManual: true };
    setManualQueue((prev) => [manualTrack, ...prev]);
    if (showOfflineNotice) {
      showOfflineNotice(`Playing "${manualTrack.title}" next`);
    }
  };

  // Playlist Shuffle: keeps currently playing track, shuffles upcoming without duplicates
  const toggleShuffle = (explicitTracks = null) => {
    setIsShuffle((prev) => {
      const next = !prev;
      const orig = explicitTracks || originalPlaylistTracksRef.current || currentTracklistRef.current || [];
      const cur = currentTrackRef.current;
      if (orig && orig.length > 0) {
        if (next) {
          // Shuffle remaining tracks without altering current track
          const remaining = orig.filter((t) => String(t.id) !== String(cur?.id));
          const shuffled = [...remaining].sort(() => Math.random() - 0.5);
          setQueue(shuffled);
        } else {
          // Restore normal playlist-order playback
          const curIndex = orig.findIndex((t) => String(t.id) === String(cur?.id));
          const normalRemaining = curIndex !== -1 ? orig.slice(curIndex + 1) : orig.filter((t) => String(t.id) !== String(cur?.id));
          setQueue(normalRemaining);
        }
      }
      return next;
    });
  };

  // Pin & Unpin playlist with persistence and full metadata
  const togglePinPlaylist = (playlistId, playlistData = null) => {
    if (!playlistId) return;
    const pid = String(playlistId);
    setPinnedPlaylistIds((prev) => {
      const isAlreadyPinned = prev.includes(pid);
      const next = isAlreadyPinned ? prev.filter((id) => id !== pid) : [...prev, pid];
      try {
        localStorage.setItem("ceepeefy_pinned_playlists", JSON.stringify(next));
      } catch (e) {
        console.warn("Could not save pinned playlists:", e);
      }
      return next;
    });

    setAddedPlaylists((prev) => {
      const isAlreadyAdded = prev.some((p) => String(p.id) === pid);
      let next;
      if (isAlreadyAdded) {
        next = prev.filter((p) => String(p.id) !== pid);
      } else {
        const itemToSave = playlistData
          ? {
            id: pid,
            title: playlistData.title || "Playlist",
            description: playlistData.description || playlistData.subtitle || "Added to library",
            curator: playlistData.curator || playlistData.artist || "Curated",
            coverUrl:
              playlistData.coverUrl ||
              playlistData.image ||
              playlistData.thumbnail ||
              "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
            tracks: playlistData.tracks || [],
            trackCount: playlistData.tracks?.length || playlistData.trackCount || playlistData.songCount || 0,
            type: playlistData.type || (playlistData.isMovie || playlistData.isAlbum ? "album" : "playlist"),
            addedAt: Date.now(),
          }
          : {
            id: pid,
            title: "Added Playlist",
            curator: "Curated",
            coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
            tracks: [],
            trackCount: 0,
            type: "playlist",
            addedAt: Date.now(),
          };
        next = [itemToSave, ...prev];
      }
      try {
        localStorage.setItem("ceepeefy_added_playlists", JSON.stringify(next));
      } catch (e) {
        console.warn("Could not save added playlists:", e);
      }
      return next;
    });
  };

  const removeAddedPlaylist = (playlistId) => {
    if (!playlistId) return;
    const pid = String(playlistId);
    setPinnedPlaylistIds((prev) => {
      const next = prev.filter((id) => id !== pid);
      try {
        localStorage.setItem("ceepeefy_pinned_playlists", JSON.stringify(next));
      } catch (e) { }
      return next;
    });
    setAddedPlaylists((prev) => {
      const next = prev.filter((p) => String(p.id) !== pid);
      try {
        localStorage.setItem("ceepeefy_added_playlists", JSON.stringify(next));
      } catch (e) { }
      return next;
    });
  };

  const isPlaylistPinned = (playlistId) => {
    if (!playlistId) return false;
    const pid = String(playlistId);
    return pinnedPlaylistIds.includes(pid) || addedPlaylists.some((p) => String(p.id) === pid);
  };

  // Seek bound to audio element's currentTime
  const seekTo = (seconds) => {
    const clamped = Math.max(0, Math.min(seconds, duration || 300));
    setCurrentTime(clamped);
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = clamped;
      } catch (err) {
        console.warn("Audio seekTo error:", err);
      }
    }
    updateMediaSessionPositionState(clamped);
  };

  // Previous track with history and tracklist support
  const handlePrevTrack = () => {
    // If track has been playing for more than 3 seconds, restart current track (Standard Spotify behavior)
    const currentAudioTime = audioRef.current?.currentTime ?? currentTime ?? 0;
    if (currentAudioTime > 3 && audioRef.current) {
      seekTo(0);
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => { });
      }
      return;
    }

    const hist = playbackHistoryRef.current || [];
    if (hist.length > 0) {
      const prevTrack = hist[hist.length - 1];
      const newHist = hist.slice(0, -1);
      playbackHistoryRef.current = newHist;
      setPlaybackHistory(newHist);
      if (currentTrackRef.current) {
        setQueue((q) => [currentTrackRef.current, ...q]);
      }
      playTrack(prevTrack, null, { fromHistory: true });
      return;
    }

    const cur = currentTrackRef.current;
    const tracklist = currentTracklistRef.current || [];
    if (cur && tracklist.length > 0) {
      const currentIndex = tracklist.findIndex((t) => String(t.id) === String(cur.id));
      if (currentIndex > 0) {
        const prevTrack = tracklist[currentIndex - 1];
        if (currentTrackRef.current) {
          setQueue((q) => [currentTrackRef.current, ...q]);
        }
        playTrack(prevTrack, tracklist, { fromHistory: true });
        return;
      }
    }

    seekTo(0);
  };

  // Stable refs for action handlers so Media Session handlers are registered once and NEVER torn down on state changes
  const handleNextTrackRef = useRef(handleNextTrack);
  const handlePrevTrackRef = useRef(handlePrevTrack);
  const togglePlayRef = useRef(togglePlay);
  const seekToRef = useRef(seekTo);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => { handleNextTrackRef.current = handleNextTrack; });
  useEffect(() => { handlePrevTrackRef.current = handlePrevTrack; });
  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => { seekToRef.current = seekTo; });
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Web Media Session API: Professional OS Notifications, Lock Screen Controls & Background Controls
  useEffect(() => {
    updateMediaSessionMetadata(currentTrack);

    // Keep document title strictly "Ceepeefy" as required
    try {
      document.title = "Ceepeefy";
    } catch { }
  }, [currentTrack]);

  // Sync Media Session Playback State
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    try {
      if (!currentTrack) {
        navigator.mediaSession.playbackState = "none";
      } else {
        navigator.mediaSession.playbackState = (isPlaying || isBuffering) ? "playing" : "paused";
      }
    } catch { }
  }, [isPlaying, isBuffering, currentTrack]);

  // Sync Media Session Playback Position on duration or track changes
  useEffect(() => {
    updateMediaSessionPositionState();
  }, [duration, currentTrack, updateMediaSessionPositionState]);

  // Register OS Media Controls Action Handlers ONCE on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const actionHandlers = [
      ["play", () => {
        if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => { });
        } else if (togglePlayRef.current) {
          togglePlayRef.current();
        }
      }],
      ["pause", () => {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        } else if (togglePlayRef.current) {
          togglePlayRef.current();
        }
      }],
      ["nexttrack", () => {
        if (handleNextTrackRef.current) {
          handleNextTrackRef.current();
        }
      }],
      ["previoustrack", () => {
        if (handlePrevTrackRef.current) {
          handlePrevTrackRef.current();
        }
      }],
      ["seekbackward", (details) => {
        const offset = details?.seekOffset || 10;
        const cur = audioRef.current?.currentTime ?? currentTimeRef.current ?? 0;
        if (seekToRef.current) {
          seekToRef.current(Math.max(0, cur - offset));
        }
      }],
      ["seekforward", (details) => {
        const offset = details?.seekOffset || 10;
        const cur = audioRef.current?.currentTime ?? currentTimeRef.current ?? 0;
        const dur = audioRef.current?.duration ?? durationRef.current ?? 300;
        if (seekToRef.current) {
          seekToRef.current(Math.min(dur, cur + offset));
        }
      }],
      ["seekto", (details) => {
        if (details?.seekTime !== undefined && seekToRef.current) {
          seekToRef.current(details.seekTime);
        }
      }],
      ["stop", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setIsBuffering(false);
        isTransitioningTrackRef.current = false;
        if (typeof window !== "undefined" && "mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "none";
          } catch { }
        }
      }],
    ];

    actionHandlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        console.debug(`[MediaSession] Action "${action}" not supported:`, err);
      }
    });

    return () => {
      actionHandlers.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch { }
      });
    };
  }, []);

  // Toggle Like (Accepts track object or trackId)
  const toggleLike = (trackOrId, optionalTrackObj) => {
    const currentUserId = getAccountUserId(user);
    if (!user || currentUserId !== DEFAULT_USER_ID) {
      openAuthModal("login");
      return;
    }
    let targetId = null;
    let trackObj = null;

    if (typeof trackOrId === "object" && trackOrId !== null) {
      targetId = trackOrId.id;
      trackObj = trackOrId;
    } else {
      targetId = trackOrId || currentTrack?.id;
      trackObj = optionalTrackObj || (currentTrack?.id === targetId ? currentTrack : null);
    }

    if (!targetId) return;

    if (!trackObj) {
      trackObj =
        NOCTURNE_TRACKS.find((t) => t.id === targetId) ||
        currentTracklistRef.current.find((t) => t.id === targetId) ||
        queueRef.current.find((t) => t.id === targetId) ||
        likedSongsMap[targetId];
    }

    const isCurrentlyLiked = likedSongIds.includes(targetId);

    setLikedSongIds((prev) => {
      if (prev.includes(targetId)) {
        return prev.filter((id) => id !== targetId);
      } else {
        return [targetId, ...prev];
      }
    });

    let normalizedTrack = null;
    if (trackObj) {
      normalizedTrack = {
        ...trackObj,
        coverUrl: trackObj.coverUrl || trackObj.image || trackObj.thumbnail,
      };
      setLikedSongsMap((prev) => ({
        ...prev,
        [targetId]: normalizedTrack,
      }));
    }

    // Cloud persistence
    if (!isCurrentlyLiked) {
      const trackToSave = normalizedTrack || trackObj || { id: targetId, title: "Liked Song" };
      saveLikedSongToCloud(trackToSave, currentUserId).catch((err) => {
        console.error("[MusicContext] Failed to save liked song to Supabase:", err);
      });
    } else {
      removeLikedSongFromCloud(targetId, currentUserId).catch((err) => {
        console.error("[MusicContext] Failed to remove liked song from Supabase:", err);
      });
    }
  };

  const isLiked = (trackId) => {
    const targetId = trackId || currentTrack?.id;
    return likedSongIds.includes(targetId);
  };

  // Full liked tracks array for Liked Songs page & player
  const likedTracks = useMemo(() => {
    return likedSongIds
      .map((id) => likedSongsMap[id] || NOCTURNE_TRACKS.find((t) => t.id === id))
      .filter(Boolean);
  }, [likedSongIds, likedSongsMap]);

  // Volume control
  const changeVolume = (val) => {
    const clamped = Math.max(0, Math.min(val, 1));
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <MusicContext.Provider
      value={{
        // State
        currentTrack,
        currentSong: currentTrack,
        isPlaying,
        isBuffering,
        isPlayerReady,
        currentTime,
        duration,
        volume,
        isMuted,
        isShuffle,
        repeatMode,
        isQueueOpen,
        isLyricsOpen,
        lyricsMode,
        playerMode,
        setPlayerMode,
        minimizeLyricsToCard,
        syncedLyrics,
        isLoadingLyrics,
        lyricsError,
        isDeviceModalOpen,
        currentDevice,
        isSettingsModalOpen,
        setIsSettingsModalOpen,
        isAuthModalOpen,
        setIsAuthModalOpen,
        authModalTab,
        setAuthModalTab,
        openAuthModal,
        user,
        login,
        signUp,
        logout,
        settings,
        updateSetting,
        updateSettings,
        resetAppearance,
        queue,
        manualQueue,
        autoQueue,
        setManualQueue,
        setAutoQueue,
        currentTracklist,
        playbackHistory,
        hasNextTrack,
        hasPrevTrack,
        likedSongIds,
        likedTracks,
        likedSongsMap,
        recentlyPlayed,
        recentlyPlayedTracks,
        setRecentlyPlayedTracks,
        activeFilter,
        searchQuery,
        recentSearches,
        customPlaylists,
        selfMixes,
        setSelfMixes,
        isAutoplayEnabled,
        isAutoplayLoading,

        // Setters & Actions
        playTrack,
        playSong: playTrack,
        togglePlay,
        toggleAutoplay,
        setIsAutoplayEnabled,
        fetchAndInjectAutoplayQueue,
        triggerAutoplayTransition,
        handleNextTrack,
        handlePrevTrack,
        seekTo,
        toggleLike,
        isLiked,
        changeVolume,
        toggleMute,
        setIsShuffle,
        toggleShuffle,
        setRepeatMode,
        setIsQueueOpen,
        setIsLyricsOpen,
        setLyricsMode,
        setSyncedLyrics,
        audioRef,
        setIsDeviceModalOpen,
        setCurrentDevice,
        setQueue,
        addToQueue,
        playNext,
        playFromQueue,
        removeFromQueue,
        clearQueue,
        clearRecentlyPlayed,
        pinnedPlaylistIds,
        addedPlaylists,
        togglePinPlaylist,
        removeAddedPlaylist,
        isPlaylistPinned,
        setActiveFilter,
        setSearchQuery,
        addRecentSearch,
        removeRecentSearch,
        clearAllRecentSearches,
        formatTime,
        createPlaylist,
        importSpotifyPlaylist,
        syncingPlaylistIds,
        fetchSpotifySyncPlan,
        commitSpotifySync,
        deleteCustomPlaylist,
        deletePlaylist,
        updatePlaylistCover,
        renamePlaylist,
        bumpPlaylistToTop,
        createSelfMix,
        deleteSelfMix,
        addLocalTracksToSelfMix,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        syncAccountDataWithCloud,
        fetchPlaylistTracksFromCloud,

        // Offline storage & playback helpers
        offlineTrackIds,
        offlineTracks,
        offlinePlaylists,
        isNetworkOnline,
        offlineNotice,
        setOfflineNotice,
        showOfflineNotice,
        isOffline,
        refreshOfflineState,
        downloadTrack,
        removeOfflineTrack,
        downloadPlaylist,
        removePlaylistOffline,
        getPlaylistOfflineStatus,
        getOfflineStorageStats,
        getOfflinePlaylists,
      }}
    >
      {children}

      {/* Floating Offline Notification Toast */}
      {offlineNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-[#181818] text-white border border-primary/40 px-4 py-2.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="material-symbols-outlined text-primary text-[18px]">
            offline_pin
          </span>
          <span>{offlineNotice}</span>
          <button
            onClick={() => setOfflineNotice(null)}
            className="text-outline hover:text-white p-0.5 rounded-full transition-colors ml-1"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Standard HTML5 <audio> Element with Aggressive Preloading & Stall Recovery */}
      <audio
        ref={audioRef}
        style={{ display: "none" }}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onPlay={handlePlay}
        onPause={handlePause}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onEnded={handleEnded}
        onStalled={handleStalled}
        onError={handleAudioError}
      />
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error("useMusic must be used within a MusicProvider");
  }
  return context;
};
