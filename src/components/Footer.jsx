"use client";

import React, { useState } from "react";

export default function Footer() {
  const [modalContent, setModalContent] = useState(null);

  const openInfoModal = (title, content) => {
    setModalContent({ title, content });
  };

  const closeModal = () => {
    setModalContent(null);
  };

  return (
    <>
      {/* Professional Frameless Transparent Footer */}
      <footer className="w-full bg-transparent border-t border-white/[0.06] pt-12 sm:pt-16 pb-36 sm:pb-28 mt-16 sm:mt-24 select-none relative overflow-hidden font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Giant Clean Watermark / Header */}
          <div className="w-full mb-8 sm:mb-12 overflow-hidden">
            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[7.5rem] xl:text-[8.5rem] font-black tracking-tight text-white/[0.08] leading-none select-none pointer-events-none whitespace-nowrap">
              Ceepeefy.com
            </h1>
          </div>

          {/* 4-Column Footer Navigation Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 text-left">
            {/* Column 1: Brand Info */}
            <div className="flex flex-col items-start">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight mb-3 sm:mb-4">
                Ceepeefy
              </h3>
              <p className="text-xs sm:text-[13px] text-zinc-400/90 leading-relaxed max-w-xs">
                Fast, privacy-respecting music streaming with offline support, collaborative rooms, enhanced video previews and smart playlists.
              </p>
            </div>

            {/* Column 2: Platform */}
            <div className="flex flex-col items-start">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight mb-3 sm:mb-4">
                Platform
              </h3>
              <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "How It Works",
                        "Ceepeefy combines YouTube & Spotify metadata with ultra-high-definition studio sound engines, lossless caching, real-time lyrics synchronization, and collaborative listening sessions for an unparalleled audio journey."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    How It Works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Features",
                        "Key Features:\n• 24-Bit Studio Equalizer & Spatial 3D Audio\n• Seamless Offline Playback & Caching\n• AI-Powered Smart Playlists & Self-Mix Studio\n• Synchronized Word-by-Word Lyrics\n• Cross-device Session Sync"
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Frequently Asked Questions (FAQ)",
                        "Q: Is Ceepeefy free to use?\nA: Yes, Ceepeefy provides free high-fidelity music streaming.\n\nQ: Can I download songs for offline playback?\nA: Absolutely! Enable offline mode to save your favorite tracks directly to browser storage.\n\nQ: Does Ceepeefy track my personal data?\nA: No, Ceepeefy values your privacy and stores preferences locally."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    FAQ
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Blog & Updates",
                        "Stay tuned for audio engineering deep dives, feature announcements, artist spotlights, and upcoming updates to the Ceepeefy audio core."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Blog
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Company & Legal */}
            <div className="flex flex-col items-start">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight mb-3 sm:mb-4">
                Company & Legal
              </h3>
              <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "About Ceepeefy",
                        "Ceepeefy is built for audiophiles and casual listeners alike, delivering cinematic sound quality, intelligent discovery, and lightning-fast streaming without bloated interfaces."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Contact Us",
                        "Have feedback, feature requests, or technical questions? Reach out to the Ceepeefy team directly at support@ceepeefy.com or join our community hub."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Contact
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Privacy Policy",
                        "Your privacy is our priority. Ceepeefy does not sell your personal data or track your listening habits across external advertising networks. Cache and settings are stored locally on your device."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Terms of Service",
                        "By using Ceepeefy, you agree to access content for personal, non-commercial entertainment purposes. All streaming sources are provided in compliance with platform guidelines."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Cookie Policy",
                        "Ceepeefy only utilizes essential local storage and session tokens to preserve your playback preferences, equalizer settings, and offline cached audio."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Cookie Policy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "DMCA & Copyright Policy",
                        "Ceepeefy respects intellectual property rights. If you believe your copyrighted work is infringed, please send a notice to dmca@ceepeefy.com with relevant details."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    DMCA
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Disclaimer",
                        "Ceepeefy is an independent audio streaming client. All song titles, album artwork, and artist names are copyright and trademarks of their respective owners."
                      )
                    }
                    className="hover:text-white transition-colors text-left"
                  >
                    Disclaimer
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Stay Updated */}
            <div className="flex flex-col items-start">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight mb-3 sm:mb-4">
                Stay Updated
              </h3>
              <p className="text-xs sm:text-[13px] text-zinc-400/90 leading-relaxed mb-3.5 max-w-xs">
                Join our socials for updates, changelogs and roadmap polls.
              </p>
              <button
                onClick={() =>
                  openInfoModal(
                    "Social Hub",
                    "Connect with the Ceepeefy Community on:\n• Discord: discord.gg/ceepeefy\n• GitHub: github.com/nabeelkvr/Ceepeefy\n• Twitter / X: @ceepeefy\n• Reddit: r/ceepeefy"
                  )
                }
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white text-xs font-medium rounded-xl border border-white/10 hover:border-white/20 transition-all mb-4 shadow-sm active:scale-95 cursor-pointer"
              >
                Visit Social Hub
              </button>
              <span className="text-[11px] sm:text-xs text-zinc-500">
                © {new Date().getFullYear()} Ceepeefy. All rights reserved.
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Info / Policy Modal */}
      {modalContent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-[#121216] border border-white/15 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h2 className="text-base font-bold text-white tracking-tight">
                {modalContent.title}
              </h2>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line max-h-80 overflow-y-auto pr-1">
              {modalContent.content}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-1.5 bg-primary text-black font-semibold text-xs rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
