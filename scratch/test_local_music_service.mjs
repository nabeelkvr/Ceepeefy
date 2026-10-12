import { cleanFileNameMetadata, formatFileSize } from "../src/services/localMusicService.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ FAILED:", msg);
    process.exit(1);
  }
  console.log("✅ PASSED:", msg);
}

console.log("Testing localMusicService helpers...");

// Test filename cleaner
const t1 = cleanFileNameMetadata("01 - Adele - Rolling in the Deep.mp3");
assert(t1.artist === "Adele", "Artist extracted as Adele");
assert(t1.title === "Rolling in the Deep", "Title extracted");

const t2 = cleanFileNameMetadata("SongWithoutArtist.flac");
assert(t2.artist === "Unknown Artist", "Fallback artist when no delimiter");
assert(t2.title === "SongWithoutArtist", "Title without extension");

// Test format file size
assert(formatFileSize(15 * 1024 * 1024) === "15.0 MB", "15 MB formatted");
assert(formatFileSize(500 * 1024) === "500 KB", "500 KB formatted");

console.log("🎉 All localMusicService unit checks passed!");
