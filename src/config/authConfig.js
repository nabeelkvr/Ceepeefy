/**
 * Central Authentication & Account Identity Configuration
 * Single source of truth for the account identifier across the application.
 */

export const DEFAULT_USER_ID = "nabeeyl";

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
    return (user.username || user.activeUser || user.id || DEFAULT_USER_ID).toLowerCase();
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
 * Generates account-specific localStorage key
 * @param {string} prefix
 * @param {string} userId
 * @returns {string}
 */
export const getAccountStorageKey = (prefix = "userData", userId = DEFAULT_USER_ID) => {
  return `${prefix}_${userId}`;
};
