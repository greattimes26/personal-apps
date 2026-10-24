// Hifz domain logic: sessions, dates, plan generators and insights.
// UI-free so the iPhone version can reuse it.
//
// Session item:
// { id, type: 'memorize' | 'review', date: 'YYYY-MM-DD', from: {s,a}, to: {s,a},
//   rating: null | 1..4, note, planned, createdAt, updatedAt, deleted }

import { SURAHS, TOTAL_AYAHS, JUZ, toIndex, fromIndex, rangeIdx, isValidPos, surah } from '../../shared/quran.js';

export const APP = 'hifz';
export const SCHEMA_VERSION = 1;

export const RATINGS = [
  { v: 4, key: 'excellent', label: 'Excellent', short: 'Exc' },
  { v: 3, key: 'verygood', label: 'Very Good', short: 'V.Good' },
  { v: 2, key: 'good', label: 'Good', short: 'Good' },
  { v: 1, key: 'poor', label: 'Poor', short: 'Poor' },
];
export const ratingInfo = (v) => RATINGS.find((r) => r.v === v);

export const TYPES = { memorize: 'Memorization', review: 'Review' };

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function validateItem(i) {
  return (i.type === 'memorize' || i.type === 'review') &&
    /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    (i.deleted || (isValidPos(i.from) && isValidPos(i.to))) &&
    (i.rating == null || [1, 2, 3, 4].includes(i.rating));
}

export function migrate(items /*, fromVersion */) {
  return items; // schema v1 is the first version
}

// ---------- dates (local calendar days as 'YYYY-MM-DD') ----------

const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => dateStr(new Date());
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
export const weekday = (s) => WEEKDAYS[parseDate(s).getDay()];
export const weekdayIndex = (s) => parseDate(s).getDay();
/** Whole days from a to b. */
export const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

export function formatDate(s, { year = true } = {}) {
  return parseDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}
export function formatLongDate(s) {
  return parseDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function formatMonth(ym) {
  return parseDate(`${ym}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
export function hijri(s) {
  try {
    return parseDate(s).toLocaleDateString('en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

// ---------- sessions ----------

/** done | today | planned | missed */
export function status(item, t = today()) {
  if (item.rating) return 'done';
  if (item.date < t) return 'missed';
  if (item.date === t) return 'today';
  return 'planned';
}
export const STATUS_LABEL = { done: 'Done', today: 'To do', planned: 'Planned', missed: 'Not done' };

export function sizeOf(item) {
  const [x, y] = rangeIdx(item.from, item.to);
  return y - x + 1;
}

export function sortSessions(list) {
  const order = { memorize: 0, review: 1 };
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || order[a.type] - order[b.type] || toIndex(a.from) - toIndex(b.from));
}

/** Position after the furthest memorization (done or planned), or null. */
export function nextMemorizeStart(items, { before } = {}) {
  let max = -1;
  for (const i of items) {
    if (i.deleted || i.type !== 'memorize') continue;
    if (before && i.date >= before) continue;
    max = Math.max(max, rangeIdx(i.from, i.to)[1]);
  }
  return max >= 0 && max < TOTAL_AYAHS - 1 ? fromIndex(max + 1) : null;
}

/** Whether a session's range covers ayah index i / overlaps [x, y]. */
export function overlaps(item, x, y) {
  const [a, b] = rangeIdx(item.from, item.to);
  return a <= y && b >= x;
}

// ---------- plan generators ----------

/** Dates from start for `days` days, keeping only the chosen weekdays (0=Sunday). */
export function planDates(start, days, weekdays) {
  const out = [];
  for (let k = 0; k < days; k++) {
    const d = addDays(start, k);
    if (weekdays.includes(weekdayIndex(d))) out.push(d);
  }
  return out;
}

/**
 * New memorization: `perDay` ayahs per date starting at `start`.
 * order 'forward': mushaf order, may span surahs.
 * order 'backward': surahs from the start surah down toward Al-Fatihah (Juz 'Amma style);
 *   ayahs ascend inside each surah and a day never spans two surahs.
 */
export function generateMemorize({ start, perDay, order, dates }) {
  const out = [];
  if (order === 'forward') {
    let i = toIndex(start);
    for (const date of dates) {
      if (i >= TOTAL_AYAHS) break;
      const end = Math.min(i + perDay - 1, TOTAL_AYAHS - 1);
      out.push({ date, from: fromIndex(i), to: fromIndex(end) });
      i = end + 1;
    }
  } else {
    let s = start.s, a = start.a;
    for (const date of dates) {
      if (s < 1) break;
      const n = surah(s).ayahs;
      const end = Math.min(a + perDay - 1, n);
      out.push({ date, from: { s, a }, to: { s, a: end } });
      if (end >= n) { s -= 1; a = 1; } else a = end + 1;
    }
  }
  return out;
}

/** Split [x, y] into units: 'surah' or 'juz' boundaries, or fixed ayah chunks. */
function units(x, y, unit, size) {
  const cuts = [];
  if (unit === 'ayahs') {
    for (let i = x; i <= y; i += size) cuts.push([i, Math.min(i + size - 1, y)]);
    return cuts;
  }
  const bounds = unit === 'juz' ? JUZ.map((j) => [j.start, j.end]) : SURAHS.map((s) => [s.offset, s.offset + s.ayahs - 1]);
  for (const [a, b] of bounds) if (a <= y && b >= x) cuts.push([Math.max(a, x), Math.min(b, y)]);
  return cuts;
}

/**
 * Review rotation over [from, to]: each date gets the next `perDay` units
 * (surahs, juz, or a chunk of ayahs), wrapping to the start when it reaches the end.
 */
export function generateReview({ from, to, unit, perDay, dates }) {
  const [x, y] = rangeIdx(from, to);
  const list = unit === 'ayahs' ? units(x, y, 'ayahs', perDay) : units(x, y, unit);
  const step = unit === 'ayahs' ? 1 : perDay;
  const out = [];
  let k = 0;
  for (const date of dates) {
    if (k >= list.length) k = 0;
    const take = list.slice(k, Math.min(k + step, list.length));
    k += take.length;
    out.push({ date, from: fromIndex(take[0][0]), to: fromIndex(take[take.length - 1][1]) });
  }
  return out;
}

// ---------- insights ----------

const dayNum = (s) => Math.round(parseDate(s) / 86400000);

/** Latest state of every ayah, from done sessions (memorize or review). */
export function ayahState(items) {
  const rating = new Int8Array(TOTAL_AYAHS);       // latest rating, 0 = never
  const last = new Int32Array(TOTAL_AYAHS);        // day number of latest session
  const lastDate = new Array(TOTAL_AYAHS);
  const memorized = new Uint8Array(TOTAL_AYAHS);   // covered by a done memorization
  const done = items.filter((i) => !i.deleted && i.rating).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.updatedAt < b.updatedAt ? -1 : 1));
  for (const it of done) {
    const [x, y] = rangeIdx(it.from, it.to);
    const dn = dayNum(it.date);
    for (let i = x; i <= y; i++) {
      rating[i] = it.rating;
      last[i] = dn;
      lastDate[i] = it.date;
      if (it.type === 'memorize') memorized[i] = 1;
    }
  }
  return { rating, last, lastDate, memorized };
}

function streaks(daysSet, t) {
  let current = 0;
  let d = daysSet.has(t) ? t : addDays(t, -1);
  while (daysSet.has(d)) { current++; d = addDays(d, -1); }
  const sorted = [...daysSet].sort();
  let longest = 0, run = 0, prev = null;
  for (const s of sorted) {
    run = prev && dayDiff(prev, s) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = s;
  }
  return { current, longest };
}

/** Contiguous ayah runs (within one surah) whose latest rating is in `levels`. */
function ratingRuns(st, levels) {
  const runs = [];
  let cur = null;
  for (let i = 0; i < TOTAL_AYAHS; i++) {
    const r = st.rating[i];
    const pos = fromIndex(i);
    if (levels.includes(r) && cur && cur.rating === r && cur.to.s === pos.s && cur.end === i - 1) {
      cur.to = pos; cur.end = i;
      if (st.lastDate[i] > cur.date) cur.date = st.lastDate[i];
    } else if (levels.includes(r)) {
      cur = { rating: r, from: pos, to: pos, start: i, end: i, date: st.lastDate[i] };
      runs.push(cur);
    } else cur = null;
  }
  return runs;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function insights(items, t = today()) {
  const live = items.filter((i) => !i.deleted);
  const done = live.filter((i) => i.rating);
  const st = ayahState(live);
  const tn = dayNum(t);

  let known = 0, memorizedNew = 0;
  for (let i = 0; i < TOTAL_AYAHS; i++) { if (st.rating[i]) known++; if (st.memorized[i]) memorizedNew++; }

  const perSurah = SURAHS.map((s) => {
    let k = 0, sum = 0, oldest = Infinity, newest = -Infinity, poor = 0;
    for (let i = s.offset; i < s.offset + s.ayahs; i++) {
      if (!st.rating[i]) continue;
      k++; sum += st.rating[i];
      if (st.rating[i] === 1) poor++;
      oldest = Math.min(oldest, st.last[i]);
      newest = Math.max(newest, st.last[i]);
    }
    return {
      n: s.n, known: k, coverage: k / s.ayahs, avg: k ? sum / k : null, poor,
      staleDays: k ? tn - oldest : null, lastDays: k ? tn - newest : null,
    };
  });

  const perJuz = JUZ.map((j) => {
    let k = 0, sum = 0;
    for (let i = j.start; i <= j.end; i++) if (st.rating[i]) { k++; sum += st.rating[i]; }
    return { n: j.n, known: k, coverage: k / (j.end - j.start + 1), avg: k ? sum / k : null };
  });

  const activeDays = new Set(done.map((i) => i.date));
  const { current, longest } = streaks(activeDays, t);

  const inWindow = (i, from, to) => i.date >= from && i.date <= to;
  const d30 = addDays(t, -29), d60 = addDays(t, -59);
  const recent = done.filter((i) => inWindow(i, d30, t));
  const prior = done.filter((i) => inWindow(i, d60, addDays(t, -30)));
  const byType = (list, type) => list.filter((i) => i.type === type).map((i) => i.rating);

  const distribution = { memorize: { 1: 0, 2: 0, 3: 0, 4: 0 }, review: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  done.forEach((i) => distribution[i.type][i.rating]++);

  const weekdays = WEEKDAYS.map((name, w) => {
    const list = done.filter((i) => weekdayIndex(i.date) === w);
    return { name, w, sessions: list.length, days: new Set(list.map((i) => i.date)).size, avg: avg(list.map((i) => i.rating)) };
  });

  const activity = new Map(); // date -> { sessions, ayahs, avg }
  for (const i of done) {
    const a = activity.get(i.date) || { sessions: 0, ayahs: 0, sum: 0 };
    a.sessions++; a.ayahs += sizeOf(i); a.sum += i.rating;
    activity.set(i.date, a);
  }

  const months = [];
  for (let m = 11; m >= 0; m--) {
    const d = parseDate(t); d.setDate(1); d.setMonth(d.getMonth() - m);
    const ym = dateStr(d).slice(0, 7);
    const list = done.filter((i) => i.date.startsWith(ym));
    months.push({
      ym,
      memorized: list.filter((i) => i.type === 'memorize').reduce((n, i) => n + sizeOf(i), 0),
      reviewed: list.filter((i) => i.type === 'review').reduce((n, i) => n + sizeOf(i), 0),
    });
  }

  const pastPlanned = live.filter((i) => inWindow(i, d30, addDays(t, -1)));
  const adherence = {
    done: pastPlanned.filter((i) => i.rating).length,
    missed: pastPlanned.filter((i) => !i.rating).length,
  };
  const upcoming = live.filter((i) => !i.rating && i.date >= t);

  const attention = ratingRuns(st, [1, 2]).sort((a, b) => a.rating - b.rating || (a.date < b.date ? 1 : -1));
  const strong = ratingRuns(st, [4]).sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const stale = perSurah.filter((s) => s.known && s.staleDays >= 30).sort((a, b) => b.staleDays - a.staleDays);

  return {
    known, memorizedNew, perSurah, perJuz, st,
    activeDays: activeDays.size,
    activeDays30: new Set(recent.map((i) => i.date)).size,
    streak: current, longestStreak: longest,
    avg30: { memorize: avg(byType(recent, 'memorize')), review: avg(byType(recent, 'review')) },
    avgPrior: { memorize: avg(byType(prior, 'memorize')), review: avg(byType(prior, 'review')) },
    sessions: done.length,
    distribution, weekdays, activity, months, adherence, upcoming,
    attention, strong, stale,
  };
}
