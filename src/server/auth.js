import crypto from "node:crypto";

/**
 * Server-Side Authentication & Session Management
 * Single source of truth for administrative owner access.
 *
 * Credentials Configuration:
 * Default Account: nabeeyl
 * Password: 321321
 *
 * HOW TO CHANGE CREDENTIALS:
 * 1. To change username or password, update the OWNER_USERNAME or generate a new
 *    OWNER_PASSWORD_HASH using the helper function below:
 *      hashPassword("your_new_password", OWNER_PASSWORD_SALT)
 * 2. Alternatively, set OWNER_USERNAME and OWNER_PASSWORD in server environment variables.
 */

// Secret used for HMAC signing of session tokens (set in env or fallback to a stable server secret)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "ceepeefy-master-session-secret-key-2026-secure-f83b194d";

// Salt for password hashing
export const OWNER_PASSWORD_SALT =
  process.env.OWNER_PASSWORD_SALT || "ceepeefy_salt_9283748192";

/**
 * Derives a cryptographic password hash using PBKDF2 with 100,000 iterations
 * @param {string} password
 * @param {string} salt
 * @returns {string} Hex encoded hash
 */
export function hashPassword(password, salt = OWNER_PASSWORD_SALT) {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
}

// Default credentials
export const OWNER_USERNAME = (process.env.OWNER_USERNAME || "nabeeyl").toLowerCase();
// Hash of "321321" with OWNER_PASSWORD_SALT
export const OWNER_PASSWORD_HASH =
  process.env.OWNER_PASSWORD_HASH || hashPassword(process.env.OWNER_PASSWORD || "321321", OWNER_PASSWORD_SALT);

/**
 * Timing-safe password verification
 * @param {string} inputPassword
 * @returns {boolean}
 */
export function verifyPassword(inputPassword) {
  if (!inputPassword || typeof inputPassword !== "string") return false;
  try {
    const inputHash = hashPassword(inputPassword, OWNER_PASSWORD_SALT);
    const expectedBuf = Buffer.from(OWNER_PASSWORD_HASH, "hex");
    const inputBuf = Buffer.from(inputHash, "hex");
    if (expectedBuf.length !== inputBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, inputBuf);
  } catch (err) {
    console.error("[Auth] Error verifying password:", err);
    return false;
  }
}

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
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

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
