"use client";

import React from "react";

export default function AppSkeleton() {
  return (
    <div className="h-[100dvh] h-screen w-screen flex flex-col bg-[#0b1326] text-on-surface font-sans overflow-hidden select-none">
      {/* Upper area: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar Skeleton */}
        <aside className="hidden md:flex w-[72px] flex-col bg-[#080d1a] border-r border-white/5 py-4 px-3 gap-5 select-none shrink-0 items-center justify-between">
          <div className="flex flex-col gap-5 items-center w-full">
            {/* Logo Skeleton */}
            <div className="w-10 h-10 rounded-2xl bg-white/10 skeleton-shimmer shrink-0" />

            {/* Main Navigation Skeleton */}
            <div className="flex flex-col gap-2 w-full items-center">
              {[1, 2, 3, 4, 5, 6, 7].map((idx) => (
                <div
                  key={idx}
                  className="w-11 h-11 rounded-2xl bg-white/[0.04] flex items-center justify-center shrink-0"
                >
                  <div className="w-5 h-5 rounded-md bg-white/10 skeleton-shimmer" />
                </div>
              ))}
            </div>

            {/* Library Section Skeleton */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5 w-full items-center">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="w-9 h-9 rounded-xl bg-white/10 skeleton-shimmer shrink-0" />
              ))}
            </div>
          </div>

          {/* Bottom install icon skeleton */}
          <div className="w-10 h-10 rounded-2xl bg-white/[0.04] skeleton-shimmer shrink-0" />
        </aside>

        {/* Main Content Skeleton Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-[#0b1326] via-[#0d172e] to-[#070e1e] md:my-2 md:mr-2 md:rounded-2xl overflow-hidden shadow-2xl relative border border-white/5">
          {/* Header Skeleton */}
          <header className="h-14 sm:h-16 px-4 md:px-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0b1326]/60 backdrop-blur-md">
            {/* Mobile Header Left: Brand Logo & Menu */}
            <div className="flex items-center gap-3 md:hidden">
              <div className="w-8 h-8 rounded-lg bg-white/10 skeleton-shimmer" />
              <div className="h-4 w-24 rounded-md bg-white/10 skeleton-shimmer" />
            </div>

            {/* Desktop Header Left: Search Bar Placeholder */}
            <div className="hidden md:flex items-center gap-3 w-80 h-10 rounded-full bg-white/[0.04] border border-white/5 px-4">
              <div className="w-4 h-4 rounded-full bg-white/10 skeleton-shimmer shrink-0" />
              <div className="h-3 w-40 rounded-full bg-white/10 skeleton-shimmer" />
            </div>

            {/* Header Right: Actions & Profile */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="w-8 h-8 rounded-full bg-white/10 skeleton-shimmer" />
              <div className="w-9 h-9 rounded-full bg-primary/20 skeleton-shimmer border border-primary/30" />
            </div>
          </header>

          {/* Main Scroll Content Skeleton */}
          <main className="flex-1 overflow-hidden px-3 sm:px-6 md:px-8 flex flex-col gap-6 md:gap-8 pt-3 md:pt-6">
            {/* Filter Chips Skeleton */}
            <div className="flex items-center gap-2 overflow-x-hidden pb-1">
              {[80, 64, 88, 76, 84].map((width, idx) => (
                <div
                  key={idx}
                  style={{ width: `${width}px` }}
                  className="h-7 sm:h-8 rounded-full bg-white/[0.06] skeleton-shimmer shrink-0"
                />
              ))}
            </div>

            {/* Section 1: Recently Played Skeleton */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-28 rounded-full bg-white/10 skeleton-shimmer" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400/30 skeleton-shimmer" />
                </div>
                <div className="h-3 w-16 rounded-full bg-white/5 skeleton-shimmer" />
              </div>

              {/* Cards Row */}
              <div className="flex flex-row overflow-x-hidden gap-3 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className="w-[145px] sm:w-auto shrink-0 flex flex-col gap-2 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5"
                  >
                    <div className="relative aspect-square w-full rounded-lg sm:rounded-xl bg-white/10 skeleton-shimmer" />
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="h-3.5 w-4/5 rounded-full bg-white/10 skeleton-shimmer" />
                      <div className="h-2.5 w-1/2 rounded-full bg-white/5 skeleton-shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Popular Artists (Exact 2 Rows on Mobile: 3 cols x 2 rows) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="h-2.5 w-24 rounded-full bg-primary/20 skeleton-shimmer" />
                  <div className="h-5 w-36 rounded-md bg-white/10 skeleton-shimmer" />
                </div>
                <div className="h-3 w-20 rounded-full bg-white/5 skeleton-shimmer" />
              </div>

              {/* Artist Avatars: 2 rows of 3 on mobile */}
              <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center text-center gap-1.5 sm:gap-2 p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5"
                  >
                    <div className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-white/10 skeleton-shimmer ring-2 ring-white/5" />
                    <div className="flex flex-col items-center gap-1 w-full pt-1">
                      <div className="h-3 w-16 rounded-full bg-white/10 skeleton-shimmer" />
                      <div className="h-2 w-12 rounded-full bg-white/5 skeleton-shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Bottom Player Bar Skeleton */}
      <div className="h-16 md:h-20 bg-[#070e1e]/90 border-t border-white/5 px-4 md:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/10 skeleton-shimmer shrink-0" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-28 rounded-full bg-white/10 skeleton-shimmer" />
            <div className="h-2.5 w-16 rounded-full bg-white/5 skeleton-shimmer" />
          </div>
        </div>

        {/* Center player controls skeleton */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-white/5 skeleton-shimmer" />
          <div className="w-10 h-10 rounded-full bg-primary/30 skeleton-shimmer" />
          <div className="w-7 h-7 rounded-full bg-white/5 skeleton-shimmer" />
        </div>

        {/* Right audio controls skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-white/10 skeleton-shimmer" />
          <div className="w-20 h-2 rounded-full bg-white/10 skeleton-shimmer hidden md:block" />
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar Skeleton */}
      <nav className="md:hidden h-14 border-t border-white/5 bg-[#0b1326]/95 backdrop-blur-xl flex items-center justify-around px-2 shrink-0">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 rounded-md bg-white/10 skeleton-shimmer" />
            <div className="h-2 w-9 rounded-full bg-white/5 skeleton-shimmer" />
          </div>
        ))}
      </nav>
    </div>
  );
}
