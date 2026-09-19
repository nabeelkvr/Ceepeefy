"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";

export default function ProfileDropdown({ isOpen, onClose }) {
  const dropdownRef = useRef(null);
  const router = useRouter();
  const {
    user,
    logout,
    openAuthModal,
    setIsSettingsModalOpen,
    setIsDeviceModalOpen,
    currentDevice,
  } = useMusic();

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-12 right-0 w-80 sm:w-84 bg-[#11192b]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {!user ? (
        /* GUEST STATE: Highlight "New to Ceepeefy?" & "Sign Up" */
        <div className="p-4 flex flex-col gap-3">
          {/* New to Ceepeefy Hero Banner */}
          <div className="relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-primary/15 via-surface-container to-surface-container-high border border-primary/25 shadow-[0_0_20px_rgba(76,215,246,0.12)]">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-primary/20 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined text-primary text-[20px]">
                auto_awesome
              </span>
              <h4 className="text-sm font-bold text-white tracking-tight">
                New to Ceepeefy?
              </h4>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed mb-3.5">
              Join for free to save playlists, like tracks, and enjoy bit-perfect Hi-Res Studio sound.
            </p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAuthModal("signup");
                }}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-primary via-cyan-400 to-primary-container text-[#003640] font-bold text-xs tracking-wide shadow-[0_0_16px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">
                  person_add
                </span>
                Sign Up
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAuthModal("login");
                }}
                className="w-full py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface font-medium text-xs border border-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-outline">
                  login
                </span>
                Already have an account? Log In
              </button>
            </div>
          </div>

          {/* Quick Perks Pill List */}
          <div className="px-1 py-1 grid grid-cols-2 gap-2 text-[11px] text-outline">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[14px]">
                graphic_eq
              </span>
              <span>24-bit / 192kHz</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[14px]">
                lyrics
              </span>
              <span>Live Synced Lyrics</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-tertiary text-[14px]">
                queue_music
              </span>
              <span>Unlimited Playlists</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-cyan-300 text-[14px]">
                surround_sound
              </span>
              <span>Spatial Audio</span>
            </div>
          </div>

          <div className="h-[1px] bg-white/10 my-0.5" />

          {/* General Actions */}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                setIsSettingsModalOpen(true);
              }}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[18px]">
                  settings
                </span>
                <span>Audio & App Settings</span>
              </div>
              <span className="material-symbols-outlined text-outline/50 group-hover:text-outline text-[16px]">
                chevron_right
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                setIsDeviceModalOpen(true);
              }}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[18px]">
                  devices
                </span>
                <span>Connected Output Device</span>
              </div>
              <span className="text-[10px] text-primary truncate max-w-[100px]">
                {currentDevice.split(" ")[0]}
              </span>
            </button>
          </div>
        </div>
      ) : (
        /* AUTHENTICATED STATE */
        <div className="p-4 flex flex-col gap-3">
          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container/90 border border-white/5">
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary to-cyan-300 p-0.5 shadow-[0_0_12px_rgba(76,215,246,0.4)] flex-shrink-0">
              <div className="w-full h-full rounded-full bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-base">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  (user.name?.[0] || "U").toUpperCase()
                )}
              </div>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white truncate">
                  {user.name}
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              </div>
              <span className="text-xs text-outline truncate">{user.email}</span>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary font-semibold w-fit">
                <span className="material-symbols-outlined text-[12px]">verified</span>
                {user.plan || "Studio Pro"}
              </div>
            </div>
          </div>

          {/* Quick Library Links */}
          <div className="flex flex-col gap-1">
            <Link
              href="/liked"
              onClick={onClose}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[18px]">
                  favorite
                </span>
                <span>Liked Songs</span>
              </div>
              <span className="material-symbols-outlined text-outline/50 group-hover:text-outline text-[16px]">
                chevron_right
              </span>
            </Link>

            <Link
              href="/playlists"
              onClick={onClose}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[18px]">
                  queue_music
                </span>
                <span>Your Collections</span>
              </div>
              <span className="material-symbols-outlined text-outline/50 group-hover:text-outline text-[16px]">
                chevron_right
              </span>
            </Link>

            <button
              type="button"
              onClick={() => {
                onClose();
                setIsSettingsModalOpen(true);
              }}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[18px]">
                  settings
                </span>
                <span>Settings & Equalizer</span>
              </div>
              <span className="material-symbols-outlined text-outline/50 group-hover:text-outline text-[16px]">
                chevron_right
              </span>
            </button>
          </div>

          <div className="h-[1px] bg-white/10 my-0.5" />

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
