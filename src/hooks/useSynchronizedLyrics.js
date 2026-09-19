"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom hook to track real-time synchronized playback position in a lyrics array,
 * compute active line index, and auto-scroll the container to keep the active line centered.
 *
 * @param {Array<{ time: number, text: string }>} lyrics
 * @param {number} currentTime Current playback position in seconds
 * @param {Function} [seekTo] Optional function to seek playback
 */
export function useSynchronizedLyrics(lyrics = [], currentTime = 0, seekTo = null) {
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const isUserScrollingRef = useRef(false);
  const scrollResumeTimeoutRef = useRef(null);

  // 1. Calculate active line index by comparing currentTime against timestamps
  useEffect(() => {
    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      setActiveLineIndex(-1);
      return;
    }

    let foundIndex = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        foundIndex = i;
        break;
      }
    }

    // Default to first line if audio just started playing before first lyric mark
    if (foundIndex === -1 && currentTime > 0 && lyrics.length > 0) {
      foundIndex = 0;
    }

    setActiveLineIndex(foundIndex);
  }, [currentTime, lyrics]);

  // 2. Auto-scroll lyrics container to keep active line centered
  useEffect(() => {
    if (activeLineIndex < 0 || isUserScrollingRef.current) return;

    const container = containerRef.current;
    const activeEl = lineRefs.current[activeLineIndex];

    if (container && activeEl) {
      const containerHeight = container.clientHeight;
      const lineTop = activeEl.offsetTop - container.offsetTop;
      const targetScrollTop = lineTop - containerHeight / 2 + activeEl.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    }
  }, [activeLineIndex]);

  // 3. Detect user scrolling to avoid scroll-fighting, auto-resume after 2.5s
  const handleUserScroll = useCallback(() => {
    isUserScrollingRef.current = true;
    if (scrollResumeTimeoutRef.current) {
      clearTimeout(scrollResumeTimeoutRef.current);
    }
    scrollResumeTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2500);
  }, []);

  // 4. Click a line to seek playback
  const handleLineClick = useCallback(
    (time) => {
      if (typeof seekTo === "function") {
        seekTo(time);
        isUserScrollingRef.current = false;
      }
    },
    [seekTo]
  );

  return {
    activeLineIndex,
    containerRef,
    lineRefs,
    handleUserScroll,
    handleLineClick,
  };
}

export default useSynchronizedLyrics;
