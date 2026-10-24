// Quran reference data: surah names, ayah counts, juz boundaries (Hafs, 6236 ayahs).
// A position is { s, a } (surah 1–114, ayah 1–n). Positions also map to an
// absolute index 0–6235 in mushaf order, which makes range math simple.

const RAW = [
  ['Al-Fatihah', 'الفاتحة', 7], ['Al-Baqarah', 'البقرة', 286], ['Aal-Imran', 'آل عمران', 200],
  ['An-Nisa', 'النساء', 176], ["Al-Ma'idah", 'المائدة', 120], ["Al-An'am", 'الأنعام', 165],
  ["Al-A'raf", 'الأعراف', 206], ['Al-Anfal', 'الأنفال', 75], ['At-Tawbah', 'التوبة', 129],
  ['Yunus', 'يونس', 109], ['Hud', 'هود', 123], ['Yusuf', 'يوسف', 111],
  ["Ar-Ra'd", 'الرعد', 43], ['Ibrahim', 'إبراهيم', 52], ['Al-Hijr', 'الحجر', 99],
  ['An-Nahl', 'النحل', 128], ['Al-Isra', 'الإسراء', 111], ['Al-Kahf', 'الكهف', 110],
  ['Maryam', 'مريم', 98], ['Taha', 'طه', 135], ['Al-Anbiya', 'الأنبياء', 112],
  ['Al-Hajj', 'الحج', 78], ["Al-Mu'minun", 'المؤمنون', 118], ['An-Nur', 'النور', 64],
  ['Al-Furqan', 'الفرقان', 77], ["Ash-Shu'ara", 'الشعراء', 227], ['An-Naml', 'النمل', 93],
  ['Al-Qasas', 'القصص', 88], ['Al-Ankabut', 'العنكبوت', 69], ['Ar-Rum', 'الروم', 60],
  ['Luqman', 'لقمان', 34], ['As-Sajdah', 'السجدة', 30], ['Al-Ahzab', 'الأحزاب', 73],
  ['Saba', 'سبأ', 54], ['Fatir', 'فاطر', 45], ['Ya-Sin', 'يس', 83],
  ['As-Saffat', 'الصافات', 182], ['Sad', 'ص', 88], ['Az-Zumar', 'الزمر', 75],
  ['Ghafir', 'غافر', 85], ['Fussilat', 'فصلت', 54], ['Ash-Shura', 'الشورى', 53],
  ['Az-Zukhruf', 'الزخرف', 89], ['Ad-Dukhan', 'الدخان', 59], ['Al-Jathiyah', 'الجاثية', 37],
  ['Al-Ahqaf', 'الأحقاف', 35], ['Muhammad', 'محمد', 38], ['Al-Fath', 'الفتح', 29],
  ['Al-Hujurat', 'الحجرات', 18], ['Qaf', 'ق', 45], ['Adh-Dhariyat', 'الذاريات', 60],
  ['At-Tur', 'الطور', 49], ['An-Najm', 'النجم', 62], ['Al-Qamar', 'القمر', 55],
  ['Ar-Rahman', 'الرحمن', 78], ["Al-Waqi'ah", 'الواقعة', 96], ['Al-Hadid', 'الحديد', 29],
  ['Al-Mujadilah', 'المجادلة', 22], ['Al-Hashr', 'الحشر', 24], ['Al-Mumtahanah', 'الممتحنة', 13],
  ['As-Saff', 'الصف', 14], ["Al-Jumu'ah", 'الجمعة', 11], ['Al-Munafiqun', 'المنافقون', 11],
  ['At-Taghabun', 'التغابن', 18], ['At-Talaq', 'الطلاق', 12], ['At-Tahrim', 'التحريم', 12],
  ['Al-Mulk', 'الملك', 30], ['Al-Qalam', 'القلم', 52], ['Al-Haqqah', 'الحاقة', 52],
  ["Al-Ma'arij", 'المعارج', 44], ['Nuh', 'نوح', 28], ['Al-Jinn', 'الجن', 28],
  ['Al-Muzzammil', 'المزمل', 20], ['Al-Muddaththir', 'المدثر', 56], ['Al-Qiyamah', 'القيامة', 40],
  ['Al-Insan', 'الإنسان', 31], ['Al-Mursalat', 'المرسلات', 50], ['An-Naba', 'النبأ', 40],
  ["An-Nazi'at", 'النازعات', 46], ['Abasa', 'عبس', 42], ['At-Takwir', 'التكوير', 29],
  ['Al-Infitar', 'الانفطار', 19], ['Al-Mutaffifin', 'المطففين', 36], ['Al-Inshiqaq', 'الانشقاق', 25],
  ['Al-Buruj', 'البروج', 22], ['At-Tariq', 'الطارق', 17], ["Al-A'la", 'الأعلى', 19],
  ['Al-Ghashiyah', 'الغاشية', 26], ['Al-Fajr', 'الفجر', 30], ['Al-Balad', 'البلد', 20],
  ['Ash-Shams', 'الشمس', 15], ['Al-Layl', 'الليل', 21], ['Ad-Duha', 'الضحى', 11],
  ['Ash-Sharh', 'الشرح', 8], ['At-Tin', 'التين', 8], ['Al-Alaq', 'العلق', 19],
  ['Al-Qadr', 'القدر', 5], ['Al-Bayyinah', 'البينة', 8], ['Az-Zalzalah', 'الزلزلة', 8],
  ['Al-Adiyat', 'العاديات', 11], ["Al-Qari'ah", 'القارعة', 11], ['At-Takathur', 'التكاثر', 8],
  ['Al-Asr', 'العصر', 3], ['Al-Humazah', 'الهمزة', 9], ['Al-Fil', 'الفيل', 5],
  ['Quraysh', 'قريش', 4], ["Al-Ma'un", 'الماعون', 7], ['Al-Kawthar', 'الكوثر', 3],
  ['Al-Kafirun', 'الكافرون', 6], ['An-Nasr', 'النصر', 3], ['Al-Masad', 'المسد', 5],
  ['Al-Ikhlas', 'الإخلاص', 4], ['Al-Falaq', 'الفلق', 5], ['An-Nas', 'الناس', 6],
];

// Juz start positions [surah, ayah].
const JUZ_STARTS = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 83], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

export const SURAHS = [];
let offset = 0;
RAW.forEach(([name, ar, ayahs], i) => {
  SURAHS.push({ n: i + 1, name, ar, ayahs, offset });
  offset += ayahs;
});
export const TOTAL_AYAHS = offset; // 6236

export function surah(n) {
  return SURAHS[n - 1];
}

/** Absolute index (0-based, mushaf order) of a position. */
export function toIndex({ s, a }) {
  return SURAHS[s - 1].offset + a - 1;
}

export function fromIndex(i) {
  let lo = 0, hi = SURAHS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SURAHS[mid].offset <= i) lo = mid; else hi = mid - 1;
  }
  return { s: lo + 1, a: i - SURAHS[lo].offset + 1 };
}

export const JUZ = JUZ_STARTS.map(([s, a], i) => {
  const start = SURAHS[s - 1].offset + a - 1;
  const next = JUZ_STARTS[i + 1];
  const end = next ? SURAHS[next[0] - 1].offset + next[1] - 2 : TOTAL_AYAHS - 1;
  return { n: i + 1, start, end };
});

export function juzOfIndex(i) {
  for (let j = JUZ.length - 1; j >= 0; j--) if (JUZ[j].start <= i) return j + 1;
  return 1;
}

export function isValidPos(p) {
  return p && Number.isInteger(p.s) && p.s >= 1 && p.s <= 114 && Number.isInteger(p.a) && p.a >= 1 && p.a <= SURAHS[p.s - 1].ayahs;
}

/** Range as absolute [start, end] indices, inclusive. */
export function rangeIdx(from, to) {
  const x = toIndex(from), y = toIndex(to);
  return x <= y ? [x, y] : [y, x];
}

export function ayahCount(from, to) {
  const [x, y] = rangeIdx(from, to);
  return y - x + 1;
}

export function juzSpan(from, to) {
  const [x, y] = rangeIdx(from, to);
  const a = juzOfIndex(x), b = juzOfIndex(y);
  return a === b ? `Juz ${a}` : `Juz ${a}–${b}`;
}

/** "Al-Baqarah 1–25", "Al-Mulk 1 – Al-Qalam 52", or "Al-Mulk" for a whole surah. */
export function formatRange(from, to, { arabic = false } = {}) {
  const A = surah(from.s), B = surah(to.s);
  const nm = (x) => (arabic ? x.ar : x.name);
  if (from.s === to.s) {
    if (from.a === 1 && to.a === A.ayahs) return nm(A);
    return from.a === to.a ? `${nm(A)} ${from.a}` : `${nm(A)} ${from.a}–${to.a}`;
  }
  const whole = from.a === 1 && to.a === B.ayahs;
  return whole ? `${nm(A)} – ${nm(B)}` : `${nm(A)} ${from.a} – ${nm(B)} ${to.a}`;
}

/** Normalize text for matching surah names (Latin or Arabic). */
export function normalizeName(t) {
  return String(t)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^a-z0-9؀-ۿ]/g, '')
    .replace(/^(al|an|ar|as|at|ash|adh|ad|az|aal)(?=[a-z]{3})/, '')
    .replace(/^ال/, '');
}

const NAME_KEYS = SURAHS.map((s) => [normalizeName(s.name), normalizeName(s.ar)]);

/** Surah numbers whose name matches the query (substring, normalized). */
export function matchSurahs(q) {
  const k = normalizeName(q);
  if (k.length < 2) return [];
  return SURAHS.filter((_, i) => NAME_KEYS[i][0].includes(k) || NAME_KEYS[i][1].includes(k)).map((s) => s.n);
}
