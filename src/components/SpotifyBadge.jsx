import React from "react";

/**
 * Official Spotify SVG Icon
 */
export function SpotifyIcon({ className = "w-4 h-4 text-[#1DB954]" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.308a.747.747 0 0 1-1.028.248c-2.815-1.72-6.358-2.108-10.533-1.154a.749.749 0 0 1-.336-1.46c4.57-1.045 8.492-.596 11.649 1.338.353.217.465.674.248 1.028zm1.47-3.268a.936.936 0 0 1-1.287.308c-3.224-1.982-8.14-2.557-11.954-1.4a.937.937 0 0 1-.548-1.792c4.358-1.323 9.778-.68 13.481 1.597.412.253.543.788.308 1.287zm.126-3.41c-3.864-2.295-10.245-2.507-13.924-1.39a1.124 1.124 0 0 1-.655-2.152c4.23-1.284 11.278-1.033 15.717 1.602a1.125 1.125 0 0 1-1.138 1.94z" />
    </svg>
  );
}

/**
 * Spotify Branding Badge for Attribution
 *
 * @param {object} props
 * @param {string} [props.label="Spotify"]
 * @param {string} [props.size="sm"]
 * @param {string} [props.className]
 */
export default function SpotifyBadge({ label = "Spotify", size = "sm", className = "" }) {
  const isXs = size === "xs";
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 text-[#1ed760] font-semibold select-none ${
        isXs ? "text-[10px]" : "text-[11px]"
      } ${className}`}
    >
      <SpotifyIcon className={isXs ? "w-3 h-3 text-[#1DB954]" : "w-3.5 h-3.5 text-[#1DB954]"} />
      <span className="tracking-wide">{label}</span>
    </div>
  );
}
