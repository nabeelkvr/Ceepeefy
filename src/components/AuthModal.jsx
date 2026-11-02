"use client";

import React, { useState, useEffect } from "react";
import { useMusic } from "../context/MusicContext";

export default function AuthModal() {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    login,
  } = useMusic();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthModalOpen) {
      setFeedback(null);
      setPassword("");
    }
  }, [isAuthModalOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsAuthModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, setIsAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setFeedback({
        type: "error",
        message: "Please enter both username/email and password.",
      });
      return;
    }

    const trimmedIdent = (email || "").trim().toLowerCase();
    const trimmedPass = (password || "").trim();

    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          username: trimmedIdent,
          password: trimmedPass,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        login(data.user);

        setFeedback({
          type: "success",
          message: `Welcome back, ${data.user.username}! Authenticated successfully.`,
        });

        setTimeout(() => {
          setIsAuthModalOpen(false);
          if (typeof window !== "undefined" && window.location.pathname === "/login") {
            window.location.replace("/");
          }
        }, 500);
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Invalid username or password.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Network error connecting to authentication server.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      data-auth-modal="true"
      id="auth-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-[#181818] border border-[#282828] rounded-2xl p-6 md:p-7 shadow-2xl overflow-hidden flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">
                login
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Welcome Back
              </h3>
              <p className="text-[11px] text-outline">
                Sign in to access your personal library
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAuthModalOpen(false)}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
              feedback.type === "success"
                ? "bg-primary/15 border border-primary/30 text-primary"
                : "bg-red-500/15 border border-red-500/30 text-red-300"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {feedback.type === "success" ? "check_circle" : "error"}
            </span>
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-on-surface-variant">
              Email Address or username
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">
                alternate_email
              </span>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@domain.com or username"
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-on-surface-variant">
                Password
              </label>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">
                lock
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 mt-1 rounded-xl bg-gradient-to-r from-primary via-cyan-400 to-primary-container text-[#003640] font-bold text-xs tracking-wide shadow-[0_0_20px_rgba(76,215,246,0.35)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">
              login
            </span>
            {isLoading ? "Signing In..." : "Sign In to Ceepeefy"}
          </button>
        </form>
      </div>
    </div>
  );
}
