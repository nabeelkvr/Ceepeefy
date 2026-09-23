"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
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
  deleteLocalAudioFiles
} from "../services/localAudioStorage";
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
  migrateLocalDataToSupabase,
} from "../services/cloudStorageService";
import { deleteSelfMixFromCloud } from "../services/supabaseClient";

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
  const rawCover =
    track.coverUrl ||
    track.thumbnail ||
    track.image ||
    track.imageUrl ||
    (Array.isArray(track.image) && track.image[track.image.length - 1]?.url) ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

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

      // 2. Query fresh cloud data from Supabase
      const [cloudPlaylists, cloudLiked, cloudRecents] = await Promise.all([
        fetchUserPlaylistsFromCloud(userId),
        fetchLikedSongsFromCloud(userId),
        fetchRecentlyPlayedFromCloud(userId),
      ]);

      // 3. Apply state updates if queries were successful
      if (cloudPlaylists !== null) {
        setCustomPlaylists(cloudPlaylists);
      }
      if (cloudLiked !== null) {
        setLikedSongIds(cloudLiked.likedSongIds || []);
        setLikedSongsMap(cloudLiked.likedSongsMap || {});
      }
      if (cloudRecents !== null) {
        const valid = cloudRecents
          .map(normalizeTrack)
          .filter((t) => t && !DEFAULT_MOCK_TRACK_IDS.has(String(t.id)));
        setRecentlyPlayedTracks(valid);
        setRecentlyPlayed(valid.map((t) => t.id));
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
        if (Array.isArray(accountData.selfMixes)) setSelfMixes(accountData.selfMixes);
      } else {

        const legacyLiked = JSON.parse(localStorage.getItem("nocturne_liked") || "[]");
        const legacyLikedMap = JSON.parse(localStorage.getItem("nocturne_liked_map") || "{}");
        const legacyPlaylists = JSON.parse(localStorage.getItem("nocturne_custom_playlists") || "[]");
        const legacyRecents = JSON.parse(localStorage.getItem("nocturne_recent_tracks") || "[]");

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
          selfMixes: [],
        };
        localStorage.setItem(accountStorageKey, JSON.stringify(initialAccountData));
        setLikedSongIds(initialAccountData.likedSongIds);
        setLikedSongsMap(initialAccountData.likedSongsMap);
        setCustomPlaylists(initialAccountData.customPlaylists);
        setRecentlyPlayedTracks(initialAccountData.recentlyPlayedTracks);
        setRecentlyPlayed(initialAccountData.recentlyPlayed);
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
    try {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("activeUser");
      localStorage.removeItem("ceepeefy_user");
    } catch (e) { }
  };

  // Audiophile App & Playback Settings
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

  // Queue & Tracklist
  const [queue, setQueue] = useState([]);
  const [currentTracklist, setCurrentTracklist] = useState(NOCTURNE_TRACKS);

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
      const nextMixes = overrides.selfMixes ?? selfMixes;

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
      // Also update legacy fallback keys
      localStorage.setItem("nocturne_liked", JSON.stringify(nextLikedIds));
      localStorage.setItem("nocturne_liked_map", JSON.stringify(nextLikedMap));
      localStorage.setItem("nocturne_custom_playlists", JSON.stringify(nextPlaylists));
      localStorage.setItem("nocturne_recent_tracks", JSON.stringify(nextRecents));
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
          if (Array.isArray(accountData.selfMixes)) setSelfMixes(accountData.selfMixes);
        } else {
          // Fallback to legacy keys
          const legacyLiked = JSON.parse(localStorage.getItem("nocturne_liked") || "[]");
          const legacyLikedMap = JSON.parse(localStorage.getItem("nocturne_liked_map") || "{}");
          const legacyPlaylists = JSON.parse(localStorage.getItem("nocturne_custom_playlists") || "[]");
          const legacyRecents = JSON.parse(localStorage.getItem("nocturne_recent_tracks") || "[]");

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
            selfMixes: [],
          };
          localStorage.setItem(accountStorageKey, JSON.stringify(initialAccountData));
          setLikedSongIds(initialAccountData.likedSongIds);
          setLikedSongsMap(initialAccountData.likedSongsMap);
          setCustomPlaylists(initialAccountData.customPlaylists);
          setRecentlyPlayedTracks(initialAccountData.recentlyPlayedTracks);
          setRecentlyPlayed(initialAccountData.recentlyPlayed);
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

  const deleteCustomPlaylist = (id) => {
    const currentUserId = getAccountUserId(user);
    setCustomPlaylists((prev) => prev.filter((p) => p.id !== id));

    // Delete from Supabase cloud
    deletePlaylistFromCloud(id, currentUserId).catch((err) => {
      console.error("[MusicContext] Failed to delete playlist from Supabase:", err);
    });
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

    setSelfMixes((prev) => [newMix, ...prev]);
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

    setSelfMixes((prev) => prev.filter((m) => String(m.id) !== String(id)));
    setCustomPlaylists((prev) => prev.filter((p) => String(p.id) !== String(id)));
  };

  const addLocalTracksToSelfMix = (mixId, newTracks = []) => {
    if (!mixId || !Array.isArray(newTracks) || newTracks.length === 0) return;
    const normalizedNew = newTracks.map(normalizeTrack).filter(Boolean);

    setSelfMixes((prev) =>
      prev.map((mix) => {
        if (mix.id !== mixId) return mix;
        const existing = mix.tracks || [];
        const existingIds = new Set(existing.map((t) => String(t.id)));
        const toAdd = normalizedNew.filter((t) => !existingIds.has(String(t.id)));
        const updated = [...existing, ...toAdd];
        return {
          ...mix,
          tracks: updated,
          songsCount: updated.length,
          duration: formatPlaylistDuration(updated),
          subtitle: `By You • ${updated.length} tracks`,
        };
      })
    );
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
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);

  // Sync ref values to avoid stale closures in audio callbacks
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { currentTracklistRef.current = currentTracklist; }, [currentTracklist]);
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
        queueRef.current.length <= 2 &&
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
  };

  const handleDurationChange = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0) {
      setDuration(audioRef.current.duration);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleWaiting = () => {
    setIsBuffering(true);
  };

  const handlePlaying = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    isRecoveringRef.current = false;
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
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

  // Error Event Listener: Recovers from Network drops (Error 1 or 2)
  const handleAudioError = (e) => {
    const audio = audioRef.current;
    const err = audio?.error;
    const code = err?.code; // 1 = MEDIA_ERR_ABORTED, 2 = MEDIA_ERR_NETWORK
    console.warn(`[AudioEngine] HTML5 audio error event triggered (code: ${code}):`, err?.message || e);

    if (code === 1 || code === 2 || !code) {
      console.warn(`[AudioEngine] Network/Connection drop detected (Error ${code || "drop"}). Triggering automatic timestamp recovery...`);
      recoverPlayback(`network_error_${code || "drop"}`);
    } else {
      setIsBuffering(false);
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
      seedTrack.source === "local-upload"
    );
    if (isLocalSong) {
      console.log("[Autoplay] Seed track is a local upload; queue finished.");
      return null;
    }

    return {
      id: String(seedTrack.id || ""),
      album_id: String(seedTrack.album_id || seedTrack.albumId || seedTrack.more_info?.album_id || ""),
      album: String(seedTrack.album || seedTrack.albumName || seedTrack.more_info?.album || ""),
      primary_artist: String(seedTrack.primary_artist || seedTrack.primaryArtist || seedTrack.artist || seedTrack.singers || ""),
      genre: String(seedTrack.genre || seedTrack.more_info?.genre || ""),
      mood: String(seedTrack.mood || seedTrack.more_info?.mood || ""),
      language: String(seedTrack.language || seedTrack.more_info?.language || ""),
      year: String(seedTrack.year || seedTrack.releaseDate?.slice(0, 4) || ""),
      title: String(seedTrack.title || seedTrack.song || ""),
      artist: String(seedTrack.artist || ""),
    };
  };

  /**
   * Spotify-Inspired 6-Tier Intelligent Queue Manager:
   * 1. Extracts seed metadata (id, album_id, album, primary_artist, genre, mood, language, year, title).
   * 2. Fetches candidate tracks ranked by the strict 6-tier recommendation engine.
   * 3. Mode "initial": User played a song from Search. Populates upcoming queue with highest-priority recommendations,
   *    preserving any manual queue items.
   * 4. Mode "append": Queue is running low (<= 2 tracks). Seamlessly fetches and appends next recommendations if Autoplay is ON.
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

    // If Autoplay is OFF, allow initial queue generation from Search, but skip append/transition
    if (mode !== "initial" && !isAutoplayEnabledRef.current) return;
    if (isFetchingAutoplayRef.current) return;

    const seedMeta = extractSeedMetadata(seedTrack);
    if (!seedMeta || !seedMeta.id) return;

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
        params.set("songId", seedMeta.id);
        params.set("id", seedMeta.id);
        if (seedMeta.album_id) params.set("album_id", seedMeta.album_id);
        if (seedMeta.album) params.set("album", seedMeta.album);
        if (seedMeta.primary_artist) params.set("primary_artist", seedMeta.primary_artist);
        if (seedMeta.genre) params.set("genre", seedMeta.genre);
        if (seedMeta.mood) params.set("mood", seedMeta.mood);
        if (seedMeta.language) params.set("language", seedMeta.language);
        if (seedMeta.year) params.set("year", seedMeta.year);
        if (seedMeta.title) params.set("title", seedMeta.title);
        if (seedMeta.artist) params.set("artist", seedMeta.artist);

        // Session history exclusion to avoid repetitive recommendations
        const excludeList = Array.from(sessionPlayedTrackIdsRef.current).join(",");
        if (excludeList) params.set("excludeIds", excludeList);

        console.log(
          `[Autoplay] Querying intelligent recommendations for seed: "${seedMeta.title}" (${seedMeta.id}) | Mode: ${mode} | Album: ${seedMeta.album_id || "N/A"} | Artist: ${seedMeta.primary_artist} | Lang: ${seedMeta.language || "N/A"}`
        );
        const res = await fetch(`/api/audio/recommendations?${params.toString()}`);

        if (!res.ok) {
          throw new Error(`Recommendations endpoint returned status ${res.status}`);
        }

        const data = await res.json();
        rawTracks = data.tracks || [];
      }

      // Filter out seedTrack, currently playing track, and current queue duplicates
      const playedIds = sessionPlayedTrackIdsRef.current;
      const playedKeys = sessionPlayedKeysRef.current;
      const currentQueueIds = new Set((queueRef.current || []).map((t) => String(t.id)));
      const curId = String(currentTrackRef.current?.id || "");
      const seedId = String(seedMeta.id);

      let candidateTracks = rawTracks
        .map(normalizeTrack)
        .filter((t) => {
          if (!t || !t.id) return false;
          const tid = String(t.id);
          if (tid === seedId || tid === curId) return false;
          if (mode !== "initial" && currentQueueIds.has(tid)) return false;
          return true;
        });

      // Strictly filter out any tracks the user has already listened to in the current session
      const freshTracks = candidateTracks.filter((t) => {
        const tid = String(t.id);
        if (playedIds.has(tid)) return false;
        const cleanT = (t.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        const cleanA = (t.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        if (cleanT && cleanA && playedKeys.has(`${cleanT}:::${cleanA}`)) return false;
        return true;
      });

      // Fallback if session history exhausted candidates: use candidateTracks so queue never halts
      const tracksToUse = freshTracks.length > 0 ? freshTracks : candidateTracks;

      // Select top 12-16 ranked tracks for initial queue, or 8 tracks for append
      const countToTake = mode === "initial" ? 15 : 8;
      const topRankedTracks = tracksToUse.slice(0, countToTake);

      if (topRankedTracks.length > 0) {
        if (mode === "initial") {
          console.log(
            `[Autoplay] Initializing intelligent queue with ${topRankedTracks.length} tracks for "${seedMeta.title}":`,
            topRankedTracks.map((t) => `[Tier ${t.tier}] ${t.title}`).join(", ")
          );
          setQueue((prev) => {
            const manual = prev.filter((t) => t.isManual);
            return [...manual, ...topRankedTracks];
          });
          setCurrentTracklist([...topRankedTracks]);
        } else if (mode === "append") {
          console.log(
            `[Autoplay] Silently appending ${topRankedTracks.length} ranked candidate tracks to the active queue:`,
            topRankedTracks.map((t) => `[Tier ${t.tier}] ${t.title}`).join(", ")
          );
          setQueue((prev) => [...prev, ...topRankedTracks]);
          setCurrentTracklist((prev) => [...prev, ...topRankedTracks]);
        } else if (mode === "transition") {
          const nextTrack = topRankedTracks[0];
          const upcomingQueue = topRankedTracks.slice(1);
          console.log(
            `[Autoplay] Seamlessly transitioning to: "${nextTrack.title}" [Tier ${nextTrack.tier}: ${nextTrack.tierReason}]. Queueing ${upcomingQueue.length} tracks.`
          );
          setCurrentTracklist((prev) => [...prev, nextTrack, ...upcomingQueue]);
          setQueue((prev) => [...prev, ...upcomingQueue]);
          await playTrack(nextTrack, null, { fromQueue: true });
        }
      } else {
        console.warn("[Autoplay] No suitable recommendations found.");
        if (mode === "transition") {
          setIsPlaying(false);
        }
      }
    } catch (err) {
      console.error("[Autoplay] Error during autoplay queue injection:", err);
      if (mode === "transition") {
        const fallbackList = NOCTURNE_TRACKS.filter((t) => String(t.id) !== String(seedTrack.id));
        if (fallbackList.length > 0) {
          const fallback = fallbackList[Math.floor(Math.random() * fallbackList.length)];
          playTrack(fallback);
        } else {
          setIsPlaying(false);
        }
      }
    } finally {
      isFetchingAutoplayRef.current = false;
      setIsAutoplayLoading(false);
    }
  };

  // Keep triggerAutoplayTransition as alias for backwards compatibility
  const triggerAutoplayTransition = async (seedTrack) => {
    return fetchAndInjectAutoplayQueue(seedTrack, { mode: "transition" });
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setIsBuffering(false);

    // 1. Single track repeat mode: Replay current track
    if (repeatModeRef.current === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });
        setIsPlaying(true);
      }
      return;
    }

    const cur = currentTrackRef.current;
    const activeQueue = queueRef.current || [];

    // 2. If there are still songs queued up in user's active queue, play next
    if (activeQueue.length > 0) {
      handleNextTrack();
      return;
    }

    // 3. Current track is the last song in user's active queue (activeQueue is empty)
    // If Repeat Mode is "all", restart the tracklist from the beginning
    if (repeatModeRef.current === "all") {
      const tracklist = currentTracklistRef.current || [];
      if (tracklist.length > 0) {
        const firstTrack = tracklist[0];
        const remaining = tracklist.slice(1);
        setQueue(remaining);
        playTrack(firstTrack);
      }
      return;
    }

    // 4. Autoplay Interceptor: If it's the last song and isAutoplayEnabled is true,
    // fetch related tracks and seamlessly transition with zero downtime!
    if (isAutoplayEnabledRef.current && cur) {
      triggerAutoplayTransition(cur);
      return;
    }

    // 5. If Autoplay is disabled and active queue finished, cleanly stop playback
    setIsPlaying(false);
    setIsBuffering(false);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch { }
    }
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

    if (!user && !offlineTrackIds.has(String(track.id))) {
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

    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 210);
    setIsBuffering(true);

    if (tracklist && tracklist.length > 0 && !options?.fromSearch) {
      originalPlaylistTracksRef.current = tracklist;
      setCurrentTracklist(tracklist);
      let remaining;
      if (isShuffleRef.current) {
        remaining = [...tracklist.filter((t) => String(t.id) !== String(track.id))].sort(() => Math.random() - 0.5);
      } else {
        const idx = tracklist.findIndex((t) => String(t.id) === String(track.id));
        remaining = idx !== -1 ? tracklist.slice(idx + 1) : tracklist.filter((t) => String(t.id) !== String(track.id));
      }
      setQueue(remaining);
    } else if (!options?.fromQueue) {
      // Standalone track or played from search:
      // Preserve manual tracks if any, and trigger immediate 6-tier intelligent queue generation!
      const manual = (queueRef.current || []).filter((t) => t.isManual);
      setQueue(manual);
      fetchAndInjectAutoplayQueue(track, { mode: "initial" });
    } else if (options?.fromQueue) {
      if (isAutoplayEnabledRef.current && queueRef.current.length <= 2) {
        fetchAndInjectAutoplayQueue(track, { mode: "append" });
      }
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
    const norm = normalizeTrack(track);
    const isLocalTrack = Boolean(
      track.isLocal ||
      String(track.id).startsWith("local-") ||
      track.source === "local-upload"
    );

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

      // 1. Check local offline storage (IndexedDB)
      try {
        const offlineUrl = await getOfflineAudioUrl(track.id);
        if (offlineUrl) {
          rawAudioUrl = offlineUrl;
        }
      } catch (offlineErr) {
        console.warn("[OfflineStorage] Offline track check error:", offlineErr);
      }

      // 2. Check local user uploads (Self Mix) if not found in offline storage
      if (!rawAudioUrl && isLocalTrack) {
        try {
          const localUrl = await getLocalAudioUrl(track.id);
          if (localUrl) {
            rawAudioUrl = localUrl;
          }
        } catch (localErr) {
          console.warn("[LocalAudio] Error retrieving local audio from IndexedDB:", localErr);
        }
      }

      // 3. Graceful offline detection: if no local/offline audio and browser is disconnected
      const isOnlineNow = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (!rawAudioUrl && !isOnlineNow) {
        setIsBuffering(false);
        showOfflineNotice("This track is not downloaded for offline listening. Connect to the internet or play your offline songs.");
        return;
      }

      // 4. Remote stream resolution if online
      if (!rawAudioUrl) {
        const streamData = await getDirectAudioStreamUrl(track.title, track.artist, track.id);
        rawAudioUrl = streamData.audioUrl;
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
        } catch (playErr) {
          console.warn("HTML5 audio play was prevented by browser policy or error:", playErr);
        }
      }
    } catch (err) {
      console.error("Failed to load and play audio stream:", err);
      setIsBuffering(false);
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

  // Next track
  const handleNextTrack = () => {
    const q = queueRef.current;
    if (q.length > 0) {
      const next = q[0];
      const remaining = q.slice(1);
      setQueue(remaining);
      playTrack(next, null, { fromQueue: true });
      return;
    }

    const cur = currentTrackRef.current;
    const tracklist = currentTracklistRef.current;
    if (!cur) {
      if (tracklist.length > 0) {
        playTrack(tracklist[0]);
      }
      return;
    }

    const currentIndex = tracklist.findIndex((t) => t.id === cur?.id);
    if (currentIndex !== -1) {
      let nextIndex = currentIndex + 1;
      if (nextIndex >= tracklist.length) {
        if (repeatModeRef.current === "all") {
          nextIndex = 0;
        } else if (isAutoplayEnabledRef.current && cur) {
          triggerAutoplayTransition(cur);
          return;
        } else {
          setIsPlaying(false);
          setIsBuffering(false);
          if (audioRef.current) {
            try {
              audioRef.current.pause();
            } catch { }
          }
          return;
        }
      }
      playTrack(tracklist[nextIndex]);
    } else if (isAutoplayEnabledRef.current && cur) {
      triggerAutoplayTransition(cur);
    }
  };

  // Play upcoming item directly from queue
  const playFromQueue = (track, index) => {
    const remaining = queueRef.current.slice(index + 1);
    setQueue(remaining);
    playTrack(track, null, { fromQueue: true });
  };

  // Clear upcoming queue without stopping current playback
  const clearQueue = () => {
    setQueue([]);
  };

  // Add track to queue: Append to the end of the upcoming queue
  const addToQueue = (track) => {
    if (!track) return;
    const norm = normalizeTrack(track);
    if (!norm) return;
    const manualTrack = { ...norm, isManual: true };
    setQueue((prev) => [...prev, manualTrack]);
  };

  // Play track immediately next in queue: Insert immediately after current song, before other upcoming songs
  const playNext = (track) => {
    if (!track) return;
    const norm = normalizeTrack(track);
    if (!norm) return;
    const manualTrack = { ...norm, isManual: true };
    setQueue((prev) => [manualTrack, ...prev]);
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
      } catch (e) {}
      return next;
    });
    setAddedPlaylists((prev) => {
      const next = prev.filter((p) => String(p.id) !== pid);
      try {
        localStorage.setItem("ceepeefy_added_playlists", JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const isPlaylistPinned = (playlistId) => {
    if (!playlistId) return false;
    const pid = String(playlistId);
    return pinnedPlaylistIds.includes(pid) || addedPlaylists.some((p) => String(p.id) === pid);
  };

  // Previous track
  const handlePrevTrack = () => {
    const cur = currentTrackRef.current;
    if (!cur) return;
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    const tracklist = currentTracklistRef.current;
    const currentIndex = tracklist.findIndex((t) => t.id === cur?.id);
    if (currentIndex > 0) {
      playTrack(tracklist[currentIndex - 1]);
    } else {
      seekTo(0);
    }
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
  };

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
        queue,
        currentTracklist,
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
        clearQueue,
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
        deleteCustomPlaylist,
        createSelfMix,
        deleteSelfMix,
        addLocalTracksToSelfMix,
        addTrackToPlaylist,
        removeTrackFromPlaylist,

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
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-[#0d172e]/95 text-white border border-primary/40 px-4 py-2.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
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
