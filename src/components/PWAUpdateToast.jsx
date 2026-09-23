"use client";

import React, { useState } from "react";
import { usePWA } from "../context/PWAContext";

export default function PWAUpdateToast() {
  const { hasUpdate, applyUpdate } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!hasUpdate || dismissed) return null;

  return (
    <aside
      aria-label="App update available"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] bg-surface-container-high/95 backdrop-blur-xl border border-primary/30 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-slide-up text-on-surface"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="material-symbols-outlined text-primary text-xl flex-shrink-0 animate-spin">
          sync
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">Update Available</p>
          <p className="text-[11px] text-on-surface-variant truncate">Refresh to load latest version</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={applyUpdate}
          className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs transition-colors shadow-sm"
        >
          Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Dismiss update notification"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    </aside>
  );
}
