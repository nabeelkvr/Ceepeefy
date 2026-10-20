"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMusic } from "../../context/MusicContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useMusic();

  // Mode: true = Signup Card (matching the image), false = Login Card
  const [isSignUp, setIsSignUp] = useState(true);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already logged in, redirect to destination
  useEffect(() => {
    if (user && user.isLoggedIn && !isLoading) {
      const searchParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const from = searchParams?.get("from");
      const destination =
        from && from.startsWith("/") && from !== "/login" ? from : "/";
      if (typeof window !== "undefined") {
        window.location.replace(destination);
      } else {
        router.replace(destination);
      }
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (isSignUp) {
      if (!email.trim() || !password.trim()) {
        setFeedback({
          type: "error",
          message: "Please enter your email and a password.",
        });
        return;
      }
      if (password.trim().length < 4) {
        setFeedback({
          type: "error",
          message: "Password must be at least 4 characters long.",
        });
        return;
      }
    } else {
      if (!loginUser.trim() || !password.trim()) {
        setFeedback({
          type: "error",
          message: "Please enter your email or username and password.",
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload = isSignUp
        ? {
          action: "signup",
          email: email.trim(),
          password: password.trim(),
          displayName: displayName.trim() || email.split("@")[0],
        }
        : {
          action: "login",
          username: loginUser.trim(),
          password: password.trim(),
        };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        login(data.user);

        setFeedback({
          type: "success",
          message: isSignUp
            ? `Account created! Welcome, ${data.user.name}!`
            : `Welcome back, ${data.user.name}!`,
        });

        const searchParams =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
        const from = searchParams?.get("from");
        const destination =
          from && from.startsWith("/") && from !== "/login" ? from : "/";

        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.location.replace(destination);
          } else {
            router.replace(destination);
          }
        }, 300);
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Authentication failed. Please verify your details.",
        });
      }
    } catch (err) {
      console.error("Auth error:", err);
      setFeedback({
        type: "error",
        message: "Network error connecting to authentication server. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative w-screen min-h-screen overflow-x-hidden bg-[#05070e] flex items-center justify-center font-sans select-none p-4 sm:p-8 lg:p-12">

      {/* ======================================================== */}
      {/* 1. FULL-WIDTH BACKGROUND MOSAIC & COLOR GRADING          */}
      {/* ======================================================== */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Real Ambient Wallpaper Image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-45 scale-105"
          style={{ backgroundImage: "url('/backgrounds/login_ambient_bg.jpg')" }}
        />

        {/* Dense Angled Album Cards Overlay Layer (Mirrors Image 2) */}
        <div className="absolute inset-0 opacity-40 mix-blend-screen scale-110 -rotate-3 transform pointer-events-none">
          <div className="grid grid-cols-4 md:grid-cols-6 gap-6 -mt-16 -ml-16 w-[120vw]">
            {/* Row 1 */}
            <div className="h-44 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-zinc-900 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Mil Salikna</span>
              <div className="w-16 h-16 rounded-full bg-cyan-500/20 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-cyan-300 text-[24px]">graphic_eq</span>
              </div>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-tr from-purple-900/90 to-pink-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-pink-300 font-bold">The Song Things</span>
              <div className="w-14 h-14 rounded-full border-2 border-pink-400/80 mx-auto bg-gradient-to-r from-purple-500/30 to-pink-500/30" />
              <span className="text-[9px] text-zinc-400">Love in Music</span>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-purple-950 to-zinc-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-purple-300 font-bold">Acoustic Live</span>
              <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 mx-auto" />
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-cyan-950/70 to-indigo-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-cyan-300 font-bold">Ceepeefy CP</span>
              <div className="w-16 h-16 rounded-full bg-cyan-400/10 border border-cyan-400/30 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-cyan-400 text-[22px]">album</span>
              </div>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-zinc-900 to-black border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-zinc-400 font-bold">Midnight</span>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-tr from-emerald-950/60 to-zinc-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-emerald-300 font-bold">Soundwave</span>
            </div>

            {/* Row 2 */}
            <div className="h-44 rounded-2xl bg-gradient-to-br from-zinc-900 to-black border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-zinc-300 font-bold">Barate</span>
              <div className="w-12 h-12 rounded-full bg-white/10 mx-auto" />
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-amber-950/70 via-zinc-900 to-black border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-amber-300 font-bold">Hoasted</span>
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 mx-auto" />
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-tr from-purple-900/60 to-zinc-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-purple-300 font-bold">Aayasha</span>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-tr from-blue-900/80 to-zinc-950 border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-blue-300 font-bold">Concert Arena</span>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-teal-950 to-black border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-teal-300 font-bold">Studio Master</span>
            </div>
            <div className="h-44 rounded-2xl bg-gradient-to-br from-indigo-950 to-black border border-white/10 shadow-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-indigo-300 font-bold">Festival</span>
            </div>
          </div>
        </div>

        {/* Split Color Grading (Purple on Left, Teal on Right matching Image 2) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#170a2c]/75 via-[#080d1a]/85 to-[#051c22]/80" />

        {/* Ambient Radial Lights */}
        <div className="absolute -top-24 left-1/12 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-1/12 w-[650px] h-[650px] bg-teal-500/20 rounded-full blur-[170px]" />
        <div className="absolute top-1/2 left-1/3 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[140px]" />

        {/* Vignette Edge Shading */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(5,7,14,0.92)_100%)]" />
      </div>

      {/* ======================================================== */}
      {/* 2. MAIN FULL-WIDTH WRAPPER: HERO TEXT + SIGNUP CARD      */}
      {/* ======================================================== */}
      <div className="relative z-10 w-full max-w-[1240px] flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-14 py-8 sm:py-12">

        {/* LEFT COLUMN: HERO HEADLINE & TAGLINE */}
        <div className="w-full lg:w-1/2 flex flex-col items-start text-left z-10 lg:pr-6">
          <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-black tracking-tight leading-[1.08] text-white">
            Ready to start <br />
            <span className="text-white drop-shadow-[0_0_28px_rgba(56,189,248,0.55)]">
              listening?
            </span>
          </h1>

          <p className="text-sm sm:text-base lg:text-[17px] text-zinc-300/85 leading-relaxed mt-5 sm:mt-6 max-w-md font-normal">
            Explore millions of songs, podcasts, and custom playlists on Ceepeefy, free forever.
          </p>
        </div>

        {/* RIGHT COLUMN: FLOATING GLASSMORPHIC SIGNUP/LOGIN CARD */}
        <div className="w-full lg:w-[430px] flex-shrink-0 z-20">
          <div className="relative w-full bg-white/[0.05] sm:bg-[#121626]/65 backdrop-blur-3xl border border-white/20 rounded-[28px] sm:rounded-[32px] p-7 sm:p-9 shadow-[0_30px_70px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.22)] transition-all duration-300">

            {/* Top Brand Identity: Soundwave CP Emblem + Ceepeefy Wordmark from Image 2 */}
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 relative">
                <svg
                  viewBox="0 0 512 512"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full filter drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                >
                  <defs>
                    <linearGradient
                      id="card-logo-grad"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="30%" stopColor="#3B82F6" />
                      <stop offset="65%" stopColor="#8B5CF6" />
                      <stop offset="85%" stopColor="#D946EF" />
                      <stop offset="100%" stopColor="#F43F5E" />
                    </linearGradient>
                  </defs>
                  {/* Waveform bars forming icon */}
                  <rect x="115" y="160" width="28" height="194" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="165" y="114" width="28" height="284" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="216" y="73" width="28" height="366" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="267" y="27" width="28" height="457" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="317" y="73" width="28" height="149" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="317" y="290" width="28" height="149" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="368" y="114" width="28" height="80" rx="14" fill="url(#card-logo-grad)" />
                  <rect x="368" y="317" width="28" height="81" rx="14" fill="url(#card-logo-grad)" />
                </svg>
              </div>

              <span className="font-extrabold text-[27px] tracking-tight bg-gradient-to-r from-[#38bdf8] via-[#60a5fa] via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">
                Ceepeefy
              </span>
            </div>

            {/* Card Titles */}
            <div className="flex flex-col items-center text-center mt-5 mb-6">
              <h2 className="text-2xl sm:text-[26px] font-bold text-white tracking-tight">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-xs sm:text-[13px] text-zinc-400 mt-1">
                {isSignUp ? "Join the music community." : "Log in to continue listening."}
              </p>
            </div>

            {/* Notification alert */}
            {feedback && (
              <div
                className={`mb-4 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 border animate-in fade-in duration-150 ${feedback.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
              >
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">
                  {feedback.type === "success" ? "check_circle" : "error"}
                </span>
                <span className="leading-snug">{feedback.message}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {isSignUp ? (
                /* ================= SIGNUP INPUTS ================= */
                <>
                  <div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="What's your email?"
                      required
                      autoComplete="email"
                      className="w-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/15 focus:border-cyan-400/70 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/70 transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      required
                      autoComplete="new-password"
                      className="w-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/15 focus:border-cyan-400/70 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/70 transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="What should we call you?"
                      autoComplete="name"
                      className="w-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/15 focus:border-cyan-400/70 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/70 transition-all shadow-inner"
                    />
                  </div>
                </>
              ) : (
                /* ================= LOGIN INPUTS ================= */
                <>
                  <div>
                    <input
                      type="text"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      placeholder="Email or username"
                      required
                      autoComplete="username"
                      className="w-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/15 focus:border-cyan-400/70 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/70 transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className="w-full bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/15 focus:border-cyan-400/70 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/70 transition-all shadow-inner"
                    />
                  </div>
                </>
              )}

              {/* Action Button: Sign Up Free / Log In */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3.5 px-6 rounded-full font-semibold text-sm text-white bg-gradient-to-r from-[#9333ea] via-[#6366f1] to-[#38bdf8] shadow-[0_0_25px_rgba(147,51,234,0.45)] hover:shadow-[0_0_35px_rgba(147,51,234,0.7)] hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Please wait...</span>
                  </>
                ) : (
                  <span>{isSignUp ? "Sign up free" : "Log in"}</span>
                )}
              </button>
            </form>

            {/* Toggle Between Signup and Login */}
            <div className="mt-5 text-center text-xs text-zinc-400">
              {isSignUp ? (
                <span>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setFeedback(null);
                    }}
                    className="text-white hover:text-cyan-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Log in
                  </button>
                </span>
              ) : (
                <span>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setFeedback(null);
                    }}
                    className="text-white hover:text-cyan-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Sign up free
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. SUBTLE BOTTOM-RIGHT SPARKLE (Matching Image 2)        */}
      {/* ======================================================== */}
      <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 text-zinc-500/40 pointer-events-none select-none z-10">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24">
          <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
        </svg>
      </div>
    </main>
  );
}
