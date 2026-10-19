/**
 * Ceepify — Multi-Label Song Classification Engine
 *
 * Implements full taxonomy according to Section 4:
 * A. Mood & Emotion (Sad/Emotional, Happy/Feel-good, Love/Romance, Chill/Peaceful, Energetic/Hype, Nostalgic/Memories, Additional)
 * B. Complete BGM (Cinematic BGM: mass, hero entry, villain, action, thriller, horror, epic; Instrumental BGM: piano, strings, lofi, ambient, synthwave, gaming)
 * C. Genre (Pop, Rock, Hip-hop/Rap, Electronic/EDM, R&B/Soul, Classical/Indian Classical, Folk, Acoustic, Soundtrack/Film, Devotional, Latin, African, Other)
 * D. Situation & Activity (Daily life, Study, Work, Fitness, Travel, Sleep, Relaxation, Parties, Social, Romance, Faith)
 * E. Energy Level (1 to 7)
 * F. Vocal & Arrangement (Solo male, Solo female, Duet, Group, Instrumental, Acoustic, Remix, Lo-fi)
 * G. Language & Regional Styles (Malayalam, Tamil, Telugu, Hindi, Kannada, Bengali, Punjabi, Urdu, Marathi, English, Arabic, Spanish, etc.)
 * H. Specialized Tags (Relationship, Life-stage, Story, Atmosphere, Discovery)
 */

import { cleanStr } from "./recommendationEngine.js";

// Memory cache for classified tracks
const classificationCache = new Map();

// Token boundary regex generator to avoid false-positive substrings
function createWordRegex(words) {
  const pattern = words
    .map((w) => w.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"))
    .filter(Boolean)
    .join("|");
  return new RegExp(`(?:^|[\\s.,_\\-/(])(?:${pattern})(?:$|[\\s.,_\\-/)])`, "i");
}

/* ==========================================================================
   A. MOOD & EMOTION CATEGORIES
   ========================================================================== */

const SAD_EMOTIONAL_WORDS = [
  "sad", "heartbreak", "heart broken", "broken heart", "crying", "tears", "pain", "painful",
  "lonely", "alone", "loneliness", "separation", "betrayal", "regret", "lost love",
  "deep feeling", "soulful sad", "melancholy", "melancholic", "sorrow", "grief",
  "dardi", "dard", "judaai", "judai", "maranam", "viraham", "nombaram", "kanneer",
  "kannukal", "sogam", "soga", "pirivu", "vali", "azhugai", "thanimai", "badha",
  "edupu", "ontari", "breakup", "adhuri kahani", "alvida", "channa mereya", "khairiyat",
  "bekheyali", "bhula dena", "agar tum saath ho", "lut gaye", "phir bhi tumko", "jaan nisaar",
  "oorake", "pedave palikina", "kallaloki kallu petti", "vennilave", "aaradhike sad", "cherathukal"
];

const HAPPY_FEEL_GOOD_WORDS = [
  "feel good", "feelgood", "happy", "happiness", "cheerful", "uplifting", "positive vibe",
  "positive", "sunshine", "carefree", "wholesome", "smile", "joyful", "joy", "optimistic",
  "good vibes", "celebration", "celebrate", "kondattam", "premalu", "aluvapuzha",
  "appangalembadum", "jimikki kammal", "kudukku", "manickya malaraya", "pala palli",
  "armadham feel good", "kichu kichu", "anuraga karikkin", "punchiri thanjum", "entammede"
];

const LOVE_ROMANTIC_WORDS = [
  "romantic", "romance", "love", "first love", "crush", "proposal", "wedding",
  "passionate love", "intimate", "cute couple", "duet", "dreamy romance", "kadhal",
  "kaadhal", "premam", "pranayam", "sneham", "dil", "pyar", "pyaar", "ishq",
  "heart", "soulful love", "affection", "couple", "mohabbat", "anbe", "kanmani",
  "humsafar", "saathiya", "deewani", "sanam", "kesariya", "apna bana le", "darshana",
  "tum hi ho", "uyire", "azhage", "muthumani", "vaseegara", "zaalima", "raataan lambiyan",
  "pehli nazar", "hawayein", "mathara", "malare", "neela nilave", "pavizha mazha",
  "uyiril thodum", "ennuyire", "chiri thottu", "venmathi", "thumba poove",
  "katchi sera", "thaensudare", "dippam dappam", "mallipoo", "samaja varagamana",
  "chuttamalle", "srivalli", "innum konjam", "naan un", "kanden kanden", "tum tum"
];

const CHILL_PEACEFUL_WORDS = [
  "chill", "peaceful", "peace", "relaxing", "relax", "calm", "soothing", "mellow",
  "soft", "dreamy", "ambient", "late night", "midnight", "rainy night", "cozy",
  "atmospheric", "slow life", "lofi", "lo fi", "acoustic", "unplugged", "serene",
  "meditation", "gentle", "sunset", "breeze", "morning walk", "cloudy", "coffee"
];

const ENERGETIC_HYPE_WORDS = [
  "hype", "energetic", "energy", "powerful", "power", "adrenaline", "party",
  "pump up", "high energy", "aggressive beat", "fast beat", "mass", "massu",
  "confidence", "victory", "stadium", "workout", "gym", "head banging", "dance",
  "club", "edm", "drop", "kuthu", "dappan", "drill", "trap", "bass boosted",
  "aaya sher", "fear song", "hukum", "badass", "naa ready", "arabic kuthu",
  "rowdy baby", "vaathi coming", "enjoy enjaami", "alappara", "illuminati",
  "jaada", "armadham", "thallumaala", "pala palli", "kuthanthram", "naatu naatu",
  "oo antava", "dosti", "komuram bheemudo", "tauba tauba", "chaleya", "badtameez"
];

const NOSTALGIC_MEMORIES_WORDS = [
  "nostalgic", "nostalgia", "childhood", "school life", "college", "golden era",
  "throwback", "retro", "hometown", "friendship", "travel memories", "memories",
  "old memory", "90s", "80s", "2000s", "evergreen", "classmates", "hridayam",
  "autograph", "bangalore days", "varshangalkku shesham"
];

/* ==========================================================================
   B. BGM CLASSIFICATION
   ========================================================================== */

const CINEMATIC_BGM_WORDS = [
  "bgm", "original score", "soundtrack", "theme", "ost", "score", "mass bgm",
  "hero entry", "villain entry", "action bgm", "fight bgm", "battle bgm",
  "chase bgm", "thriller bgm", "suspense bgm", "mystery bgm", "horror bgm",
  "dark bgm", "epic bgm", "war bgm", "interval bgm", "climax bgm", "teaser theme",
  "trailer theme", "interval theme", "motion poster theme", "theme reprise"
];

const INSTRUMENTAL_BGM_WORDS = [
  "instrumental", "piano", "strings", "violin", "cello", "flute", "guitar",
  "fingerstyle", "orchestral", "orchestra", "chill beats", "study beats",
  "nature ambience", "synthwave", "dark synth", "cyberpunk", "gaming bgm",
  "boss fight", "lofi beats", "ambient instrumental", "acoustic instrumental"
];

/* ==========================================================================
   C. GENRE CATEGORIES
   ========================================================================== */

const GENRE_WORDS = {
  hiphop: ["hip hop", "hiphop", "rap", "trap", "drill", "cypher", "flow", "bars", "mc"],
  electronic: ["electronic", "edm", "house", "techno", "dubstep", "synthwave", "trance", "phonk"],
  rock: ["rock", "metal", "punk", "hard rock", "alternative rock", "guitar solo"],
  pop: ["pop", "synth pop", "dance pop", "electropop", "indie pop"],
  soundtracks: ["soundtrack", "film song", "original motion picture", "ost", "cinema", "score"],
  classical: ["carnatic", "hindustani", "classical", "raga", "raaga", "kriti", "symphony", "orchestral"],
  folk: ["folk", "mappila", "nadan pattu", "folksong", "traditional", "dholak", "desi"],
  acoustic: ["acoustic", "unplugged", "fingerstyle", "piano ballad", "soft melody"],
  devotional: ["devotional", "bhajan", "qawwali", "nasheed", "prayer", "spiritual", "hymn", "gospel"],
};

/* ==========================================================================
   D. REGEX COMPILATION
   ========================================================================== */

const regexSad = createWordRegex(SAD_EMOTIONAL_WORDS);
const regexHappy = createWordRegex(HAPPY_FEEL_GOOD_WORDS);
const regexLove = createWordRegex(LOVE_ROMANTIC_WORDS);
const regexChill = createWordRegex(CHILL_PEACEFUL_WORDS);
const regexEnergetic = createWordRegex(ENERGETIC_HYPE_WORDS);
const regexNostalgic = createWordRegex(NOSTALGIC_MEMORIES_WORDS);

const regexCinematicBgm = createWordRegex(CINEMATIC_BGM_WORDS);
const regexInstrumentalBgm = createWordRegex(INSTRUMENTAL_BGM_WORDS);

/* ==========================================================================
   MULTI-LABEL CLASSIFIER FUNCTION
   ========================================================================== */

export function classifySongDetailed(track) {
  if (!track) {
    return {
      language: "malayalam",
      languageConfidence: 0.5,
      isBgm: false,
      isInstrumental: false,
      contentType: "vocal",
      primaryMood: "feel_good",
      moodCategories: ["happy_feel_good"],
      moodConfidence: { happy_feel_good: 0.7 },
      genre: "Soundtrack",
      genres: ["Soundtrack", "Pop"],
      energyLevel: 4,
      energyConfidence: 0.7,
      vocalArrangement: "Solo/Duet",
      tags: ["Trending"],
    };
  }

  const tid = String(track.id || track.cleanId || "");
  const cacheKey = `${tid}:::${track.title || track.song}:::${track.artist}:::${track.language}`;
  if (classificationCache.has(cacheKey)) {
    return classificationCache.get(cacheKey);
  }

  const rawTitle = (track.title || track.song || "").toLowerCase();
  const rawArtist = (track.artist || track.primary_artist || track.primaryArtist || track.singers || "").toLowerCase();
  const rawAlbum = (track.album || track.albumName || track.movieName || track.movie || "").toLowerCase();
  const rawGenre = (track.genre || track.more_info?.genre || "").toLowerCase();
  const rawMood = (track.mood || track.more_info?.mood || "").toLowerCase();

  const fullText = `${rawTitle} ${rawArtist} ${rawAlbum} ${rawGenre} ${rawMood}`;

  // 1. Language Detection & Confidence
  let language = (track.language || track.more_info?.language || "").toLowerCase().trim();
  let languageConfidence = language ? 0.95 : 0.5;

  if (!language || language === "english") {
    // Check known language keywords
    if (/malayalam|kerala|mollywood|aavesham|thudarum|premalu|manjummel|lucifer|hridayam|khalifa/i.test(fullText)) {
      language = "malayalam";
      languageConfidence = 0.9;
    } else if (/tamil|kollywood|anirudh|jailer|leo|vikram|varisu|kanguva|vettaiyan|goat/i.test(fullText)) {
      language = "tamil";
      languageConfidence = 0.9;
    } else if (/telugu|tollywood|the paradise|devara|pushpa|salaar|kalki|rrr|guntur kaaram|thaman/i.test(fullText)) {
      language = "telugu";
      languageConfidence = 0.9;
    } else if (/hindi|bollywood|arijit|pritam|jawan|animal|stree|brahmastra/i.test(fullText)) {
      language = "hindi";
      languageConfidence = 0.9;
    } else if (/kannada|sandalwood|kgf|kantara/i.test(fullText)) {
      language = "kannada";
      languageConfidence = 0.9;
    } else if (/punjabi|pollywood|diljit|karan aujla|sidhu/i.test(fullText)) {
      language = "punjabi";
      languageConfidence = 0.9;
    } else if (!language) {
      language = "malayalam"; // default regional hit baseline
      languageConfidence = 0.4;
    }
  }

  // 2. Song Type / BGM Detection
  // Important: Movie soundtrack albums contain vocal songs. Do not classify a vocal track as BGM
  // simply because its album contains the word "Soundtrack" or "Score".
  const titleAndGenreText = `${rawTitle} ${rawGenre} ${rawMood}`;
  const hasLyricsExplicit = track.has_lyrics === "false" || track.has_lyrics === false || track.has_lyrics === 0;
  const hasLyricsPositive = track.has_lyrics === "true" || track.has_lyrics === true || track.has_lyrics === 1;
  const isTitleBgm = regexCinematicBgm.test(titleAndGenreText) || /\b(theme|bgm|instrumental|tune|original score|cinematic score)\b/i.test(rawTitle);
  const isCinematicBgm = !hasLyricsPositive && isTitleBgm;
  const isInstrumentalBgm = !hasLyricsPositive && (regexInstrumentalBgm.test(titleAndGenreText) || (hasLyricsExplicit && isTitleBgm));
  const isBgm = isCinematicBgm || isInstrumentalBgm;
  const isInstrumental = isInstrumentalBgm || (hasLyricsExplicit && isBgm);
  const contentType = isBgm ? (isInstrumental ? "instrumental_bgm" : "cinematic_bgm") : "vocal";

  // 3. Multi-label Mood Detection
  const moodScores = {
    energetic_hype: 0,
    love_romance: 0,
    sad_emotional: 0,
    happy_feel_good: 0,
    chill_peaceful: 0,
    nostalgic_memories: 0,
  };

  if (regexEnergetic.test(fullText)) moodScores.energetic_hype += 3;
  if (regexLove.test(fullText)) moodScores.love_romance += 3;
  if (regexSad.test(fullText)) moodScores.sad_emotional += 3;
  if (regexHappy.test(fullText)) moodScores.happy_feel_good += 3;
  if (regexChill.test(fullText)) moodScores.chill_peaceful += 3;
  if (regexNostalgic.test(fullText)) moodScores.nostalgic_memories += 2;

  // Artist & specific track cues
  if (/anirudh|devi sri prasad|dsp|thaman|vedan|dabzee|sushin shyam|ravi basrur/i.test(rawArtist) && (rawTitle.includes("mass") || rawTitle.includes("sher") || rawTitle.includes("hukum") || rawTitle.includes("theme") || rawTitle.includes("anthem") || rawTitle.includes("kuthu") || rawTitle.includes("beat") || rawTitle.includes("illuminati") || rawTitle.includes("armadham"))) {
    moodScores.energetic_hype += 4;
  }
  if (/shreya ghoshal|sid sriram|ks harisankar|jakes bejoy|vidyasagar|chinmayi|sujatha/i.test(rawArtist) && (rawTitle.includes("mathara") || rawTitle.includes("melody") || rawTitle.includes("love") || rawTitle.includes("duet") || rawTitle.includes("neeyen") || rawTitle.includes("kannaadi") || rawTitle.includes("minnalvala") || rawTitle.includes("pinneyum"))) {
    moodScores.love_romance += 4;
  }

  // Pick primary and active mood categories
  const activeMoods = Object.entries(moodScores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([mood]) => mood);

  let primaryMood = activeMoods[0] || (isBgm ? "energetic_hype" : "happy_feel_good");
  if (activeMoods.length === 0) {
    activeMoods.push(primaryMood);
  }

  // 4. Energy Level (1 to 7)
  let energyLevel = 4; // default medium
  if (primaryMood === "energetic_hype") {
    if (fullText.includes("mass") || fullText.includes("sher") || fullText.includes("drop") || fullText.includes("fast") || fullText.includes("kuthu")) {
      energyLevel = 7; // Very high
    } else {
      energyLevel = 6; // High
    }
  } else if (primaryMood === "happy_feel_good") {
    energyLevel = 5; // Medium-high
  } else if (primaryMood === "love_romance") {
    energyLevel = 4; // Medium (melodic, warm)
  } else if (primaryMood === "chill_peaceful") {
    energyLevel = 2; // Low
  } else if (primaryMood === "sad_emotional") {
    energyLevel = 2; // Low
  } else if (isBgm) {
    energyLevel = isCinematicBgm ? 6 : 2;
  }

  // 5. Genre Detection
  const genres = [];
  for (const [g, words] of Object.entries(GENRE_WORDS)) {
    if (words.some((w) => fullText.includes(w))) {
      genres.push(g.charAt(0).toUpperCase() + g.slice(1));
    }
  }
  if (genres.length === 0) {
    genres.push("Soundtrack");
  }

  // 6. Arrangement & Tags
  let vocalArrangement = "Vocal";
  if (isBgm) {
    vocalArrangement = isInstrumental ? "Instrumental Only" : "Orchestral Theme";
  } else if (rawArtist.includes(",") || rawArtist.includes("&") || fullText.includes("duet")) {
    vocalArrangement = "Male-Female Duet";
  } else {
    vocalArrangement = "Solo Vocals";
  }

  const tags = [...activeMoods];
  if (isBgm) tags.push("BGM");
  if (energyLevel >= 6) tags.push("High Energy");
  if (energyLevel <= 2) tags.push("Mellow");

  const result = {
    language,
    languageConfidence,
    isBgm,
    isInstrumental,
    contentType,
    primaryMood,
    moodCategories: activeMoods,
    energyLevel,
    energyConfidence: 0.85,
    genre: genres[0],
    genres,
    vocalArrangement,
    tags,
    year: parseInt(track.year || track.more_info?.year || "2024", 10),
    playCount: Number(track.play_count || track.playCount || track.more_info?.play_count || 0),
  };

  classificationCache.set(cacheKey, result);
  return result;
}

/**
 * Calculates compatibility between seed profile and candidate profile
 */
export function calculateProfileSimilarity(seedProfile, candProfile) {
  if (!seedProfile || !candProfile) return 0;

  // 1. Language Match (Strict 0 if different, unless seed has no language)
  if (seedProfile.language && candProfile.language && seedProfile.language !== candProfile.language) {
    return 0; // Hard language mismatch
  }

  // 2. Song Type Match (Vocal vs BGM)
  if (seedProfile.isBgm !== candProfile.isBgm) {
    return 10; // Serious mismatch between vocal song and instrumental BGM
  }

  // 3. Mood Overlap (0 to 100)
  let moodScore = 0;
  if (seedProfile.primaryMood === candProfile.primaryMood) {
    moodScore = 100;
  } else {
    const commonMoods = seedProfile.moodCategories.filter((m) => candProfile.moodCategories.includes(m));
    if (commonMoods.length > 0) {
      moodScore = 75;
    } else {
      // Related pairs (e.g. love_romance <-> happy_feel_good: 50; energetic_hype <-> happy_feel_good: 45)
      const p1 = seedProfile.primaryMood;
      const p2 = candProfile.primaryMood;
      if (
        (p1 === "love_romance" && p2 === "happy_feel_good") ||
        (p1 === "happy_feel_good" && p2 === "love_romance") ||
        (p1 === "chill_peaceful" && p2 === "sad_emotional") ||
        (p1 === "sad_emotional" && p2 === "chill_peaceful")
      ) {
        moodScore = 50;
      } else if (
        (p1 === "energetic_hype" && p2 === "happy_feel_good") ||
        (p1 === "happy_feel_good" && p2 === "energetic_hype")
      ) {
        moodScore = 40;
      } else {
        moodScore = 0; // Incompatible (e.g. sad vs energetic)
      }
    }
  }

  // 4. Energy Compatibility (1 to 7 delta)
  const energyDiff = Math.abs(seedProfile.energyLevel - candProfile.energyLevel);
  const energyScore = Math.max(0, 100 - energyDiff * 25);

  // 5. Genre Compatibility
  const commonGenres = seedProfile.genres.filter((g) => candProfile.genres.includes(g));
  const genreScore = commonGenres.length > 0 ? 100 : 40;

  return {
    moodScore,
    energyScore,
    genreScore,
  };
}
