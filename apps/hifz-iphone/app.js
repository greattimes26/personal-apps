// Hifz — iPhone UI. Data/logic lives in ../hifz-common/ and /shared/.
import { createStore, requestPersistence } from '../../shared/store.js';
import { SURAHS, JUZ, TOTAL_AYAHS, surah, ayahCount, toIndex, fromIndex, isValidPos } from '../../shared/quran.js';
import * as M from '../hifz-common/model.js';
import {
  t, count, setLang, applyDocLang, isAr, lang, addStrings,
  ratingLabel, ratingName, typeLabel, typeShort, statusLabel, surahName, rangeLabel, juzLabel, surahOption,
  weekdayName, weekdayShort, weekdayByIndex, fmtDate, fmtLongDate, fmtMonth, fmtMonthShort, fmtMonthTiny, fmtDateTime, hijri,
} from '../hifz-common/i18n.js';
import { freshFilters, filterSessions } from '../hifz-common/search.js';

addStrings({
  en: {
    'nav.more': 'More', r3short: 'V. Good',
    backupSub: 'Your data stays on this iPhone, inside the Home Screen app. Export a file to back it up or move it to your Mac.',
    exportTip: 'Export opens the share sheet: choose “Save to Files”, then iCloud Drive.',
    installTitle: 'Add Hifz to your Home Screen',
    installSteps: 'In Safari, tap the Share button, then “Add to Home Screen”. Always open Hifz from that icon: data in a Safari tab is kept separately.',
    gotIt: 'Got it', language: 'Language', backupTitle: 'Backup',
    addMem: '+ Add memorization', addRev: '+ Add review',
    filters: 'Filters', done: 'Done', seeAll: 'Show all ({n})', showLess: 'Show less',
    openHistory: 'Open history', tapTile: 'Tap a tile to see details.',
    tileKnown: '{p}% known', tileAvg: 'Average: {r}', tileLast: 'Oldest part last seen {d}',
    activitySubM: 'last 17 weeks · darker = more ayahs', autoShort: 'Auto-plan', clearShort: 'Clear',
    planWindow: '{a} – {b}', addFor: 'Add for {day}',
  },
  ar: {
    'nav.more': 'المزيد',
    backupSub: 'بياناتك محفوظة على هذا الآيفون داخل تطبيق الشاشة الرئيسية. صدّر ملفاً لحفظ نسخة احتياطية أو لنقلها إلى الماك.',
    exportTip: 'يفتح التصدير قائمة المشاركة: اختر «حفظ في الملفات» ثم iCloud Drive.',
    installTitle: 'أضف «حفظ» إلى الشاشة الرئيسية',
    installSteps: 'في Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية». افتح التطبيق دائماً من تلك الأيقونة؛ بيانات تبويب Safari منفصلة عنه.',
    gotIt: 'حسناً', language: 'اللغة', backupTitle: 'النسخ الاحتياطي',
    addMem: '+ إضافة حفظ', addRev: '+ إضافة مراجعة',
    filters: 'تصفية', done: 'تم', seeAll: 'عرض الكل ({n})', showLess: 'عرض أقل',
    openHistory: 'عرض السجل', tapTile: 'اضغط على مربع لعرض تفاصيله.',
    tileKnown: 'محفوظ {p}%', tileAvg: 'المتوسط: {r}', tileLast: 'أقدم جزء رُوجع {d}',
    activitySubM: 'آخر 17 أسبوعاً · الأغمق = آيات أكثر', autoShort: 'تخطيط تلقائي', clearShort: 'مسح',
    planWindow: '{a} – {b}', addFor: 'إضافة ليوم {day}',
  },
});

const store = createStore({ app: M.APP, schemaVersion: M.SCHEMA_VERSION, migrate: M.migrate, validate: M.validateItem });

const VIEWS = ['day', 'plan', 'history', 'insights', 'more'];
const S = {
  items: [],
  view: 'day',
  day: M.today(),
  planStart: M.today(),
  hist: freshFilters(),
  mapMode: 'surah',
  tileSel: null,
  expanded: new Set(),
  lastImport: null,
  persisted: undefined,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const sheet = $('#sheet');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------- data ----------

async function reload() {
  S.items = await store.all();
  renderChrome();
  render();
}

async function save(item) {
  await store.put(item);
  await reload();
}

const sessionsOn = (date) => M.sortSessions(S.items.filter((i) => i.date === date));

function relDay(d) {
  const n = M.dayDiff(M.today(), d);
  if (n === 0) return t('today');
  if (n === 1) return t('tomorrow');
  if (n === -1) return t('yesterday');
  return n > 0 ? t('inN', { n: count(n, 'day') }) : t('nAgo', { n: count(-n, 'day') });
}

// ---------- small pieces ----------

const ratingPill = (v) => (v ? `<span class="pill r${v}"><i></i>${ratingLabel(v)}</span>` : '');
const statusBadge = (it) => { const s = M.status(it); return `<span class="badge st-${s}">${statusLabel(s)}</span>`; };

// Four equal buttons; English "Very Good" is shortened so all four fit on small iPhones.
const rateLabel = (v) => (v === 3 && !isAr() ? t('r3short') : ratingLabel(v));
function rateButtons(current, disabled) {
  return `<div class="rate" role="group" aria-label="${t('rating')}">${M.RATINGS.map((r) =>
    `<button type="button" class="rb r${r.v}" data-rate="${r.v}" aria-pressed="${current === r.v}" aria-label="${ratingLabel(r.v)}" ${disabled ? 'disabled' : ''}><i></i>${rateLabel(r.v)}</button>`).join('')}</div>`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

const chevron = (dir) => `<svg viewBox="0 0 24 24" class="chev ${dir}" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;

// ---------- sheet (bottom modal) ----------

let onSheetClose = null;
function openSheet(html, onClose = null) {
  sheet.innerHTML = html;
  onSheetClose = onClose;
  document.documentElement.classList.add('sheet-open');
  sheet.showModal();
  sheet.scrollTop = 0;
  return sheet;
}
// Cleanup runs directly rather than relying on the dialog's 'close' event alone.
function sheetClosed() {
  document.documentElement.classList.remove('sheet-open');
  const fn = onSheetClose;
  onSheetClose = null;
  fn?.();
}
function closeSheet() {
  if (sheet.open) sheet.close();
  sheetClosed();
}
sheet.addEventListener('close', sheetClosed); // Escape key and other native closes
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

const sheetHead = (title, saveLabel) => `<header class="sh-head">
  <button type="button" class="link" data-close>${t('cancel')}</button>
  <h2>${title}</h2>
  ${saveLabel ? `<button type="submit" class="link strong" data-save>${saveLabel}</button>` : '<span></span>'}
</header>`;

// ---------- range picker ----------

const surahOptions = (sel) => SURAHS.map((s) => `<option value="${s.n}" ${s.n === sel ? 'selected' : ''}>${esc(surahOption(s))}</option>`).join('');

const stepper = (k, p) => `<div class="stepper">
  <button type="button" data-step="${k}" data-d="-1" aria-label="−">−</button>
  <input type="number" inputmode="numeric" pattern="[0-9]*" data-a="${k}" min="1" max="${surah(p.s).ayahs}" value="${p.a}" aria-label="${t(k === 'from' ? 'fromAyah' : 'toAyah')}">
  <button type="button" data-step="${k}" data-d="1" aria-label="+">+</button>
</div>`;

function rangePickerHTML(from, to) {
  return `<div class="rp" data-rp>
    <div class="rp-row"><span class="lbl">${t('from')}</span>
      <select data-s="from" aria-label="${t('fromSurah')}">${surahOptions(from.s)}</select>${stepper('from', from)}</div>
    <div class="rp-row"><span class="lbl">${t('to')}</span>
      <select data-s="to" aria-label="${t('toSurah')}">${surahOptions(to.s)}</select>${stepper('to', to)}</div>
    <div class="rp-quick">
      <button type="button" class="chip-btn" data-whole>${t('wholeSurah')}</button>
      <select class="chip-btn" data-juz aria-label="${t('wholeJuz')}"><option value="">${t('wholeJuz')}</option>${JUZ.map((j) => `<option value="${j.n}">${t('juzN', { n: j.n })}</option>`).join('')}</select>
    </div>
    <div class="rp-sum" data-sum></div>
  </div>`;
}

function bindRangePicker(root, onChange = () => {}) {
  const el = $('[data-rp]', root);
  const sel = (k) => $(`[data-s="${k}"]`, el);
  const inp = (k) => $(`[data-a="${k}"]`, el);
  const read = (k) => ({ s: Number(sel(k).value), a: Number(inp(k).value) });
  const write = (k, p) => { sel(k).value = p.s; inp(k).max = surah(p.s).ayahs; inp(k).value = p.a; };

  function get() {
    const from = read('from'), to = read('to');
    if (!isValidPos(from) || !isValidPos(to) || toIndex(to) < toIndex(from)) return null;
    return { from, to };
  }
  function update() {
    const v = get();
    const sum = $('[data-sum]', el);
    if (!v) {
      const from = read('from'), to = read('to');
      sum.textContent = isValidPos(from) && isValidPos(to) ? t('errOrder') : t('errAyah');
      sum.classList.add('err');
    } else {
      sum.textContent = `${count(ayahCount(v.from, v.to), 'ayah')} · ${juzLabel(v.from, v.to)}`;
      sum.classList.remove('err');
    }
    onChange(v);
  }
  sel('from').addEventListener('change', () => {
    const s = Number(sel('from').value);
    write('from', { s, a: 1 });
    if (toIndex(read('to')) < toIndex({ s, a: 1 }) || read('to').s !== s) write('to', { s, a: surah(s).ayahs });
    update();
  });
  sel('to').addEventListener('change', () => { const s = Number(sel('to').value); write('to', { s, a: surah(s).ayahs }); update(); });
  $$('input', el).forEach((i) => i.addEventListener('input', update));
  $$('[data-step]', el).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.step;
    const p = read(k);
    write(k, { s: p.s, a: Math.min(surah(p.s).ayahs, Math.max(1, (p.a || 1) + Number(b.dataset.d))) });
    update();
  }));
  $('[data-whole]', el).addEventListener('click', () => {
    const s = read('from').s;
    write('from', { s, a: 1 });
    write('to', { s, a: surah(s).ayahs });
    update();
  });
  $('[data-juz]', el).addEventListener('change', (e) => {
    const j = JUZ[Number(e.target.value) - 1];
    if (!j) return;
    write('from', fromIndex(j.start));
    write('to', fromIndex(j.end));
    e.target.value = '';
    update();
  });
  update();
  return { get, set: (from, to) => { write('from', from); write('to', to); update(); } };
}

function defaultRange(type, date) {
  if (type === 'memorize') {
    const from = M.nextMemorizeStart(S.items, { before: M.addDays(date, 1) }) || { s: 1, a: 1 };
    return { from, to: { s: from.s, a: Math.min(from.a + 4, surah(from.s).ayahs) } };
  }
  const prev = M.sortSessions(S.items.filter((i) => i.type === 'review' && i.date <= date)).pop();
  return prev ? { from: prev.from, to: prev.to } : { from: { s: 1, a: 1 }, to: { s: 1, a: 7 } };
}

// ---------- session editor ----------

function openEditor(item) {
  const isNew = !item.id;
  const it = { note: '', rating: null, ...item };
  if (!it.from) Object.assign(it, defaultRange(it.type, it.date));
  openSheet(`<form class="sheet-form" method="dialog">
    ${sheetHead(isNew ? t('newSession') : t('editSession'), isNew ? t('addBtn') : t('save'))}
    <div class="sh-body">
      <div class="seg full" data-type>
        <button type="button" data-v="memorize" aria-pressed="${it.type === 'memorize'}">${typeLabel('memorize')}</button>
        <button type="button" data-v="review" aria-pressed="${it.type === 'review'}">${typeLabel('review')}</button>
      </div>
      <label class="group"><span class="g-lbl">${t('date')}</span>
        <span class="date-row"><input type="date" name="date" value="${it.date}" required><b class="wd"></b></span></label>
      <div class="group"><span class="g-lbl">${t('range')}</span>${rangePickerHTML(it.from, it.to)}</div>
      <div class="group"><span class="g-lbl">${t('rating')}</span>${rateButtons(it.rating)}<p class="hint" data-rate-hint></p></div>
      <label class="group"><span class="g-lbl">${t('note')}</span><textarea name="note" rows="3" placeholder="${t('notePh')}">${esc(it.note)}</textarea></label>
      ${isNew ? '' : `<button type="button" class="danger-row" data-del>${t('del')}</button>`}
    </div>
  </form>`);
  const form = $('form', sheet);
  const rp = bindRangePicker(form, (v) => { $('[data-save]', form).disabled = !v; });
  let type = it.type;
  let rating = it.rating;
  const syncRate = () => $$('[data-rate]', form).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === rating)));
  const syncDate = () => {
    const d = form.date.value;
    $('.wd', form).textContent = d ? `${weekdayName(d)} · ${relDay(d)}` : '';
    const future = d > M.today();
    $$('[data-rate]', form).forEach((b) => { b.disabled = future; });
    if (future) { rating = null; syncRate(); }
    $('[data-rate-hint]', form).textContent = future ? t('futureHint') : t('rateHint');
  };
  $$('[data-type] button', form).forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.v;
    $$('[data-type] button', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (isNew) { const r = defaultRange(type, form.date.value || it.date); rp.set(r.from, r.to); }
  }));
  $$('[data-rate]', form).forEach((b) => b.addEventListener('click', () => {
    const v = Number(b.dataset.rate);
    rating = rating === v ? null : v;
    syncRate();
  }));
  form.date.addEventListener('input', syncDate);
  $('[data-close]', form).addEventListener('click', closeSheet);
  $('[data-del]', form)?.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    await store.remove(it.id);
    closeSheet();
    toast(t('sessionDeleted'));
    await reload();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = rp.get();
    if (!r || !form.date.value) return;
    const date = form.date.value;
    await save({
      ...it, type, date, from: r.from, to: r.to, rating,
      note: form.note.value.trim(),
      planned: isNew ? date > M.today() || (!rating && date >= M.today()) : it.planned,
    });
    closeSheet();
    toast(isNew ? t('sessionAdded') : t('saved'));
  });
  syncDate();
}

// ---------- Day ----------

function sessionCard(it) {
  const future = it.date > M.today();
  return `<article class="card session st-${M.status(it)} t-${it.type}" data-id="${it.id}">
    <button class="sc-main" data-edit>
      <span class="sc-top"><span class="sc-range">${esc(rangeLabel(it.from, it.to))}</span>${statusBadge(it)}</span>
      <span class="sc-meta">${count(M.sizeOf(it), 'ayah')} · ${juzLabel(it.from, it.to)}${it.planned ? ` · ${t('plannedAhead')}` : ''}</span>
      ${it.note ? `<span class="sc-note">${esc(it.note)}</span>` : ''}
    </button>
    ${rateButtons(it.rating, future)}
  </article>`;
}

function installBanner() {
  if (isStandalone()) return '';
  try { if (localStorage.getItem('hifz:install-dismissed')) return ''; } catch { /* ignore */ }
  return `<div class="banner"><b>${t('installTitle')}</b><p>${t('installSteps')}</p><button class="link strong" data-dismiss>${t('gotIt')}</button></div>`;
}

function renderDay() {
  const d = S.day;
  const list = sessionsOn(d);
  const week0 = M.addDays(d, -M.weekdayIndex(d));
  const week = Array.from({ length: 7 }, (_, k) => M.addDays(week0, k));
  const future = d > M.today();
  const section = (type) => {
    const xs = list.filter((i) => i.type === type);
    const addLabel = t(type === 'memorize' ? 'addMem' : 'addRev');
    return `<section class="day-sec">
      <header class="sec-head"><h2>${typeLabel(type)}</h2>${xs.length ? `<button class="link strong" data-add="${type}">${t('add')}</button>` : ''}</header>
      ${xs.map(sessionCard).join('')}
      ${xs.length ? '' : `<button class="add-big" data-add="${type}"><span>${addLabel}</span><small>${t(`empty${type === 'memorize' ? 'Mem' : 'Rev'}${future ? 'Planned' : 'Logged'}`)}</small></button>`}
    </section>`;
  };
  view.innerHTML = `
    ${installBanner()}
    <header class="day-head">
      <button class="icon-btn" data-nav="-1" aria-label="${t('prevDay')}">${chevron('prev')}</button>
      <div class="dh-center">
        <div class="day-wd">${weekdayName(d)}</div>
        <div class="day-date">${fmtLongDate(d)}</div>
        <div class="day-hijri">${esc(hijri(d))}</div>
      </div>
      <button class="icon-btn" data-nav="1" aria-label="${t('nextDay')}">${chevron('next')}</button>
    </header>
    <div class="day-sub">
      ${d === M.today() ? `<span class="today-tag">${t('today')}</span>` : `<button class="pill-btn" data-nav="0">${t('today')}</button><span class="muted">${relDay(d)}</span>`}
      <label class="date-jump">${t('goToDate')}<input type="date" data-pick value="${d}" aria-label="${t('goToDate')}"></label>
    </div>
    <div class="week-strip">${week.map((w) => {
      const xs = sessionsOn(w);
      return `<button class="ws-day ${w === d ? 'sel' : ''} ${w === M.today() ? 'is-today' : ''}" data-go="${w}">
        <span class="ws-wd">${weekdayShort(w).replace(/^ال/, '').slice(0, isAr() ? 6 : 3)}</span><span class="ws-n">${M.parseDate(w).getDate()}</span>
        <span class="ws-dots">${xs.slice(0, 4).map((x) => `<i class="dot ${x.rating ? `r${x.rating}` : `st-${M.status(x)}`}"></i>`).join('')}</span>
      </button>`;
    }).join('')}</div>
    ${section('memorize')}${section('review')}`;

  $$('[data-nav]', view).forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.nav);
    goDay(n === 0 ? M.today() : M.addDays(S.day, n), n);
  }));
  $('[data-pick]', view).addEventListener('change', (e) => { if (e.target.value) goDay(e.target.value); });
  $$('[data-go]', view).forEach((b) => b.addEventListener('click', () => goDay(b.dataset.go)));
  $$('[data-add]', view).forEach((b) => b.addEventListener('click', () => openEditor({ type: b.dataset.add, date: d })));
  $('[data-dismiss]', view)?.addEventListener('click', () => {
    try { localStorage.setItem('hifz:install-dismissed', '1'); } catch { /* ignore */ }
    render();
  });
  $$('.session', view).forEach((card) => {
    const it = S.items.find((i) => i.id === card.dataset.id);
    $('[data-edit]', card).addEventListener('click', () => openEditor(it));
    $$('[data-rate]', card).forEach((b) => b.addEventListener('click', async () => {
      const v = Number(b.dataset.rate);
      await save({ ...it, rating: it.rating === v ? null : v });
    }));
  });
}

function goDay(d, dir = 0) {
  const step = dir || Math.sign(M.dayDiff(S.day, d));
  S.day = d;
  render();
  if (step) {
    view.classList.remove('slide-next', 'slide-prev');
    void view.offsetWidth;
    view.classList.add(step > 0 ? 'slide-next' : 'slide-prev');
  }
}

// Swipe between days. Next day is a swipe toward the reading direction's start.
let touch = null;
view.addEventListener('touchstart', (e) => {
  if (S.view !== 'day' || e.touches.length !== 1 || e.target.closest('input, select, textarea, .week-strip')) { touch = null; return; }
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
view.addEventListener('touchend', (e) => {
  if (!touch || S.view !== 'day') return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  const quick = Date.now() - touch.t < 700;
  touch = null;
  if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
  const next = isAr() ? dx > 0 : dx < 0;
  goDay(M.addDays(S.day, next ? 1 : -1), next ? 1 : -1);
}, { passive: true });

// ---------- Plan ----------

function renderPlan() {
  const start = S.planStart;
  const days = Array.from({ length: 30 }, (_, k) => M.addDays(start, k));
  const end = days[29];
  const inWin = S.items.filter((i) => i.date >= start && i.date <= end);
  const mem = inWin.filter((i) => i.type === 'memorize');
  const memAyahs = mem.reduce((n, i) => n + M.sizeOf(i), 0);
  const lastMem = M.sortSessions(mem).pop();
  const chip = (it) => `<button class="chip t-${it.type} ${it.rating ? `r${it.rating}` : ''}" data-id="${it.id}">
    ${it.rating ? '<i></i>' : ''}<span>${esc(rangeLabel(it.from, it.to))}</span><span class="chip-n">${M.sizeOf(it)}</span></button>`;

  view.innerHTML = `
    <header class="page-head"><h1>${t('nav.plan')}</h1><p class="muted">${t('planSub')}</p></header>
    <div class="plan-nav">
      <button class="icon-btn" data-shift="-30" aria-label="${t('prev30')}">${chevron('prev')}</button>
      <label class="plan-range">${t('planWindow', { a: fmtDate(start, { year: false }), b: fmtDate(end, { year: false }) })}<input type="date" data-start value="${start}" aria-label="${t('planStart')}"></label>
      <button class="icon-btn" data-shift="30" aria-label="${t('next30')}">${chevron('next')}</button>
    </div>
    <div class="plan-actions">
      <button class="primary" data-auto>${t('autoShort')}</button>
      ${start === M.today() ? '' : `<button data-shift="0">${t('fromToday')}</button>`}
      <button data-clear>${t('clearShort')}</button>
    </div>
    <div class="plan-summary">
      <span>${t('daysHave', { n: new Set(inWin.map((i) => i.date)).size })}</span>
      <span>${t('toMemorize', { n: count(memAyahs, 'ayah') })}${lastMem ? ` · ${t('reaching', { x: esc(rangeLabel(lastMem.to, lastMem.to)) })}` : ''}</span>
      <span>${t('reviewCount', { n: count(inWin.filter((i) => i.type === 'review').length, 'session') })}</span>
    </div>
    <div class="plan-list">
      ${days.map((d) => {
        const xs = sessionsOn(d);
        const wd = M.weekdayIndex(d);
        return `<div class="pl-row ${d === M.today() ? 'is-today' : ''} ${wd === 5 ? 'fri' : ''} ${wd === 0 && d !== start ? 'week-start' : ''}">
          <button class="pl-day" data-open="${d}"><b>${weekdayName(d)}</b><span>${fmtDate(d, { year: false })}</span></button>
          <div class="pl-items">${xs.map(chip).join('')}</div>
          <button class="pl-add" data-add="${d}" aria-label="${esc(t('addFor', { day: weekdayName(d) }))}">+</button>
        </div>`;
      }).join('')}
    </div>`;

  $$('[data-shift]', view).forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.shift);
    S.planStart = n === 0 ? M.today() : M.addDays(S.planStart, n);
    render();
  }));
  $('[data-start]', view).addEventListener('change', (e) => { if (e.target.value) { S.planStart = e.target.value; render(); } });
  $$('.chip[data-id]', view).forEach((b) => b.addEventListener('click', () => openEditor(S.items.find((i) => i.id === b.dataset.id))));
  $$('[data-add]', view).forEach((b) => b.addEventListener('click', () => openEditor({ type: 'memorize', date: b.dataset.add })));
  $$('[data-open]', view).forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.open; go('day'); }));
  $('[data-auto]', view).addEventListener('click', openAutoPlan);
  $('[data-clear]', view).addEventListener('click', openClearPlans);
}

function openAutoPlan() {
  const start = S.planStart < M.today() ? M.today() : S.planStart;
  const memStart = M.nextMemorizeStart(S.items) || { s: 1, a: 1 };
  const known = M.ayahState(S.items);
  let firstKnown = -1, lastKnown = -1;
  for (let i = 0; i < TOTAL_AYAHS; i++) if (known.rating[i]) { if (firstKnown < 0) firstKnown = i; lastKnown = i; }
  const revFrom = lastKnown >= 0 ? fromIndex(firstKnown) : { s: 78, a: 1 };
  const revTo = lastKnown >= 0 ? fromIndex(lastKnown) : { s: 114, a: 6 };

  openSheet(`<form class="sheet-form" method="dialog">
    ${sheetHead(t('autoTitle'), t('addBtn'))}
    <div class="sh-body">
      <div class="seg full" data-type>
        <button type="button" data-v="memorize" aria-pressed="true">${typeLabel('memorize')}</button>
        <button type="button" data-v="review" aria-pressed="false">${typeLabel('review')}</button>
      </div>
      <label class="group"><span class="g-lbl">${t('start')}</span><span class="date-row"><input type="date" name="start" value="${start}"><b class="wd"></b></span></label>
      <label class="group"><span class="g-lbl">${t('days')}</span><span class="inline"><input type="number" inputmode="numeric" name="days" min="1" max="30" value="30"> <span class="muted">${t('daysMax')}</span></span></label>
      <div class="group"><span class="g-lbl">${t('on')}</span><div class="wd-boxes">${M.WEEKDAYS.map((_, k) =>
        `<label class="wd-box"><input type="checkbox" name="wd" value="${k}" checked><span>${weekdayByIndex(k, true).replace(/^ال/, '')}</span></label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" name="skip" checked><span>${t('skip')}</span></label>

      <div data-for="memorize">
        <div class="group"><span class="g-lbl">${t('startAt')}</span>
          <div class="rp-row"><select name="ms" aria-label="${t('startSurah')}">${surahOptions(memStart.s)}</select>
          <input type="number" inputmode="numeric" class="num-in" name="ma" min="1" value="${memStart.a}" aria-label="${t('startAyah')}"></div></div>
        <label class="group"><span class="g-lbl">${t('perDay')}</span><span class="inline"><input type="number" inputmode="numeric" class="num-in" name="per" min="1" max="300" value="5"> ${t('ayahsUnit')}</span></label>
        <label class="group"><span class="g-lbl">${t('order')}</span><select name="order">
          <option value="forward">${t('forward')}</option><option value="backward">${t('backward')}</option></select></label>
      </div>

      <div data-for="review" hidden>
        <div class="group"><span class="g-lbl">${t('cycleOver')}</span>${rangePickerHTML(revFrom, revTo)}</div>
        <div class="group"><span class="g-lbl">${t('perDay')}</span><span class="inline"><input type="number" inputmode="numeric" class="num-in" name="rper" min="1" max="300" value="1">
          <select name="unit"><option value="juz">${t('unitJuz')}</option><option value="surah">${t('unitSurah')}</option><option value="ayahs">${t('unitAyahs')}</option></select></span></div>
        <p class="hint">${t('reviewHint')}</p>
      </div>

      <div class="group preview"><span class="g-lbl">${t('preview')} · <span data-count></span></span><ol data-preview></ol></div>
    </div>
  </form>`);
  const form = $('form', sheet);
  let type = 'memorize';
  let plan = [];
  const rp = bindRangePicker($('[data-for="review"]', form), () => preview());

  function compute() {
    const days = Math.max(1, Math.min(30, Number(form.days.value) || 0));
    const wds = $$('[name="wd"]:checked', form).map((c) => Number(c.value));
    let dates = M.planDates(form.start.value || start, days, wds);
    if (form.skip.checked) {
      const taken = new Set(S.items.filter((i) => i.type === type).map((i) => i.date));
      dates = dates.filter((d) => !taken.has(d));
    }
    if (type === 'memorize') {
      const s = Number(form.ms.value);
      const a = Math.min(Math.max(1, Number(form.ma.value) || 1), surah(s).ayahs);
      return M.generateMemorize({ start: { s, a }, perDay: Math.max(1, Number(form.per.value) || 1), order: form.order.value, dates });
    }
    const r = rp.get();
    return r ? M.generateReview({ ...r, unit: form.unit.value, perDay: Math.max(1, Number(form.rper.value) || 1), dates }) : [];
  }
  function preview() {
    if (!form) return;
    const d = form.start.value;
    $('.wd', form).textContent = d ? weekdayName(d) : '';
    plan = compute();
    $('[data-count]', form).textContent = count(plan.length, 'session');
    $('[data-preview]', form).innerHTML = plan.map((p) => `<li><span><b>${weekdayName(p.date)}</b> ${fmtDate(p.date, { year: false })}</span>
      <span>${esc(rangeLabel(p.from, p.to))}</span><span class="muted num">${ayahCount(p.from, p.to)}</span></li>`).join('') || `<li class="muted">${t('nothingToAdd')}</li>`;
    $('[data-save]', form).disabled = !plan.length;
  }
  $$('[data-type] button', form).forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.v;
    $$('[data-type] button', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $$('[data-for]', form).forEach((x) => { x.hidden = x.dataset.for !== type; });
    preview();
  }));
  form.ms.addEventListener('change', () => { form.ma.value = 1; form.ma.max = surah(Number(form.ms.value)).ayahs; preview(); });
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  $('[data-close]', form).addEventListener('click', closeSheet);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!plan.length) return;
    await store.putMany(plan.map((p) => ({ type, date: p.date, from: p.from, to: p.to, rating: null, note: '', planned: true })));
    closeSheet();
    toast(t('addedN', { n: count(plan.length, 'session') }));
    await reload();
  });
  preview();
}

function openClearPlans() {
  const start = S.planStart < M.today() ? M.today() : S.planStart;
  openSheet(`<form class="sheet-form" method="dialog">
    ${sheetHead(t('clearTitle'), t('clear'))}
    <div class="sh-body">
      <p class="muted">${t('clearSub')}</p>
      <label class="group"><span class="g-lbl">${t('from')}</span><input type="date" name="from" value="${start}"></label>
      <label class="group"><span class="g-lbl">${t('to')}</span><input type="date" name="to" value="${M.addDays(start, 29)}"></label>
      <label class="group"><span class="g-lbl">${t('type')}</span><select name="type"><option value="all">${t('bothTypes')}</option><option value="memorize">${t('memOnly')}</option><option value="review">${t('revOnly')}</option></select></label>
      <p class="warn" data-count></p>
    </div>
  </form>`);
  const form = $('form', sheet);
  const pick = () => S.items.filter((i) => !i.rating && i.date >= form.from.value && i.date <= form.to.value && (form.type.value === 'all' || i.type === form.type.value));
  const upd = () => {
    const n = pick().length;
    $('[data-count]', form).textContent = t('willRemove', { n: count(n, 'session') });
    $('[data-save]', form).disabled = !n;
  };
  form.addEventListener('input', upd);
  form.addEventListener('change', upd);
  $('[data-close]', form).addEventListener('click', closeSheet);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = pick().map((i) => i.id);
    await store.removeMany(ids);
    closeSheet();
    toast(t('removedN', { n: count(ids.length, 'session') }));
    await reload();
  });
  upd();
}

// ---------- History ----------

const activeFilters = (H) => (H.ratings.size ? 1 : 0) + (H.status !== 'all' ? 1 : 0) + (H.preset !== 'past' ? 1 : 0);

function renderHistory() {
  const H = S.hist;
  view.innerHTML = `
    <header class="page-head"><h1>${t('nav.history')}</h1></header>
    <div class="search-bar">
      <input type="search" data-q value="${esc(H.q)}" placeholder="${t('searchPh')}" aria-label="${t('searchAria')}" autocomplete="off" autocorrect="off" spellcheck="false">
      <div class="search-tools">
        <div class="seg small" data-ftype>
          ${[['all', t('all')], ['memorize', typeLabel('memorize')], ['review', typeLabel('review')]].map(([v, l]) => `<button data-v="${v}" aria-pressed="${H.type === v}">${l}</button>`).join('')}
        </div>
        <button class="filter-btn" data-filters>${t('filters')}${activeFilters(H) ? `<b>${activeFilters(H)}</b>` : ''}</button>
      </div>
    </div>
    <div data-list></div>`;
  const q = $('[data-q]', view);
  q.addEventListener('input', () => { H.q = q.value; H.limit = 200; renderHistoryList(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
  $$('[data-ftype] button', view).forEach((b) => b.addEventListener('click', () => { H.type = b.dataset.v; renderHistory(); }));
  $('[data-filters]', view).addEventListener('click', openFilters);
  renderHistoryList();
}

function renderHistoryList() {
  const H = S.hist;
  const all = filterSessions(S.items, H);
  const shown = all.slice(0, H.limit);
  const days = [...new Set(all.map((i) => i.date))];
  const months = [...new Set(all.map((i) => i.date.slice(0, 7)))];
  const ayahs = all.reduce((n, i) => n + M.sizeOf(i), 0);

  let html = `<div class="hist-sum"><span>${t('histSum', { s: count(all.length, 'session'), d: count(days.length, 'day'), a: count(ayahs, 'ayah') })}</span>
    ${months.length > 1 ? `<select data-jump aria-label="${t('jumpMonth')}"><option value="">${t('jumpMonth')}</option>${months.map((ym) => `<option value="${ym}">${fmtMonth(ym)}</option>`).join('')}</select>` : ''}</div>`;
  if (!S.items.length) html += `<div class="empty big">${t('noSessions')}</div>`;
  else if (!all.length) html += `<div class="empty big">${t('noMatch')}</div>`;
  let month = null, day = null;
  for (const it of shown) {
    const ym = it.date.slice(0, 7);
    if (ym !== month) {
      if (day) html += '</div></section>';
      day = null;
      month = ym;
      html += `<h2 class="month-h" id="m-${ym}">${fmtMonth(ym)}</h2>`;
    }
    if (it.date !== day) {
      if (day) html += '</div></section>';
      day = it.date;
      html += `<section class="h-day ${day === M.today() ? 'is-today' : ''}">
        <button class="h-day-head" data-open="${day}"><b>${weekdayName(day)}</b><span>${fmtDate(day)}</span><span class="muted">${relDay(day)}</span></button><div class="h-rows">`;
    }
    html += `<button class="h-row t-${it.type}" data-id="${it.id}">
      <span class="h-type">${typeShort(it.type)}</span>
      <span class="h-main"><span class="h-range">${esc(rangeLabel(it.from, it.to))}</span>${it.note ? `<span class="h-note">${esc(it.note)}</span>` : ''}</span>
      <span class="h-end">${it.rating ? ratingPill(it.rating) : statusBadge(it)}<span class="num muted">${M.sizeOf(it)}</span></span>
    </button>`;
  }
  if (day) html += '</div></section>';
  if (all.length > shown.length) html += `<button class="more" data-more>${t('showMore', { n: (all.length - shown.length).toLocaleString('en-US') })}</button>`;
  const listEl = $('[data-list]', view);
  listEl.innerHTML = html;

  $$('.h-row', listEl).forEach((b) => b.addEventListener('click', () => openEditor(S.items.find((i) => i.id === b.dataset.id))));
  $$('[data-open]', listEl).forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.open; go('day'); }));
  $('[data-more]', listEl)?.addEventListener('click', () => { H.limit += 300; renderHistoryList(); });
  $('[data-jump]', listEl)?.addEventListener('change', (e) => {
    const ym = e.target.value;
    if (!ym) return;
    const idx = all.findIndex((i) => i.date.startsWith(ym));
    if (idx >= H.limit) { H.limit = idx + 100; renderHistoryList(); }
    $(`#m-${ym}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function openFilters() {
  const H = S.hist;
  openSheet(`<form class="sheet-form" method="dialog">
    ${sheetHead(t('filters'), t('done'))}
    <div class="sh-body">
      <div class="group"><span class="g-lbl">${t('rating')}</span>
        <div class="rate wrap" data-frating>${M.RATINGS.map((r) => `<button type="button" class="rb r${r.v}" data-v="${r.v}" aria-pressed="${H.ratings.has(r.v)}"><i></i>${ratingLabel(r.v)}</button>`).join('')}
        <button type="button" class="rb" data-v="0" aria-pressed="${H.ratings.has(0)}">${t('notRated')}</button></div></div>
      <label class="group"><span class="g-lbl">${t('status')}</span><select name="status">
        ${[['all', t('anyStatus')], ['done', t('fDone')], ['planned', t('fPlanned')], ['missed', t('fMissed')]].map(([v, l]) => `<option value="${v}" ${H.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="group"><span class="g-lbl">${t('dateRange')}</span><select name="preset">
        ${[['all', t('allDates')], ['past', t('upToToday')], ['7', t('last7')], ['30', t('last30')], ['90', t('last90')], ['month', t('thisMonth')], ['future', t('upcoming')], ['custom', t('custom')]].map(([v, l]) => `<option value="${v}" ${H.preset === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="group custom ${H.preset === 'custom' ? '' : 'hidden'}">
        <label><span class="g-lbl">${t('fromDate')}</span><input type="date" name="from" value="${H.from}"></label>
        <label><span class="g-lbl">${t('toDate')}</span><input type="date" name="to" value="${H.to}"></label>
      </div>
      <button type="button" class="danger-row neutral" data-reset>${t('reset')}</button>
    </div>
  </form>`, () => { if (S.view === 'history') renderHistory(); });
  const form = $('form', sheet);
  $$('[data-frating] button', form).forEach((b) => b.addEventListener('click', () => {
    const v = Number(b.dataset.v);
    H.ratings.has(v) ? H.ratings.delete(v) : H.ratings.add(v);
    b.setAttribute('aria-pressed', String(H.ratings.has(v)));
  }));
  form.addEventListener('change', () => {
    H.status = form.status.value;
    H.preset = form.preset.value;
    H.from = form.from.value;
    H.to = form.to.value;
    $('.custom', form).classList.toggle('hidden', H.preset !== 'custom');
  });
  $('[data-reset]', form).addEventListener('click', () => { S.hist = freshFilters({ q: H.q, type: H.type }); closeSheet(); });
  $('[data-close]', form).addEventListener('click', closeSheet);
  form.addEventListener('submit', (e) => { e.preventDefault(); closeSheet(); });
}

function historyFor(q) {
  S.hist = freshFilters({ q, status: 'done', preset: 'all' });
  go('history');
}

// ---------- Insights ----------

const fmtAvg = (avg) => (avg == null ? '—' : avg.toFixed(1));

function trend(now, before) {
  if (now == null || before == null) return `<span class="muted">${t('trendNone')}</span>`;
  const d = now - before;
  if (Math.abs(d) < 0.05) return `<span class="muted">${t('trendSame')}</span>`;
  return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span> <span class="muted">${t('trendVs')}</span>`;
}

function expandable(key, rows, empty, max = 5) {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  const open = S.expanded.has(key);
  return `<ul class="spots">${(open ? rows : rows.slice(0, max)).join('')}</ul>
    ${rows.length > max ? `<button class="link strong more-link" data-expand="${key}">${open ? t('showLess') : t('seeAll', { n: rows.length })}</button>` : ''}`;
}

const spotRow = (r) => `<li><button data-spot="${r.from.s}:${r.from.a}-${r.to.a}">
  ${ratingPill(r.rating)}
  <span class="sp-range">${esc(rangeLabel(r.from, r.to))}</span>
  <span class="muted sp-when">${count(r.end - r.start + 1, 'ayah')} · ${weekdayName(r.date)} ${fmtDate(r.date)}</span></button></li>`;

function renderInsights() {
  const I = M.insights(S.items);
  const pct = (I.known / TOTAL_AYAHS) * 100;
  const td = M.today();
  const adh = I.adherence.done + I.adherence.missed;

  // Heatmap: 17 weeks fits an iPhone width.
  const WEEKS = 17;
  const startHM = M.addDays(td, -M.weekdayIndex(td) - (WEEKS - 1) * 7);
  const maxAyahs = Math.max(1, ...[...I.activity.values()].map((a) => a.ayahs));
  let cells = '';
  for (let k = 0; k < WEEKS * 7; k++) {
    const d = M.addDays(startHM, Math.floor(k / 7) * 7 + (k % 7));
    if (d > td) { cells += '<span class="hm-cell future"></span>'; continue; }
    const a = I.activity.get(d);
    const lvl = a ? Math.max(1, Math.ceil((a.ayahs / maxAyahs) * 4)) : 0;
    const tip = a
      ? t('hmTip', { day: `${weekdayName(d)} ${fmtDate(d)}`, s: count(a.sessions, 'session'), a: count(a.ayahs, 'ayah'), r: ratingName(a.sum / a.sessions) })
      : `${weekdayName(d)} ${fmtDate(d)} — ${t('nothingLogged')}`;
    cells += `<span class="hm-cell l${lvl}" data-tip="${esc(tip)}"></span>`;
  }
  const monthLabels = Array.from({ length: WEEKS }, (_, w) => {
    const d = M.addDays(startHM, w * 7);
    const prev = M.addDays(d, -7);
    return `<span>${w > 0 && d.slice(5, 7) !== prev.slice(5, 7) ? fmtMonthShort(d.slice(0, 7)) : ''}</span>`;
  }).join('');

  const distRow = (type) => {
    const d = I.distribution[type];
    const total = d[1] + d[2] + d[3] + d[4];
    return `<div class="dist-row"><span class="dist-lbl">${typeLabel(type)}</span><span class="num muted">${total}</span>
      <div class="dist-bar">${total ? M.RATINGS.filter((r) => d[r.v]).map((r) =>
        `<span class="r${r.v}" style="flex:${d[r.v]}" data-tip="${typeLabel(type)} · ${ratingLabel(r.v)}: ${d[r.v]} (${Math.round((d[r.v] / total) * 100)}%)"></span>`).join('') : '<span class="none"></span>'}</div></div>`;
  };

  const maxWd = Math.max(1, ...I.weekdays.map((w) => w.sessions));
  const monthBars = (key) => {
    const max = Math.max(1, ...I.months.map((m) => m[key]));
    return `<div class="mbars">${I.months.map((m) => `<div class="mbar" data-tip="${fmtMonth(m.ym)}: ${count(m[key], 'ayah')}">
      <div class="mbar-col"><span style="height:${(m[key] / max) * 100}%"></span></div><span class="mbar-l">${fmtMonthTiny(m.ym)}</span></div>`).join('')}</div>
      <div class="mbars-foot muted"><span>${fmtMonth(I.months[0].ym)}</span><span>${t('maxN', { n: count(Math.max(...I.months.map((m) => m[key])), 'ayah') })}</span></div>`;
  };

  // Quran map: compact tiles; tap shows details below.
  const tiles = S.mapMode === 'surah' ? I.perSurah : I.perJuz;
  const tileName = (x) => (S.mapMode === 'surah' ? surahName(x.n) : t('juzN', { n: x.n }));
  const sel = tiles.find((x) => x.n === S.tileSel);
  const detail = sel ? `<div class="tile-detail">
      <div><b>${esc(tileName(sel))}</b>${S.mapMode === 'surah' && !isAr() ? ` <span class="ar">${surah(sel.n).ar}</span>` : ''}</div>
      ${sel.known ? `<div class="muted">${t('tileKnown', { p: Math.round(sel.coverage * 100) })} · ${t('tileAvg', { r: ratingName(sel.avg) })}${sel.staleDays != null ? ` · ${t('tileLast', { d: relDay(M.addDays(td, -sel.staleDays)) })}` : ''}</div>` : `<div class="muted">${t('notStarted')}</div>`}
      <button class="link strong" data-hist="${S.mapMode === 'surah' ? sel.n : `juz ${sel.n}`}">${t('openHistory')}</button>
    </div>` : `<p class="hint">${t('tapTile')}</p>`;

  view.innerHTML = `
    <header class="page-head"><h1>${t('nav.insights')}</h1><p class="muted">${t('insSub')}</p></header>
    ${!S.items.some((i) => i.rating) ? `<div class="empty big">${t('insEmpty')}</div>` : ''}
    <div class="kpis">
      <div class="kpi wide"><div class="kpi-l">${t('kpiKnown')}</div><div class="kpi-v">${I.known.toLocaleString('en-US')}</div>
        <div class="kpi-s">${t('kpiKnownSub', { p: pct.toFixed(1), j: (I.known / (TOTAL_AYAHS / 30)).toFixed(1) })}</div>
        <div class="meter"><span style="width:${pct}%"></span></div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiStreak')}</div><div class="kpi-v">${count(I.streak, 'day')}</div><div class="kpi-s">${t('kpiStreakSub', { l: count(I.longestStreak, 'day'), a: I.activeDays30 })}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiNew')}</div><div class="kpi-v">${I.memorizedNew.toLocaleString('en-US')}</div><div class="kpi-s">${t('kpiNewSub')}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiMemQ')}</div><div class="kpi-v">${fmtAvg(I.avg30.memorize)} <small>${ratingName(I.avg30.memorize)}</small></div><div class="kpi-s">${trend(I.avg30.memorize, I.avgPrior.memorize)}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiRevQ')}</div><div class="kpi-v">${fmtAvg(I.avg30.review)} <small>${ratingName(I.avg30.review)}</small></div><div class="kpi-s">${trend(I.avg30.review, I.avgPrior.review)}</div></div>
      <div class="kpi wide"><div class="kpi-l">${t('kpiPlan')}</div><div class="kpi-v">${adh ? `${Math.round((I.adherence.done / adh) * 100)}%` : '—'}</div><div class="kpi-s">${t('kpiPlanSub', { d: I.adherence.done, m: I.adherence.missed, u: I.upcoming.length })}</div></div>
    </div>

    <section class="panel"><header><h2>${t('needsCare')}</h2><span class="muted">${t('needsCareSub')}</span></header>
      ${expandable('care', I.attention.map(spotRow), t('needsCareEmpty'))}</section>
    <section class="panel"><header><h2>${t('due')}</h2><span class="muted">${t('dueSub')}</span></header>
      ${expandable('due', I.stale.map((s) => `<li><button data-hist="${s.n}">
        <span class="pill"><b class="num">${s.staleDays}</b>&nbsp;${t('daysWord')}</span>
        <span class="sp-range">${esc(surahName(s.n))}</span>
        <span class="muted sp-when">${t('dueMeta', { p: Math.round(s.coverage * 100), r: ratingName(s.avg) })}</span></button></li>`), t('dueEmpty'))}</section>
    <section class="panel"><header><h2>${t('strong')}</h2><span class="muted">${t('strongSub')}</span></header>
      ${expandable('strong', I.strong.map(spotRow), t('strongEmpty'))}</section>

    <section class="panel">
      <header><h2>${t('quranMap')}</h2>
        <div class="seg small" data-mapmode><button data-v="surah" aria-pressed="${S.mapMode === 'surah'}">${t('bySurah')}</button><button data-v="juz" aria-pressed="${S.mapMode === 'juz'}">${t('byJuz')}</button></div></header>
      <div class="tiles ${S.mapMode}">${tiles.map((x) => {
        const b = x.avg == null ? 0 : Math.round(x.avg);
        return `<button class="tile ${b ? `has r${b}` : ''} ${x.n === S.tileSel ? 'sel' : ''}" data-tile="${x.n}" aria-label="${esc(tileName(x))}">
          <span class="tile-n">${x.n}</span><span class="tile-bar"><span style="width:${Math.round(x.coverage * 100)}%"></span></span></button>`;
      }).join('')}</div>
      ${detail}
      <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${ratingLabel(r.v)}</span>`).join('')}<span><i class="sw none"></i>${t('notStarted')}</span></div>
    </section>

    <section class="panel"><header><h2>${t('ratings')}</h2><span class="muted">${t('ratingsSub')}</span></header>
      ${distRow('memorize')}${distRow('review')}
      <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${ratingLabel(r.v)}</span>`).join('')}</div>
    </section>

    <section class="panel"><header><h2>${t('activity')}</h2><span class="muted">${t('activitySubM')}</span></header>
      <div class="heatmap"><div class="hm-wd">${M.WEEKDAYS.map((_, k) => `<span>${k % 2 ? weekdayByIndex(k, true).replace(/^ال/, '') : ''}</span>`).join('')}</div>
        <div><div class="hm-months" style="grid-template-columns:repeat(${WEEKS}, var(--cell))">${monthLabels}</div><div class="hm-grid">${cells}</div></div></div>
      <div class="legend"><span class="muted">${t('less')}</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-cell l${l}"></i>`).join('')}<span class="muted">${t('more')}</span></div>
    </section>

    <section class="panel"><header><h2>${t('byWeekday')}</h2><span class="muted">${t('byWeekdaySub')}</span></header>
      <div class="wdbars">${I.weekdays.map((w) => `<div class="wdbar">
        <span class="wd-n">${weekdayByIndex(w.w, true).replace(/^ال/, '')}</span><span class="wd-track"><span style="width:${(w.sessions / maxWd) * 100}%"></span></span>
        <span class="num wd-v">${w.sessions}</span><span class="wd-r muted">${w.avg == null ? '' : ratingName(w.avg)}</span></div>`).join('')}</div>
    </section>
    <section class="panel"><header><h2>${t('memPerMonth')}</h2><span class="muted">${t('inAyahs')}</span></header>${monthBars('memorized')}</section>
    <section class="panel"><header><h2>${t('revPerMonth')}</h2><span class="muted">${t('inAyahs')}</span></header>${monthBars('reviewed')}</section>`;

  $$('[data-mapmode] button', view).forEach((b) => b.addEventListener('click', () => { S.mapMode = b.dataset.v; S.tileSel = null; renderInsights(); }));
  $$('[data-tile]', view).forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.tile);
    S.tileSel = S.tileSel === n ? null : n;
    const y = window.scrollY;
    renderInsights();
    window.scrollTo(0, y);
  }));
  $$('[data-hist]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.hist)));
  $$('[data-spot]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.spot)));
  $$('[data-expand]', view).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.expand;
    S.expanded.has(k) ? S.expanded.delete(k) : S.expanded.add(k);
    const y = window.scrollY;
    renderInsights();
    window.scrollTo(0, y);
  }));
}

// ---------- More (language, backup, install) ----------

async function doExport() {
  S.persisted = await requestPersistence();
  const r = await store.exportBackup({ preferShare: true });
  if (r.cancelled) return;
  toast(t('exportedN', { n: count(r.count, 'record'), file: `${M.APP}-backup.json` }));
  renderChrome();
  if (S.view === 'more') render();
}

function importSummary(r) {
  if (r.error) return `<div class="result err"><b>${t('importFailed')}</b> ${esc(r.error)} ${t('nothingChanged')}</div>`;
  return `<div class="result">
    <b>${t('importDone')}</b>${r.exportedAt ? ` <span class="muted">${t('backupFrom', { d: fmtDateTime(r.exportedAt) })}</span>` : ''}
    <ul>
      <li><b class="num">${r.added}</b> ${t('resAdded')}</li>
      <li><b class="num">${r.updated}</b> ${t('resUpdated')}</li>
      <li><b class="num">${r.unchanged}</b> ${t('resUnchanged')}</li>
      <li><b class="num">${r.keptLocal}</b> ${t('resKept')}</li>
      ${r.invalid ? `<li><b class="num">${r.invalid}</b> ${t('resInvalid')}</li>` : ''}
    </ul>
    ${r.migratedFrom ? `<p class="muted">${t('migrated', { n: r.migratedFrom })}</p>` : ''}
  </div>`;
}

async function renderMore() {
  const lastExp = await store.getMeta('lastExported');
  if (S.view !== 'more') return; // the user moved on while this was loading
  const r = S.lastImport;
  view.innerHTML = `
    <header class="page-head"><h1>${t('nav.more')}</h1></header>
    <section class="panel">
      <header><h2>${t('language')}</h2></header>
      <div class="seg full" data-langs>
        <button data-lang="ar" lang="ar" aria-pressed="${lang === 'ar'}">العربية</button>
        <button data-lang="en" lang="en" aria-pressed="${lang === 'en'}">English</button>
      </div>
    </section>
    ${isStandalone() ? '' : `<section class="panel banner-panel"><header><h2>${t('installTitle')}</h2></header><p>${t('installSteps')}</p></section>`}
    <section class="panel">
      <header><h2>${t('backupTitle')}</h2></header>
      <p class="muted">${t('backupSub')}</p>
      <div class="last-exp">${t('lastExportedB')} <b>${lastExp ? `${weekdayName(M.dateStr(new Date(lastExp)))}${isAr() ? '، ' : ', '}${fmtDateTime(lastExp)}` : t('never')}</b></div>
      <button class="primary big" data-export>${t('exportBackup')}</button>
      <p class="hint">${t('exportTip')}</p>
      <label class="file-btn big"><input type="file" accept="application/json,.json,text/plain" data-import>${t('chooseFile')}</label>
      <p class="hint">${t('importDesc')}</p>
      <div data-result>${r ? importSummary(r) : ''}</div>
      <p class="storage-status ${S.persisted ? 'ok' : ''}">${S.persisted ? '✓' : 'ⓘ'} ${t(S.persisted ? 'storageOk' : S.persisted === false ? 'storageNo' : 'storageUnknown')}</p>
    </section>
    <section class="panel">
      <header><h2>${t('syncTitle')}</h2></header>
      <ol class="steps"><li>${t('sync1')}</li><li>${t('sync2')}</li><li>${t('sync3')}</li></ol>
    </section>`;
  $$('[data-lang]', view).forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); renderChrome(); render(); }));
  $('[data-export]', view).addEventListener('click', doExport);
  $('[data-import]', view).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      S.lastImport = await store.importBackup(f);
      toast(t('importDone'));
    } catch (err) {
      S.lastImport = { error: err.code ? t(`err.${err.code}`) : err.message };
    }
    await reload();
  });
}

// ---------- chrome, routing ----------

function renderChrome() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const todo = S.items.filter((i) => i.date === M.today() && !i.rating).length;
  $('#badge-today').textContent = todo || '';
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.view === S.view));
}

function render() {
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.view === S.view));
  ({ day: renderDay, plan: renderPlan, history: renderHistory, insights: renderInsights, more: renderMore })[S.view]();
}

function go(v) {
  if (location.hash !== `#${v}`) location.hash = v;
  else { S.view = v; render(); }
}

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  S.view = VIEWS.includes(v) ? v : 'day';
  render();
  window.scrollTo(0, 0);
});

// Tapping the current tab again scrolls to the top (and Day jumps back to today).
$$('#tabbar a').forEach((a) => a.addEventListener('click', (e) => {
  if (a.dataset.view !== S.view) return;
  e.preventDefault();
  if (S.view === 'day' && S.day !== M.today() && window.scrollY < 10) goDay(M.today());
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

// Tap-to-show tooltip for chart marks.
const tip = $('#tip');
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8));
  const y = r.top - tip.offsetHeight - 8 < 60 ? r.bottom + 8 : r.top - tip.offsetHeight - 8;
  tip.style.transform = `translate(${x}px, ${y}px)`;
  clearTimeout(tip.timer);
  tip.timer = setTimeout(() => { tip.hidden = true; }, 3000);
});
window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

// Midnight rollover and coming back to the app after a while.
let lastToday = M.today();
function checkDay() {
  if (M.today() !== lastToday) {
    if (S.day === lastToday) S.day = M.today();
    lastToday = M.today();
    reload();
  }
}
setInterval(checkDay, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
}

applyDocLang();
requestPersistence().then((p) => { S.persisted = p; if (S.view === 'more') render(); });
S.view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'day';
reload();
