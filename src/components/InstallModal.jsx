"use client";

import React from "react";
import Image from "next/image";
import { usePWA } from "../context/PWAContext";

export default function InstallModal() {
  const { isInstallModalOpen, closeInstallModal, isIOS, isInstallable, promptInstall } = usePWA();

  if (!isInstallModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={closeInstallModal}
    >
      <div
        className="w-full max-w-md bg-[#131b2e] border border-white/10 rounded-2xl p-6 shadow-2xl relative text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={closeInstallModal}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        {/* App Icon & Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-primary/20 bg-[#0b1326] flex items-center justify-center flex-shrink-0">
            <Image
              src="/icon-192.png"
              alt="Ceepeefy Logo"
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Install Ceepeefy</h3>
            <p className="text-xs text-primary font-medium tracking-wide">STUDIO MODE PWA</p>
          </div>
        </div>

        {/* Benefits List */}
        <div className="space-y-2.5 mb-6 text-xs text-on-surface-variant bg-[#0b1326]/60 p-3.5 rounded-xl border border-white/5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-base">offline_pin</span>
            <span>Offline music playback & instant app loading</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-base">fullscreen</span>
            <span>Fullscreen standalone display without browser borders</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-base">speed</span>
            <span>Smooth native gestures, lower battery & data usage</span>
          </div>
        </div>

        {/* Instructions based on platform */}
        {isIOS ? (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">How to install on iOS:</h4>
            <ol className="text-sm text-on-surface-variant space-y-3 pl-1">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
                <span>
                  Tap the <strong className="text-white">Share</strong> button in Safari's toolbar:
                  <span className="inline-flex items-center justify-center mx-1 px-1.5 py-0.5 rounded bg-white/10 text-primary text-xs">
                    <span className="material-symbols-outlined text-sm align-middle">ios_share</span>
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
                <span>
                  Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong>:
                  <span className="inline-flex items-center justify-center mx-1 px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">
                    <span className="material-symbols-outlined text-sm align-middle">add_box</span>
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
                <span>
                  Tap <strong className="text-primary font-semibold">"Add"</strong> in the top-right corner to launch directly from your home screen.
                </span>
              </li>
            </ol>
            <button
              onClick={closeInstallModal}
              className="w-full mt-4 py-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-white font-medium text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {isInstallable ? (
              <button
                onClick={promptInstall}
                className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                Install Ceepeefy App
              </button>
            ) : (
              <div className="text-sm text-on-surface-variant space-y-2">
                <p>
                  To install Ceepeefy on your desktop or Android browser:
                </p>
                <p className="bg-[#0b1326] p-3 rounded-xl border border-white/5 text-xs text-white">
                  Click the <strong>Install</strong> icon in the address bar (Chrome / Edge), or select <strong>"Add to Home screen"</strong> from your browser menu.
                </p>
                <button
                  onClick={closeInstallModal}
                  className="w-full mt-2 py-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-white font-medium text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
