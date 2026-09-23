"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMusic } from "../../context/MusicContext";
import { DEFAULT_USER_ID } from "../../config/authConfig";

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useMusic();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already logged in, redirect to home
  useEffect(() => {
    if (user && user.isLoggedIn) {
      router.replace("/");
    }
  }, [user, router]);

  const handleLogin = (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setFeedback({
        type: "error",
        message: "Please enter both your username and access key.",
      });
      return;
    }

    const trimmedUser = username.trim().toLowerCase();
    const trimmedPass = password.trim();

    const isUserMatch =
      trimmedUser === DEFAULT_USER_ID ||
      trimmedUser === `${DEFAULT_USER_ID}@ceepeefy.audio` ||
      trimmedUser === `${DEFAULT_USER_ID}@gmail.com`;
    const isPassMatch = trimmedPass === "3603";

    if (isUserMatch && isPassMatch) {
      setIsLoading(true);
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
        router.push("/");
      }, 500);
    } else {
      setFeedback({
        type: "error",
        message: "Access Denied: Private instance. Invalid credentials.",
      });
    }
  };

  const handleQuickOwnerSignIn = () => {
    setIsLoading(true);
    setUsername(DEFAULT_USER_ID);
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
      router.push("/");
    }, 500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#080d1a] relative overflow-hidden select-none">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-secondary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(76,215,246,0.15),rgba(255,255,255,0))]" />

      {/* Main Login Card */}
      <div className="relative w-full max-w-md bg-[#0f172a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 md:p-9 shadow-2xl overflow-hidden flex flex-col gap-6 z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-cyan-300 flex items-center justify-center text-surface-container-lowest shadow-[0_0_24px_rgba(76,215,246,0.5)]">
              <span className="material-symbols-outlined text-[26px]">graphic_eq</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Ceepeefy</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-widest uppercase bg-primary/15 text-primary border border-primary/30">
                Studio
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-1">
            <h2 className="text-lg font-bold text-white tracking-tight">Private Studio Instance</h2>
            <p className="text-xs text-on-surface-variant max-w-xs leading-relaxed">
              Sign in with your owner credentials to unlock high-resolution streaming, custom playlists, and cloud storage.
            </p>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border border-red-500/30 text-red-300"
            }`}
          >
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">
              {feedback.type === "success" ? "check_circle" : "error"}
            </span>
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">
              Username or Account Email
            </label>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[19px]">alternate_email</span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. nabeeyl"
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">
              Master Access Key
            </label>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-container/60 border border-white/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <span className="material-symbols-outlined text-outline text-[19px]">lock</span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-outline/60 w-full font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-outline hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 rounded-xl bg-primary text-surface-container-lowest font-bold text-xs tracking-wide shadow-[0_0_20px_rgba(76,215,246,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            <span>{isLoading ? "Authenticating..." : "Sign In to Studio Mode"}</span>
          </button>
        </form>
        {/* Footer */}
        <div className="text-center pt-1">
          <p className="text-[10px] text-outline">
            Private instance • High-resolution lossless audio • Ceepeefy
          </p>
        </div>
      </div>
    </div>
  );
}
