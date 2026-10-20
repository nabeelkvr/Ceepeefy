"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";

// Available languages for the language selector
const LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Español" },
  { code: "fr-FR", name: "Français" },
  { code: "de-DE", name: "Deutsch" },
  { code: "it-IT", name: "Italiano" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "ja-JP", name: "日本語" },
  { code: "ko-KR", name: "한국어" },
  { code: "hi-IN", name: "हिन्दी" },
  { code: "ar-SA", name: "العربية" },
];

export default function Footer() {
  const [modalContent, setModalContent] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("English (US)");
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        langDropdownRef.current &&
        !langDropdownRef.current.contains(event.target)
      ) {
        setIsLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openInfoModal = (title, content) => {
    setModalContent({ title, content });
  };

  const closeModal = () => {
    setModalContent(null);
  };

  return (
    <>
      <footer className="w-full mt-16 sm:mt-24 border-t border-white/[0.08] bg-[#0c1017]/85 backdrop-blur-2xl pb-32 sm:pb-36 select-none font-sans text-left">
        <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 2xl:px-20 py-10 sm:py-14">
          
          {/* Top Grid: Brand + 4 Link Columns + Right Socials/Badges */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
              
              {/* Brand Column (Matching Image 2 Logo & Text) */}
              <div className="lg:col-span-3 flex flex-col items-start pr-0 lg:pr-4">
                <Link
                  href="/"
                  className="group flex items-center gap-3.5 transition-transform duration-200 active:scale-95"
                >
                  {/* Equalizer Waveform Shield Icon (Vector geometry from Image 2) */}
                  <div className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 relative">
                    <svg
                      viewBox="0 0 512 512"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-full h-full filter drop-shadow-[0_0_12px_rgba(56,189,248,0.45)] group-hover:scale-105 transition-transform"
                    >
                      <defs>
                        <linearGradient
                          id="footer-ceepeefy-logo-grad"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <stop offset="0%" stopColor="#38BDF8" />
                          <stop offset="25%" stopColor="#3B82F6" />
                          <stop offset="60%" stopColor="#8B5CF6" />
                          <stop offset="85%" stopColor="#D946EF" />
                          <stop offset="100%" stopColor="#F43F5E" />
                        </linearGradient>
                      </defs>
                      <rect
                        x="115"
                        y="160"
                        width="28"
                        height="194"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="165"
                        y="114"
                        width="28"
                        height="284"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="216"
                        y="73"
                        width="28"
                        height="366"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="267"
                        y="27"
                        width="28"
                        height="457"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="317"
                        y="73"
                        width="28"
                        height="149"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="317"
                        y="290"
                        width="28"
                        height="149"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="368"
                        y="114"
                        width="28"
                        height="80"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                      <rect
                        x="368"
                        y="317"
                        width="28"
                        height="81"
                        rx="14"
                        fill="url(#footer-ceepeefy-logo-grad)"
                      />
                    </svg>
                  </div>

                  {/* Gradient Wordmark matching Image 2 */}
                  <span className="font-extrabold text-2xl sm:text-[28px] tracking-tight bg-gradient-to-r from-[#38bdf8] via-[#60a5fa] via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">
                    Ceepeefy
                  </span>
                </Link>

                {/* Tagline from Image 1 */}
                <p className="text-zinc-400/90 text-xs sm:text-[13px] font-normal tracking-wide mt-3.5">
                  Your world, in sound.
                </p>
              </div>

              {/* Central 4 Link Columns from Image 1 */}
              <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-6">
                
                {/* Column 1: COMPANY */}
                <div className="flex flex-col items-start">
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-3 sm:mb-4">
                    Company
                  </h4>
                  <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "About Ceepeefy",
                            "Ceepeefy is built for audiophiles and music lovers worldwide, delivering studio sound quality, smart discovery algorithms, and lightning-fast streaming without ads or bloated interfaces."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        About
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Careers at Ceepeefy",
                            "Join our engineering, audio research, and creative teams. We are passionate about spatial acoustics, machine learning recommendations, and building the future of sound.\n\nSend your portfolio to careers@ceepeefy.com."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Careers
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Press & Media",
                            "Access official press releases, product announcements, brand guidelines, and high-resolution media kits.\n\nFor inquiries: press@ceepeefy.com."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Press
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Our Impact",
                            "Ceepeefy is committed to sustainable cloud architecture, supporting independent artists, and democratizing high-fidelity audio access across every continent."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Impact
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 2: COMMUNITIES */}
                <div className="flex flex-col items-start">
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-3 sm:mb-4">
                    Communities
                  </h4>
                  <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "For Artists",
                            "Claim your verified artist profile, access real-time listener analytics, upload lossless audio masters, and connect directly with your global audience."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        For Artists
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Developers & API",
                            "Build apps with the Ceepeefy Web Audio API. Access real-time audio analysis, playlist sync, equalizer DSP modules, and open metadata endpoints."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Developers
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Advertising",
                            "Reach millions of music lovers with audio experiences tailored to user taste, high-impact sponsored playlists, and branded discovery sessions."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Advertising
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Investors",
                            "Explore our financial reports, quarterly growth summaries, corporate governance, and vision for next-generation spatial streaming technologies."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Investors
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Vendors & Partners",
                            "Information for studio audio hardware partners, CDN providers, licensing agencies, and enterprise supply chain collaborators."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Vendors
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Ceepeefy for Podcasters",
                            "Host, distribute, and monetize high-definition audio and video podcasts with automated transcripts, chapter markers, and audience engagement tools."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Ceepeefy for Podcasters
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 3: USEFUL LINKS */}
                <div className="flex flex-col items-start">
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-3 sm:mb-4">
                    Useful Links
                  </h4>
                  <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Support & Help Center",
                            "Need help? Search our comprehensive knowledge base, troubleshoot playback issues, report playback bugs, or contact customer care 24/7."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Support
                      </button>
                    </li>
                    <li>
                      <Link
                        href="/"
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Web Player
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Free Mobile App",
                            "Download Ceepeefy on iOS and Android to take your lossless tracks, offline playlists, and customized smart equalizer anywhere."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Free Mobile App
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 4: PLANS */}
                <div className="flex flex-col items-start">
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-3 sm:mb-4">
                    Plans
                  </h4>
                  <ul className="flex flex-col space-y-2.5 text-xs sm:text-[13px] text-zinc-400">
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Free Plan",
                            "Enjoy on-demand music playback, smart shuffle, synchronized lyrics, curated discovery, and unlimited streaming on desktop and mobile."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Free
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Premium Plan",
                            "Unlock 24-Bit FLAC studio audio, unlimited offline downloads, zero interruptions, spatial 3D audio, and private listening rooms."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Premium
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Family Plan",
                            "Up to 6 individual Premium accounts for family members living under one roof, with customized Family Mix and parental control filters."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Family
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Student Plan",
                            "Special 50% discount for eligible university students. Includes full Premium features, verified through SheerID."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Student
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() =>
                          openInfoModal(
                            "Duo Plan",
                            "2 individual Premium accounts for couples or housemates sharing an address, featuring an automatically updated Duo Mix playlist."
                          )
                        }
                        className="hover:text-white transition-colors duration-150 text-left"
                      >
                        Duo
                      </button>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Right Side Column: Socials & Badges + Download our app */}
              <div className="lg:col-span-3 flex flex-col items-start lg:items-end justify-between">
                <div className="flex flex-col items-start lg:items-end w-full">
                  {/* Socials Heading */}
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-3">
                    Socials & Badges
                  </h4>

                  {/* 5 Circular Glowing Social Media Buttons */}
                  <div className="flex items-center gap-2.5 mb-6">
                    {/* Instagram */}
                    <a
                      href="https://instagram.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                      className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] via-[#cc2366] to-[#bc1888] flex items-center justify-center text-white shadow-[0_0_10px_rgba(225,48,108,0.35)] hover:scale-110 hover:shadow-[0_0_15px_rgba(225,48,108,0.6)] transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </a>

                    {/* X (Twitter) */}
                    <a
                      href="https://x.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="X"
                      className="w-8 h-8 rounded-full bg-black border border-white/20 flex items-center justify-center text-white shadow-[0_0_10px_rgba(255,255,255,0.15)] hover:scale-110 hover:border-white/40 transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>

                    {/* Facebook */}
                    <a
                      href="https://facebook.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook"
                      className="w-8 h-8 rounded-full bg-[#1877F2] flex items-center justify-center text-white shadow-[0_0_10px_rgba(24,119,242,0.35)] hover:scale-110 hover:shadow-[0_0_15px_rgba(24,119,242,0.6)] transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.667 5H18V0h-3.808C10.597 0 9 1.583 9 4.615V8z" />
                      </svg>
                    </a>

                    {/* YouTube */}
                    <a
                      href="https://youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="YouTube"
                      className="w-8 h-8 rounded-full bg-[#FF0000] flex items-center justify-center text-white shadow-[0_0_10px_rgba(255,0,0,0.35)] hover:scale-110 hover:shadow-[0_0_15px_rgba(255,0,0,0.6)] transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                    </a>

                    {/* TikTok */}
                    <a
                      href="https://tiktok.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="TikTok"
                      className="w-8 h-8 rounded-full bg-[#010101] border border-cyan-400/40 flex items-center justify-center text-white shadow-[0_0_10px_rgba(0,242,234,0.3)] hover:scale-110 hover:shadow-[0_0_15px_rgba(255,0,79,0.5)] transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                      </svg>
                    </a>
                  </div>

                  {/* Download our app Section */}
                  <h4 className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider mb-2.5">
                    Download our app
                  </h4>

                  {/* App Store and Google Play Badges Side-by-Side */}
                  <div className="flex flex-row items-center gap-2.5">
                    {/* App Store Badge */}
                    <button
                      onClick={() =>
                        openInfoModal(
                          "Ceepeefy for iOS",
                          "Ceepeefy iOS app is currently available for preview via Apple TestFlight. Experience lossless audio playback, CarPlay integration, Dynamic Island controls, and offline listening."
                        )
                      }
                      className="flex items-center gap-2 px-3 py-1.5 bg-black/90 hover:bg-black text-white rounded-lg border border-white/20 hover:border-white/40 transition-all shadow-md group cursor-pointer active:scale-95"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 170 170">
                        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-6.42-9.8-11.43-20.93-15.03-33.39-3.6-12.46-5.4-23.73-5.4-33.82 0-14.04 3.49-25.75 10.47-35.13 6.98-9.38 15.77-14.19 26.37-14.43 4.89 0 10.37 1.25 16.44 3.75 6.07 2.5 10.13 3.81 12.18 3.93 1.63 0 5.86-1.39 12.69-4.16 6.83-2.77 12.6-3.99 17.3-3.66 12.96.87 23.24 5.58 30.84 14.13-11.33 6.86-16.89 16.44-16.68 28.74.22 9.69 3.86 17.85 10.92 24.48 7.06 6.63 15.45 10.35 25.17 11.16-2.18 6.53-4.95 13.06-8.33 19.59zM119.22 31.86c0-7.3 2.66-14.11 7.99-20.44 5.33-6.33 11.87-10.3 19.62-11.92.87 7.08-.98 13.88-5.55 20.39-4.57 6.51-11.38 10.61-20.44 12.31-.32-.11-.9-.23-1.62-.34z" />
                      </svg>
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-[8px] uppercase tracking-wider text-zinc-400">
                          Download on the
                        </span>
                        <span className="text-[11px] font-bold text-white tracking-tight">
                          App Store
                        </span>
                      </div>
                    </button>

                    {/* Google Play Badge */}
                    <button
                      onClick={() =>
                        openInfoModal(
                          "Ceepeefy for Android",
                          "Download the official Ceepeefy Android APK / Play Store release. Enjoy custom equalizer presets, home-screen playback widgets, and Android Auto support."
                        )
                      }
                      className="flex items-center gap-2 px-3 py-1.5 bg-black/90 hover:bg-black text-white rounded-lg border border-white/20 hover:border-white/40 transition-all shadow-md group cursor-pointer active:scale-95"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 512 512">
                        <path
                          fill="#00d3ff"
                          d="M325.3 234.3L10.4 485.4c4.1 4.5 10.1 7.4 16.8 7.4 3.7 0 7.2-.9 10.3-2.6l287.8-165.9-40.3-40-80.1-50z"
                        />
                        <path
                          fill="#00f076"
                          d="M480.9 228.6L363.6 161l-38.3 73.3 38.3 40 117.3-67.6c5.8-3.3 9.4-9.3 9.4-16.1 0-6.7-3.6-12.7-9.4-16z"
                        />
                        <path
                          fill="#ff3a44"
                          d="M325.3 274.3L40.2 438.7c-3.1 1.7-6.6 2.6-10.3 2.6-6.7 0-12.7-2.9-16.8-7.4l312.2-159.6z"
                        />
                        <path
                          fill="#ffc400"
                          d="M13.1 33.7c4.1-4.5 10.1-7.4 16.8-7.4 3.7 0 7.2.9 10.3 2.6l285.1 164.4-325.3 40.7 13.1-199.3z"
                        />
                      </svg>
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-[8px] uppercase tracking-wider text-zinc-400">
                          GET IT ON
                        </span>
                        <span className="text-[11px] font-bold text-white tracking-tight">
                          Google Play
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider Line */}
            <div className="w-full border-t border-white/[0.08] mt-10 pt-6 sm:pt-8">
              
              {/* Bottom Sub-footer Row: Copyright + Legal Links + Language Selector */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-400/90">
                
                {/* Copyright */}
                <span className="text-zinc-500 font-normal">
                  © 2026 Ceepeefy Inc.
                </span>

                {/* Center Legal Links from Image 1 */}
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] sm:text-xs">
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Legal Information",
                        "Ceepeefy operates as an independent music client. Content access is strictly for non-commercial personal entertainment in compliance with public APIs."
                      )
                    }
                    className="hover:text-white transition-colors"
                  >
                    Legal
                  </button>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Privacy Policy",
                        "We believe in true privacy. Ceepeefy does not sell personal listening history, serve targeted tracking cookies, or share your account credentials with data brokers."
                      )
                    }
                    className="hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </button>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Terms of Service",
                        "By streaming or caching audio on Ceepeefy, you agree to our standard terms of use, fair usage quotas, and respect for intellectual property rights."
                      )
                    }
                    className="hover:text-white transition-colors"
                  >
                    Terms of Service
                  </button>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Cookie Policy",
                        "Ceepeefy stores only essential playback state, volume levels, equalizer adjustments, and offline track index data directly in your browser."
                      )
                    }
                    className="hover:text-white transition-colors"
                  >
                    Cookies
                  </button>
                  <button
                    onClick={() =>
                      openInfoModal(
                        "Ad Choices",
                        "Ceepeefy provides an ad-free streaming environment. We do not participate in third-party behavioral advertising networks or tracking cookies."
                      )
                    }
                    className="hover:text-white transition-colors"
                  >
                    Ad Choices
                  </button>
                </div>

                {/* Right: Interactive Language Selector Pill from Image 1 */}
                <div className="relative" ref={langDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsLangOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-zinc-300 hover:text-white transition-all text-xs font-medium cursor-pointer shadow-sm active:scale-95"
                    aria-label="Select Language"
                  >
                    {/* Globe Icon */}
                    <svg
                      className="w-3.5 h-3.5 fill-none stroke-current"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>

                    <span>{selectedLanguage}</span>

                    {/* Chevron Down */}
                    <svg
                      className={`w-3.5 h-3.5 fill-none stroke-current transition-transform duration-200 ${
                        isLangOpen ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Language Selector Dropdown Menu */}
                  {isLangOpen && (
                    <div className="absolute right-0 bottom-full mb-2 w-44 bg-[#181818] border border-[#2e2e2e] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-white/[0.06] mb-1">
                        Select Region
                      </div>
                      <div className="max-h-48 overflow-y-auto no-scrollbar">
                        {LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => {
                              setSelectedLanguage(lang.name);
                              setIsLangOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                              selectedLanguage === lang.name
                                ? "text-primary font-semibold bg-primary/10"
                                : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                            }`}
                          >
                            <span>{lang.name}</span>
                            {selectedLanguage === lang.name && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
      </footer>

      {/* Info / Policy Modal */}
      {modalContent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200 select-text"
          onClick={closeModal}
        >
          <div
            className="bg-[#141720] border border-[#2a2f3e] rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-base font-bold text-white tracking-tight">
                {modalContent.title}
              </h3>
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
