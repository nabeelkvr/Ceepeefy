/**
 * Multilingual Lyrics Text Processor
 *
 * Handles:
 * 1. Accurate script detection (Malayalam, Devanagari, Tamil, Telugu, Kannada, Latin)
 * 2. Track language identification
 * 3. Script normalization and transliteration according to Section 5:
 *    - Malayalam: MUST display in Malayalam script
 *    - Tamil: Prefer Romanized Tamil (Latin script)
 *    - Hindi: Prefer Romanized Hindi (Latin script)
 *    - Telugu: Prefer Romanized Telugu (Latin script)
 *    - Kannada: Prefer Romanized Kannada (Latin script)
 *    - English: Retain original English lyrics
 */

import { SCRIPT_TYPES } from "./types.js";

/**
 * Strips HTML tags, entities, and excessive whitespace
 */
export function cleanLyricsString(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/**
 * Detects the dominant writing script of a lyrics block
 */
export function detectScript(text) {
  if (!text || typeof text !== "string") return SCRIPT_TYPES.UNKNOWN;

  let malayalamCount = 0;
  let devanagariCount = 0;
  let tamilCount = 0;
  let teluguCount = 0;
  let kannadaCount = 0;
  let bengaliCount = 0;
  let latinCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0D00 && code <= 0x0D7F) malayalamCount++;
    else if (code >= 0x0900 && code <= 0x097F) devanagariCount++;
    else if (code >= 0x0B80 && code <= 0x0BFF) tamilCount++;
    else if (code >= 0x0C00 && code <= 0x0C7F) teluguCount++;
    else if (code >= 0x0C80 && code <= 0x0CFF) kannadaCount++;
    else if (code >= 0x0980 && code <= 0x09FF) bengaliCount++;
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) latinCount++;
  }

  const scores = [
    { script: SCRIPT_TYPES.MALAYALAM, count: malayalamCount },
    { script: SCRIPT_TYPES.DEVANAGARI, count: devanagariCount },
    { script: SCRIPT_TYPES.TAMIL, count: tamilCount },
    { script: SCRIPT_TYPES.TELUGU, count: teluguCount },
    { script: SCRIPT_TYPES.KANNADA, count: kannadaCount },
    { script: SCRIPT_TYPES.BENGALI, count: bengaliCount },
    { script: SCRIPT_TYPES.LATIN, count: latinCount },
  ];

  scores.sort((a, b) => b.count - a.count);
  return scores[0].count > 0 ? scores[0].script : SCRIPT_TYPES.UNKNOWN;
}

/**
 * Infers language from track metadata and script
 */
export function detectLanguage(text, trackMeta = {}) {
  const metaLang = (
    trackMeta.language ||
    trackMeta.more_info?.language ||
    trackMeta.detectedLanguage ||
    ""
  ).toLowerCase().trim();

  if (metaLang) {
    if (metaLang.includes("malayalam")) return "malayalam";
    if (metaLang.includes("tamil")) return "tamil";
    if (metaLang.includes("hindi")) return "hindi";
    if (metaLang.includes("telugu")) return "telugu";
    if (metaLang.includes("kannada")) return "kannada";
    if (metaLang.includes("english")) return "english";
    if (metaLang.includes("punjabi")) return "punjabi";
    if (metaLang.includes("bengali")) return "bengali";
    if (metaLang.includes("marathi")) return "marathi";
  }

  // Fallback to script-based detection
  const script = detectScript(text);
  if (script === SCRIPT_TYPES.MALAYALAM) return "malayalam";
  if (script === SCRIPT_TYPES.TAMIL) return "tamil";
  if (script === SCRIPT_TYPES.TELUGU) return "telugu";
  if (script === SCRIPT_TYPES.KANNADA) return "kannada";
  if (script === SCRIPT_TYPES.BENGALI) return "bengali";
  if (script === SCRIPT_TYPES.DEVANAGARI) return "hindi";

  return "english";
}

/* ==========================================================================
   TRANSLITERATION ENGINE
   ========================================================================== */

const DEVANAGARI_MAP = {
  vowels: {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "am", "अः": "ah",
  },
  matras: {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ँ": "n", "ः": "h", "्": "",
  },
  consonants: {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy",
    "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f"
  }
};

export function transliterateDevanagariToLatin(text) {
  if (!text) return "";
  let result = "";
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const nextCh = i + 1 < len ? text[i + 1] : "";

    if (DEVANAGARI_MAP.vowels[ch]) {
      result += DEVANAGARI_MAP.vowels[ch];
      continue;
    }

    if (DEVANAGARI_MAP.matras[ch] !== undefined) {
      result += DEVANAGARI_MAP.matras[ch];
      continue;
    }

    if (DEVANAGARI_MAP.consonants[ch]) {
      const rom = DEVANAGARI_MAP.consonants[ch];
      if (nextCh === "्") {
        result += rom;
        i++;
      } else if (DEVANAGARI_MAP.matras[nextCh] !== undefined) {
        result += rom;
      } else if (nextCh === "" || /\s|[.,!?;:()\[\]"\'-]/.test(nextCh)) {
        result += rom;
      } else {
        result += rom + "a";
      }
      continue;
    }

    result += ch;
  }

  return result;
}

const TAMIL_MAP = {
  vowels: {
    "அ": "a", "ஆ": "aa", "இ": "i", "ஈ": "ee", "உ": "u", "ஊ": "oo",
    "எ": "e", "ஏ": "ae", "ஐ": "ai", "ஒ": "o", "ஓ": "oa", "ஔ": "au",
  },
  matras: {
    "ா": "aa", "ி": "i", "ீ": "ee", "ு": "u", "ூ": "oo",
    "ெ": "e", "ே": "ae", "ை": "ai", "ொ": "o", "ோ": "oa", "ௌ": "au", "்": "",
  },
  consonants: {
    "க": "k", "ங": "ng", "ச": "s", "ஞ": "ny", "ட": "t", "ண": "n",
    "த": "th", "ந": "n", "ப": "p", "ம": "m", "ய": "y", "ர": "r",
    "ல": "l", "வ": "v", "ழ": "zh", "ள": "l", "ற": "r", "ன": "n",
    "ஜ": "j", "ஷ": "sh", "ஸ": "s", "ஹ": "h",
  }
};

export function transliterateTamilToLatin(text) {
  if (!text) return "";
  let result = "";
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const nextCh = i + 1 < len ? text[i + 1] : "";

    if (TAMIL_MAP.vowels[ch]) {
      result += TAMIL_MAP.vowels[ch];
      continue;
    }

    if (TAMIL_MAP.matras[ch] !== undefined) {
      result += TAMIL_MAP.matras[ch];
      continue;
    }

    if (TAMIL_MAP.consonants[ch]) {
      const rom = TAMIL_MAP.consonants[ch];
      if (nextCh === "்") {
        result += rom;
        i++;
      } else if (TAMIL_MAP.matras[nextCh] !== undefined) {
        result += rom;
      } else {
        result += rom + "a";
      }
      continue;
    }

    result += ch;
  }
  return result;
}

const TELUGU_MAP = {
  vowels: {
    "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ee", "ఉ": "u", "ఊ": "oo",
    "ఋ": "ri", "ఎ": "e", "ఏ": "ae", "ఐ": "ai", "ఒ": "o", "ఓ": "oa", "ఔ": "au",
  },
  matras: {
    "ా": "aa", "ి": "i", "ీ": "ee", "ు": "u", "ూ": "oo", "ృ": "ri",
    "ె": "e", "ే": "ae", "ై": "ai", "ొ": "o", "ో": "oa", "ౌ": "au", "ం": "m", "్": "",
  },
  consonants: {
    "క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "ng",
    "చ": "ch", "ఛ": "chh", "జ": "j", "ఝ": "jh", "ఞ": "ny",
    "ట": "t", "ఠ": "th", "డ": "d", "ఢ": "dh", "ణ": "n",
    "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n",
    "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m",
    "య": "y", "ర": "r", "ల": "l", "వ": "v", "శ": "sh", "ష": "sh", "స": "s", "హ": "h",
    "ళ": "l",
  }
};

export function transliterateTeluguToLatin(text) {
  if (!text) return "";
  let result = "";
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const nextCh = i + 1 < len ? text[i + 1] : "";

    if (TELUGU_MAP.vowels[ch]) {
      result += TELUGU_MAP.vowels[ch];
      continue;
    }
    if (TELUGU_MAP.matras[ch] !== undefined) {
      result += TELUGU_MAP.matras[ch];
      continue;
    }
    if (TELUGU_MAP.consonants[ch]) {
      const rom = TELUGU_MAP.consonants[ch];
      if (nextCh === "్") {
        result += rom;
        i++;
      } else if (TELUGU_MAP.matras[nextCh] !== undefined) {
        result += rom;
      } else {
        result += rom + "a";
      }
      continue;
    }
    result += ch;
  }
  return result;
}

const KANNADA_MAP = {
  vowels: {
    "ಅ": "a", "ಆ": "aa", "ಇ": "i", "ಈ": "ee", "ಉ": "u", "ಊ": "oo",
    "ಋ": "ri", "ಎ": "e", "ಏ": "ae", "ಐ": "ai", "ಒ": "o", "ಓ": "oa", "ಔ": "au",
  },
  matras: {
    "ಾ": "aa", "ಿ": "i", "ೀ": "ee", "ು": "u", "ೂ": "oo", "ೃ": "ri",
    "ೆ": "e", "ೇ": "ae", "ೈ": "ai", "ೊ": "o", "ೋ": "oa", "ೌ": "au", "ಂ": "m", "್": "",
  },
  consonants: {
    "ಕ": "k", "ಖ": "kh", "ಗ": "g", "ಘ": "gh", "ಙ": "ng",
    "ಚ": "ch", "ಛ": "chh", "ಜ": "j", "ಝ": "jh", "ಞ": "ny",
    "ಟ": "t", "ಠ": "th", "ಡ": "d", "ಢ": "dh", "ಣ": "n",
    "ತ": "t", "ಥ": "th", "ದ": "d", "ಧ": "dh", "ನ": "n",
    "ಪ": "p", "ಫ": "ph", "ಬ": "b", "ಭ": "bh", "ಮ": "m",
    "ಯ": "y", "ರ": "r", "ಲ": "l", "ವ": "v", "ಶ": "sh", "ಷ": "sh", "ಸ": "s", "ಹ": "h",
    "ಳ": "l",
  }
};

export function transliterateKannadaToLatin(text) {
  if (!text) return "";
  let result = "";
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const nextCh = i + 1 < len ? text[i + 1] : "";

    if (KANNADA_MAP.vowels[ch]) {
      result += KANNADA_MAP.vowels[ch];
      continue;
    }
    if (KANNADA_MAP.matras[ch] !== undefined) {
      result += KANNADA_MAP.matras[ch];
      continue;
    }
    if (KANNADA_MAP.consonants[ch]) {
      const rom = KANNADA_MAP.consonants[ch];
      if (nextCh === "್") {
        result += rom;
        i++;
      } else if (KANNADA_MAP.matras[nextCh] !== undefined) {
        result += rom;
      } else {
        result += rom + "a";
      }
      continue;
    }
    result += ch;
  }
  return result;
}

const MALAYALAM_MAP = {
  vowels: {
    "അ": "a", "ആ": "aa", "ഇ": "i", "ഈ": "ee", "ഉ": "u", "ഊ": "oo",
    "ഋ": "ri", "എ": "e", "ഏ": "ae", "ഐ": "ai", "ഒ": "o", "ഓ": "oa", "ഔ": "au",
  },
  matras: {
    "ാ": "aa", "ി": "i", "ീ": "ee", "ു": "u", "ൂ": "oo", "ൃ": "ri",
    "െ": "e", "േ": "ae", "ൈ": "ai", "ൊ": "o", "ോ": "oa", "ൌ": "au", "ൗ": "au", "ം": "m", "്": "",
  },
  chillus: {
    "ൺ": "n", "ൻ": "n", "ർ": "r", "ൽ": "l", "ൾ": "l", "ൿ": "k",
  },
  consonants: {
    "ക": "k", "ഖ": "kh", "ഗ": "g", "ഘ": "gh", "ങ": "ng",
    "ച": "ch", "ഛ": "chh", "ജ": "j", "ഝ": "jh", "ഞ": "ny",
    "ട": "t", "ഠ": "th", "ഡ": "d", "ഢ": "dh", "ണ": "n",
    "ത": "th", "ഥ": "th", "ദ": "d", "ധ": "dh", "ന": "n",
    "പ": "p", "ഫ": "ph", "ബ": "b", "ഭ": "bh", "മ": "m",
    "യ": "y", "ര": "r", "ല": "l", "വ": "v",
    "ശ": "sh", "ഷ": "sh", "സ": "s", "ഹ": "h",
    "ള": "l", "ഴ": "zh", "റ": "r",
  }
};

export function transliterateMalayalamToLatin(text) {
  if (!text) return "";
  let result = "";
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const nextCh = i + 1 < len ? text[i + 1] : "";

    if (MALAYALAM_MAP.vowels[ch]) {
      result += MALAYALAM_MAP.vowels[ch];
      continue;
    }
    if (MALAYALAM_MAP.matras[ch] !== undefined) {
      result += MALAYALAM_MAP.matras[ch];
      continue;
    }
    if (MALAYALAM_MAP.chillus[ch]) {
      result += MALAYALAM_MAP.chillus[ch];
      continue;
    }
    if (MALAYALAM_MAP.consonants[ch]) {
      const rom = MALAYALAM_MAP.consonants[ch];
      if (nextCh === "്") {
        result += rom;
        i++;
      } else if (MALAYALAM_MAP.matras[nextCh] !== undefined) {
        result += rom;
      } else if (nextCh === "" || /\s|[.,!?;:()\[\]"\'-]/.test(nextCh)) {
        result += rom;
      } else {
        result += rom + "a";
      }
      continue;
    }
    result += ch;
  }
  return result;
}

export const COMMON_INDIC_WORDS = {
  "होली": "holi",
  "दीवाली": "diwali",
  "दिवाली": "diwali",
  "जिंदगी": "zindagi",
  "प्यार": "pyaar",
  "दिल": "dil",
  "इश्क": "ishq",
  "रंगोली": "rangoli",
  "ரங்கோலி": "rangoli",
  "ஹோலி": "holi",
  "दीवाना": "deewana",
};

/**
 * Universal multi-script transliterator
 * Detects any Indic Unicode blocks (Devanagari, Tamil, Telugu, Kannada, Malayalam)
 * and safely converts them to Latin script, leaving English words, punctuation,
 * and LRC timestamps untouched.
 */
export function transliterateAnyIndicToLatin(text) {
  if (!text || typeof text !== "string") return "";

  const indicRegex = /[\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]+/g;

  return text.replace(indicRegex, (match) => {
    if (COMMON_INDIC_WORDS[match]) {
      return COMMON_INDIC_WORDS[match];
    }
    if (/[\u0900-\u097F]/.test(match)) {
      return transliterateDevanagariToLatin(match);
    }
    if (/[\u0B80-\u0BFF]/.test(match)) {
      return transliterateTamilToLatin(match);
    }
    if (/[\u0C00-\u0C7F]/.test(match)) {
      return transliterateTeluguToLatin(match);
    }
    if (/[\u0C80-\u0CFF]/.test(match)) {
      return transliterateKannadaToLatin(match);
    }
    if (/[\u0D00-\u0D7F]/.test(match)) {
      return transliterateMalayalamToLatin(match);
    }
    return match;
  });
}

const MANGLISH_CONSONANTS = [
  { rom: "nch", mal: "ഞ്ച" },
  { rom: "njnj", mal: "ഞ്ഞ" },
  { rom: "ngng", mal: "ങ്ങ" },
  { rom: "thth", mal: "ത്ത" },
  { rom: "tth", mal: "ത്ത" },
  { rom: "chch", mal: "ച്ച" },
  { rom: "cch", mal: "ച്ച" },
  { rom: "nj", mal: "ഞ്ഞ" },
  { rom: "ng", mal: "ങ്ങ" },
  { rom: "ch", mal: "ച" },
  { rom: "th", mal: "ത" },
  { rom: "zh", mal: "ഴ" },
  { rom: "sh", mal: "ശ" },
  { rom: "ph", mal: "ഫ" },
  { rom: "bh", mal: "ഭ" },
  { rom: "dh", mal: "ധ" },
  { rom: "gh", mal: "ഘ" },
  { rom: "kh", mal: "ഖ" },
  { rom: "jh", mal: "ഝ" },
  { rom: "kk", mal: "ക്ക" },
  { rom: "tt", mal: "ട്ട" },
  { rom: "pp", mal: "പ്പ" },
  { rom: "mm", mal: "മ്മ" },
  { rom: "nn", mal: "ന്ന" },
  { rom: "ll", mal: "ല്ല" },
  { rom: "bb", mal: "ബ്ബ" },
  { rom: "dd", mal: "ഡ്ഡ" },
  { rom: "nd", mal: "ന്ദ" }, // In song lyrics, nd is mostly dental 'ന്ദ' (sandehi, sundari, anandam)
  { rom: "nt", mal: "ന്റ" },
  { rom: "nk", mal: "ങ്ക" },
  { rom: "mp", mal: "മ്പ" },
  { rom: "k", mal: "ക" },
  { rom: "g", mal: "ഗ" },
  { rom: "j", mal: "ജ" },
  { rom: "t", mal: "ട" },
  { rom: "d", mal: "ദ" },
  { rom: "n", mal: "ന" },
  { rom: "p", mal: "പ" },
  { rom: "b", mal: "ബ" },
  { rom: "m", mal: "മ" },
  { rom: "y", mal: "യ" },
  { rom: "r", mal: "ര" },
  { rom: "l", mal: "ല" },
  { rom: "v", mal: "വ" },
  { rom: "w", mal: "വ" },
  { rom: "s", mal: "സ" },
  { rom: "h", mal: "ഹ" },
];

const MANGLISH_VOWELS = [
  { rom: "aa", initial: "ആ", matra: "ാ" },
  { rom: "ee", initial: "ഈ", matra: "ീ" },
  { rom: "oo", initial: "ഊ", matra: "ൂ" },
  { rom: "ai", initial: "ഐ", matra: "ൈ" },
  { rom: "au", initial: "ഔ", matra: "ൌ" },
  { rom: "ou", initial: "ഔ", matra: "ൌ" },
  { rom: "a", initial: "അ", matra: "" },
  { rom: "i", initial: "ഇ", matra: "ി" },
  { rom: "u", initial: "ഉ", matra: "ു" },
  { rom: "e", initial: "എ", matra: "െ" },
  { rom: "o", initial: "ഒ", matra: "ൊ" },
];

// Special high-frequency Manglish song vocabulary mappings
const SPECIAL_MANGLISH_WORDS = {
  njan: "ഞാൻ",
  njaan: "ഞാൻ",
  rabbe: "റബ്ബേ",
  ya: "യാ",
  yaa: "യാ",
  vedana: "വേദന",
  kaathu: "കാത്തു",
  kathu: "കാത്തു",
  oruvela: "ഒരു വേള",
  sandehi: "സന്ദേഹി",
  sandehiyai: "സന്ദേഹിയായി",
  sandehiyaayi: "സന്ദേഹിയായി",
  thangi: "തങ്ങി",
  mangi: "മങ്ങി",
  chornnu: "ചോർന്ന്",
  chornn: "ചോർന്ന്",
  priyamerum: "പ്രിയമേറും",
  kazhiyilla: "കഴിയില്ല",
  kazhiyulla: "കഴിയൂല",
  kazhiyoola: "കഴിയൂല",
  kabaril: "കബറിൽ",
  pokathe: "പോകാതെ",
  manjooriya: "മഞ്ഞൂറിയ",
  thanuneerum: "തണുനീരും",
  thanneerum: "തണ്ണീരും",
  melkuliranai: "മേൽക്കുളിരനായ്",
  melkuliranaayi: "മേൽക്കുളിരനായ്",
};

function transliterateWordManglishToMalayalam(word) {
  if (!word) return "";
  const w = word.toLowerCase();

  // Check direct special song vocabulary
  if (SPECIAL_MANGLISH_WORDS[w]) {
    return SPECIAL_MANGLISH_WORDS[w];
  }

  let i = 0;
  let out = "";
  let lastWasConsonant = false;

  while (i < w.length) {
    let matchedVowel = null;
    for (const v of MANGLISH_VOWELS) {
      if (w.startsWith(v.rom, i)) {
        matchedVowel = v;
        break;
      }
    }

    if (matchedVowel) {
      if (lastWasConsonant) {
        // If word-final 'e' on multi-syllable word (e.g. rabbe, pokathe), prefer long 'േ'
        if (matchedVowel.rom === "e" && i + 1 === w.length && out.length > 1) {
          out += "േ";
        } else {
          out += matchedVowel.matra;
        }
      } else {
        out += matchedVowel.initial;
      }
      i += matchedVowel.rom.length;
      lastWasConsonant = false;
      continue;
    }

    let matchedConsonant = null;
    for (const c of MANGLISH_CONSONANTS) {
      if (w.startsWith(c.rom, i)) {
        matchedConsonant = c;
        break;
      }
    }

    if (matchedConsonant) {
      if (lastWasConsonant) {
        out += "്";
      }
      out += matchedConsonant.mal;
      i += matchedConsonant.rom.length;
      lastWasConsonant = true;
      continue;
    }

    const ch = w[i];
    out += ch;
    i++;
    lastWasConsonant = false;
  }

  if (lastWasConsonant) {
    if (out.endsWith("ന")) out = out.slice(0, -1) + "ൻ";
    else if (out.endsWith("ര")) out = out.slice(0, -1) + "ർ";
    else if (out.endsWith("ല")) out = out.slice(0, -1) + "ൽ";
    else if (out.endsWith("മ")) out = out.slice(0, -1) + "ം";
    else out += "്";
  }

  return out;
}

export function transliterateManglishToMalayalam(text) {
  if (!text) return "";
  // Clean abnormal stutter hyphens between Roman words (e.g. "thaandukayal-aal-akale-akale")
  const sanitized = text
    .replace(/([a-zA-Z])-([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ");

  return sanitized.replace(/[a-zA-Z]+/g, (match) => {
    return transliterateWordManglishToMalayalam(match);
  });
}

/**
 * Main coordinator for Language and Script Processing (Section 5 & 6)
 */
export function processLyricsLanguageAndScript(rawLyricsText, rawLines = [], trackMeta = {}) {
  const cleanedText = cleanLyricsString(rawLyricsText);
  const detectedLang = detectLanguage(cleanedText, trackMeta);
  const origScript = detectScript(cleanedText);

  let targetScript = SCRIPT_TYPES.LATIN;
  let transformFn = (str) => str;

  if (detectedLang === "malayalam") {
    targetScript = SCRIPT_TYPES.MALAYALAM;
    if (origScript === SCRIPT_TYPES.LATIN) {
      // Romanized Manglish -> convert to Malayalam script
      transformFn = transliterateManglishToMalayalam;
    } else {
      // Primarily Malayalam script: convert any stray Manglish lines or stray foreign Indic characters
      transformFn = (str) => {
        if (!str) return "";
        const lineScript = detectScript(str);
        if (lineScript === SCRIPT_TYPES.LATIN) {
          return transliterateManglishToMalayalam(str);
        }
        if (/[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF]/.test(str)) {
          const latinized = transliterateAnyIndicToLatin(str);
          return transliterateManglishToMalayalam(latinized);
        }
        return str;
      };
    }
  } else {
    // All other songs (Tamil, Hindi, Telugu, Kannada, English, Punjabi, etc.)
    // MUST display in English / Latin script!
    targetScript = SCRIPT_TYPES.LATIN;

    transformFn = (str) => {
      if (!str) return "";
      let processed = str;
      if (/[\u0900-\u097F]/.test(processed) && (detectedLang === "hindi" || detectedLang === "marathi")) {
        processed = transliterateDevanagariToLatin(processed);
      } else if (/[\u0B80-\u0BFF]/.test(processed) && detectedLang === "tamil") {
        processed = transliterateTamilToLatin(processed);
      } else if (/[\u0C00-\u0C7F]/.test(processed) && detectedLang === "telugu") {
        processed = transliterateTeluguToLatin(processed);
      } else if (/[\u0C80-\u0CFF]/.test(processed) && detectedLang === "kannada") {
        processed = transliterateKannadaToLatin(processed);
      }

      // Universal multi-script transliteration:
      // Eliminates any embedded Indic characters (such as Devanagari 'होली, होली' in Tamil/English lines)
      return transliterateAnyIndicToLatin(processed);
    };
  }

  // Transform display lyrics while strictly preserving original text
  const displayLyrics = transformFn(cleanedText);
  const displayScript = detectScript(displayLyrics);

  // Transform lines array if provided, preserving timestamps and line boundaries
  const transformedLines = Array.isArray(rawLines)
    ? rawLines.map((line) => {
        if (!line || typeof line !== "object") return line;
        const cleanedLineText = cleanLyricsString(line.text || "");
        return {
          time: line.time,
          text: transformFn(cleanedLineText),
          originalText: cleanedLineText,
        };
      })
    : [];

  return {
    detectedLanguage: detectedLang,
    originalScript: origScript,
    displayScript,
    originalLyrics: cleanedText,
    displayLyrics,
    lines: transformedLines,
  };
}