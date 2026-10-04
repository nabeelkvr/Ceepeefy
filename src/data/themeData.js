/**
 * Ceepeefy Ambient Theme & Background Engine
 * Curated high-resolution cinematic background presets and adaptive color palettes.
 */

export const BACKGROUND_PRESETS = [
  {
    id: "sunset-mountains",
    name: "Sunset Mountains",
    category: "Warm Twilight",
    description: "Beautiful sunset horizon, dark mountain silhouettes, muted amber, burgundy, and violet lighting.",
    imageUrl: "https://images.unsplash.com/photo-1509233725247-49e657c54213?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1509233725247-49e657c54213?auto=format&fit=crop&w=400&q=75",
    baseBg: "#0c0814",
    palette: {
      primary: "#a78bfa",
      primaryRgb: "167 139 250",
      primaryContainer: "#7c3aed",
      primaryContainerRgb: "124 58 237",
      onPrimary: "#2e1065",
      onPrimaryRgb: "46 16 101",
      secondary: "#fb923c",
      secondaryRgb: "251 146 60",
      glow: "rgba(167, 139, 250, 0.45)",
      ambientHue: "270",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "midnight-ocean",
    name: "Midnight Ocean",
    category: "Ocean & Water",
    description: "Dark ocean waves, moonlight, muted teal reflections, cinematic atmosphere.",
    imageUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=400&q=75",
    baseBg: "#050d18",
    palette: {
      primary: "#2dd4bf",
      primaryRgb: "45 212 191",
      primaryContainer: "#0f766e",
      primaryContainerRgb: "15 118 110",
      onPrimary: "#003731",
      onPrimaryRgb: "0 55 49",
      secondary: "#0284c7",
      secondaryRgb: "2 132 199",
      glow: "rgba(45, 212, 191, 0.4)",
      ambientHue: "175",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "rainy-city",
    name: "Rainy City",
    category: "Urban & Lo-Fi",
    description: "Blurred city lights, rainy glass, distant warm lights, deep charcoal surroundings.",
    imageUrl: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=400&q=75",
    baseBg: "#080c14",
    palette: {
      primary: "#cbd5e1",
      primaryRgb: "203 213 225",
      primaryContainer: "#475569",
      primaryContainerRgb: "71 85 105",
      onPrimary: "#0f172a",
      onPrimaryRgb: "15 23 42",
      secondary: "#f59e0b",
      secondaryRgb: "245 158 11",
      glow: "rgba(203, 213, 225, 0.35)",
      ambientHue: "215",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "Atmosphere",
    description: "Soft northern lights, deep night sky, subtle emerald and teal gradients.",
    imageUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=400&q=75",
    baseBg: "#051314",
    palette: {
      primary: "#6ee7b7",
      primaryRgb: "110 231 183",
      primaryContainer: "#059669",
      primaryContainerRgb: "5 150 105",
      onPrimary: "#022c22",
      onPrimaryRgb: "2 44 34",
      secondary: "#2dd4bf",
      secondaryRgb: "45 212 191",
      glow: "rgba(110, 231, 183, 0.4)",
      ambientHue: "160",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "dreamy-forest",
    name: "Dreamy Forest",
    category: "Nature",
    description: "Dark forest, gentle fog, subtle green light, peaceful cinematic depth.",
    imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=75",
    baseBg: "#05110a",
    palette: {
      primary: "#34d399",
      primaryRgb: "52 211 153",
      primaryContainer: "#059669",
      primaryContainerRgb: "5 150 105",
      onPrimary: "#022c22",
      onPrimaryRgb: "2 44 34",
      secondary: "#10b981",
      secondaryRgb: "16 185 129",
      glow: "rgba(52, 211, 153, 0.4)",
      ambientHue: "155",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "midnight-drive",
    name: "Midnight Drive",
    category: "Nocturne & Speed",
    description: "Night highway, distant streetlights, atmospheric photography, warm light trails.",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=400&q=75",
    baseBg: "#0a0710",
    palette: {
      primary: "#fbbf24",
      primaryRgb: "251 191 36",
      primaryContainer: "#d97706",
      primaryContainerRgb: "217 119 6",
      onPrimary: "#451a03",
      onPrimaryRgb: "69 26 3",
      secondary: "#f43f5e",
      secondaryRgb: "244 63 94",
      glow: "rgba(251, 191, 36, 0.4)",
      ambientHue: "38",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "purple-dusk",
    name: "Purple Dusk",
    category: "Twilight",
    description: "Dark violet horizon, soft clouds, muted lavender light, premium nighttime aesthetic.",
    imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=75",
    baseBg: "#0f0b1a",
    palette: {
      primary: "#c084fc",
      primaryRgb: "192 132 252",
      primaryContainer: "#7e22ce",
      primaryContainerRgb: "126 34 206",
      onPrimary: "#3b0764",
      onPrimaryRgb: "59 7 100",
      secondary: "#818cf8",
      secondaryRgb: "129 140 248",
      glow: "rgba(192, 132, 252, 0.4)",
      ambientHue: "275",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "abstract-ambient",
    name: "Abstract Ambient",
    category: "Abstract",
    description: "Beautiful abstract flowing light, soft blurred gradients, deep dark tones.",
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=75",
    baseBg: "#090919",
    palette: {
      primary: "#818cf8",
      primaryRgb: "129 140 248",
      primaryContainer: "#4f46e5",
      primaryContainerRgb: "79 70 229",
      onPrimary: "#1e1b4b",
      onPrimaryRgb: "30 27 75",
      secondary: "#c084fc",
      secondaryRgb: "192 132 252",
      glow: "rgba(129, 140, 248, 0.4)",
      ambientHue: "235",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "deep-space",
    name: "Deep Space",
    category: "Cosmos",
    description: "Subtle stars, cosmic clouds, dark navy and charcoal atmosphere.",
    imageUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=400&q=75",
    baseBg: "#070614",
    palette: {
      primary: "#7dd3fc",
      primaryRgb: "125 211 252",
      primaryContainer: "#0284c7",
      primaryContainerRgb: "2 132 199",
      onPrimary: "#082f49",
      onPrimaryRgb: "8 47 73",
      secondary: "#38bdf8",
      secondaryRgb: "56 189 248",
      glow: "rgba(125, 211, 252, 0.4)",
      ambientHue: "200",
    },
    defaultIntensity: "cinematic",
  },
  {
    id: "minimal-cinematic",
    name: "Minimal Cinematic",
    category: "Minimalist",
    description: "Elegant dark photographic textures with almost invisible ambient lighting.",
    imageUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1920&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=400&q=75",
    baseBg: "#070b14",
    palette: {
      primary: "#94a3b8",
      primaryRgb: "148 163 184",
      primaryContainer: "#475569",
      primaryContainerRgb: "71 85 105",
      onPrimary: "#0f172a",
      onPrimaryRgb: "15 23 42",
      secondary: "#64748b",
      secondaryRgb: "100 116 139",
      glow: "rgba(148, 163, 184, 0.3)",
      ambientHue: "215",
    },
    defaultIntensity: "chill",
  },
];

export const INTENSITY_PRESETS = {
  chill: {
    id: "chill",
    label: "Chill",
    description: "Deep darkness, soft photographic visibility, very subtle glow for focused listening.",
    bgOpacity: 32,
    overlayOpacity: 75,
    ambientGlowIntensity: 25,
    bgBlur: 10,
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematic",
    description: "Balanced background visibility, elegant ambient lighting, beautiful color harmony.",
    bgOpacity: 55,
    overlayOpacity: 48,
    ambientGlowIntensity: 45,
    bgBlur: 5,
  },
  immersive: {
    id: "immersive",
    label: "Immersive",
    description: "More visible photography, richer gradients, stronger ambient atmosphere while retaining readability.",
    bgOpacity: 75,
    overlayOpacity: 35,
    ambientGlowIntensity: 65,
    bgBlur: 2,
  },
};

export const MANUAL_ACCENT_PALETTES = [
  { id: "cyan", name: "Cyan Nocturne", color: "#4cd7f6", rgb: "76 215 246", container: "#06b6d4", containerRgb: "6 182 212", onPrimary: "#003640", glow: "rgba(76,215,246,0.35)" },
  { id: "sky", name: "Electric Sky", color: "#38bdf8", rgb: "56 189 248", container: "#0284c7", containerRgb: "2 132 199", onPrimary: "#003640", glow: "rgba(56,189,248,0.35)" },
  { id: "emerald", name: "Emerald Pulse", color: "#34d399", rgb: "52 211 153", container: "#059669", containerRgb: "5 150 105", onPrimary: "#022c22", glow: "rgba(52,211,153,0.35)" },
  { id: "mint", name: "Mint Aurora", color: "#2dd4bf", rgb: "45 212 191", container: "#0f766e", containerRgb: "15 118 110", onPrimary: "#003731", glow: "rgba(45,212,191,0.35)" },
  { id: "purple", name: "Cyber Violet", color: "#c084fc", rgb: "192 132 252", container: "#7e22ce", containerRgb: "126 34 206", onPrimary: "#3b0764", glow: "rgba(192,132,252,0.35)" },
  { id: "amber", name: "Sunset Gold", color: "#fb923c", rgb: "251 146 60", container: "#ea580c", containerRgb: "234 88 12", onPrimary: "#431407", glow: "rgba(251,146,60,0.35)" },
  { id: "rose", name: "Rose Quartz", color: "#f43f5e", rgb: "244 63 94", container: "#be123c", containerRgb: "190 18 60", onPrimary: "#4c0519", glow: "rgba(244,63,94,0.35)" },
  { id: "indigo", name: "Royal Indigo", color: "#818cf8", rgb: "129 140 248", container: "#4f46e5", containerRgb: "79 70 229", onPrimary: "#1e1b4b", glow: "rgba(129,140,248,0.35)" },
];

/**
 * Parses any HEX string into RGB numbers array
 */
export function hexToRgb(hex) {
  if (!hex) return [76, 215, 246];
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  if (cleanHex.length !== 6) return [76, 215, 246];
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return [76, 215, 246];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Applies all theme variables to the document root safely and smoothly
 */
export function applyThemeToDom(themeSettings = {}) {
  if (typeof document === "undefined" || !document.documentElement) return;

  const bgId = themeSettings.backgroundId || "sunset-mountains";
  const customUrl = themeSettings.customBackgroundUrl || null;
  const isCustom = Boolean(customUrl && bgId === "custom");

  const preset = BACKGROUND_PRESETS.find((p) => p.id === bgId) || BACKGROUND_PRESETS[0];

  // Resolve Active Accent Palette
  let primaryRgb = preset.palette.primaryRgb;
  let primaryContainerRgb = preset.palette.primaryContainerRgb;
  let onPrimaryRgb = preset.palette.onPrimaryRgb;
  let glowColor = preset.palette.glow;
  let baseBg = preset.baseBg;

  if (isCustom && themeSettings.customPalette) {
    primaryRgb = themeSettings.customPalette.primaryRgb || primaryRgb;
    primaryContainerRgb = themeSettings.customPalette.primaryContainerRgb || primaryContainerRgb;
    glowColor = themeSettings.customPalette.glow || glowColor;
    baseBg = themeSettings.customPalette.baseBg || baseBg;
  }

  // If manual accent mode is active, override accent colors
  if (themeSettings.accentMode === "manual" && themeSettings.manualAccentColor) {
    const [r, g, b] = hexToRgb(themeSettings.manualAccentColor);
    primaryRgb = `${r} ${g} ${b}`;
    // Container is a darker 60% version of the manual accent
    primaryContainerRgb = `${Math.round(r * 0.7)} ${Math.round(g * 0.7)} ${Math.round(b * 0.7)}`;
    onPrimaryRgb = (r * 0.299 + g * 0.587 + b * 0.114) > 160 ? "0 0 0" : "255 255 255";
    glowColor = `rgba(${r}, ${g}, ${b}, 0.35)`;
  }

  // Intensities
  const bgOpacity = typeof themeSettings.bgOpacity === "number" ? themeSettings.bgOpacity / 100 : 0.35;
  const overlayOpacity = typeof themeSettings.overlayOpacity === "number" ? themeSettings.overlayOpacity / 100 : 0.72;
  const glowOpacity = typeof themeSettings.ambientGlowIntensity === "number" ? themeSettings.ambientGlowIntensity / 100 : 0.42;
  const bgBlur = typeof themeSettings.bgBlur === "number" ? `${themeSettings.bgBlur}px` : "14px";

  const root = document.documentElement;
  root.style.setProperty("--color-primary-rgb", primaryRgb);
  root.style.setProperty("--color-primary-container-rgb", primaryContainerRgb);
  root.style.setProperty("--color-on-primary-rgb", onPrimaryRgb);
  root.style.setProperty("--theme-bg-base", baseBg);
  root.style.setProperty("--theme-bg-opacity", String(bgOpacity));
  root.style.setProperty("--theme-overlay-opacity", String(overlayOpacity));
  root.style.setProperty("--theme-bg-blur", bgBlur);
  root.style.setProperty("--theme-glow-opacity", String(glowOpacity));
  root.style.setProperty("--theme-primary-glow", glowColor);
}

/**
 * Extracts dominant vibrant color from an image using offscreen HTML canvas
 */
export async function extractPaletteFromImage(imageSrc) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !imageSrc) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let count = 0;

        let bestVibrantR = 76;
        let bestVibrantG = 215;
        let bestVibrantB = 246;
        let maxSaturation = -1;

        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          totalR += r;
          totalG += g;
          totalB += b;
          count++;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

          // Seek vibrant pixels that are neither too dark (<40) nor blown out white (>230)
          if (brightness > 45 && brightness < 225 && delta > maxSaturation) {
            maxSaturation = delta;
            bestVibrantR = r;
            bestVibrantG = g;
            bestVibrantB = b;
          }
        }

        const avgR = Math.round(totalR / (count || 1));
        const avgG = Math.round(totalG / (count || 1));
        const avgB = Math.round(totalB / (count || 1));

        // Deepen average color for very dark base background
        const baseBgR = Math.min(18, Math.round(avgR * 0.12));
        const baseBgG = Math.min(22, Math.round(avgG * 0.12));
        const baseBgB = Math.min(32, Math.round(avgB * 0.15));
        const baseBg = `#${((1 << 24) + (baseBgR << 16) + (baseBgG << 8) + baseBgB).toString(16).slice(1)}`;

        resolve({
          primary: `rgb(${bestVibrantR}, ${bestVibrantG}, ${bestVibrantB})`,
          primaryRgb: `${bestVibrantR} ${bestVibrantG} ${bestVibrantB}`,
          primaryContainer: `rgb(${Math.round(bestVibrantR * 0.7)}, ${Math.round(bestVibrantG * 0.7)}, ${Math.round(bestVibrantB * 0.7)})`,
          primaryContainerRgb: `${Math.round(bestVibrantR * 0.7)} ${Math.round(bestVibrantG * 0.7)} ${Math.round(bestVibrantB * 0.7)}`,
          onPrimaryRgb: (bestVibrantR * 0.299 + bestVibrantG * 0.587 + bestVibrantB * 0.114) > 160 ? "0 0 0" : "255 255 255",
          glow: `rgba(${bestVibrantR}, ${bestVibrantG}, ${bestVibrantB}, 0.35)`,
          baseBg,
        });
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}
