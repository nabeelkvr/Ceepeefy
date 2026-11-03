/**
 * Central Authentication & Account Identity Configuration
 * Single source of truth for account identifiers, email mapping, and auth helpers.
 */

export const DEFAULT_USER_ID = "nabeeyl";

/**
 * Username to Supabase Auth Email Mapping (D1)
 * Used to transparently map familiar handles to Supabase Auth email addresses.
 */
export const USERNAME_TO_EMAIL_MAP = {
  nabeeyl: process.env.NEXT_PUBLIC_OWNER_EMAIL || "nabeelek3603@gmail.com",
};

/**
 * Resolves an email address for a given username or returns the email if already formatted
 * @param {string} usernameOrEmail
 * @returns {string}
 */
export const resolveEmailForUser = (usernameOrEmail = "") => {
  if (!usernameOrEmail) return "";
  const clean = String(usernameOrEmail).trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return USERNAME_TO_EMAIL_MAP[clean] || `${clean}@ceepeefy.audio`;
};

/**
 * Returns the active user ID string from a user object or fallback
 * @param {Object|string|null} user
 * @returns {string}
 */
export const getAccountUserId = (user) => {
  if (typeof user === "string" && user.trim()) {
    return user.trim().toLowerCase();
  }
  if (user && typeof user === "object") {
    return (user.id || user.uid || user.username || user.activeUser || DEFAULT_USER_ID).toLowerCase();
  }
  return DEFAULT_USER_ID;
};

/**
 * Returns whether a given user object or username represents the default account
 * @param {Object|string|null} user
 * @returns {boolean}
 */
export const isDefaultAccount = (user) => {
  return getAccountUserId(user) === DEFAULT_USER_ID;
};

/**
 * Generates account-specific localStorage key (used strictly as paint cache)
 * @param {string} prefix
 * @param {string} userId
 * @returns {string}
 */
export const getAccountStorageKey = (prefix = "userData", userId = DEFAULT_USER_ID) => {
  return `${prefix}_${userId}`;
};
