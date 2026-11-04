import crypto from "node:crypto";

/**
 * Server-Side Authentication & Rate Limiting
 * Central utilities for rate limiting and account identifiers.
 * All user password authentication is managed exclusively by Supabase Auth.
 */

// Secret used for HMAC signing of internal tokens (set in env or generated securely on boot)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

// Single owner account credentials
export const OWNER_USERNAME = (process.env.OWNER_USERNAME || "nabeeyl").toLowerCase();

/**
 * Rate Limiter for Login Attempts
 * In-memory sliding window: max 5 failed attempts per IP per 5 minutes
 */
const loginAttempts = new Map(); // ip -> { count: number, resetAt: number }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function checkRateLimit(ip = "global") {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      retryAfterSec,
      message: `Too many login attempts. Please wait ${retryAfterSec} seconds before trying again.`,
    };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

export function recordFailedAttempt(ip = "global") {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
  }
}

export function resetRateLimit(ip = "global") {
  loginAttempts.delete(ip);
}

/**
 * Session Token Utilities
 * Format: userId:createdAt:expiresAt:signature
 */
export const SESSION_COOKIE_NAME = "ceepeefy_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

export function createSessionToken(username = OWNER_USERNAME) {
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_SEC * 1000;
  const payload = `${username.toLowerCase()}:${now}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}:${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(":");
  if (parts.length !== 4) return null;

  const [username, createdAtStr, expiresAtStr, signature] = parts;
  const payload = `${username}:${createdAtStr}:${expiresAtStr}`;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return null; // Expired
  }

  return {
    username,
    createdAt: parseInt(createdAtStr, 10),
    expiresAt,
  };
}
