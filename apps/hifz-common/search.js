// History search and filters, shared by the Mac and iPhone apps.
import { JUZ, surah, toIndex, rangeIdx, matchSurahs, isValidPos, normalizeName } from '../../shared/quran.js';
import * as M from './model.js';
import { AR_WEEKDAYS, AR_RATINGS } from './i18n.js';

const AR_WD_KEYS = AR_WEEKDAYS.map(normalizeName);
const AR_RATING_KEYS = Object.fromEntries(Object.entries(AR_RATINGS).map(([k, v]) => [normalizeName(k), v]));

export const freshFilters = (extra = {}) => ({ q: '', type: 'all', ratings: new Set(), status: 'all', preset: 'past', from: '', to: '', limit: 200, ...extra });

/**
 * Search: "2:255", "2:1-20", "18" (surah), "juz 30" / "جزء 30", surah names (Latin/Arabic),
 * weekdays and ratings (English/Arabic), note text. Tokens are ANDed.
 */
export function matcher(q) {
  const raw = q.trim().toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/(?:juz|(?:ال)?جزء)\s*(\d+)/g, 'juz$1')
    .replace(/very\s+good|جيد\s+جد[اًا]+/g, 'verygood')
    .replace(/not\s+done|لم\s+يتم/g, 'notdone')
    .replace(/سور[ةه]\s+/g, 'surah:');
  if (!raw) return () => true;
  const tests = raw.split(/\s+/).map((tok) => {
    let m;
    if ((m = tok.match(/^(\d{1,3}):(\d{1,3})$/))) {
      const p = { s: Number(m[1]), a: Number(m[2]) };
      if (!isValidPos(p)) return () => false;
      const i = toIndex(p);
      return (it) => M.overlaps(it, i, i);
    }
    if ((m = tok.match(/^(\d{1,3}):(\d{1,3})-(\d{1,3})$/))) {
      const s = Number(m[1]);
      if (!isValidPos({ s, a: Number(m[2]) }) || !isValidPos({ s, a: Number(m[3]) })) return () => false;
      const [x, y] = rangeIdx({ s, a: Number(m[2]) }, { s, a: Number(m[3]) });
      return (it) => M.overlaps(it, x, y);
    }
    if ((m = tok.match(/^#?(\d{1,3})$/)) && Number(m[1]) >= 1 && Number(m[1]) <= 114) {
      const s = surah(Number(m[1]));
      return (it) => M.overlaps(it, s.offset, s.offset + s.ayahs - 1);
    }
    if ((m = tok.match(/^juz(\d{1,2})$/)) && JUZ[Number(m[1]) - 1]) {
      const j = JUZ[Number(m[1]) - 1];
      return (it) => M.overlaps(it, j.start, j.end);
    }
    const surahOnly = tok.startsWith('surah:');
    const word = surahOnly ? tok.slice(6) : tok;
    const surahs = matchSurahs(word).map(surah);
    const bySurah = (it) => surahs.some((s) => M.overlaps(it, s.offset, s.offset + s.ayahs - 1));
    if (surahOnly) return bySurah;
    // An exact Arabic weekday (e.g. الجمعة) means the day; use "سورة الجمعة" for the surah.
    const arWd = AR_WD_KEYS.indexOf(normalizeName(word));
    if (arWd >= 0) return (it) => M.weekdayIndex(it.date) === arWd;
    const wd = tok.length >= 3 ? M.WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(tok)) : -1;
    const rating = M.RATINGS.find((r) => r.key === tok)?.v || AR_RATING_KEYS[normalizeName(tok)];
    return (it) =>
      (wd >= 0 && M.weekdayIndex(it.date) === wd) ||
      (rating && it.rating === rating) ||
      (tok === 'notdone' && M.status(it) === 'missed') ||
      bySurah(it) ||
      (it.note || '').toLowerCase().includes(tok) ||
      it.date.includes(tok);
  });
  return (it) => tests.every((fn) => fn(it));
}

export function presetRange(p) {
  const td = M.today();
  switch (p) {
    case '7': return [M.addDays(td, -6), td];
    case '30': return [M.addDays(td, -29), td];
    case '90': return [M.addDays(td, -89), td];
    case 'month': return [`${td.slice(0, 7)}-01`, td];
    case 'past': return ['', td];
    case 'future': return [M.addDays(td, 1), ''];
    default: return ['', ''];
  }
}

/** Sessions matching the filters, newest first. */
export function filterSessions(items, H) {
  const m = matcher(H.q);
  const [pf, pt] = H.preset === 'custom' ? [H.from, H.to] : presetRange(H.preset);
  return M.sortSessions(items.filter((it) =>
    (H.type === 'all' || it.type === H.type) &&
    (!H.ratings.size || H.ratings.has(it.rating || 0)) &&
    (H.status === 'all' || M.status(it) === H.status || (H.status === 'planned' && M.status(it) === 'today')) &&
    (!pf || it.date >= pf) && (!pt || it.date <= pt) &&
    m(it))).reverse();
}
