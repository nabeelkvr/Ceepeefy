import { classifySongDetailed } from "./songClassifier.js";

/**
 * Ceepify — Intelligent Automatic Queue Algorithm & Recommendation Engine
 *
 * Implements the deterministic Priority Hierarchy & Scoring System:
 * 1. SAME LANGUAGE — HIGHEST PRIORITY (Weight: 35)
 * 2. SAME SONG TYPE / MOOD — VERY HIGH PRIORITY (Weight: 30)
 * 3. TRENDING / POPULARITY — HIGH PRIORITY (Weight: 20)
 * 4. ARTIST DIVERSITY & PUZZLE FACTOR — LOW PRIORITY (Weight: 10)
 * 5. CONTROLLED RANDOMNESS & DISCOVERY FACTOR (Weight: 5)
 *
 * Scoring Formula:
 * Queue Score = (Language Match * 35) + (Mood Match * 30) + (Popularity * 20) + (Artist Diversity * 10) + (Discovery Factor * 5)
 */

/**
 * Normalizes text for clean string comparisons
 */
export function cleanStr(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes noisy qualifiers from movie / album titles
 */
export function normalizeMovieAlbum(rawAlbum) {
  if (!rawAlbum || typeof rawAlbum !== "string") return "";
  let clean = rawAlbum
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(
      /\s*[\(\[](?:original\s+motion\s+picture\s+soundtrack|motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack|ost|from\s+[^)\]]+|audio|album|ep|single|deluxe|remaster(?:ed)?|edition|vol\.?\s*\d*)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(?:original\s+motion\s+picture\s+soundtrack|soundtrack|ost|single|ep|deluxe).*/gi, "")
    .trim();

  return cleanStr(clean);
}

/**
 * Extracts and tokenizes all artist names associated with a song.
 * Supports primary_artist, artist, singers, music director, featured artists, and artistMap.
 */
export function extractArtists(track) {
  if (!track) return [];
  const artistsSet = new Set();

  const addName = (name) => {
    if (!name || typeof name !== "string") return;
    const parts = name.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+|\s+x\s+|\s+vs\.?\s+/i);
    for (const p of parts) {
      const cleaned = cleanStr(p);
      if (cleaned.length >= 2 && cleaned !== "various artists" && cleaned !== "various" && cleaned !== "unknown") {
        artistsSet.add(cleaned);
      }
    }
  };

  // 1. Direct string fields
  addName(track.primary_artist || track.primaryArtist);
  addName(track.artist);
  addName(track.singers);
  addName(track.music || track.composer || track.musicDirector || track.more_info?.music);

  // 2. Featured artists
  if (typeof track.featured_artists === "string") {
    addName(track.featured_artists);
  } else if (Array.isArray(track.featured_artists)) {
    track.featured_artists.forEach((a) => addName(typeof a === "object" ? a.name : a));
  }

  // 3. Structured artistMap (JioSaavn format)
  const artistMap = track.artistMap || track.more_info?.artistMap;
  if (artistMap && typeof artistMap === "object") {
    if (Array.isArray(artistMap.primary_artists)) {
      artistMap.primary_artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.artists)) {
      artistMap.artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.featured_artists)) {
      artistMap.featured_artists.forEach((a) => addName(a.name));
    }
    for (const [key, val] of Object.entries(artistMap)) {
      if (typeof key === "string" && isNaN(Number(key))) {
        addName(key);
      } else if (typeof val === "string" && isNaN(Number(val))) {
        addName(val);
      }
    }
  }

  return Array.from(artistsSet);
}

/**
 * Checks whether track A and track B share at least one matching artist.
 */
export function isArtistMatch(trackA, trackB) {
  const artistsA = extractArtists(trackA);
  const artistsB = extractArtists(trackB);
  if (artistsA.length === 0 || artistsB.length === 0) return false;

  for (const a of artistsA) {
    for (const b of artistsB) {
      if (a === b) return true;
      if (a.length > 5 && b.length > 5) {
        if (a.includes(b) || b.includes(a)) return true;
      }
    }
  }
  return false;
}

/**
 * Generic album words that do not constitute a specific movie or album match
 */
const GENERIC_ALBUM_NAMES = new Set([
  "",
  "single",
  "singles",
  "unknown",
  "untitled",
  "track",
  "audio",
  "music",
  "songs",
  "album",
  "remix",
  "ep",
  "soundtrack",
]);

/**
 * Extracts normalized movie name if present in track metadata or song title.
 */
export function extractMovieName(track) {
  if (!track) return "";
  if (track.movieName && typeof track.movieName === "string") {
    return cleanStr(track.movieName);
  }
  if (track.movie && typeof track.movie === "string") {
    return cleanStr(track.movie);
  }
  if (track.more_info?.movie_name && typeof track.more_info.movie_name === "string") {
    return cleanStr(track.more_info.movie_name);
  }

  const title = track.title || track.song || "";
  const match =
    title.match(/\(\s*from\s+["']?([^"')\]]+)["']?\s*\)/i) ||
    title.match(/\[\s*from\s+["']?([^"'\]]+)["']?\s*\]/i) ||
    title.match(/-\s*from\s+["']?([^"'-]+)["']?/i);
  if (match && match[1]) {
    const extracted = cleanStr(match[1]);
    if (extracted && !GENERIC_ALBUM_NAMES.has(extracted)) {
      return extracted;
    }
  }

  const isMovie = Boolean(
    track.isMovie ||
    track.isMovieTrack ||
    track.more_info?.is_movie === "1" ||
    track.more_info?.is_movie === true ||
    track.more_info?.album_type === "movie" ||
    track.album_type === "movie"
  );
  if (isMovie) {
    const alb = normalizeMovieAlbum(track.album || track.albumName || track.more_info?.album || "");
    if (alb && !GENERIC_ALBUM_NAMES.has(alb)) {
      return alb;
    }
  }

  return "";
}

/**
 * Checks whether candidate originates from the exact same movie as seedTrack.
 */
export function isMovieMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;
  const movieA = extractMovieName(trackA);
  const movieB = extractMovieName(trackB);

  if (movieA && movieB && !GENERIC_ALBUM_NAMES.has(movieA) && !GENERIC_ALBUM_NAMES.has(movieB)) {
    if (movieA === movieB) return true;
    if (movieA.length > 3 && movieB.length > 3 && (movieA.includes(movieB) || movieB.includes(movieA))) {
      return true;
    }
  }

  const isMovieA = Boolean(
    trackA.isMovie ||
    trackA.isMovieTrack ||
    trackA.more_info?.is_movie === "1" ||
    trackA.more_info?.is_movie === true ||
    trackA.more_info?.album_type === "movie" ||
    trackA.album_type === "movie" ||
    extractMovieName(trackA)
  );
  const isMovieB = Boolean(
    trackB.isMovie ||
    trackB.isMovieTrack ||
    trackB.more_info?.is_movie === "1" ||
    trackB.more_info?.is_movie === true ||
    trackB.more_info?.album_type === "movie" ||
    trackB.album_type === "movie" ||
    extractMovieName(trackB)
  );

  if ((isMovieA || isMovieB) && isAlbumMatch(trackA, trackB)) {
    return true;
  }

  return false;
}

/**
 * Checks whether track A and track B originate from the same album.
 */
export function isAlbumMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;

  const idA = String(trackA.album_id || trackA.albumId || trackA.more_info?.album_id || "").trim();
  const idB = String(trackB.album_id || trackB.albumId || trackB.more_info?.album_id || "").trim();
  if (idA && idB && idA === idB) return true;

  const albumA = normalizeMovieAlbum(trackA.movieName || trackA.album || trackA.albumName || trackA.more_info?.album || "");
  const albumB = normalizeMovieAlbum(trackB.movieName || trackB.album || trackB.albumName || trackB.more_info?.album || "");

  if (albumA && albumB && !GENERIC_ALBUM_NAMES.has(albumA) && !GENERIC_ALBUM_NAMES.has(albumB)) {
    if (albumA === albumB) return true;
    if (albumA.length > 4 && albumB.length > 4) {
      if (albumA.includes(albumB) || albumB.includes(albumA)) return true;
    }
  }

  if (trackA.isSameAlbum || trackB.isSameAlbum) return true;

  return false;
}

export function isMovieAlbumMatch(trackA, trackB) {
  return isMovieMatch(trackA, trackB) || isAlbumMatch(trackA, trackB);
}

/**
 * --------------------------------------------------------------------------
 * 1. SAME LANGUAGE — HIGHEST PRIORITY (Score: 100, 40, 0 | Weight: 35)
 * --------------------------------------------------------------------------
 */
export const RELATED_LANGUAGES = {
  malayalam: ["tamil"],
  tamil: ["malayalam", "telugu"],
  telugu: ["tamil", "kannada"],
  kannada: ["telugu", "tamil"],
  hindi: ["urdu", "punjabi", "bhojpuri"],
  urdu: ["hindi", "punjabi"],
  punjabi: ["hindi", "urdu"],
  bhojpuri: ["hindi"],
  bengali: ["hindi", "assamese"],
  marathi: ["hindi"],
  gujarati: ["hindi"],
  arabic: [],
  english: [],
  spanish: [],
  korean: [],
  japanese: [],
};

// Helper for accurate keyword matching with token boundaries to prevent substring collisions
export function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const kw = cleanStr(keyword);
  const target = cleanStr(text);
  if (!kw || !target) return false;

  if (kw.includes(" ") || kw.length > 5) {
    return target.includes(kw);
  }
  const escaped = kw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "i");
  return regex.test(target);
}

export const MALAYALAM_INDICATORS = [
  // Iconic Songs & Hits
  "lajjavathiye", "lajjawathiye", "annakkili", "ninte mizhimuna", "ente kanneril", "4 the people", "four the people",
  "4 students", "aluvapuzha", "aluvapuzhayude", "malare", "kalippu", "chembarathi", "aaromale", "appangalembadum",
  "jimikki kammal", "kudukku", "darshana", "manickya malaraya", "entammede jimikki", "pala palli", "neela nilave",
  "jaada", "illuminati", "armadham", "mathara", "thallumaala", "kichu kichu", "manjummel", "kanave",
  "mizhiyariyathe", "pinneyum pinneyum", "punchiri thanjum", "enthellam", "kannaadi koodum", "pathirapullunarnnu",
  "thamarappoovil", "karale nin", "devadoothar", "kuthanthram", "thaazhvaram", "pavizha mazha", "neeyilla neram",
  "uyiril thodum", "athiran", "kaathodu kaathorath", "unnam marannu", "aaradhike", "cherathukal", "ennuyire",
  "puthu mazha", "sarvam maya", "chiri thottu", "venmathi", "thumba poove", "oru kari mukilinu", "rathipushpam",

  // Iconic Artists & Composers
  "jassie gift", "jassey gift", "sushin shyam", "hesham abdul wahab", "vidyasagar", "deepak dev",
  "vineeth sreenivasan", "harisankar", "k.s. harisankar", "ks harisankar", "job kurian",
  "rex vijayan", "bijibal", "shaan rahman", "gopi sundar", "m.g. sreekumar", "mg sreekumar",
  "rajalakshmy", "vinayak sasikumar", "jakes bejoy", "k.j. yesudas", "kj yesudas", "yesudas",
  "sujatha mohan", "madhu balakrishnan", "vijay yesudas", "najim arshad", "sithara krishnakumar", "sithara",
  "vaikom vijayalakshmi", "jyotsna", "unni menon", "p. jayachandran", "p jayachandran", "jayachandran",
  "ouseppachan", "m. jayachandran", "m jayachandran", "raveendran", "johnson master", "johnson", "berny ignatius",
  "girish puthenchery", "kaithapram", "rafeeq ahammed", "alphons joseph", "mohanlal",
  "mammootty", "fahadh faasil", "nivin pauly", "tovino thomas", "prithviraj", "dulquer salmaan",
  "basil joseph", "asif ali", "soubin shahir", "sreenath bhasi", "dabzee", "baby jean",
  "hanumankind", "thirumali", "fejo", "vedan", "neha s nair", "neha s. nair", "anne amie",
  "sachin warrier", "arun alat", "sooraj santhosh", "niranj suresh", "gowry lekshmi",
  "sayanora philip", "mridula warrier", "rimi tomy", "manjari", "swetha mohan", "shweta mohan",
  "afsal", "stephen devassy", "prashant pillai", "rahul raj", "kailas menon", "justin varghese",
  "christo xavier", "4 musics",

  // Movies & Pop culture
  "thudarum", "kondattam", "premalu", "manjummel boys", "manjummel", "avesham", "aavesham",
  "romancham", "bheeshma", "hridayam", "minnal murali", "lucifer", "rdx", "varshangalkku shesham",
  "turbo", "bramayugam", "malaikottai vaaliban", "neru", "kannur squad", "king of kotha", "kurup",
  "malik", "kumbalangi nights", "kumbalangi", "bangalore days", "charlie", "usthad hotel", "premam",
  "jacobinte swargarajyam", "thattathin marayathu", "classmates", "devasuram", "spadikam", "kilukkam",
  "chithram", "manichitrathazhu", "drishyam", "pulimurugan", "empuraan", "barroz", "bougainvillea",
  "kishkindha kaandam", "marco", "ajayante randam moshanam", "arm", "vaazha",
  "guruvayoor ambalanadayil", "adujeevitham", "the goat life", "garudan", "falimy", "mukundan unni",
  "jaya jaya jaya jaya hey", "jan e man", "android kunjappan", "helen", "varane avashyamund",
  "ennu ninte moideen", "anuraga karikkin vellam", "guppy", "sudani from nigeria", "jallikattu",
  "churuli", "nanpakal nerathu mayakkam", "kaduva", "kaapa", "chatha mazha", "malayalam", "mollywood", "kerala"
];

export const TAMIL_INDICATORS = [
  // Composers & Artists
  "anirudh", "anirudh ravichander", "yuvan", "yuvan shankar raja",
  "harris jayaraj", "santhosh narayanan", "d. imman", "d imman", "gv prakash", "g.v. prakash",
  "ilaiyaraaja", "ilayaraja", "sean roldan", "sam c.s.", "sam cs", "hiphop tamizha",
  "dhanush", "thalapathy vijay", "ajith kumar", "ajith", "rajinikanth",
  "kamal haasan", "suriya", "karthi", "sivakarthikeyan", "silambarasan tr", "simbu",
  "vijay sethupathi", "andrea jeremiah",
  "dhee", "anthony daasan", "yogi b", "arivu", "asal kolaar",
  "pradeep kumar", "dhibu ninan thomas", "nivas k. prasanna",

  // Movies & Tracks
  "leo", "jailer", "vikram", "master", "kaithi", "beast", "varisu", "the greatest of all time",
  "vada chennai", "ponniyin selvan", "ps1", "ps2", "maaveeran", "captain miller", "ayalaan", "indian 2",
  "raayan", "kanguva", "vettaiyan", "viduthalai", "thuppakki", "mankatha", "mersal", "sarkar",
  "bigil", "petta", "vaathi", "don", "doctor", "theri", "viswasam", "veeram",
  "hukum", "kaavaalaa", "arabic kuthu", "rowdy baby", "vaathi coming", "enjoy enjaami",
  "katchi sera", "thaensudare", "badass", "naa ready", "dippam dappam",
  "tamil", "kollywood", "tamizha"
];

export const TELUGU_INDICATORS = [
  "devi sri prasad", "dsp", "s. thaman", "thaman s", "thaman", "m.m. keeravaani", "keeravani",
  "mickey j. meyer", "mickey j meyer", "vivek sagar", "chaitan bharadwaj", "anurag kulkarni",
  "ram miriyala", "mangli", "rahul sipligunj", "kaala bhairava", "sunitha",
  "geetha madhuri", "lipsika", "prabhas", "allu arjun", "mahesh babu", "jr ntr", "ram charan",
  "pawan kalyan", "chiranjeevi", "nani", "vijay deverakonda", "pushpa", "pushpa 2", "rrr",
  "devara", "kalki 2898 ad", "salaar", "guntur kaaram", "hanuman", "bahubali", "baahubali",
  "ala vaikunthapurramuloo", "sarileru neekevvaru", "geetha govindam", "rangasthalam",
  "oo antava", "srivalli", "naatu naatu", "dosti", "komuram bheemudo", "fear song", "chuttamalle",
  "telugu", "tollywood"
];

export const HINDI_INDICATORS = [
  "arijit singh", "pritam", "sachin-jigar", "sachin jigar", "vishal-shekhar", "vishal shekhar",
  "vishal mishra", "mithoon", "amit trivedi", "shankar-ehsaan-loy", "tanishk bagchi", "b praak",
  "jasleen royal", "badshah", "yo yo honey singh", "honey singh", "raftaar", "mc stan",
  "divine", "king", "atif aslam", "kk", "mohit chauhan", "sonu nigam", "shaan", "javed ali",
  "jubin nautiyal", "darshan raval", "stebin ben", "sunidhi chauhan",
  "neha kakkar", "tulsi kumar", "palak muchhal", "monali thakur", "shilpa rao", "neeti mohan",
  "alka yagnik", "kumar sanu", "udit narayan", "kishore kumar", "mohammed rafi", "lata mangeshkar",
  "asha bhosle", "jawan", "brahmastra", "animal", "kabir singh", "aashiqui", "kesariya",
  "chaleya", "dunki", "pathaan", "tiger 3", "fighter", "stree 2", "shaitaan", "bhool bhulaiyaa",
  "rocky aur rani", "gadar 2", "channa mereya", "tum hi ho", "apna bana le", "o maahi", "tauba tauba",
  "hindi", "bollywood"
];

export const KANNADA_INDICATORS = [
  "ravi basrur", "b. ajaneesh loknath", "ajaneesh loknath", "charan raj", "arjun janya",
  "v. harikrishna", "sanjith hegde", "raghu dixit", "rishab shetty", "rakshit shetty",
  "shiva rajkumar", "puneeth rajkumar", "sudeep", "kgf", "kgf chapter 2", "kantara",
  "vikrant rona", "777 charlie", "sapta sagaradaache ello", "singara siriye", "kannada", "sandalwood"
];

export const PUNJABI_INDICATORS = [
  "diljit dosanjh", "diljit", "karan aujla", "sidhu moose wala", "sidhu moosewala", "ap dhillon",
  "gurinder gill", "shubh", "amrit maan", "garry sandhu", "jassie gill", "harrdy sandhu",
  "guru randhawa", "amrinder gill", "babbu maan", "parmish verma", "punjabi", "pollywood"
];

export const ENGLISH_INDICATORS = [
  "the weeknd", "taylor swift", "drake", "dua lipa", "ed sheeran", "harry styles",
  "billie eilish", "justin bieber", "post malone", "ariana grande", "bruno mars",
  "coldplay", "imagine dragons", "maroon 5", "eminem", "rihanna", "katy perry",
  "adele", "shawn mendes", "charlie puth", "olivia rodrigo", "duncan laurence",
  "arcade", "as it was", "levitating", "starboy", "stay", "harleys in hawaii", "cruel summer"
];

export const PHONK_INDICATORS = [
  "kordhell", "interworld", "moondeity", "dxrk", "dvrst", "playamane", "hensonn",
  "s3bzs", "bibi babydoll", "kslv", "phonk", "drift phonk", "brazilian phonk", "pr funk"
];

export function extractLanguage(track) {
  if (!track) return "";
  const raw =
    track.language ||
    track.more_info?.language ||
    (typeof track.subtitle === "string" && track.subtitle.includes("•")
      ? track.subtitle.split("•")[0]
      : "") ||
    "";

  const clean = cleanStr(raw);

  const titleText = [track.title, track.song, track.album, track.movieName, track.movie]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const allText = [
    track.title,
    track.song,
    track.artist,
    track.primary_artist,
    track.primaryArtist,
    track.singers,
    track.music,
    track.composer,
    track.album,
    track.movieName,
    track.movie,
    track.genre,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 1. Phonk & explicit title indicators
  if (PHONK_INDICATORS.some((k) => matchesKeyword(allText, k))) return "phonk";
  if (MALAYALAM_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "malayalam";
  if (TELUGU_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "telugu";
  if (KANNADA_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "kannada";
  if (PUNJABI_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "punjabi";
  if (TAMIL_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "tamil";
  if (HINDI_INDICATORS.some((k) => matchesKeyword(titleText, k))) return "hindi";

  // 2. If valid raw language metadata was explicitly provided, use it
  if (
    clean &&
    clean !== "unknown" &&
    clean !== "popular" &&
    clean !== "undefined" &&
    clean !== "null"
  ) {
    return clean;
  }

  // 3. Fallback to allText indicator matching
  if (MALAYALAM_INDICATORS.some((k) => matchesKeyword(allText, k))) return "malayalam";
  if (TELUGU_INDICATORS.some((k) => matchesKeyword(allText, k))) return "telugu";
  if (KANNADA_INDICATORS.some((k) => matchesKeyword(allText, k))) return "kannada";
  if (PUNJABI_INDICATORS.some((k) => matchesKeyword(allText, k))) return "punjabi";
  if (TAMIL_INDICATORS.some((k) => matchesKeyword(allText, k))) return "tamil";
  if (HINDI_INDICATORS.some((k) => matchesKeyword(allText, k))) return "hindi";
  if (ENGLISH_INDICATORS.some((k) => matchesKeyword(allText, k))) return "english";

  return clean || "";
}

export function isLanguageMatch(trackA, trackB) {
  const langA = extractLanguage(trackA);
  const langB = extractLanguage(trackB);
  if (langA && langB && langA === langB) return true;
  return false;
}

export function getLanguageMatchScore(candidate, seedTrack) {
  const langSeed = extractLanguage(seedTrack);
  const langCand = extractLanguage(candidate);

  if (!langSeed) {
    return 100; // If seed language is completely unspecified, treat all as neutral
  }

  if (langCand && langSeed === langCand) {
    return 100; // Strict same language match
  }

  if (!langCand) {
    // If candidate language is missing, check if it matches seed language indicators
    const allCandText = [
      candidate.artist,
      candidate.primary_artist,
      candidate.title,
      candidate.song,
      candidate.album,
      candidate.movieName,
    ].filter(Boolean).join(" ").toLowerCase();

    if (langSeed === "malayalam" && MALAYALAM_INDICATORS.some((k) => allCandText.includes(k))) return 85;
    if (langSeed === "tamil" && TAMIL_INDICATORS.some((k) => allCandText.includes(k))) return 85;
    if (langSeed === "hindi" && HINDI_INDICATORS.some((k) => allCandText.includes(k))) return 85;
    if (langSeed === "phonk" && PHONK_INDICATORS.some((k) => allCandText.includes(k))) return 85;
    return 10;
  }

  // Cross-language isolation: Malayalam != Tamil != Hindi != English
  return 0;
}

/**
 * --------------------------------------------------------------------------
 * 2. SAME SONG TYPE / MOOD / FEELING — VERY HIGH PRIORITY
 * --------------------------------------------------------------------------
 * Core categories supported:
 * - sad: Sad, emotional, heartbreak, grief, tears, pain, crying, separation, viraham, sogam, pirivu, alvida, judaai, dard
 * - feeling: Romantic, love, feeling, feelings, soulful melody, heartfelt melody, premam, kadhal, ishq, pyar, duet, pranayam
 * - bgm: BGM, instrumental, movie background score, theme score, cinematic instrumentals, original score, mass theme
 * - energetic: High-energy, mass, dance, party, kuthu, festival, edm, fast beat, hype, phonk, drill
 * - chill: Chill, relaxing, lo-fi, acoustic, calm, soothing, peaceful, slow melody
 * - feel_good: Upbeat pop, happy, groove, trending chartbuster
 */
export function classifySongMood(track) {
  if (!track) return { primary: "feel_good", secondary: [], isBgm: false, label: "Trending Hit" };

  const textToScan = [
    track.genre,
    track.mood,
    track.songType,
    track.category,
    Array.isArray(track.categories) ? track.categories.join(" ") : "",
    track.badge,
    track.more_info?.genre,
    track.more_info?.mood,
    track.title,
    track.song,
    track.album,
    track.movieName,
    track.more_info?.album,
    track.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const titleLower = (track.title || track.song || "").toLowerCase();
  const hasLyricsExplicit = track.has_lyrics === "false" || track.has_lyrics === false || track.has_lyrics === 0;

  // 1. Phonk Detection
  if (PHONK_INDICATORS.some((k) => textToScan.includes(k))) {
    return { primary: "phonk", secondary: ["energetic", "bass"], isBgm: false, label: "Phonk" };
  }

  // 2. BGM / Instrumental Detection
  const bgmRegex = /\b(bgm|theme|instrumental|score|ost|soundtrack|cinematic|interlude|original score|flute|piano|violin|orchestral|whistle theme|title track theme|teaser theme|interval bgm|climax bgm|mass theme)\b/i;
  const isBgm =
    bgmRegex.test(titleLower) ||
    bgmRegex.test(track.genre || "") ||
    bgmRegex.test(track.more_info?.genre || "") ||
    (hasLyricsExplicit && /\b(theme|bgm|score|version|instrumental|tune)\b/i.test(titleLower));

  if (isBgm) {
    return { primary: "bgm", secondary: ["instrumental", "chill"], isBgm: true, label: "BGM Theme" };
  }

  // 3. Sad / Emotional / Heartbreak / Pain / Melancholy
  const sadRegex = /\b(sad|pain|broken|tears|lonely|alone|dardi|emotional|crying|separation|judaai|judai|maranam|viraham|heartbreak|sorrow|depress|melanchol|dard|alvida|channa mereya|khairiyat|nombaram|kanneer|kannukal|sogam|soga|pirivu|vali|azhugai|thanimai|badha|edupu|ontari|breakup|adhuri kahani|bekheyali|bhula dena|agar tum saath ho|lut gaye|phir bhi tumko|jaan nisaar)\b/i;
  if (sadRegex.test(textToScan)) {
    return { primary: "sad", secondary: ["chill", "slow"], isBgm: false, label: "Sad Melody" };
  }

  // 4. Feeling / Romantic / Love / Soulful Melody
  const feelingRegex = /\b(romantic|romance|love|feeling|feelings|kadhal|kaadhal|premam|pranayam|sneham|dil|pyar|pyaar|ishq|heart|duet|soulful|affection|couple|mohabbat|anbe|kanmani|humsafar|saathiya|deewani|sanam|kesariya|apna bana le|darshana|tum hi ho|uyire|azhage|muthumani|vaseegara|zaalima|raataan lambiyan|pehli nazar|hawayein|madhu pole|mundiri paadam|paathira pullunarnnu|pinneyum pinneyum|punchiri thanjum|kannaadi koodum|ente ellaam|innum konjam|naan un|vennilave|aaruyire|kanden kanden|tum tum|mallipoo|chustu chustune|samaja varagamana|melody|melodies|lajjavathiye|lajjawathiye|ninte mizhimuna|annakkili|malare|mathara|cherathukal|neela nilave|thaazhvaram|pavizha mazha|neeyilla neram|uyiril thodum|aaradhike|kaathodu kaathorath|unnam marannu)\b/i;
  if (feelingRegex.test(textToScan)) {
    return { primary: "feeling", secondary: ["romantic", "chill", "melody"], isBgm: false, label: "Feeling Melody" };
  }

  // 5. Energetic / Dance / Mass / Party / Fast beat
  const energeticRegex = /\b(energy|energetic|dance|party|club|edm|mass|dappan|kuthu|workout|gym|beat|bass|drop|remix|fast|drill|trap|hip[\s-]?hop|rap|anthem|festival|dhol|armadham|chaleya|badtameez|hukum|alappara|thallumaala|naatu|arabic kuthu|jimikki kammal|dholak|celebration|kuthanthram|pala palli)\b/i;
  if (energeticRegex.test(textToScan)) {
    return { primary: "energetic", secondary: ["dance", "mass", "feel_good"], isBgm: false, label: "Mass Beat" };
  }

  // 6. Chill / Relaxing / Lo-Fi / Acoustic
  const chillRegex = /\b(chill|relax|relaxing|lo[\s-]?fi|lofi|calm|soothing|slow|ambient|sleep|acoustic|coffee|peace|peaceful|serene|meditat|unplugged|gentle|sunset|midnight)\b/i;
  if (chillRegex.test(textToScan)) {
    return { primary: "chill", secondary: ["feel_good", "acoustic"], isBgm: false, label: "Chill Vibe" };
  }

  // 7. Feel-Good / Upbeat / Popular (Default)
  return { primary: "feel_good", secondary: ["pop", "upbeat"], isBgm: false, label: "Trending Hit" };
}

/**
 * Returns exact mood match score (100, 50, 0)
 */
export function getMoodMatchScore(candidate, seedTrack) {
  const seedMood = classifySongMood(seedTrack);
  const candMood = classifySongMood(candidate);

  // Exact same primary mood (Sad -> Sad, Feeling -> Feeling, BGM -> BGM, Energetic -> Energetic, Chill -> Chill)
  if (seedMood.primary === candMood.primary) {
    return 100;
  }

  // Feeling and romantic aliases
  if (
    (seedMood.primary === "feeling" && (candMood.primary === "romantic" || candMood.secondary.includes("melody"))) ||
    (seedMood.primary === "romantic" && (candMood.primary === "feeling" || candMood.secondary.includes("melody")))
  ) {
    return 100;
  }

  // If seed is BGM, protect it strictly: vocal pop or party songs get 0 pts
  if (seedMood.isBgm) {
    if (candMood.isBgm) return 100;
    if (candMood.primary === "chill" || candMood.secondary.includes("instrumental")) return 40;
    return 0;
  }

  // If candidate is BGM but seed was vocal song:
  if (candMood.isBgm) {
    return 10;
  }

  // Related pairs (emotional sad <-> feeling melody share slow, heartfelt vibe)
  const p1 = seedMood.primary;
  const p2 = candMood.primary;
  const isRelated =
    (p1 === "sad" && (p2 === "feeling" || p2 === "chill")) ||
    (p1 === "feeling" && (p2 === "sad" || p2 === "chill")) ||
    (p1 === "chill" && (p2 === "feeling" || p2 === "feel_good")) ||
    (p1 === "energetic" && p2 === "feel_good") ||
    (p1 === "feel_good" && p2 === "energetic");

  if (isRelated) {
    return 50;
  }

  // Opposites: e.g. Energetic Party vs Sad Heartbreak -> 0 pts
  return 0;
}

export function detectSongTypes(track) {
  const mood = classifySongMood(track);
  return new Set([mood.primary, ...mood.secondary]);
}

export function isSongTypeMatch(candidate, seedTrack) {
  return getMoodMatchScore(candidate, seedTrack) >= 80;
}

export function isRelatedMatch(candidate, seedTrack) {
  return getMoodMatchScore(candidate, seedTrack) >= 50;
}

/**
 * --------------------------------------------------------------------------
 * 3. TRENDING / POPULARITY — HIGH PRIORITY (Score: 0 to 100)
 * --------------------------------------------------------------------------
 * Combines play count metrics with release recency to strongly favor famous, trending hits.
 */
export function calculatePopularityScore(track) {
  if (!track) return 0;

  let playCount = 0;
  if (track.play_count !== undefined && track.play_count !== null) {
    playCount = Number(track.play_count) || 0;
  } else if (track.playCount !== undefined && track.playCount !== null) {
    playCount = Number(track.playCount) || 0;
  } else if (track.more_info?.play_count) {
    playCount = Number(track.more_info.play_count) || 0;
  }

  // Play count base score (0 to 80 points)
  let playScore = 0;
  if (playCount >= 50000000) {
    playScore = 80;
  } else if (playCount >= 10000000) {
    playScore = 75 + Math.min(5, Math.floor(((playCount - 10000000) / 40000000) * 5));
  } else if (playCount >= 2000000) {
    playScore = 65 + Math.min(10, Math.floor(((playCount - 2000000) / 8000000) * 10));
  } else if (playCount >= 500000) {
    playScore = 50 + Math.min(15, Math.floor(((playCount - 500000) / 1500000) * 15));
  } else if (playCount >= 100000) {
    playScore = 35 + Math.min(15, Math.floor(((playCount - 100000) / 400000) * 15));
  } else if (playCount >= 20000) {
    playScore = 20;
  } else if (playCount >= 5000) {
    playScore = 10;
  } else {
    // Under 5000 plays
    playScore = 0;
  }

  // Curated / Master badge track bonus if play count was unlisted
  if (playScore === 0 && (track.badge || track.fidelity || track.source === "curated" || track.isTrending || track.isHit)) {
    playScore = 65;
  }

  // Recency / Trending score (0 to 20 points) - Awarded to popular tracks
  let recencyScore = 0;
  if (playScore > 0) {
    const rawYear = track.year || track.more_info?.year || track.release_date?.slice(0, 4);
    const year = parseInt(rawYear || "0", 10);
    if (year >= 2024) {
      recencyScore = 20; // Currently trending / hot release
    } else if (year >= 2022) {
      recencyScore = 16; // Recent hit
    } else if (year >= 2020) {
      recencyScore = 12;
    } else if (year >= 2016) {
      recencyScore = 8;
    } else {
      recencyScore = 4;
    }
  }

  return Math.min(100, Math.max(0, playScore + recencyScore));
}

/**
 * --------------------------------------------------------------------------
 * 4. ARTIST & MOVIE DIVERSITY — AVOID MONOPOLY / SPAM
 * --------------------------------------------------------------------------
 * "Same artist and same movie not consider, but you can place that in song perhaps"
 * - DO NOT flood the queue with songs from the same movie or same artist!
 * - At most 1-2 songs from the same artist/movie in the entire queue.
 * - Never place the same artist or same movie back-to-back.
 */
export function calculateArtistDiversityScore(candidate, seedTrack, artistCounts = new Map(), lastArtistName = null, movieCounts = new Map(), lastMovieName = null) {
  const candArtists = extractArtists(candidate);
  const seedArtists = extractArtists(seedTrack);
  const isSeedArtistMatch = candArtists.some((ca) => seedArtists.includes(ca));

  const primaryLead = candArtists[0] || cleanStr(candidate.primary_artist || candidate.artist || "");
  const movieName = cleanStr(candidate.movieName || candidate.album || "");

  // Never place back-to-back identical artist or movie
  if (lastArtistName && primaryLead && lastArtistName === primaryLead) {
    return 0;
  }
  if (lastMovieName && movieName && lastMovieName === movieName) {
    return 0;
  }

  const timesArtistAppeared = artistCounts.get(primaryLead) || 0;
  const timesMovieAppeared = movieCounts.get(movieName) || 0;

  // Already appeared 2 or more times: reject/drop heavily
  if (timesArtistAppeared >= 2 || timesMovieAppeared >= 2) {
    return 0;
  }

  if (timesArtistAppeared === 1 || timesMovieAppeared === 1) {
    return 30;
  }

  // Not yet appeared in queue
  if (isSeedArtistMatch) {
    // Reference song's artist: allowed occasionally (score 60)
    return 60;
  }

  // Fresh diverse artist
  return 100;
}

/**
 * --------------------------------------------------------------------------
 * WEIGHTED RECOMMENDATION SCORING MODEL (Section 7)
 * Total Score = 100 Points:
 * 1. Same Language: 20
 * 2. Same Song Type / BGM: 20
 * 3. Same Mood and Emotional Character: 15
 * 4. Trending Status: 12
 * 5. Popularity: 10
 * 6. Musical / Genre Similarity: 7
 * 7. Energy and Tempo Compatibility: 5
 * 8. Recency: 4
 * 9. Artist Similarity / Occasional Same-Artist Bonus: 3
 * 10. Album / Movie Relationship Bonus: 2
 * 11. Discovery and Variety Bonus: 2
 * --------------------------------------------------------------------------
 */
export function calculateQueueScore(candidate, seedTrack, options = {}) {
  const {
    artistCounts = new Map(),
    lastArtist = null,
    movieCounts = new Map(),
    lastMovie = null,
    recentQueueTrackIds = new Set(),
  } = options;

  const seedProfile = classifySongDetailed(seedTrack);
  const candProfile = classifySongDetailed(candidate);

  // 1. Same Language (Weight: 20)
  let langScore = 0;
  const langMatchRaw = getLanguageMatchScore(candidate, seedTrack);
  if (langMatchRaw === 100) {
    langScore = 20;
  } else if (langMatchRaw >= 70) {
    langScore = 14;
  } else if (langMatchRaw >= 40) {
    langScore = 8;
  } else {
    langScore = 0;
  }

  // 2. Same Song Type / BGM Classification (Weight: 18)
  let typeScore = 0;
  if (!seedProfile.isBgm && !candProfile.isBgm) {
    typeScore = 18; // Both are vocal songs
  } else if (seedProfile.isBgm && candProfile.isBgm) {
    if (seedProfile.contentType === candProfile.contentType) {
      typeScore = 18; // Exact BGM subtype match
    } else {
      typeScore = 14;
    }
  } else {
    typeScore = 0; // Vocal vs BGM mismatch
  }

  // 3. Same Mood and Emotional Character (Weight: 12)
  let moodScore = 0;
  if (seedProfile.primaryMood === candProfile.primaryMood) {
    moodScore = 12; // Exact primary mood match
  } else {
    const common = seedProfile.moodCategories.filter((m) => candProfile.moodCategories.includes(m));
    if (common.length > 0) {
      moodScore = 9; // Secondary / overlapping mood match
    } else {
      const p1 = seedProfile.primaryMood;
      const p2 = candProfile.primaryMood;
      const isRelated =
        (p1 === "love_romance" && p2 === "happy_feel_good") ||
        (p1 === "happy_feel_good" && p2 === "love_romance") ||
        (p1 === "sad_emotional" && p2 === "chill_peaceful") ||
        (p1 === "chill_peaceful" && p2 === "sad_emotional") ||
        (p1 === "energetic_hype" && p2 === "happy_feel_good") ||
        (p1 === "happy_feel_good" && p2 === "energetic_hype");
      if (isRelated) {
        moodScore = 6;
      } else {
        moodScore = 0; // Opposites (e.g. sad vs energetic)
      }
    }
  }

  const yr = candProfile.year || parseInt(candidate.year || "2024", 10);
  const plays = candProfile.playCount || candidate.play_count || candidate.playCount || 0;
  const chartRank = candidate.chartRank || candidate.chart_rank || null;

  // 4. Verified Trending Evidence (Weight: 15)
  let trendingScore = 2;
  if (chartRank && chartRank > 0) {
    if (chartRank <= 10) trendingScore = 15;
    else if (chartRank <= 25) trendingScore = 13.5;
    else if (chartRank <= 50) trendingScore = 12;
  } else if (candidate.isTrending || candidate.badge === "Trending") {
    trendingScore = 11;
  } else if (yr >= 2025 && plays >= 1500000) {
    trendingScore = 11;
  } else if (yr >= 2024 && plays >= 2000000) {
    trendingScore = 10;
  } else if (yr >= 2024 && plays >= 500000) {
    trendingScore = 8;
  } else if (yr >= 2023 && plays >= 300000) {
    trendingScore = 6;
  } else if (yr >= 2021) {
    trendingScore = 3.5;
  } else {
    trendingScore = 2;
  }

  // 5. Reliable Popularity Evidence (Weight: 15)
  let popScore = 0;
  if (plays >= 25000000) popScore = 15;
  else if (plays >= 10000000) popScore = 13.5;
  else if (plays >= 3000000) popScore = 11.5;
  else if (plays >= 1000000) popScore = 9.5;
  else if (plays >= 300000) popScore = 7.5;
  else if (plays >= 100000) popScore = 5.5;
  else if (plays >= 30000) popScore = 3.5;
  else if (plays >= 15000) popScore = 1.5;
  else if (candidate.badge === "Master" || candidate.source === "curated") popScore = 7;
  else popScore = 0;

  // 6. Musical/Genre Similarity (Weight: 7)
  let genreScore = 1.5;
  const commonGenres = seedProfile.genres.filter((g) => candProfile.genres.includes(g));
  if (commonGenres.length > 0) {
    genreScore = 7;
  } else {
    genreScore = 4;
  }

  // 7. Energy and Tempo Compatibility (Weight: 5)
  const energyDiff = Math.abs(seedProfile.energyLevel - candProfile.energyLevel);
  let energyScore = 0;
  if (energyDiff === 0) energyScore = 5;
  else if (energyDiff === 1) energyScore = 4;
  else if (energyDiff === 2) energyScore = 2;
  else energyScore = 0;

  // 8. Recency (Weight: 4)
  let recencyScore = 1;
  if (yr >= 2025) recencyScore = 4;
  else if (yr >= 2023) recencyScore = 3;
  else if (yr >= 2020) recencyScore = 2;
  else if (yr >= 2015) recencyScore = 1.5;
  else recencyScore = 1;

  // 9. Occasional Artist, Album, or Movie Bonus (Weight: 2)
  const isSameArt = isArtistMatch(candidate, seedTrack);
  const isMovieAlbum = isMovieAlbumMatch(candidate, seedTrack);
  const artistScore = isSameArt ? 2 : 0;
  const movieScore = isMovieAlbum ? 1.5 : 0;
  const artistMovieBonus = Math.min(2, artistScore + movieScore);

  // 10. Discovery and Variety Bonus (Weight: 2)
  let discoveryScore = 1;
  const tid = String(candidate.id);
  if (!recentQueueTrackIds.has(tid) && plays >= 50000 && plays <= 1500000 && moodScore >= 9) {
    discoveryScore = 2;
  }

  // Total raw score (0 to 100)
  let totalScore = Math.round(
    langScore +
    typeScore +
    moodScore +
    trendingScore +
    popScore +
    genreScore +
    energyScore +
    recencyScore +
    artistMovieBonus +
    discoveryScore
  );

  // Anti-Repetition Penalty (Section 15):
  // If track was already recommended in the immediate recent queue of another starting song, dampen it by 12 points
  if (recentQueueTrackIds.has(tid)) {
    totalScore = Math.max(0, totalScore - 12);
  }

  return {
    totalScore: Math.min(100, Math.max(0, totalScore)),
    langScore,
    typeScore,
    moodScore,
    trendingScore,
    popScore,
    genreScore,
    energyScore,
    recencyScore,
    artistScore,
    movieScore,
    discoveryScore,
    isSameArtist: isSameArt,
    seedProfile,
    candProfile,
  };
}

/**
 * Backwards compatibility helper for existing references
 */
export function assignCandidateTier(candidate, seedTrack) {
  const langMatch = getLanguageMatchScore(candidate, seedTrack);
  const moodMatch = getMoodMatchScore(candidate, seedTrack);

  if (langMatch === 100 && moodMatch >= 80) {
    return { tier: 1, tierReason: "Same Language & Mood", sameLanguage: true, isRelated: true };
  }
  if (langMatch === 100 && moodMatch >= 50) {
    return { tier: 2, tierReason: "Same Language", sameLanguage: true, isRelated: true };
  }
  if (langMatch >= 40 && moodMatch >= 50) {
    return { tier: 3, tierReason: "Related Language & Mood", sameLanguage: false, isRelated: true };
  }
  return { tier: 4, tierReason: "Fallback Discovery", sameLanguage: false, isRelated: false };
}

export function calculateSecondaryScore(candidate, seedTrack, tierInfo = {}) {
  const scoreObj = calculateQueueScore(candidate, seedTrack);
  return scoreObj.totalScore;
}

export function normalizeBaseTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|original|soundtrack|version|remix|chill|trap|slowed|reverb|lofi|lyrical|video|audio|extended|ost|bgm|reprise|unplugged|male|female|duet|cover|hindi|tamil|telugu|malayalam|kannada)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|remix|chill|trap|slowed|reverb|lofi|lyrical|version|soundtrack|ost|reprise|unplugged|extended|cover|hindi|tamil|telugu|malayalam|kannada).*/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * --------------------------------------------------------------------------
 * INTELLIGENT QUEUE BUILDER (Sections 7, 8 & 15)
 * - Strict Same Language (Malayalam -> Malayalam, Telugu -> Telugu, etc.)
 * - Strict Song Type Match (Vocal -> Vocal, BGM -> BGM)
 * - Transparent 100-Point Weighted Scoring Model
 * - Diversity & Repetition Protection (Never back-to-back same artist/movie, max 2 tracks per artist, max 1 per movie)
 * - Beautiful Sequencing Layer: Generates exactly 20 tracks!
 * - Anti-Repetition Across Starting Songs: Context-aware anchor queues
 * --------------------------------------------------------------------------
 */
export function buildIntelligentQueue(seedTrack, candidatePool, options = {}) {
  if (!seedTrack || !Array.isArray(candidatePool) || candidatePool.length === 0) {
    return [];
  }

  const maxResults = options.maxResults || 20;

  const excludeIds = new Set(
    (Array.isArray(options.excludeIds)
      ? options.excludeIds
      : options.excludeIds instanceof Set
        ? Array.from(options.excludeIds)
        : String(options.excludeIds || "").split(",")
    )
      .map((s) => String(s).trim())
      .filter(Boolean)
  );

  const sessionPlayedIds = new Set(
    (Array.isArray(options.sessionPlayedIds)
      ? options.sessionPlayedIds
      : options.sessionPlayedIds instanceof Set
        ? Array.from(options.sessionPlayedIds)
        : String(options.sessionPlayedIds || "").split(",")
    )
      .map((s) => String(s).trim())
      .filter(Boolean)
  );

  const recentQueueTrackIds = new Set(
    (Array.isArray(options.recentQueueTrackIds)
      ? options.recentQueueTrackIds
      : options.recentQueueTrackIds instanceof Set
        ? Array.from(options.recentQueueTrackIds)
        : String(options.recentQueueTrackIds || "").split(",")
    )
      .map((s) => String(s).trim())
      .filter(Boolean)
  );

  const seedId = String(seedTrack.id || "").trim();
  if (seedId) excludeIds.add(seedId);
  const cleanSeedId = seedId.replace(/^track-/, "").trim();
  if (cleanSeedId) excludeIds.add(cleanSeedId);

  const seedProfile = classifySongDetailed(seedTrack);
  const seedLang = seedProfile.language;
  const seedBaseTitle = normalizeBaseTitle(seedTrack.title || seedTrack.song || "");
  const seedMovie = cleanStr(seedTrack.movieName || seedTrack.album || "");

  // 1. Clean & Deduplicate candidates
  const seenIds = new Set();
  const seenBaseTitles = new Set();
  if (seedBaseTitle) seenBaseTitles.add(seedBaseTitle);
  const seenTitleArtist = new Set();
  const validCandidates = [];

  for (const track of candidatePool) {
    if (!track || !track.id) continue;
    const tid = String(track.id).trim();
    const cleanTid = tid.replace(/^track-/, "").trim();
    if (excludeIds.has(tid) || excludeIds.has(cleanTid)) continue;
    if (seenIds.has(tid) || seenIds.has(cleanTid)) continue;

    // Strict Language Check: If seed has a detected language, candidate MUST match that language
    const candProfile = classifySongDetailed(track);
    if (seedLang && candProfile.language && candProfile.language !== seedLang) {
      continue; // Strictly reject different language tracks
    }

    // Strict Song Type Check: Vocal seed -> Vocal candidate; BGM seed -> BGM candidate
    if (seedProfile.isBgm !== candProfile.isBgm) {
      continue; // Strictly reject cross-type songs
    }

    // Strict Duplicate Title Check: Reject same song name variations or remixes
    const baseTitle = normalizeBaseTitle(track.title || track.song || "");
    if (baseTitle && seenBaseTitles.has(baseTitle)) {
      continue; // Avoid duplicate song names in the queue
    }

    const cleanT = cleanStr(track.title || track.song || "");
    const cleanA = cleanStr(track.artist || track.primary_artist || "");
    const taKey = `${cleanT}:::${cleanA}`;
    if (cleanT && cleanA && seenTitleArtist.has(taKey)) continue;

    seenIds.add(tid);
    seenIds.add(cleanTid);
    if (baseTitle) seenBaseTitles.add(baseTitle);
    if (cleanT && cleanA) seenTitleArtist.add(taKey);
    validCandidates.push(track);
  }

  // Controlled constraint relaxation: if candidate pool is small, allow related languages or unclassified candidates matching BGM type
  if (validCandidates.length < maxResults) {
    const relatedLangs = RELATED_LANGUAGES[seedLang] || [];
    for (const track of candidatePool) {
      if (!track || !track.id) continue;
      const tid = String(track.id).trim();
      const cleanTid = tid.replace(/^track-/, "").trim();
      if (excludeIds.has(tid) || excludeIds.has(cleanTid)) continue;
      if (seenIds.has(tid) || seenIds.has(cleanTid)) continue;

      const candProfile = classifySongDetailed(track);
      if (seedProfile.isBgm !== candProfile.isBgm) continue;
      if (candProfile.language && candProfile.language !== seedLang && !relatedLangs.includes(candProfile.language)) {
        continue;
      }

      seenIds.add(tid);
      seenIds.add(cleanTid);
      validCandidates.push(track);
      if (validCandidates.length >= maxResults * 2) break;
    }
  }

  // Session history exclusion (relax if pool is small)
  let pool = validCandidates.filter((t) => !sessionPlayedIds.has(String(t.id)));
  if (pool.length < maxResults) {
    const played = validCandidates.filter((t) => sessionPlayedIds.has(String(t.id)));
    pool = [...pool, ...played];
  }

  const finalQueue = [];
  const artistCounts = new Map();
  const movieCounts = new Map();

  const seedArtists = extractArtists(seedTrack);
  const seedLeadArtist = seedArtists[0] || cleanStr(seedTrack.primary_artist || seedTrack.artist || "");

  let lastArtist = seedLeadArtist;
  let lastMovie = seedMovie;
  let seedArtistAppearances = 0;
  let seedMovieAppearances = 0;

  // 2. Iteratively build exactly maxResults (20) queue slots
  while (finalQueue.length < maxResults && pool.length > 0) {
    const queueIndex = finalQueue.length;

    // Score all remaining candidates against seedTrack using the transparent 100-point model
    const scoredList = pool.map((cand) => {
      const scoreObj = calculateQueueScore(cand, seedTrack, {
        artistCounts,
        lastArtist,
        movieCounts,
        lastMovie,
        recentQueueTrackIds,
      });
      return {
        track: cand,
        candProfile: scoreObj.candProfile,
        ...scoreObj,
      };
    });

    // Diversity & Sequencing Filters:
    // a. Never place the same artist or same movie back-to-back
    // b. In slots 0 & 1, do NOT pick seed artist or seed movie (immediate fresh variety)
    // c. Maximum 1 song from the same movie/album in the entire queue
    // d. Other artists maximum 2 appearances in queue
    let eligible = scoredList.filter((item) => {
      const candArtists = extractArtists(item.track);
      const lead = candArtists[0] || cleanStr(item.track.primary_artist || item.track.artist || "");
      const movie = cleanStr(item.track.movieName || item.track.album || "");

      // No back-to-back identical artist or movie
      if (lastArtist && lead && lastArtist === lead) return false;
      if (lastMovie && movie && lastMovie === movie) return false;

      const isSeedArtist = candArtists.some((ca) => seedArtists.includes(ca));
      const isSeedMovie = Boolean(seedMovie && movie && (movie === seedMovie || movie.includes(seedMovie) || seedMovie.includes(movie)));

      // Slots 0 & 1: do not repeat seed artist or seed movie if alternatives exist
      if (queueIndex < 2 && (isSeedArtist || isSeedMovie)) return false;

      // Maximum 1 track from any movie in the entire queue
      if (isSeedMovie && seedMovieAppearances >= 1) return false;
      const mCount = movieCounts.get(movie) || 0;
      if (movie && mCount >= 1) return false;

      // Artist appearances cap (max 2)
      if (isSeedArtist && seedArtistAppearances >= 2) return false;
      const aCount = artistCounts.get(lead) || 0;
      if (aCount >= 2) return false;

      return true;
    });

    // If diversity filters were too strict for remaining pool, gently relax
    if (eligible.length === 0) {
      eligible = scoredList.filter((item) => {
        const candArtists = extractArtists(item.track);
        const lead = candArtists[0] || cleanStr(item.track.primary_artist || item.track.artist || "");
        const aCount = artistCounts.get(lead) || 0;
        return aCount < 3;
      });
    }

    if (eligible.length === 0) {
      eligible = scoredList;
    }

    // Sort eligible by totalScore descending
    eligible.sort((a, b) => b.totalScore - a.totalScore);

    // Beautiful Sequencing Layer:
    // Slot 0: #1 highest scoring compatible hit
    // Slot 1: Top trending / energetic match
    // Slot 2: High genre & energy match
    // Slot 3: Newer release matching mood
    // Slot 4: Strong companion or same artist track
    // Slot 5: Hidden gem with high mood score
    // Slots 6-19: Balanced alternation of trending and evergreen hits
    let selectedItem;
    if (queueIndex === 0) {
      selectedItem = eligible[0];
    } else if (queueIndex === 4 && eligible.some((e) => e.isSameArtist && e.totalScore >= 60)) {
      selectedItem = eligible.find((e) => e.isSameArtist && e.totalScore >= 60) || eligible[0];
    } else if (queueIndex === 5 && eligible.some((e) => e.discoveryScore === 2 && e.moodScore >= 12)) {
      selectedItem = eligible.find((e) => e.discoveryScore === 2 && e.moodScore >= 12) || eligible[0];
    } else {
      const sliceSize = Math.min(3, eligible.length);
      const topSlice = eligible.slice(0, sliceSize);
      selectedItem = topSlice[Math.floor(Math.random() * topSlice.length)];
    }

    const chosenTrack = selectedItem.track;
    const chosenArtists = extractArtists(chosenTrack);
    const chosenLead = chosenArtists[0] || cleanStr(chosenTrack.primary_artist || chosenTrack.artist || "");
    const chosenMovie = cleanStr(chosenTrack.movieName || chosenTrack.album || "");

    // Update state tracking
    lastArtist = chosenLead;
    lastMovie = chosenMovie;
    artistCounts.set(chosenLead, (artistCounts.get(chosenLead) || 0) + 1);
    if (chosenMovie) {
      movieCounts.set(chosenMovie, (movieCounts.get(chosenMovie) || 0) + 1);
    }

    const isMatchArtist = chosenArtists.some((ca) => seedArtists.includes(ca));
    if (isMatchArtist) seedArtistAppearances++;
    if (seedMovie && chosenMovie && (chosenMovie === seedMovie || chosenMovie.includes(seedMovie))) {
      seedMovieAppearances++;
    }

    // Format output track
    const durSec = Number(chosenTrack.duration || 210);
    const m = Math.floor(durSec / 60);
    const s = Math.floor(durSec % 60);
    const durationFormatted = chosenTrack.durationFormatted || `${m}:${s < 10 ? "0" : ""}${s}`;

    const candLang = chosenTrack.language || seedLang || "";
    const langFormatted = candLang ? candLang.charAt(0).toUpperCase() + candLang.slice(1) : "";
    const moodLabel = selectedItem.candProfile?.primaryMood ? selectedItem.candProfile.primaryMood.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Trending";

    let tier = 1;
    let tierReason = "";
    if (isMatchArtist && seedArtistAppearances <= 1) {
      tier = 3;
      tierReason = `Artist • ${chosenLead}`;
    } else if (selectedItem.langScore === 20 && selectedItem.moodScore >= 12) {
      tier = 1;
      tierReason = langFormatted ? `${moodLabel} • ${langFormatted}` : moodLabel;
    } else if (selectedItem.langScore === 20) {
      tier = 2;
      tierReason = langFormatted ? `Trending • ${langFormatted}` : "Trending Hit";
    } else {
      tier = 4;
      tierReason = "Trending Hit";
    }

    finalQueue.push({
      ...chosenTrack,
      id: String(chosenTrack.id),
      title: chosenTrack.title || chosenTrack.song || "Unknown Track",
      artist: chosenTrack.artist || chosenTrack.primary_artist || "Unknown Artist",
      tier,
      tierReason,
      queueScore: selectedItem.totalScore,
      score: selectedItem.totalScore,
      duration: durSec,
      durationFormatted,
      isManual: false,
      queueMeta: {
        score: selectedItem.totalScore,
        languageScore: selectedItem.langScore,
        typeScore: selectedItem.typeScore,
        moodScore: selectedItem.moodScore,
        trendingScore: selectedItem.trendingScore,
        popularityScore: selectedItem.popScore,
        genreScore: selectedItem.genreScore,
        energyScore: selectedItem.energyScore,
        recencyScore: selectedItem.recencyScore,
        artistScore: selectedItem.artistScore,
        movieScore: selectedItem.movieScore,
        discoveryScore: selectedItem.discoveryScore,
        isSameArtist: isMatchArtist,
        moodLabel,
        language: candLang,
      },
    });

    // Remove chosen track from active candidate pool
    const chosenId = String(chosenTrack.id);
    pool = pool.filter((t) => String(t.id) !== chosenId);
  }

  return finalQueue;
}

/**
 * Main external export: generateRecommendedQueue(currentSong, musicCatalog, options)
 */
export function generateRecommendedQueue(currentSong, musicCatalog, options = {}) {
  return buildIntelligentQueue(currentSong, musicCatalog, options);
}




