"use client";

import React, { useState, useEffect } from "react";
import { useMusic } from "../context/MusicContext";
import { DEFAULT_USER_ID } from "../config/authConfig";

export default function AuthModal() {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    login,
  } = useMusic();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (isAuthModalOpen) {
      setFeedback(null);
      setPassword("");
    }
  }, [isAuthModalOpen, authModalTab]);

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

  const handleSubmit = (e) => {
    if (authModalTab === "signup") {
      handleSignUp(e);
    } else {
      handleLogin(e);
    }
  };

  const handleSignUp = (e) => {
    e.preventDefault();
    setFeedback({
      type: "error",
      message: "Personal Instance: Sign-ups are closed. Please log in as the owner.",
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setFeedback({
        type: "error",
        message: "Please enter both username/email and access key.",
      });
      return;
    }

    const trimmedIdent = (email || "").trim().toLowerCase();
    const trimmedPass = (password || "").trim();

    // Check if the entered credentials exactly match: Username: DEFAULT_USER_ID and Password: 3603
    const isUserMatch =
      trimmedIdent === DEFAULT_USER_ID ||
      trimmedIdent === `${DEFAULT_USER_ID}@ceepeefy.audio` ||
      trimmedIdent === `${DEFAULT_USER_ID}@gmail.com`;
    const isPassMatch = trimmedPass === "3603";

    if (isUserMatch && isPassMatch) {
      const userObj = {
        username: DEFAULT_USER_ID,
        name: DEFAULT_USER_ID,
        email: `${DEFAULT_USER_ID}@ceepeefy.audio`,
        plan: "Owner / Studio Master",
        isLoggedIn: true,
        activeUser: DEFAULT_USER_ID,
      };

      login(userObj);

      setFeedback({
        type: "success",
        message: `Welcome back, ${DEFAULT_USER_ID}! Authenticated successfully.`,
      });

      setTimeout(() => {
        setIsAuthModalOpen(false);
      }, 750);
    } else {
      // If they enter anything else, block action and display exact error message
      setFeedback({
        type: "error",
        message: "Access Denied: Personal instance only.",
      });
    }
  };

  const handleQuickOwnerSignIn = () => {
    setEmail(DEFAULT_USER_ID);
    setPassword("3603");
    const userObj = {
      username: DEFAULT_USER_ID,
      name: DEFAULT_USER_ID,
      email: `${DEFAULT_USER_ID}@ceepeefy.audio`,
      plan: "Owner / Studio Master",
      isLoggedIn: true,
      activeUser: DEFAULT_USER_ID,
    };
    login(userObj);
    setFeedback({
      type: "success",
      message: `Authenticated as Owner (${DEFAULT_USER_ID})!`,
    });
    setTimeout(() => {
      setIsAuthModalOpen(false);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0f172a]/95 border border-white/10 rounded-2xl p-6 md:p-7 shadow-2xl overflow-hidden flex flex-col gap-5">
        {/* Subtle decorative glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/15 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">
                {authModalTab === "signup" ? "person_add" : "login"}
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {authModalTab === "signup" ? "New to Ceepeefy?" : "Welcome Back"}
              </h3>
              <p className="text-[11px] text-outline">
                {authModalTab === "signup"
                  ? "Sign up for Studio Mode lossless streaming"
                  : "Sign in to access your personal library"}
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

        {/* Tab Switcher: Sign Up vs Log In */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container/80 border border-white/5">
          <button
            type="button"
            onClick={() => {
              setAuthModalTab("signup");
              setFeedback(null);
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authModalTab === "signup"
                ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)]"
                : "text-outline hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthModalTab("login");
              setFeedback(null);
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authModalTab === "login"
                ? "bg-primary text-surface-container-lowest shadow-[0_0_12px_rgba(76,215,246,0.35)]"
                : "text-outline hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            Log In
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {authModalTab === "signup" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-on-surface-variant">
                Your Name / Artist Handle
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-outline text-[18px]">
                  badge
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. nabeeyl"
                  className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-on-surface-variant">
              {authModalTab === "login" ? "Email Address or username" : "Email Address"}
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[18px]">
                {authModalTab === "login" ? "alternate_email" : "mail"}
              </span>
              <input
                type={authModalTab === "login" ? "text" : "email"}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  authModalTab === "login"
                    ? "yourname@domain.com or username"
                    : "yourname@domain.com"
                }
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-on-surface-variant">
                Password
              </label>
              {authModalTab === "login" && (
                <span className="text-[11px] text-primary/80 hover:text-primary cursor-pointer">
                  Forgot password?
                </span>
              )}
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
            className="w-full py-2.5 px-4 mt-1 rounded-xl bg-gradient-to-r from-primary via-cyan-400 to-primary-container text-[#003640] font-bold text-xs tracking-wide shadow-[0_0_20px_rgba(76,215,246,0.35)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {authModalTab === "signup" ? "how_to_reg" : "login"}
            </span>
            {authModalTab === "signup" ? "Create Free Account" : "Sign In to Ceepeefy"}
          </button>
        </form>
        {/* Switch tab note */}
        <div className="text-center text-[11px] text-outline">
          {authModalTab === "signup" ? (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setAuthModalTab("login")}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Log In
              </button>
            </span>
          ) : (
            <span>
              New to Ceepeefy?{" "}
              <button
                type="button"
                onClick={() => setAuthModalTab("signup")}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Sign up for free
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
