"use client";

import React from "react";

export default function PlaylistSkeleton() {
  return (
    <div className="w-full flex flex-col pb-16 select-none animate-fade-in">
      {/* Back button skeleton */}
      <div className="px-4 sm:px-6 md:px-8 pt-4 pb-2">
        <div className="w-20 h-7 rounded-full bg-white/[0.05] skeleton-shimmer" />
      </div>

      {/* Hero Banner Skeleton */}
      <div className="relative w-full p-4 sm:p-6 md:p-8 bg-gradient-to-b from-surface-container-high/60 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-5 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art Skeleton */}
          <div className="relative w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex-shrink-0 border border-white/10 bg-white/10 skeleton-shimmer mx-auto md:mx-0" />

          {/* Metadata info Skeleton */}
          <div className="flex flex-col gap-2.5 text-center md:text-left flex-1 min-w-0 w-full items-center md:items-start">
            {/* Badges */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="h-5 w-20 rounded-md bg-white/5 skeleton-shimmer" />
            </div>

            {/* Title */}
            <div className="h-8 sm:h-10 w-3/4 max-w-md rounded-xl bg-white/15 skeleton-shimmer" />

            {/* Description */}
            <div className="flex flex-col gap-1.5 w-full max-w-lg">
              <div className="h-3.5 w-full rounded-full bg-white/10 skeleton-shimmer" />
              <div className="h-3.5 w-2/3 rounded-full bg-white/5 skeleton-shimmer" />
            </div>

            {/* Curator & Track Count Line */}
            <div className="flex items-center gap-2.5 pt-1">
              <div className="w-5 h-5 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="h-3.5 w-24 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="h-3.5 w-16 rounded-full bg-white/5 skeleton-shimmer" />
              <div className="h-3.5 w-14 rounded-full bg-white/5 skeleton-shimmer" />
            </div>

            {/* Action Bar Dock Skeleton */}
            <div className="flex items-center gap-2.5 pt-3">
              <div className="w-12 h-12 rounded-full bg-primary/30 skeleton-shimmer" />
              <div className="w-10 h-10 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="w-10 h-10 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="w-10 h-10 rounded-full bg-white/10 skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>

      {/* Tracklist Table Skeleton */}
      <div className="px-4 sm:px-6 md:px-8 pt-6 flex flex-col gap-3">
        {/* Table Header */}
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_auto] items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/10">
          <div className="h-3 w-4 rounded bg-white/10 skeleton-shimmer mx-auto" />
          <div className="h-3 w-16 rounded bg-white/10 skeleton-shimmer" />
          <div className="h-3 w-14 rounded bg-white/10 skeleton-shimmer hidden md:block" />
          <div className="h-3 w-12 rounded bg-white/10 skeleton-shimmer hidden md:block ml-auto" />
          <div className="h-3 w-6 rounded bg-white/10 skeleton-shimmer ml-auto" />
        </div>

        {/* 8 Track Rows */}
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
            <div
              key={idx}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(180px,3fr)_minmax(120px,2fr)_5rem_auto] items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]"
            >
              {/* # Index */}
              <div className="h-3 w-4 rounded bg-white/10 skeleton-shimmer mx-auto" />

              {/* Title & Artist & Thumbnail */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-[3px] bg-white/10 skeleton-shimmer shrink-0" />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div
                    className="h-3.5 rounded-full bg-white/15 skeleton-shimmer"
                    style={{ width: `${Math.floor(45 + (idx * 17) % 40)}%` }}
                  />
                  <div
                    className="h-2.5 rounded-full bg-white/10 skeleton-shimmer"
                    style={{ width: `${Math.floor(25 + (idx * 13) % 30)}%` }}
                  />
                </div>
              </div>

              {/* Album */}
              <div className="hidden md:block">
                <div
                  className="h-3 rounded-full bg-white/10 skeleton-shimmer"
                  style={{ width: `${Math.floor(40 + (idx * 11) % 35)}%` }}
                />
              </div>

              {/* Duration */}
              <div className="hidden md:flex justify-end">
                <div className="h-3 w-10 rounded-full bg-white/10 skeleton-shimmer" />
              </div>

              {/* Action / Menu button */}
              <div className="flex justify-end">
                <div className="w-7 h-7 rounded-full bg-white/10 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
