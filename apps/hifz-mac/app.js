// Hifz — Mac UI. Data/logic lives in model.js and /shared/.
import { createStore } from '../../shared/store.js';
import { SURAHS, JUZ, TOTAL_AYAHS, surah, formatRange, juzSpan, ayahCount, toIndex, fromIndex, rangeIdx, matchSurahs, isValidPos } from '../../shared/quran.js';
import * as M from './model.js';

const store = createStore({ app: M.APP, schemaVersion: M.SCHEMA_VERSION, migrate: M.migrate, validate: M.validateItem });

const S = {
  items: [],
  view: 'day',
  day: M.today(),
  planStart: M.today(),
  hist: { q: '', type: 'all', ratings: new Set(), status: 'all', preset: 'past', from: '', to: '', limit: 200 },
  mapMode: 'surah',
  lastImport: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const dlg = $('#dlg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

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
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

// ---------- shared bits ----------

function ratingPill(v) {
  if (!v) return '';
  const r = M.ratingInfo(v);
  return `<span class="pill r${v}"><i></i>${r.label}</span>`;
}

function statusBadge(item) {
  const s = M.status(item);
  return `<span class="badge st-${s}">${M.STATUS_LABEL[s]}</span>`;
}

function typeBadge(type) {
  return `<span class="type t-${type}">${type === 'memorize' ? 'Memorize' : 'Review'}</span>`;
}

function rangeText(item) {
  const ar = item.from.s === item.to.s ? surah(item.from.s).ar : `${surah(item.from.s).ar} – ${surah(item.to.s).ar}`;
  return `<span class="range">${esc(formatRange(item.from, item.to))}</span> <span class="ar range-ar">${ar}</span>`;
}

function rateButtons(current, disabled) {
  return `<div class="rate" role="group" aria-label="Rating">${M.RATINGS.map((r) =>
    `<button type="button" class="rb r${r.v}" data-rate="${r.v}" aria-pressed="${current === r.v}" ${disabled ? 'disabled' : ''}><i></i>${r.label}</button>`).join('')}</div>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- range picker ----------

const surahOptions = (sel) => SURAHS.map((s) => `<option value="${s.n}" ${s.n === sel ? 'selected' : ''}>${s.n}. ${esc(s.name)} — ${s.ar} (${s.ayahs})</option>`).join('');

function rangePickerHTML(from, to) {
  return `<div class="rp" data-rp>
    <div class="rp-row"><span class="lbl">From</span>
      <select data-s="from" aria-label="From surah">${surahOptions(from.s)}</select>
      <span class="lbl-sm">ayah</span><input type="number" data-a="from" min="1" max="${surah(from.s).ayahs}" value="${from.a}" aria-label="From ayah">
    </div>
    <div class="rp-row"><span class="lbl">To</span>
      <select data-s="to" aria-label="To surah">${surahOptions(to.s)}</select>
      <span class="lbl-sm">ayah</span><input type="number" data-a="to" min="1" max="${surah(to.s).ayahs}" value="${to.a}" aria-label="To ayah">
    </div>
    <div class="rp-quick">
      <button type="button" data-whole>Whole surah</button>
      <select data-juz aria-label="Pick a juz"><option value="">Whole juz…</option>${JUZ.map((j) => `<option value="${j.n}">Juz ${j.n}</option>`).join('')}</select>
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
      sum.textContent = isValidPos(from) && isValidPos(to) ? '“To” must come after “From”' : 'Check the ayah numbers';
      sum.classList.add('err');
    } else {
      sum.textContent = `${plural(ayahCount(v.from, v.to), 'ayah')} · ${juzSpan(v.from, v.to)}`;
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
    <h2>${isNew ? 'New session' : 'Edit session'}</h2>
    <div class="seg" data-type>
      <button type="button" data-v="memorize" aria-pressed="${it.type === 'memorize'}">Memorization</button>
      <button type="button" data-v="review" aria-pressed="${it.type === 'review'}">Review</button>
    </div>
    <label class="field"><span>Date</span><span class="date-wrap"><input type="date" name="date" value="${it.date}" required> <b class="wd"></b></span></label>
    <div class="field"><span>Range</span>${rangePickerHTML(it.from, it.to)}</div>
    <div class="field"><span>Rating</span><div>${rateButtons(it.rating)}<div class="hint" data-rate-hint></div></div></div>
    <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Optional — mistakes, mutashabihat, how it felt…">${esc(it.note)}</textarea></label>
    <footer>
      ${isNew ? '' : '<button type="button" class="danger" data-del>Delete</button>'}
      <span class="spacer"></span>
      <button type="button" data-cancel>Cancel</button>
      <button type="submit" class="primary" data-save>Save</button>
    </footer>
  </form>`;
  const form = $('form', dlg);
  const rp = bindRangePicker(form, (v) => { $('[data-save]', form).disabled = !v; });
  let type = it.type;
  let rating = it.rating;

  const syncDate = () => {
    const d = form.date.value;
    $('.wd', form).textContent = d ? `${M.weekday(d)} · ${relDay(d)}` : '';
    const future = d > M.today();
    $$('[data-rate]', form).forEach((b) => { b.disabled = future; });
    if (future) { rating = null; syncRate(); }
    $('[data-rate-hint]', form).textContent = future ? 'Future day — this is a plan. Rate it on the day.' : 'Leave empty if not done yet. Click again to clear.';
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
    if (!confirm('Delete this session?')) return;
    await store.remove(it.id);
    dlg.close();
    toast('Session deleted');
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
    toast(isNew ? 'Session added' : 'Saved');
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
    <div class="sc-meta">${plural(M.sizeOf(it), 'ayah')} · ${juzSpan(it.from, it.to)}${it.planned ? ' · planned ahead' : ''}</div>
    ${rateButtons(it.rating, future)}
    ${it.note ? `<p class="sc-note">${esc(it.note)}</p>` : ''}
    <div class="sc-actions"><button class="ghost" data-edit>Edit</button></div>
  </article>`;
}

function renderDay() {
  const d = S.day;
  const list = sessionsOn(d);
  const week0 = M.addDays(d, -M.weekdayIndex(d));
  const week = Array.from({ length: 7 }, (_, k) => M.addDays(week0, k));
  const col = (type) => {
    const xs = list.filter((i) => i.type === type);
    return `<section class="day-col">
      <header><h3>${M.TYPES[type]}</h3><button data-add="${type}">+ Add</button></header>
      ${xs.length ? xs.map(sessionCard).join('') : `<div class="empty">No ${type === 'memorize' ? 'memorization' : 'review'} ${d > M.today() ? 'planned' : 'logged'} for this day.</div>`}
    </section>`;
  };
  view.innerHTML = `
    <header class="day-head">
      <div>
        <div class="day-wd">${M.weekday(d)}</div>
        <div class="day-date">${M.formatLongDate(d)} <span class="muted">· ${esc(M.hijri(d))}</span></div>
        <div class="day-rel">${relDay(d)}</div>
      </div>
      <div class="day-nav">
        <button data-nav="-1" aria-label="Previous day">‹</button>
        <button data-nav="0" ${d === M.today() ? 'disabled' : ''}>Today</button>
        <button data-nav="1" aria-label="Next day">›</button>
        <input type="date" data-pick value="${d}" aria-label="Go to date">
      </div>
    </header>
    <div class="week-strip">${week.map((w) => {
      const xs = sessionsOn(w);
      return `<button class="ws-day ${w === d ? 'sel' : ''} ${w === M.today() ? 'is-today' : ''}" data-go="${w}">
        <span class="ws-wd">${M.weekday(w).slice(0, 3)}</span><span class="ws-n">${M.parseDate(w).getDate()}</span>
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
  const chip = (it) => `<button class="chip t-${it.type} ${it.rating ? `rated r${it.rating}` : ''}" data-id="${it.id}" title="${esc(M.TYPES[it.type])} · ${plural(M.sizeOf(it), 'ayah')}">
      ${it.rating ? '<i></i>' : ''}${esc(formatRange(it.from, it.to))}<span class="chip-n">${M.sizeOf(it)}</span></button>`;

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Plan</h1><p class="muted">Optional. Plan any days you like — one day, a week, or the whole month.</p></div>
      <div class="toolbar">
        <button data-shift="-30" aria-label="Previous 30 days">‹</button>
        <input type="date" data-start value="${start}" aria-label="Plan start date">
        <button data-shift="30" aria-label="Next 30 days">›</button>
        <button data-shift="0" ${start === M.today() ? 'disabled' : ''}>From today</button>
        <button class="primary" data-auto>Auto-plan…</button>
        <button data-clear>Clear plans…</button>
      </div>
    </header>
    <div class="plan-summary">
      <div><b>${new Set(inWin.map((i) => i.date)).size}</b> of 30 days have something</div>
      <div><b>${plural(memAyahs, 'ayah')}</b> to memorize${lastMem ? ` · reaching <b>${esc(formatRange(lastMem.to, lastMem.to))}</b>` : ''}</div>
      <div><b>${inWin.filter((i) => i.type === 'review').length}</b> review sessions</div>
      <div class="muted">${M.formatDate(start)} → ${M.formatDate(end)}</div>
    </div>
    <div class="plan-table" role="table">
      <div class="pt-row pt-head" role="row"><div>Day</div><div>Memorization</div><div>Review</div></div>
      ${days.map((d) => {
        const xs = sessionsOn(d);
        const wd = M.weekdayIndex(d);
        return `<div class="pt-row ${d === M.today() ? 'is-today' : ''} ${wd === 5 ? 'fri' : ''} ${wd === 0 && d !== start ? 'week-start' : ''}" role="row">
          <button class="pt-day" data-open="${d}" title="Open this day"><b>${M.weekday(d)}</b><span>${M.formatDate(d, { year: false })}</span></button>
          ${['memorize', 'review'].map((type) => `<div class="pt-cell">${xs.filter((i) => i.type === type).map(chip).join('')}
            <button class="add-chip" data-add="${type}" data-date="${d}" aria-label="Add ${M.TYPES[type]} on ${M.weekday(d)}">+</button></div>`).join('')}
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

const WD_BOXES = (sel) => M.WEEKDAYS.map((w, k) => `<label class="wd-box"><input type="checkbox" name="wd" value="${k}" ${sel.includes(k) ? 'checked' : ''}>${w.slice(0, 3)}</label>`).join('');

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
    <h2>Auto-plan</h2>
    <div class="ap-grid">
      <div>
        <div class="seg" data-type>
          <button type="button" data-v="memorize" aria-pressed="true">Memorization</button>
          <button type="button" data-v="review" aria-pressed="false">Review</button>
        </div>
        <div class="field"><span>Start</span><span class="date-wrap"><input type="date" name="start" value="${start}"> <b class="wd"></b></span></div>
        <label class="field"><span>Days</span><span><input type="number" name="days" min="1" max="30" value="30"> <span class="muted">days (max 30)</span></span></label>
        <div class="field"><span>On</span><div class="wd-boxes">${WD_BOXES([0, 1, 2, 3, 4, 5, 6])}</div></div>
        <label class="check"><input type="checkbox" name="skip" checked> Skip days that already have a session of this type</label>

        <div data-for="memorize">
          <div class="field"><span>Start at</span><span class="pos">
            <select name="ms" aria-label="Start surah">${surahOptions(memStart.s)}</select>
            <span class="lbl-sm">ayah</span><input type="number" name="ma" min="1" value="${memStart.a}" aria-label="Start ayah"></span></div>
          <label class="field"><span>Per day</span><span><input type="number" name="per" min="1" max="300" value="5"> ayahs</span></label>
          <label class="field"><span>Order</span><select name="order">
            <option value="forward">Forward — Al-Fatihah → An-Nas</option>
            <option value="backward">Backward by surah — An-Nas → Al-Baqarah</option>
          </select></label>
        </div>

        <div data-for="review" hidden>
          <div class="field"><span>Cycle over</span>${rangePickerHTML(revFrom, revTo)}</div>
          <div class="field"><span>Per day</span><span><input type="number" name="rper" min="1" max="300" value="1">
            <select name="unit"><option value="juz">juz</option><option value="surah">surahs</option><option value="ayahs">ayahs</option></select></span></div>
          <p class="hint">Reviews rotate through the range and start over when they reach the end.</p>
        </div>
      </div>
      <div class="ap-preview">
        <h3>Preview <span class="muted" data-count></span></h3>
        <ol data-preview></ol>
      </div>
    </div>
    <footer><span class="spacer"></span><button type="button" data-cancel>Cancel</button><button type="submit" class="primary" data-go>Add to plan</button></footer>
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
    $('.wd', form).textContent = d ? M.weekday(d) : '';
    plan = compute();
    $('[data-count]', form).textContent = plural(plan.length, 'session');
    $('[data-preview]', form).innerHTML = plan.map((p) => `<li><span class="pv-day"><b>${M.weekday(p.date).slice(0, 3)}</b> ${M.formatDate(p.date, { year: false })}</span>
      <span>${esc(formatRange(p.from, p.to))}</span><span class="muted num">${ayahCount(p.from, p.to)}</span></li>`).join('') || '<li class="muted">Nothing to add with these settings.</li>';
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
    toast(`Added ${plural(plan.length, 'planned session')}`);
    await reload();
  });
  preview();
  dlg.showModal();
}

function openClearPlans() {
  const start = S.planStart < M.today() ? M.today() : S.planStart;
  dlg.innerHTML = `<form class="editor" method="dialog">
    <h2>Clear plans</h2>
    <p class="muted">Removes sessions that are not rated yet. Rated sessions are never touched.</p>
    <label class="field"><span>From</span><input type="date" name="from" value="${start}"></label>
    <label class="field"><span>To</span><input type="date" name="to" value="${M.addDays(start, 29)}"></label>
    <label class="field"><span>Type</span><select name="type"><option value="all">Memorization and review</option><option value="memorize">Memorization only</option><option value="review">Review only</option></select></label>
    <p data-count></p>
    <footer><span class="spacer"></span><button type="button" data-cancel>Cancel</button><button type="submit" class="primary danger-fill">Clear</button></footer>
  </form>`;
  const form = $('form', dlg);
  const pick = () => S.items.filter((i) => !i.rating && i.date >= form.from.value && i.date <= form.to.value && (form.type.value === 'all' || i.type === form.type.value));
  const upd = () => { $('[data-count]', form).textContent = `${plural(pick().length, 'unrated session')} will be removed.`; };
  form.addEventListener('input', upd);
  $('[data-cancel]', form).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = pick().map((i) => i.id);
    await store.removeMany(ids);
    dlg.close();
    toast(`Removed ${plural(ids.length, 'session')}`);
    await reload();
  });
  upd();
  dlg.showModal();
}

// ---------- History view ----------

/** Search: "2:255", "18" (surah), "juz 30", surah names (Latin/Arabic), weekdays, ratings, note text. */
function matcher(q) {
  const raw = q.trim().toLowerCase().replace(/juz\s+(\d+)/g, 'juz$1').replace(/very\s+good/g, 'verygood').replace(/not\s+done/g, 'notdone');
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
    const wd = tok.length >= 3 ? M.WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(tok)) : -1;
    const rating = M.RATINGS.find((r) => r.key === tok);
    const surahs = matchSurahs(tok).map(surah);
    return (it) =>
      (wd >= 0 && M.weekdayIndex(it.date) === wd) ||
      (rating && it.rating === rating.v) ||
      (tok === 'notdone' && M.status(it) === 'missed') ||
      surahs.some((s) => M.overlaps(it, s.offset, s.offset + s.ayahs - 1)) ||
      (it.note || '').toLowerCase().includes(tok) ||
      it.date.includes(tok);
  });
  return (it) => tests.every((t) => t(it));
}

function presetRange(p) {
  const t = M.today();
  switch (p) {
    case '7': return [M.addDays(t, -6), t];
    case '30': return [M.addDays(t, -29), t];
    case '90': return [M.addDays(t, -89), t];
    case 'month': return [`${t.slice(0, 7)}-01`, t];
    case 'past': return ['', t];
    case 'future': return [M.addDays(t, 1), ''];
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
      <div><h1>History</h1></div>
    </header>
    <div class="filters">
      <input type="search" data-q value="${esc(H.q)}" placeholder="Search: Al-Kahf · 2:255 · 18 · juz 30 · friday · poor · a note · البقرة" aria-label="Search history">
      <div class="seg small" data-ftype>
        ${[['all', 'All'], ['memorize', 'Memorization'], ['review', 'Review']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${H.type === v}">${l}</button>`).join('')}
      </div>
      <div class="rate-filter" data-frating>
        ${M.RATINGS.map((r) => `<button class="rb r${r.v}" data-v="${r.v}" aria-pressed="${H.ratings.has(r.v)}"><i></i>${r.label}</button>`).join('')}
        <button class="rb" data-v="0" aria-pressed="${H.ratings.has(0)}">Not rated</button>
      </div>
      <select data-fstatus aria-label="Status">
        ${[['all', 'Any status'], ['done', 'Done'], ['planned', 'Planned / to do'], ['missed', 'Not done (past)']].map(([v, l]) => `<option value="${v}" ${H.status === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select data-fpreset aria-label="Date range">
        ${[['all', 'All dates'], ['past', 'Up to today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['month', 'This month'], ['future', 'Upcoming'], ['custom', 'Custom range…']].map(([v, l]) => `<option value="${v}" ${H.preset === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <span class="custom-range ${H.preset === 'custom' ? '' : 'hidden'}">
        <input type="date" data-ffrom value="${H.from}" aria-label="From date"> – <input type="date" data-fto value="${H.to}" aria-label="To date">
      </span>
      <button class="ghost" data-reset>Reset</button>
    </div>
    <div class="hist-layout">
      <div class="hist-list" data-list></div>
      <nav class="month-index" data-months aria-label="Jump to month"></nav>
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
  $('[data-reset]', view).addEventListener('click', () => {
    S.hist = { q: '', type: 'all', ratings: new Set(), status: 'all', preset: 'past', from: '', to: '', limit: 200 };
    renderHistory();
  });
  renderHistoryList();
}

function renderHistoryList() {
  const H = S.hist;
  const all = M.sortSessions(filteredHistory()).reverse();
  const shown = all.slice(0, H.limit);
  const listEl = $('[data-list]', view);
  const days = [...new Set(all.map((i) => i.date))];
  const ayahs = all.reduce((n, i) => n + M.sizeOf(i), 0);

  let html = `<div class="hist-sum">${plural(all.length, 'session')} on ${plural(days.length, 'day')} · ${plural(ayahs, 'ayah')}</div>`;
  if (!S.items.length) html += `<div class="empty big">No sessions yet. Start from the <a href="#day">Day</a> view or <a href="#plan">plan ahead</a>.</div>`;
  else if (!all.length) html += `<div class="empty big">No sessions match these filters.</div>`;
  let month = null, day = null;
  for (const it of shown) {
    const ym = it.date.slice(0, 7);
    if (ym !== month) {
      if (day) html += '</div>';
      day = null;
      month = ym;
      html += `<h2 class="month-h" id="m-${ym}">${M.formatMonth(ym)}</h2>`;
    }
    if (it.date !== day) {
      if (day) html += '</div>';
      day = it.date;
      html += `<div class="hist-day ${day === M.today() ? 'is-today' : ''}"><button class="hd-date" data-open="${day}" title="Open this day">
        <b>${M.weekday(day)}</b><span>${M.formatDate(day)}</span><span class="muted">${relDay(day)}</span></button>`;
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
  if (all.length > shown.length) html += `<button class="more" data-more>Show more (${(all.length - shown.length).toLocaleString()} left)</button>`;
  listEl.innerHTML = html;

  const counts = new Map();
  all.forEach((i) => counts.set(i.date.slice(0, 7), (counts.get(i.date.slice(0, 7)) || 0) + 1));
  $('[data-months]', view).innerHTML = [...counts].map(([ym, n]) => `<button data-ym="${ym}"><span>${M.formatMonth(ym)}</span><span class="num muted">${n}</span></button>`).join('');

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
  S.hist = { q, type: 'all', ratings: new Set(), status: 'done', preset: 'all', from: '', to: '', limit: 200 };
  go('history');
}

// ---------- Insights view ----------

const ratingName = (avg) => (avg == null ? '—' : M.ratingInfo(Math.round(avg)).label);
const fmtAvg = (avg) => (avg == null ? '—' : avg.toFixed(1));

function trend(now, before) {
  if (now == null || before == null) return '<span class="muted">no earlier data to compare</span>';
  const d = now - before;
  if (Math.abs(d) < 0.05) return '<span class="muted">same as the 30 days before</span>';
  return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span> <span class="muted">vs the 30 days before</span>`;
}

function spotList(runs, empty, max = 12) {
  if (!runs.length) return `<div class="empty">${empty}</div>`;
  return `<ul class="spots">${runs.slice(0, max).map((r) => `<li><button data-spot="${r.from.s}:${r.from.a}-${r.to.a}">
      ${ratingPill(r.rating)}
      <span class="sp-range">${esc(formatRange(r.from, r.to))} <span class="ar">${esc(surah(r.from.s).ar)}</span></span>
      <span class="muted sp-when">${plural(r.end - r.start + 1, 'ayah')} · ${M.weekday(r.date)} ${M.formatDate(r.date)}</span>
    </button></li>`).join('')}</ul>${runs.length > max ? `<div class="muted more-note">+ ${runs.length - max} more</div>` : ''}`;
}

function renderInsights() {
  const I = M.insights(S.items);
  const pct = (I.known / TOTAL_AYAHS) * 100;
  const t = M.today();

  // Activity heatmap: 26 weeks, Sunday-first columns.
  const startHM = M.addDays(t, -M.weekdayIndex(t) - 25 * 7);
  const maxAyahs = Math.max(1, ...[...I.activity.values()].map((a) => a.ayahs));
  let cells = '';
  for (let k = 0; k < 26 * 7; k++) {
    const d = M.addDays(startHM, Math.floor(k / 7) * 7 + (k % 7));
    if (d > t) { cells += '<span class="hm-cell future"></span>'; continue; }
    const a = I.activity.get(d);
    const lvl = a ? Math.max(1, Math.ceil((a.ayahs / maxAyahs) * 4)) : 0;
    const tip = `${M.weekday(d)} ${M.formatDate(d)} — ${a ? `${plural(a.sessions, 'session')}, ${plural(a.ayahs, 'ayah')}, avg ${ratingName(a.sum / a.sessions)}` : 'nothing logged'}`;
    cells += `<span class="hm-cell l${lvl}" data-tip="${esc(tip)}" data-day="${d}"></span>`;
  }
  const monthLabels = Array.from({ length: 26 }, (_, w) => {
    const d = M.addDays(startHM, w * 7);
    const prev = M.addDays(d, -7);
    return `<span>${w > 0 && d.slice(5, 7) !== prev.slice(5, 7) ?M.parseDate(d).toLocaleDateString('en-GB', { month: 'short' }) : ''}</span>`;
  }).join('');

  const distRow = (type) => {
    const d = I.distribution[type];
    const total = d[1] + d[2] + d[3] + d[4];
    return `<div class="dist-row"><span class="dist-lbl">${M.TYPES[type]}</span>
      <div class="dist-bar">${total ? M.RATINGS.filter((r) => d[r.v]).map((r) =>
        `<span class="r${r.v}" style="flex:${d[r.v]}" data-tip="${M.TYPES[type]} · ${r.label}: ${d[r.v]} (${Math.round((d[r.v] / total) * 100)}%)"></span>`).join('') : '<span class="none"></span>'}</div>
      <span class="num muted">${total}</span></div>`;
  };

  const maxWd = Math.max(1, ...I.weekdays.map((w) => w.sessions));
  const monthBars = (key) => {
    const max = Math.max(1, ...I.months.map((m) => m[key]));
    return `<div class="mbars">${I.months.map((m) => `<div class="mbar" data-tip="${M.formatMonth(m.ym)}: ${plural(m[key], 'ayah')}">
      <div class="mbar-col"><span style="height:${(m[key] / max) * 100}%"></span></div>
      <span class="mbar-l">${M.parseDate(`${m.ym}-01`).toLocaleDateString('en-GB', { month: 'narrow' })}</span></div>`).join('')}</div>
      <div class="mbars-foot muted"><span>${M.formatMonth(I.months[0].ym)}</span><span>max ${plural(Math.max(...I.months.map((m) => m[key])), 'ayah')}</span></div>`;
  };

  const tile = (x, label, sub, ar, q) => {
    const bucket = x.avg == null ? 0 : Math.round(x.avg);
    const tip = x.known ? `${label} — ${Math.round(x.coverage * 100)}% covered, avg ${fmtAvg(x.avg)} (${ratingName(x.avg)})${x.staleDays != null ? `, oldest part last seen ${x.staleDays} days ago` : ''}` : `${label} — not started`;
    return `<button class="tile ${bucket ? `has r${bucket}` : ''}" data-q="${q}" data-tip="${esc(tip)}">
      <span class="tile-n">${sub}</span><span class="tile-name">${esc(label)}</span>${ar ? `<span class="tile-ar ar">${ar}</span>` : ''}
      <span class="tile-bar"><span style="width:${Math.round(x.coverage * 100)}%"></span></span></button>`;
  };
  const map = S.mapMode === 'surah'
    ? I.perSurah.map((x) => tile(x, surah(x.n).name, x.n, surah(x.n).ar, String(x.n))).join('')
    : I.perJuz.map((x) => tile(x, `Juz ${x.n}`, x.n, '', `juz ${x.n}`)).join('');

  const adh = I.adherence.done + I.adherence.missed;

  view.innerHTML = `
    <header class="page-head"><div><h1>Insights</h1><p class="muted">Based on rated sessions. A session's rating applies to every ayah in its range; the latest rating counts.</p></div></header>
    ${!S.items.some((i) => i.rating) ? '<div class="empty big">Rate a few sessions and your insights will appear here.</div>' : ''}
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">Ayahs known</div><div class="kpi-v">${I.known.toLocaleString()}</div>
        <div class="kpi-s">${pct.toFixed(1)}% of the Quran · ≈ ${(I.known / (TOTAL_AYAHS / 30)).toFixed(1)} juz</div>
        <div class="meter"><span style="width:${pct}%"></span></div></div>
      <div class="kpi"><div class="kpi-l">Newly memorized</div><div class="kpi-v">${I.memorizedNew.toLocaleString()}</div><div class="kpi-s">ayahs with a rated memorization session</div></div>
      <div class="kpi"><div class="kpi-l">Streak</div><div class="kpi-v">${plural(I.streak, 'day')}</div><div class="kpi-s">longest ${plural(I.longestStreak, 'day')} · ${I.activeDays30} active days in the last 30</div></div>
      <div class="kpi"><div class="kpi-l">Memorization quality · 30 days</div><div class="kpi-v">${fmtAvg(I.avg30.memorize)} <small>${ratingName(I.avg30.memorize)}</small></div><div class="kpi-s">${trend(I.avg30.memorize, I.avgPrior.memorize)}</div></div>
      <div class="kpi"><div class="kpi-l">Review quality · 30 days</div><div class="kpi-v">${fmtAvg(I.avg30.review)} <small>${ratingName(I.avg30.review)}</small></div><div class="kpi-s">${trend(I.avg30.review, I.avgPrior.review)}</div></div>
      <div class="kpi"><div class="kpi-l">Plan follow-through · 30 days</div><div class="kpi-v">${adh ? `${Math.round((I.adherence.done / adh) * 100)}%` : '—'}</div><div class="kpi-s">${I.adherence.done} done · ${I.adherence.missed} not done · ${I.upcoming.length} upcoming</div></div>
    </div>

    <section class="panel">
      <header><h2>Quran map</h2>
        <div class="seg small" data-mapmode><button data-v="surah" aria-pressed="${S.mapMode === 'surah'}">By surah</button><button data-v="juz" aria-pressed="${S.mapMode === 'juz'}">By juz</button></div>
        <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${r.label}</span>`).join('')}<span><i class="sw none"></i>Not started</span><span class="muted">Bar = share covered · click to see history</span></div>
      </header>
      <div class="tiles ${S.mapMode}">${map}</div>
    </section>

    <div class="grid3">
      <section class="panel"><header><h2>Needs care</h2><span class="muted">latest rating Poor or Good</span></header>
        ${spotList(I.attention, 'Nothing rated Poor or Good right now.')}</section>
      <section class="panel"><header><h2>Strong spots</h2><span class="muted">latest rating Excellent</span></header>
        ${spotList(I.strong, 'No Excellent ratings yet.')}</section>
      <section class="panel"><header><h2>Due for review</h2><span class="muted">known parts untouched 30+ days</span></header>
        ${I.stale.length ? `<ul class="spots">${I.stale.slice(0, 12).map((s) => `<li><button data-q="${s.n}">
          <span class="pill"><b class="num">${s.staleDays}</b>&nbsp;days</span>
          <span class="sp-range">${esc(surah(s.n).name)} <span class="ar">${surah(s.n).ar}</span></span>
          <span class="muted sp-when">${Math.round(s.coverage * 100)}% known · avg ${ratingName(s.avg)}</span></button></li>`).join('')}</ul>` : '<div class="empty">Everything you know was seen in the last 30 days.</div>'}</section>
    </div>

    <div class="grid2">
      <section class="panel"><header><h2>Activity</h2><span class="muted">last 26 weeks · darker = more ayahs</span></header>
        <div class="heatmap"><div class="hm-wd">${M.WEEKDAYS.map((w, k) => `<span>${k % 2 ? w.slice(0, 3) : ''}</span>`).join('')}</div>
          <div><div class="hm-months">${monthLabels}</div><div class="hm-grid">${cells}</div></div></div>
        <div class="legend"><span class="muted">Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-cell l${l}"></i>`).join('')}<span class="muted">More</span></div>
      </section>
      <section class="panel"><header><h2>Ratings</h2><span class="muted">all rated sessions</span></header>
        ${distRow('memorize')}${distRow('review')}
        <div class="legend">${M.RATINGS.map((r) => `<span><i class="sw r${r.v}"></i>${r.label}</span>`).join('')}</div>
      </section>
    </div>

    <div class="grid3">
      <section class="panel"><header><h2>By day of week</h2><span class="muted">sessions · avg rating</span></header>
        <div class="wdbars">${I.weekdays.map((w) => `<div class="wdbar" data-tip="${w.name}: ${plural(w.sessions, 'session')} on ${plural(w.days, 'day')}, avg ${fmtAvg(w.avg)}">
          <span class="wd-n">${w.name.slice(0, 3)}</span><span class="wd-track"><span style="width:${(w.sessions / maxWd) * 100}%"></span></span>
          <span class="num wd-v">${w.sessions}</span><span class="wd-r muted">${w.avg == null ? '' : ratingName(w.avg)}</span></div>`).join('')}</div>
      </section>
      <section class="panel"><header><h2>Memorized per month</h2><span class="muted">ayahs</span></header>${monthBars('memorized')}</section>
      <section class="panel"><header><h2>Reviewed per month</h2><span class="muted">ayahs</span></header>${monthBars('reviewed')}</section>
    </div>`;

  $$('[data-mapmode] button', view).forEach((b) => b.addEventListener('click', () => { S.mapMode = b.dataset.v; renderInsights(); }));
  $$('[data-q]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.q)));
  $$('[data-spot]', view).forEach((b) => b.addEventListener('click', () => historyFor(b.dataset.spot)));
  $$('.hm-cell[data-day]', view).forEach((c) => c.addEventListener('click', () => { S.day = c.dataset.day; go('day'); }));
}

// ---------- Backup view ----------

async function doExport() {
  const r = await store.exportBackup({ preferShare: false });
  if (r.cancelled) return;
  toast(`Exported ${plural(r.count, 'record')} to ${M.APP}-backup.json`);
  renderChrome();
  if (S.view === 'backup') render();
}

async function renderBackup() {
  const lastExp = await store.getMeta('lastExported');
  const all = await store.all({ includeDeleted: true });
  const r = S.lastImport;
  view.innerHTML = `
    <header class="page-head"><div><h1>Backup</h1><p class="muted">Your data stays on this Mac (in this browser’s storage). Export a file to back it up or move it to your iPhone.</p></div></header>
    <div class="grid2">
      <section class="panel">
        <header><h2>Export</h2></header>
        <p>Saves <code>${M.APP}-backup.json</code> with all ${plural(all.length, 'record')} (deletions included, so they sync too).</p>
        <p class="muted">Last exported: <b>${lastExp ? `${M.weekday(M.dateStr(new Date(lastExp)))}, ${new Date(lastExp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'never'}</b></p>
        <button class="primary" data-export>Export backup</button>
        <p class="hint">Tip: move the file to iCloud Drive to reach it from your iPhone.</p>
      </section>
      <section class="panel">
        <header><h2>Import</h2></header>
        <p>Merges a backup into this device. For each record the <b>newer</b> version wins, so an old backup never overwrites newer data here.</p>
        <label class="file-btn"><input type="file" accept=".json,application/json" data-import>Choose backup file…</label>
        <div data-result>${r ? importSummary(r) : ''}</div>
      </section>
    </div>
    <section class="panel">
      <header><h2>Syncing Mac ↔ iPhone</h2></header>
      <ol class="steps">
        <li>On the device with the newest changes: <b>Export</b> and save the file to iCloud Drive.</li>
        <li>On the other device: <b>Import</b> that file. You’ll see what was added and updated.</li>
        <li>To bring changes back, export there and import here. Importing in both directions is always safe.</li>
      </ol>
    </section>`;
  $('[data-export]', view).addEventListener('click', doExport);
  $('[data-import]', view).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      S.lastImport = await store.importBackup(f);
      toast('Import finished');
    } catch (err) {
      S.lastImport = { error: err.message };
    }
    await reload();
  });
}

function importSummary(r) {
  if (r.error) return `<div class="result err"><b>Import failed.</b> ${esc(r.error)} Nothing was changed.</div>`;
  return `<div class="result">
    <b>Import finished</b>${r.exportedAt ? ` <span class="muted">— backup from ${new Date(r.exportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>` : ''}
    <ul>
      <li><b class="num">${r.added}</b> added</li>
      <li><b class="num">${r.updated}</b> updated (the backup had a newer version)</li>
      <li><b class="num">${r.unchanged}</b> unchanged</li>
      <li><b class="num">${r.keptLocal}</b> kept as-is (this device had a newer version)</li>
      ${r.invalid ? `<li><b class="num">${r.invalid}</b> skipped (unreadable)</li>` : ''}
    </ul>
    ${r.migratedFrom ? `<p class="muted">Upgraded from schema version ${r.migratedFrom}.</p>` : ''}
  </div>`;
}

// ---------- chrome, routing, keys ----------

async function renderChrome() {
  const lastExp = await store.getMeta('lastExported');
  $('#last-export').textContent = `Last exported: ${lastExp ? M.formatDate(M.dateStr(new Date(lastExp))) : 'never'}`;
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

document.addEventListener('keydown', (e) => {
  if (dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.key === '/') { e.preventDefault(); if (S.view !== 'history') go('history'); setTimeout(() => $('[data-q]')?.focus(), 0); }
  else if (e.key === 't' || e.key === 'T') { S.day = M.today(); go('day'); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor({ type: 'memorize', date: S.view === 'day' ? S.day : M.today() }); }
  else if (S.view === 'day' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { S.day = M.addDays(S.day, e.key === 'ArrowLeft' ? -1 : 1); render(); }
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
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
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

S.view = ['day', 'plan', 'history', 'insights', 'backup'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'day';
reload();
