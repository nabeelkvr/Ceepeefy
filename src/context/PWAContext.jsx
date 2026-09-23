"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const PWAContext = createContext({
  isInstallable: false,
  isInstalled: false,
  isIOS: false,
  hasUpdate: false,
  isInstallModalOpen: false,
  promptInstall: async () => {},
  applyUpdate: () => {},
  openInstallModal: () => {},
  closeInstallModal: () => {},
});

export function PWAProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  useEffect(() => {
    // 1. Detect if running as standalone PWA
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
      const isNavigatorStandalone = window.navigator.standalone === true;
      const isAndroidApp = document.referrer.includes("android-app://");
      return Boolean(isStandaloneMedia || isNavigatorStandalone || isAndroidApp);
    };

    const standalone = checkStandalone();
    setIsInstalled(standalone);

    // 2. Detect iOS environment
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    // 3. Listen for display-mode changes
    const mediaMatcher = window.matchMedia("(display-mode: standalone)");
    const handleDisplayChange = (e) => {
      setIsInstalled(e.matches);
    };
    mediaMatcher.addEventListener("change", handleDisplayChange);

    // 4. Listen for beforeinstallprompt event (Chromium, Android, Desktop)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsInstallModalOpen(false);
      console.log("[PWA] App installed successfully!");
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 6. Register Service Worker with update detection
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "development") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            console.log("[PWA] Service Worker registered with scope:", registration.scope);

            // Check if there is already a waiting worker
            if (registration.waiting) {
              setWaitingWorker(registration.waiting);
              setHasUpdate(true);
            }

            // Listen for new workers installing
            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;
              if (!newWorker) return;

              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  // A new version has been installed and is waiting
                  setWaitingWorker(newWorker);
                  setHasUpdate(true);
                }
              });
            });
          })
          .catch((err) => {
            console.warn("[PWA] Service Worker registration failed:", err);
          });

        // Reload page when new worker takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      });
    }

    return () => {
      mediaMatcher.removeEventListener("change", handleDisplayChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Prompt the user to install the PWA
  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        console.log("[PWA] User accepted the install prompt");
        setIsInstalled(true);
        setIsInstallable(false);
      } else {
        console.log("[PWA] User dismissed the install prompt");
      }
      setDeferredPrompt(null);
      setIsInstallModalOpen(false);
    } else {
      // If no native prompt (e.g. iOS or already installed or unsupported), open modal
      setIsInstallModalOpen(true);
    }
  }, [deferredPrompt]);

  // Activate waiting update and reload
  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  }, [waitingWorker]);

  const openInstallModal = useCallback(() => setIsInstallModalOpen(true), []);
  const closeInstallModal = useCallback(() => setIsInstallModalOpen(false), []);

  return (
    <PWAContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIOS,
        hasUpdate,
        isInstallModalOpen,
        promptInstall,
        applyUpdate,
        openInstallModal,
        closeInstallModal,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  return useContext(PWAContext);
}
