// Hifz — Mac UI. Data/logic lives in model.js and /shared/; text and dates in i18n.js.
import { createStore } from '../../shared/store.js';
import { SURAHS, JUZ, TOTAL_AYAHS, surah, ayahCount, toIndex, fromIndex, rangeIdx, matchSurahs, isValidPos, normalizeName } from '../../shared/quran.js';
import * as M from './model.js';
import {
  t, count, setLang, applyDocLang, isAr, lang,
  ratingLabel, ratingName, typeLabel, typeShort, statusLabel, surahName, rangeLabel, juzLabel, surahOption,
  weekdayName, weekdayShort, weekdayByIndex, fmtDate, fmtLongDate, fmtMonth, fmtMonthShort, fmtMonthTiny, fmtDateTime, hijri,
  AR_WEEKDAYS, AR_RATINGS,
} from './i18n.js';

const store = createStore({ app: M.APP, schemaVersion: M.SCHEMA_VERSION, migrate: M.migrate, validate: M.validateItem });

const freshHist = (extra = {}) => ({ q: '', type: 'all', ratings: new Set(), status: 'all', preset: 'past', from: '', to: '', limit: 200, ...extra });

const S = {
  items: [],
  view: 'day',
  day: M.today(),
  planStart: M.today(),
  hist: freshHist(),
  mapMode: 'surah',
  lastImport: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const dlg = $('#dlg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// ---------- shared bits ----------

function ratingPill(v) {
  if (!v) return '';
  return `<span class="pill r${v}"><i></i>${ratingLabel(v)}</span>`;
}

function statusBadge(item) {
  const s = M.status(item);
  return `<span class="badge st-${s}">${statusLabel(s)}</span>`;
}

function typeBadge(type) {
  return `<span class="type t-${type}">${typeShort(type)}</span>`;
}

function rangeText(item) {
  const ar = item.from.s === item.to.s ? surah(item.from.s).ar : `${surah(item.from.s).ar} – ${surah(item.to.s).ar}`;
  return `<span class="range">${esc(rangeLabel(item.from, item.to))}</span> <span class="ar range-ar">${ar}</span>`;
}

function rateButtons(current, disabled) {
  return `<div class="rate" role="group" aria-label="${t('rating')}">${M.RATINGS.map((r) =>
    `<button type="button" class="rb r${r.v}" data-rate="${r.v}" aria-pressed="${current === r.v}" ${disabled ? 'disabled' : ''}><i></i>${ratingLabel(r.v)}</button>`).join('')}</div>`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- range picker ----------

const surahOptions = (sel) => SURAHS.map((s) => `<option value="${s.n}" ${s.n === sel ? 'selected' : ''}>${esc(surahOption(s))}</option>`).join('');

function rangePickerHTML(from, to) {
  return `<div class="rp" data-rp>
    <div class="rp-row"><span class="lbl">${t('from')}</span>
      <select data-s="from" aria-label="${t('fromSurah')}">${surahOptions(from.s)}</select>
      <span class="lbl-sm">${t('ayah')}</span><input type="number" data-a="from" min="1" max="${surah(from.s).ayahs}" value="${from.a}" aria-label="${t('fromAyah')}">
    </div>
    <div class="rp-row"><span class="lbl">${t('to')}</span>
      <select data-s="to" aria-label="${t('toSurah')}">${surahOptions(to.s)}</select>
      <span class="lbl-sm">${t('ayah')}</span><input type="number" data-a="to" min="1" max="${surah(to.s).ayahs}" value="${to.a}" aria-label="${t('toAyah')}">
    </div>
    <div class="rp-quick">
      <button type="button" data-whole>${t('wholeSurah')}</button>
      <select data-juz aria-label="${t('wholeJuz')}"><option value="">${t('wholeJuz')}</option>${JUZ.map((j) => `<option value="${j.n}">${t('juzN', { n: j.n })}</option>`).join('')}</select>
      <span class="rp-sum" data-sum></span>
    </div>
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
  sel('to').addEventListener('change', () => {
    const s = Number(sel('to').value);
    write('to', { s, a: surah(s).ayahs });
    update();
  });
  $$('input', el).forEach((i) => i.addEventListener('input', update));
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
  dlg.innerHTML = `<form class="editor" method="dialog">
    <h2>${isNew ? t('newSession') : t('editSession')}</h2>
    <div class="seg" data-type>
      <button type="button" data-v="memorize" aria-pressed="${it.type === 'memorize'}">${typeLabel('memorize')}</button>
      <button type="button" data-v="review" aria-pressed="${it.type === 'review'}">${typeLabel('review')}</button>
    </div>
    <label class="field"><span>${t('date')}</span><span class="date-wrap"><input type="date" name="date" value="${it.date}" required> <b class="wd"></b></span></label>
    <div class="field"><span>${t('range')}</span>${rangePickerHTML(it.from, it.to)}</div>
    <div class="field"><span>${t('rating')}</span><div>${rateButtons(it.rating)}<div class="hint" data-rate-hint></div></div></div>
    <label class="field"><span>${t('note')}</span><textarea name="note" rows="2" placeholder="${t('notePh')}">${esc(it.note)}</textarea></label>
    <footer>
      ${isNew ? '' : `<button type="button" class="danger" data-del>${t('del')}</button>`}
      <span class="spacer"></span>
      <button type="button" data-cancel>${t('cancel')}</button>
      <button type="submit" class="primary" data-save>${isNew ? t('addBtn') : t('save')}</button>
    </footer>
  </form>`;
  const form = $('form', dlg);
  const rp = bindRangePicker(form, (v) => { $('[data-save]', form).disabled = !v; });
  let type = it.type;
  let rating = it.rating;

  const syncDate = () => {
    const d = form.date.value;
    $('.wd', form).textContent = d ? `${weekdayName(d)} · ${relDay(d)}` : '';
    const future = d > M.today();
    $$('[data-rate]', form).forEach((b) => { b.disabled = future; });
    if (future) { rating = null; syncRate(); }
    $('[data-rate-hint]', form).textContent = future ? t('futureHint') : t('rateHint');
  };
  const syncRate = () => $$('[data-rate]', form).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === rating)));

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
  $('[data-cancel]', form).addEventListener('click', () => dlg.close());
  $('[data-del]', form)?.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    await store.remove(it.id);
    dlg.close();
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
    dlg.close();
    toast(isNew ? t('sessionAdded') : t('saved'));
  });
  syncDate();
  dlg.showModal();
}

// ---------- Day view ----------

function sessionCard(it) {
  const future = it.date > M.today();
  return `<article class="card session st-${M.status(it)}" data-id="${it.id}">
    <div class="sc-head">
      <div class="sc-range">${rangeText(it)}</div>
      ${statusBadge(it)}
    </div>
    <div class="sc-meta">${count(M.sizeOf(it), 'ayah')} · ${juzLabel(it.from, it.to)}${it.planned ? ` · ${t('plannedAhead')}` : ''}</div>
    ${rateButtons(it.rating, future)}
    ${it.note ? `<p class="sc-note">${esc(it.note)}</p>` : ''}
    <div class="sc-actions"><button class="ghost" data-edit>${t('edit')}</button></div>
  </article>`;
}

function renderDay() {
  const d = S.day;
  const list = sessionsOn(d);
  const week0 = M.addDays(d, -M.weekdayIndex(d));
  const week = Array.from({ length: 7 }, (_, k) => M.addDays(week0, k));
  const future = d > M.today();
  const col = (type) => {
    const xs = list.filter((i) => i.type === type);
    const empty = t(`empty${type === 'memorize' ? 'Mem' : 'Rev'}${future ? 'Planned' : 'Logged'}`);
    return `<section class="day-col">
      <header><h3>${typeLabel(type)}</h3><button data-add="${type}">${t('add')}</button></header>
      ${xs.length ? xs.map(sessionCard).join('') : `<div class="empty">${empty}</div>`}
    </section>`;
  };
  view.innerHTML = `
    <header class="day-head">
      <div>
        <div class="day-wd">${weekdayName(d)}</div>
        <div class="day-date">${fmtLongDate(d)} <span class="muted">· ${esc(hijri(d))}</span></div>
        <div class="day-rel">${relDay(d)}</div>
      </div>
      <div class="day-nav">
        <button data-nav="-1" aria-label="${t('prevDay')}">‹</button>
        <button data-nav="0" ${d === M.today() ? 'disabled' : ''}>${t('today')}</button>
        <button data-nav="1" aria-label="${t('nextDay')}">›</button>
        <input type="date" data-pick value="${d}" aria-label="${t('goToDate')}">
      </div>
    </header>
    <div class="week-strip">${week.map((w) => {
      const xs = sessionsOn(w);
      return `<button class="ws-day ${w === d ? 'sel' : ''} ${w === M.today() ? 'is-today' : ''}" data-go="${w}">
        <span class="ws-wd">${weekdayShort(w)}</span><span class="ws-n">${M.parseDate(w).getDate()}</span>
        <span class="ws-dots">${xs.map((x) => `<i class="dot ${x.rating ? `r${x.rating}` : `st-${M.status(x)}`}"></i>`).join('')}</span>
      </button>`;
    }).join('')}</div>
    <div class="day-cols">${col('memorize')}${col('review')}</div>`;

  $$('[data-nav]', view).forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.nav);
    S.day = n === 0 ? M.today() : M.addDays(S.day, n);
    render();
  }));
  $('[data-pick]', view).addEventListener('change', (e) => { if (e.target.value) { S.day = e.target.value; render(); } });
  $$('[data-go]', view).forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.go; render(); }));
  $$('[data-add]', view).forEach((b) => b.addEventListener('click', () => openEditor({ type: b.dataset.add, date: d })));
  bindSessionCards(view);
}

function bindSessionCards(root) {
  $$('.session', root).forEach((card) => {
    const it = S.items.find((i) => i.id === card.dataset.id);
    $('[data-edit]', card).addEventListener('click', () => openEditor(it));
    $$('[data-rate]', card).forEach((b) => b.addEventListener('click', async () => {
      const v = Number(b.dataset.rate);
      await save({ ...it, rating: it.rating === v ? null : v });
    }));
  });
}

// ---------- Plan view ----------

function renderPlan() {
  const start = S.planStart;
  const days = Array.from({ length: 30 }, (_, k) => M.addDays(start, k));
  const end = days[29];
  const inWin = S.items.filter((i) => i.date >= start && i.date <= end);
  const mem = inWin.filter((i) => i.type === 'memorize');
  const memAyahs = mem.reduce((n, i) => n + M.sizeOf(i), 0);
  const lastMem = M.sortSessions(mem).pop();
  const chip = (it) => `<button class="chip t-${it.type} ${it.rating ? `rated r${it.rating}` : ''}" data-id="${it.id}" title="${esc(typeLabel(it.type))} · ${count(M.sizeOf(it), 'ayah')}">
      ${it.rating ? '<i></i>' : ''}${esc(rangeLabel(it.from, it.to))}<span class="chip-n">${M.sizeOf(it)}</span></button>`;

  view.innerHTML = `
    <header class="page-head">
      <div><h1>${t('nav.plan')}</h1><p class="muted">${t('planSub')}</p></div>
      <div class="toolbar">
        <button data-shift="-30" aria-label="${t('prev30')}">‹</button>
        <input type="date" data-start value="${start}" aria-label="${t('planStart')}">
        <button data-shift="30" aria-label="${t('next30')}">›</button>
        <button data-shift="0" ${start === M.today() ? 'disabled' : ''}>${t('fromToday')}</button>
        <button class="primary" data-auto>${t('autoPlan')}</button>
        <button data-clear>${t('clearPlans')}</button>
      </div>
    </header>
    <div class="plan-summary">
      <div>${t('daysHave', { n: new Set(inWin.map((i) => i.date)).size })}</div>
      <div>${t('toMemorize', { n: count(memAyahs, 'ayah') })}${lastMem ? ` · ${t('reaching', { x: esc(rangeLabel(lastMem.to, lastMem.to)) })}` : ''}</div>
      <div>${t('reviewCount', { n: count(inWin.filter((i) => i.type === 'review').length, 'session') })}</div>
      <div class="muted">${fmtDate(start)} ${t('arrow')} ${fmtDate(end)}</div>
    </div>
    <div class="plan-table" role="table">
      <div class="pt-row pt-head" role="row"><div>${t('colDay')}</div><div>${typeLabel('memorize')}</div><div>${typeLabel('review')}</div></div>
      ${days.map((d) => {
        const xs = sessionsOn(d);
        const wd = M.weekdayIndex(d);
        return `<div class="pt-row ${d === M.today() ? 'is-today' : ''} ${wd === 5 ? 'fri' : ''} ${wd === 0 && d !== start ? 'week-start' : ''}" role="row">
          <button class="pt-day" data-open="${d}" title="${t('openDay')}"><b>${weekdayName(d)}</b><span>${fmtDate(d, { year: false })}</span></button>
          ${['memorize', 'review'].map((type) => `<div class="pt-cell">${xs.filter((i) => i.type === type).map(chip).join('')}
            <button class="add-chip" data-add="${type}" data-date="${d}" aria-label="${esc(t('addOn', { type: typeLabel(type), day: weekdayName(d) }))}">+</button></div>`).join('')}
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
  $$('[data-add]', view).forEach((b) => b.addEventListener('click', () => openEditor({ type: b.dataset.add, date: b.dataset.date })));
  $$('[data-open]', view).forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.open; go('day'); }));
  $('[data-auto]', view).addEventListener('click', openAutoPlan);
  $('[data-clear]', view).addEventListener('click', openClearPlans);
}

const WD_BOXES = (sel) => M.WEEKDAYS.map((_, k) => `<label class="wd-box"><input type="checkbox" name="wd" value="${k}" ${sel.includes(k) ? 'checked' : ''}>${weekdayByIndex(k, true)}</label>`).join('');

function openAutoPlan() {
  const start = S.planStart < M.today() ? M.today() : S.planStart;
  const memStart = M.nextMemorizeStart(S.items) || { s: 1, a: 1 };
  const known = M.ayahState(S.items);
  let lastKnown = -1;
  for (let i = TOTAL_AYAHS - 1; i >= 0; i--) if (known.rating[i]) { lastKnown = i; break; }
  let firstKnown = 0;
  for (let i = 0; i < TOTAL_AYAHS; i++) if (known.rating[i]) { firstKnown = i; break; }
  const revFrom = lastKnown >= 0 ? fromIndex(firstKnown) : { s: 78, a: 1 };
  const revTo = lastKnown >= 0 ? fromIndex(lastKnown) : { s: 114, a: 6 };

  dlg.innerHTML = `<form class="editor wide" method="dialog">
    <h2>${t('autoTitle')}</h2>
    <div class="ap-grid">
      <div>
        <div class="seg" data-type>
          <button type="button" data-v="memorize" aria-pressed="true">${typeLabel('memorize')}</button>
          <button type="button" data-v="review" aria-pressed="false">${typeLabel('review')}</button>
        </div>
        <div class="field"><span>${t('start')}</span><span class="date-wrap"><input type="date" name="start" value="${start}"> <b class="wd"></b></span></div>
        <label class="field"><span>${t('days')}</span><span><input type="number" name="days" min="1" max="30" value="30"> <span class="muted">${t('daysMax')}</span></span></label>
        <div class="field"><span>${t('on')}</span><div class="wd-boxes">${WD_BOXES([0, 1, 2, 3, 4, 5, 6])}</div></div>
        <label class="check"><input type="checkbox" name="skip" checked> ${t('skip')}</label>

        <div data-for="memorize">
          <div class="field"><span>${t('startAt')}</span><span class="pos">
            <select name="ms" aria-label="${t('startSurah')}">${surahOptions(memStart.s)}</select>
            <span class="lbl-sm">${t('ayah')}</span><input type="number" name="ma" min="1" value="${memStart.a}" aria-label="${t('startAyah')}"></span></div>
          <label class="field"><span>${t('perDay')}</span><span><input type="number" name="per" min="1" max="300" value="5"> ${t('ayahsUnit')}</span></label>
          <label class="field"><span>${t('order')}</span><select name="order">
            <option value="forward">${t('forward')}</option>
            <option value="backward">${t('backward')}</option>
          </select></label>
        </div>

        <div data-for="review" hidden>
          <div class="field"><span>${t('cycleOver')}</span>${rangePickerHTML(revFrom, revTo)}</div>
          <div class="field"><span>${t('perDay')}</span><span><input type="number" name="rper" min="1" max="300" value="1">
            <select name="unit"><option value="juz">${t('unitJuz')}</option><option value="surah">${t('unitSurah')}</option><option value="ayahs">${t('unitAyahs')}</option></select></span></div>
          <p class="hint">${t('reviewHint')}</p>
        </div>
      </div>
      <div class="ap-preview">
        <h3>${t('preview')} <span class="muted" data-count></span></h3>
        <ol data-preview></ol>
      </div>
    </div>
    <footer><span class="spacer"></span><button type="button" data-cancel>${t('cancel')}</button><button type="submit" class="primary" data-go>${t('addToPlan')}</button></footer>
  </form>`;
  const form = $('form', dlg);
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
      const per = Math.max(1, Number(form.per.value) || 1);
      return M.generateMemorize({ start: { s, a }, perDay: per, order: form.order.value, dates });
    }
    const r = rp.get();
    if (!r) return [];
    return M.generateReview({ ...r, unit: form.unit.value, perDay: Math.max(1, Number(form.rper.value) || 1), dates });
  }
  function preview() {
    if (!form) return;
    const d = form.start.value;
    $('.wd', form).textContent = d ? weekdayName(d) : '';
    plan = compute();
    $('[data-count]', form).textContent = count(plan.length, 'session');
    $('[data-preview]', form).innerHTML = plan.map((p) => `<li><span class="pv-day"><b>${weekdayShort(p.date)}</b> ${fmtDate(p.date, { year: false })}</span>
      <span>${esc(rangeLabel(p.from, p.to))}</span><span class="muted num">${ayahCount(p.from, p.to)}</span></li>`).join('') || `<li class="muted">${t('nothingToAdd')}</li>`;
    $('[data-go]', form).disabled = !plan.length;
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
  $('[data-cancel]', form).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!plan.length) return;
    await store.putMany(plan.map((p) => ({ type, date: p.date, from: p.from, to: p.to, rating: null, note: '', planned: true })));
    dlg.close();
    toast(t('addedN', { n: count(plan.length, 'session') }));
    await reload();
  });
  preview();
  dlg.showModal();
}

function openClearPlans() {
  const start = S.planStart < M.today() ? M.today() : S.planStart;
  dlg.innerHTML = `<form class="editor" method="dialog">
    <h2>${t('clearTitle')}</h2>
    <p class="muted">${t('clearSub')}</p>
    <label class="field"><span>${t('from')}</span><input type="date" name="from" value="${start}"></label>
    <label class="field"><span>${t('to')}</span><input type="date" name="to" value="${M.addDays(start, 29)}"></label>
    <label class="field"><span>${t('type')}</span><select name="type"><option value="all">${t('bothTypes')}</option><option value="memorize">${t('memOnly')}</option><option value="review">${t('revOnly')}</option></select></label>
    <p data-count></p>
    <footer><span class="spacer"></span><button type="button" data-cancel>${t('cancel')}</button><button type="submit" class="primary danger-fill">${t('clear')}</button></footer>
  </form>`;
  const form = $('form', dlg);
  const pick = () => S.items.filter((i) => !i.rating && i.date >= form.from.value && i.date <= form.to.value && (form.type.value === 'all' || i.type === form.type.value));
  const upd = () => { $('[data-count]', form).textContent = t('willRemove', { n: count(pick().length, 'session') }); };
  form.addEventListener('input', upd);
  $('[data-cancel]', form).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = pick().map((i) => i.id);
    await store.removeMany(ids);
    dlg.close();
    toast(t('removedN', { n: count(ids.length, 'session') }));
    await reload();
  });
  upd();
  dlg.showModal();
}

// ---------- History view ----------

const AR_WD_KEYS = AR_WEEKDAYS.map(normalizeName);
const AR_RATING_KEYS = Object.fromEntries(Object.entries(AR_RATINGS).map(([k, v]) => [normalizeName(k), v]));

/**
 * Search: "2:255", "2:1-20", "18" (surah), "juz 30" / "جزء 30", surah names (Latin/Arabic),
 * weekdays and ratings (English/Arabic), note text. Tokens are ANDed.
 */
function matcher(q) {
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

function presetRange(p) {
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

function filteredHistory() {
  const H = S.hist;
  const m = matcher(H.q);
  const [pf, pt] = H.preset === 'custom' ? [H.from, H.to] : presetRange(H.preset);
  return S.items.filter((it) =>
    (H.type === 'all' || it.type === H.type) &&
    (!H.ratings.size || H.ratings.has(it.rating || 0)) &&
    (H.status === 'all' || M.status(it) === H.status || (H.status === 'planned' && M.status(it) === 'today')) &&
    (!pf || it.date >= pf) && (!pt || it.date <= pt) &&
    m(it));
}

function renderHistory() {
  const H = S.hist;
  view.innerHTML = `
    <header class="page-head">
      <div><h1>${t('nav.history')}</h1></div>
    </header>
    <div class="filters">
      <input type="search" data-q value="${esc(H.q)}" placeholder="${t('searchPh')}" aria-label="${t('searchAria')}">
      <div class="seg small" data-ftype>
        ${[['all', t('all')], ['memorize', typeLabel('memorize')], ['review', typeLabel('review')]].map(([v, l]) => `<button data-v="${v}" aria-pressed="${H.type === v}">${l}</button>`).join('')}
      </div>
      <div class="rate-filter" data-frating>
        ${M.RATINGS.map((r) => `<button class="rb r${r.v}" data-v="${r.v}" aria-pressed="${H.ratings.has(r.v)}"><i></i>${ratingLabel(r.v)}</button>`).join('')}
        <button class="rb" data-v="0" aria-pressed="${H.ratings.has(0)}">${t('notRated')}</button>
      </div>
      <select data-fstatus aria-label="${t('status')}">
        ${[['all', t('anyStatus')], ['done', t('fDone')], ['planned', t('fPlanned')], ['missed', t('fMissed')]].map(([v, l]) => `<option value="${v}" ${H.status === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select data-fpreset aria-label="${t('dateRange')}">
        ${[['all', t('allDates')], ['past', t('upToToday')], ['7', t('last7')], ['30', t('last30')], ['90', t('last90')], ['month', t('thisMonth')], ['future', t('upcoming')], ['custom', t('custom')]].map(([v, l]) => `<option value="${v}" ${H.preset === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <span class="custom-range ${H.preset === 'custom' ? '' : 'hidden'}">
        <input type="date" data-ffrom value="${H.from}" aria-label="${t('fromDate')}"> – <input type="date" data-fto value="${H.to}" aria-label="${t('toDate')}">
      </span>
      <button class="ghost" data-reset>${t('reset')}</button>
    </div>
    <div class="hist-layout">
      <div class="hist-list" data-list></div>
      <nav class="month-index" data-months aria-label="${t('jumpMonth')}"></nav>
    </div>`;

  const q = $('[data-q]', view);
  q.addEventListener('input', () => { H.q = q.value; H.limit = 200; renderHistoryList(); });
  $$('[data-ftype] button', view).forEach((b) => b.addEventListener('click', () => { H.type = b.dataset.v; renderHistory(); }));
  $$('[data-frating] button', view).forEach((b) => b.addEventListener('click', () => {
    const v = Number(b.dataset.v);
    H.ratings.has(v) ? H.ratings.delete(v) : H.ratings.add(v);
    renderHistory();
  }));
  $('[data-fstatus]', view).addEventListener('change', (e) => { H.status = e.target.value; renderHistoryList(); });
  $('[data-fpreset]', view).addEventListener('change', (e) => { H.preset = e.target.value; renderHistory(); });
  $('[data-ffrom]', view).addEventListener('change', (e) => { H.from = e.target.value; renderHistoryList(); });
  $('[data-fto]', view).addEventListener('change', (e) => { H.to = e.target.value; renderHistoryList(); });
  $('[data-reset]', view).addEventListener('click', () => { S.hist = freshHist(); renderHistory(); });
  renderHistoryList();
}

function renderHistoryList() {
  const H = S.hist;
  const all = M.sortSessions(filteredHistory()).reverse();
  const shown = all.slice(0, H.limit);
  const listEl = $('[data-list]', view);
  const days = [...new Set(all.map((i) => i.date))];
  const ayahs = all.reduce((n, i) => n + M.sizeOf(i), 0);

  let html = `<div class="hist-sum">${t('histSum', { s: count(all.length, 'session'), d: count(days.length, 'day'), a: count(ayahs, 'ayah') })}</div>`;
  if (!S.items.length) html += `<div class="empty big">${t('noSessions')}</div>`;
  else if (!all.length) html += `<div class="empty big">${t('noMatch')}</div>`;
  let month = null, day = null;
  for (const it of shown) {
    const ym = it.date.slice(0, 7);
    if (ym !== month) {
      if (day) html += '</div>';
      day = null;
      month = ym;
      html += `<h2 class="month-h" id="m-${ym}">${fmtMonth(ym)}</h2>`;
    }
    if (it.date !== day) {
      if (day) html += '</div>';
      day = it.date;
      html += `<div class="hist-day ${day === M.today() ? 'is-today' : ''}"><button class="hd-date" data-open="${day}" title="${t('openDay')}">
        <b>${weekdayName(day)}</b><span>${fmtDate(day)}</span><span class="muted">${relDay(day)}</span></button>`;
    }
    html += `<button class="hist-row" data-id="${it.id}">
      ${typeBadge(it.type)}
      <span class="hr-range">${rangeText(it)}</span>
      <span class="hr-n num muted">${M.sizeOf(it)}</span>
      <span class="hr-rating">${it.rating ? ratingPill(it.rating) : statusBadge(it)}</span>
      <span class="hr-note muted">${esc(it.note)}</span>
    </button>`;
  }
  if (day) html += '</div>';
  if (all.length > shown.length) html += `<button class="more" data-more>${t('showMore', { n: (all.length - shown.length).toLocaleString('en-US') })}</button>`;
  listEl.innerHTML = html;

  const counts = new Map();
  all.forEach((i) => counts.set(i.date.slice(0, 7), (counts.get(i.date.slice(0, 7)) || 0) + 1));
  $('[data-months]', view).innerHTML = [...counts].map(([ym, n]) => `<button data-ym="${ym}"><span>${fmtMonth(ym)}</span><span class="num muted">${n}</span></button>`).join('');

  $$('.hist-row', listEl).forEach((b) => b.addEventListener('click', () => openEditor(S.items.find((i) => i.id === b.dataset.id))));
  $$('[data-open]', listEl).forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.open; go('day'); }));
  $('[data-more]', listEl)?.addEventListener('click', () => { H.limit += 300; renderHistoryList(); });
  $$('[data-ym]', view).forEach((b) => b.addEventListener('click', () => {
    const ym = b.dataset.ym;
    const idx = all.findIndex((i) => i.date.startsWith(ym));
    if (idx >= H.limit) { H.limit = idx + 100; renderHistoryList(); }
    $(`#m-${ym}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function historyFor(q) {
  S.hist = freshHist({ q, status: 'done', preset: 'all' });
  go('history');
}

// ---------- Insights view ----------

const fmtAvg = (avg) => (avg == null ? '—' : avg.toFixed(1));

function trend(now, before) {
  if (now == null || before == null) return `<span class="muted">${t('trendNone')}</span>`;
  const d = now - before;
  if (Math.abs(d) < 0.05) return `<span class="muted">${t('trendSame')}</span>`;
  return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span> <span class="muted">${t('trendVs')}</span>`;
}

function spotList(runs, empty, max = 12) {
  if (!runs.length) return `<div class="empty">${empty}</div>`;
  return `<ul class="spots">${runs.slice(0, max).map((r) => `<li><button data-spot="${r.from.s}:${r.from.a}-${r.to.a}">
      ${ratingPill(r.rating)}
      <span class="sp-range">${esc(rangeLabel(r.from, r.to))} <span class="ar">${esc(surah(r.from.s).ar)}</span></span>
      <span class="muted sp-when">${count(r.end - r.start + 1, 'ayah')} · ${weekdayName(r.date)} ${fmtDate(r.date)}</span>
    </button></li>`).join('')}</ul>${runs.length > max ? `<div class="muted more-note">${t('moreN', { n: runs.length - max })}</div>` : ''}`;
}

function renderInsights() {
  const I = M.insights(S.items);
  const pct = (I.known / TOTAL_AYAHS) * 100;
  const td = M.today();

  // Activity heatmap: 26 weeks, Sunday-first columns.
  const startHM = M.addDays(td, -M.weekdayIndex(td) - 25 * 7);
  const maxAyahs = Math.max(1, ...[...I.activity.values()].map((a) => a.ayahs));
  let cells = '';
  for (let k = 0; k < 26 * 7; k++) {
    const d = M.addDays(startHM, Math.floor(k / 7) * 7 + (k % 7));
    if (d > td) { cells += '<span class="hm-cell future"></span>'; continue; }
    const a = I.activity.get(d);
    const lvl = a ? Math.max(1, Math.ceil((a.ayahs / maxAyahs) * 4)) : 0;
    const tip = a
      ? t('hmTip', { day: `${weekdayName(d)} ${fmtDate(d)}`, s: count(a.sessions, 'session'), a: count(a.ayahs, 'ayah'), r: ratingName(a.sum / a.sessions) })
      : `${weekdayName(d)} ${fmtDate(d)} — ${t('nothingLogged')}`;
    cells += `<span class="hm-cell l${lvl}" data-tip="${esc(tip)}" data-day="${d}"></span>`;
  }
  const monthLabels = Array.from({ length: 26 }, (_, w) => {
    const d = M.addDays(startHM, w * 7);
    const prev = M.addDays(d, -7);
    return `<span>${w > 0 && d.slice(5, 7) !== prev.slice(5, 7) ? fmtMonthShort(d.slice(0, 7)) : ''}</span>`;
  }).join('');

  const distRow = (type) => {
    const d = I.distribution[type];
    const total = d[1] + d[2] + d[3] + d[4];
    return `<div class="dist-row"><span class="dist-lbl">${typeLabel(type)}</span>
      <div class="dist-bar">${total ? M.RATINGS.filter((r) => d[r.v]).map((r) =>
        `<span class="r${r.v}" style="flex:${d[r.v]}" data-tip="${typeLabel(type)} · ${ratingLabel(r.v)}: ${d[r.v]} (${Math.round((d[r.v] / total) * 100)}%)"></span>`).join('') : '<span class="none"></span>'}</div>
      <span class="num muted">${total}</span></div>`;
  };

  const maxWd = Math.max(1, ...I.weekdays.map((w) => w.sessions));
  const monthBars = (key) => {
    const max = Math.max(1, ...I.months.map((m) => m[key]));
    return `<div class="mbars">${I.months.map((m) => `<div class="mbar" data-tip="${fmtMonth(m.ym)}: ${count(m[key], 'ayah')}">
      <div class="mbar-col"><span style="height:${(m[key] / max) * 100}%"></span></div>
      <span class="mbar-l">${fmtMonthTiny(m.ym)}</span></div>`).join('')}</div>
      <div class="mbars-foot muted"><span>${fmtMonth(I.months[0].ym)}</span><span>${t('maxN', { n: count(Math.max(...I.months.map((m) => m[key])), 'ayah') })}</span></div>`;
  };

  const tile = (x, label, sub, ar, q) => {
    const bucket = x.avg == null ? 0 : Math.round(x.avg);
    const tip = x.known
      ? t('tileTip', { name: label, p: Math.round(x.coverage * 100), a: fmtAvg(x.avg), r: ratingName(x.avg) }) +
        (x.staleDays != null ? t('tileStale', { d: relDay(M.addDays(td, -x.staleDays)) }) : '')
      : t('tileNot', { name: label });
    return `<button class="tile ${bucket ? `has r${bucket}` : ''}" data-q="${q}" data-tip="${esc(tip)}">
      <span class="tile-n">${sub}</span><span class="tile-name">${esc(label)}</span>${ar ? `<span class="tile-ar ar">${ar}</span>` : ''}
      <span class="tile-bar"><span style="width:${Math.round(x.coverage * 100)}%"></span></span></button>`;
  };
  const map = S.mapMode === 'surah'
    ? I.perSurah.map((x) => tile(x, surahName(x.n), x.n, surah(x.n).ar, String(x.n))).join('')
    : I.perJuz.map((x) => tile(x, t('juzN', { n: x.n }), x.n, '', `juz ${x.n}`)).join('');

  const adh = I.adherence.done + I.adherence.missed;

  view.innerHTML = `
    <header class="page-head"><div><h1>${t('nav.insights')}</h1><p class="muted">${t('insSub')}</p></div></header>
    ${!S.items.some((i) => i.rating) ? `<div class="empty big">${t('insEmpty')}</div>` : ''}
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">${t('kpiKnown')}</div><div class="kpi-v">${I.known.toLocaleString('en-US')}</div>
        <div class="kpi-s">${t('kpiKnownSub', { p: pct.toFixed(1), j: (I.known / (TOTAL_AYAHS / 30)).toFixed(1) })}</div>
        <div class="meter"><span style="width:${pct}%"></span></div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiNew')}</div><div class="kpi-v">${I.memorizedNew.toLocaleString('en-US')}</div><div class="kpi-s">${t('kpiNewSub')}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiStreak')}</div><div class="kpi-v">${count(I.streak, 'day')}</div><div class="kpi-s">${t('kpiStreakSub', { l: count(I.longestStreak, 'day'), a: I.activeDays30 })}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiMemQ')}</div><div class="kpi-v">${fmtAvg(I.avg30.memorize)} <small>${ratingName(I.avg30.memorize)}</small></div><div class="kpi-s">${trend(I.avg30.memorize, I.avgPrior.memorize)}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiRevQ')}</div><div class="kpi-v">${fmtAvg(I.avg30.review)} <small>${ratingName(I.avg30.review)}</small></div><div class="kpi-s">${trend(I.avg30.review, I.avgPrior.review)}</div></div>
      <div class="kpi"><div class="kpi-l">${t('kpiPlan')}</div><div class="kpi-v">${adh ? `${Math.round((I.adherence.done / adh) * 100)}%` : '—'}</div><div class="kpi-s">${t('kpiPlanSub', { d: I.adherence.done, m: I.adherence.missed, u: I.upcoming.length })}</div></div>
    </div>

    <section class="panel">
      <header><h2>${t('quranMap')}</h2>
        <div class="seg small" data-mapmode><button data-v="surah" aria-pressed="${S.mapMode === 'surah'}">${t('bySurah')}</button><button data-v="juz" aria-pressed="${S.mapMode === 'juz'}">${t('byJuz')}</button></div>
        <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${ratingLabel(r.v)}</span>`).join('')}<span><i class="sw none"></i>${t('notStarted')}</span><span class="muted">${t('mapHint')}</span></div>
      </header>
      <div class="tiles ${S.mapMode}">${map}</div>
    </section>

    <div class="grid3">
      <section class="panel"><header><h2>${t('needsCare')}</h2><span class="muted">${t('needsCareSub')}</span></header>
        ${spotList(I.attention, t('needsCareEmpty'))}</section>
      <section class="panel"><header><h2>${t('strong')}</h2><span class="muted">${t('strongSub')}</span></header>
        ${spotList(I.strong, t('strongEmpty'))}</section>
      <section class="panel"><header><h2>${t('due')}</h2><span class="muted">${t('dueSub')}</span></header>
        ${I.stale.length ? `<ul class="spots">${I.stale.slice(0, 12).map((s) => `<li><button data-q="${s.n}">
          <span class="pill"><b class="num">${s.staleDays}</b>&nbsp;${t('daysWord')}</span>
          <span class="sp-range">${esc(surahName(s.n))} <span class="ar">${surah(s.n).ar}</span></span>
          <span class="muted sp-when">${t('dueMeta', { p: Math.round(s.coverage * 100), r: ratingName(s.avg) })}</span></button></li>`).join('')}</ul>` : `<div class="empty">${t('dueEmpty')}</div>`}</section>
    </div>

    <div class="grid2">
      <section class="panel"><header><h2>${t('activity')}</h2><span class="muted">${t('activitySub')}</span></header>
        <div class="heatmap"><div class="hm-wd">${M.WEEKDAYS.map((_, k) => `<span>${k % 2 ? weekdayByIndex(k, true) : ''}</span>`).join('')}</div>
          <div><div class="hm-months">${monthLabels}</div><div class="hm-grid">${cells}</div></div></div>
        <div class="legend"><span class="muted">${t('less')}</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-cell l${l}"></i>`).join('')}<span class="muted">${t('more')}</span></div>
      </section>
      <section class="panel"><header><h2>${t('ratings')}</h2><span class="muted">${t('ratingsSub')}</span></header>
        ${distRow('memorize')}${distRow('review')}
        <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${ratingLabel(r.v)}</span>`).join('')}</div>
      </section>
    </div>

    <div class="grid3">
      <section class="panel"><header><h2>${t('byWeekday')}</h2><span class="muted">${t('byWeekdaySub')}</span></header>
        <div class="wdbars">${I.weekdays.map((w) => `<div class="wdbar" data-tip="${esc(t('wdTip', { w: weekdayByIndex(w.w), s: count(w.sessions, 'session'), d: count(w.days, 'day'), a: fmtAvg(w.avg) }))}">
          <span class="wd-n">${weekdayByIndex(w.w, true)}</span><span class="wd-track"><span style="width:${(w.sessions / maxWd) * 100}%"></span></span>
          <span class="num wd-v">${w.sessions}</span><span class="wd-r muted">${w.avg == null ? '' : ratingName(w.avg)}</span></div>`).join('')}</div>
      </section>
      <section class="panel"><header><h2>${t('memPerMonth')}</h2><span class="muted">${t('inAyahs')}</span></header>${monthBars('memorized')}</section>
      <section class="panel"><header><h2>${t('revPerMonth')}</h2><span class="muted">${t('inAyahs')}</span></header>${monthBars('reviewed')}</section>
    </div>`;

  $$('[data-mapmode] button', view).forEach((b) => b.addEventListener('click', () => { S.mapMode = b.dataset.v; renderInsights(); }));
  $$('[data-q]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.q)));
  $$('[data-spot]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.spot)));
  $$('.hm-cell[data-day]', view).forEach((c) => c.addEventListener('click', () => { S.day = c.dataset.day; go('day'); }));
}

// ---------- Backup view ----------

const BACKUP_FILE = `<code dir="ltr">${M.APP}-backup.json</code>`;

async function doExport() {
  const r = await store.exportBackup({ preferShare: false });
  if (r.cancelled) return;
  toast(t('exportedN', { n: count(r.count, 'record'), file: `${M.APP}-backup.json` }));
  renderChrome();
  if (S.view === 'backup') render();
}

async function renderBackup() {
  const lastExp = await store.getMeta('lastExported');
  const all = await store.all({ includeDeleted: true });
  const r = S.lastImport;
  view.innerHTML = `
    <header class="page-head"><div><h1>${t('nav.backup')}</h1><p class="muted">${t('backupSub')}</p></div></header>
    <div class="grid2">
      <section class="panel">
        <header><h2>${t('exportTitle')}</h2></header>
        <p>${t('exportDesc', { file: BACKUP_FILE, n: count(all.length, 'record') })}</p>
        <p class="muted">${t('lastExportedB')} <b>${lastExp ? `${weekdayName(M.dateStr(new Date(lastExp)))}${isAr() ? '، ' : ', '}${fmtDateTime(lastExp)}` : t('never')}</b></p>
        <button class="primary" data-export>${t('exportBackup')}</button>
        <p class="hint">${t('exportTip')}</p>
      </section>
      <section class="panel">
        <header><h2>${t('importTitle')}</h2></header>
        <p>${t('importDesc')}</p>
        <label class="file-btn"><input type="file" accept=".json,application/json" data-import>${t('chooseFile')}</label>
        <div data-result>${r ? importSummary(r) : ''}</div>
      </section>
    </div>
    <section class="panel">
      <header><h2>${t('syncTitle')}</h2></header>
      <ol class="steps"><li>${t('sync1')}</li><li>${t('sync2')}</li><li>${t('sync3')}</li></ol>
    </section>`;
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

// ---------- chrome, routing, keys ----------

function renderStatic() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('.brand-sub').classList.toggle('ar', !isAr());
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

async function renderChrome() {
  renderStatic();
  const lastExp = await store.getMeta('lastExported');
  $('#last-export').textContent = t('lastExported', { d: lastExp ? fmtDate(M.dateStr(new Date(lastExp))) : t('never') });
  const todo = S.items.filter((i) => i.date === M.today() && !i.rating).length;
  $('#badge-today').textContent = todo || '';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === S.view));
}

function render() {
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === S.view));
  ({ day: renderDay, plan: renderPlan, history: renderHistory, insights: renderInsights, backup: renderBackup })[S.view]();
}

function go(v) {
  if (location.hash !== `#${v}`) location.hash = v;
  else { S.view = v; render(); }
}

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  S.view = ['day', 'plan', 'history', 'insights', 'backup'].includes(v) ? v : 'day';
  render();
  view.scrollTop = 0;
  window.scrollTo(0, 0);
});

$$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  setLang(b.dataset.lang);
  renderChrome();
  render();
}));

document.addEventListener('keydown', (e) => {
  if (dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.key === '/') { e.preventDefault(); if (S.view !== 'history') go('history'); setTimeout(() => $('[data-q]')?.focus(), 0); }
  else if (e.key === 't' || e.key === 'T') { S.day = M.today(); go('day'); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor({ type: 'memorize', date: S.view === 'day' ? S.day : M.today() }); }
  else if (S.view === 'day' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // Arrow keys follow the reading direction: in Arabic, ← is the next day.
    const forward = (e.key === 'ArrowRight') !== isAr();
    S.day = M.addDays(S.day, forward ? 1 : -1);
    render();
  }
});

// Hover tooltip for any element with data-tip.
const tip = $('#tip');
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
});
document.addEventListener('mousemove', (e) => {
  if (tip.hidden) return;
  const x = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8));
  const y = e.clientY + 18 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 18;
  tip.style.transform = `translate(${x}px, ${y}px)`;
});

dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#btn-export-side').addEventListener('click', doExport);

// Midnight rollover: keep "today" correct if the app stays open.
let lastToday = M.today();
setInterval(() => {
  if (M.today() !== lastToday) {
    if (S.day === lastToday) S.day = M.today();
    lastToday = M.today();
    reload();
  }
}, 60000);

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
}

applyDocLang();
S.view = ['day', 'plan', 'history', 'insights', 'backup'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'day';
reload();
