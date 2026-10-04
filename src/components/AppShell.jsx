"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Player from "./Player";
import QueueDrawer from "./QueueDrawer";
import MobileBottomNav from "./MobileBottomNav";
import AppSkeleton from "./AppSkeleton";
import AmbientBackground from "./AmbientBackground";
import { useMusic } from "../context/MusicContext";

const FullLyricsPanel = dynamic(() => import("./FullLyricsPanel"), { ssr: false });
const DeviceModal = dynamic(() => import("./DeviceModal"), { ssr: false });
const SettingsModal = dynamic(() => import("./SettingsModal"), { ssr: false });
const AuthModal = dynamic(() => import("./AuthModal"), { ssr: false });

export default function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const { currentTrack, lyricsMode, minimizeLyricsToCard, user, openAuthModal } = useMusic();

  // Wait for fonts & critical layout resources before revealing actual UI (eliminates FOUT & CLS)
  useEffect(() => {
    let cancelled = false;

    const waitForResources = async () => {
      try {
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }
      } catch (e) {
        console.warn("Fonts ready check:", e);
      }

      if (!cancelled) {
        setIsAppReady(true);
        setTimeout(() => {
          if (!cancelled) setShowSkeleton(false);
        }, 350);
      }
    };

    // Safe timeout fallback: max 600ms so loading is never unnecessarily long
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setIsAppReady(true);
        setTimeout(() => {
          if (!cancelled) setShowSkeleton(false);
        }, 350);
      }
    }, 600);

    waitForResources();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  // When navigating between pages, automatically minimize full-screen lyrics to Image 2 floating card
  useEffect(() => {
    if (lyricsMode === "full") {
      minimizeLyricsToCard();
    }
  }, [pathname]);

  const isUserAuthenticated = Boolean(user && user.isLoggedIn);

  // Private instance protection: Intercepts all clicks on any button or interactive element when unauthenticated
  const handleGlobalClickCapture = (e) => {
    if (isUserAuthenticated) return;
    if (pathname === "/login") return;

    // Allow typing credentials or interacting inside AuthModal
    if (e.target.closest("[data-auth-modal]") || e.target.closest("#auth-modal-container")) {
      return;
    }

    // Intercept clicks on buttons, links, inputs, cards, or clickable elements
    const targetElement = e.target.closest(
      "button, a, input, select, textarea, [role='button'], [tabindex], .cursor-pointer, [data-clickable], .glass-card"
    );

    if (targetElement) {
      e.preventDefault();
      e.stopPropagation();
      router.push("/login");
      openAuthModal("login");
    }
  };

  // Keyboard shortcut protection (Spacebar, ⌘K, etc.)
  const handleGlobalKeyDownCapture = (e) => {
    if (isUserAuthenticated) return;
    if (pathname === "/login") return;
    if (e.target.closest("[data-auth-modal]")) return;

    if (e.code === "Space" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
      e.preventDefault();
      e.stopPropagation();
      router.push("/login");
      openAuthModal("login");
    }
  };

  return (
    <div
      onClickCapture={handleGlobalClickCapture}
      onKeyDownCapture={handleGlobalKeyDownCapture}
      className="h-[100dvh] h-screen w-screen flex flex-col bg-transparent text-on-surface font-sans overflow-hidden selection:bg-primary selection:text-black relative"
    >
      {/* Dynamic Multi-Layer Ambient Background */}
      <AmbientBackground />

      {/* Skeleton Loading Screen Overlay: visible immediately on Mobile PWA & Web until fonts and layout ready */}
      {showSkeleton && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity duration-300 ease-out pointer-events-none ${
            isAppReady ? "opacity-0" : "opacity-100 pointer-events-auto"
          }`}
          aria-hidden={isAppReady}
        >
          <AppSkeleton />
        </div>
      )}

      {/* Actual Application Content */}
      <div
        className={`flex-1 flex flex-col h-full w-full overflow-hidden transition-opacity duration-300 ${
          isAppReady ? "opacity-100" : "opacity-0 invisible"
        }`}
      >
        {/* Upper area: Sidebar + Main Content */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Desktop Sidebar */}
          <Sidebar className="hidden md:flex" />

          {/* Mobile Backdrop */}
          {isMobileSidebarOpen && (
            <div
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity"
            />
          )}

          {/* Mobile Slide-over Sidebar */}
          <div
            className={`md:hidden fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
          >
            <Sidebar
              className="h-full w-full"
              onClose={() => setIsMobileSidebarOpen(false)}
            />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative transition-colors duration-500">
            <Header onToggleMobileMenu={() => setIsMobileSidebarOpen((prev) => !prev)} />
            <main className={`flex-1 overflow-y-auto ${currentTrack ? "pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] md:pb-28" : "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8"} scroll-smooth transition-[padding] duration-300`}>
              {children}
            </main>

            {/* Full-Width Lyrics View (takes width of main content area, Image 3) */}
            {lyricsMode === "full" && <FullLyricsPanel />}
          </div>

          {/* Up-Next Queue Drawer */}
          <QueueDrawer />
        </div>

        {/* Persistent Bottom Player Bar */}
        <Player />

        {/* Mobile Fixed Bottom Navigation Bar */}
        <MobileBottomNav />
      </div>

      {/* Floating Modals */}
      <DeviceModal />
      <SettingsModal />
      <AuthModal />
    </div>
  );
}
