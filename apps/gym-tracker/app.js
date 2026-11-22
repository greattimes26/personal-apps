/* Gym Tracker — app logic. Data lives in this device's IndexedDB (shared/store.js).
   Export regularly: the export file is both your backup and what you bring to chat. */
import { createStore, requestPersistence, uuid } from '../../shared/store.js';

  const APP = 'gym-tracker';
  const SCHEMA_VERSION = 1;
  const PLAN_ID = 'plan'; // single plan item, fixed id so it merges across devices
  const ITEM_TYPES = ['plan', 'log', 'checkin'];
  const store = createStore({ app: APP, schemaVersion: SCHEMA_VERSION, validate: i => validItem(i) });
  const DEFAULT_SETTINGS = { restOn: true, rest: 90, sound: true };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s));
  const fmt = s => { if (!isYmd(s)) return esc(s); const d = parse(s); return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MON[d.getMonth()]}`; };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const trimNum = n => (Math.round(n * 10) / 10).toString();
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  // "3 × 10–12" for a plan item. Numbers are checked on import, and escaped here as well.
  const repsText = it => esc(it.reps[0] === it.reps[1] ? it.reps[0] : `${it.reps[0]}–${it.reps[1]}`);

  // Shape check for every item that comes in through a backup file.
  function validItem(i) {
    if (!i || !ITEM_TYPES.includes(i.type)) return false;
    if (i.type === 'plan') return !!i.plan && validatePlan(i.plan).length === 0;
    if (!isYmd(i.date)) return false;
    if (i.type === 'log') return typeof i.session === 'string' && !!i.sets && typeof i.sets === 'object' && (!i.cardio || typeof i.cardio === 'object');
    return true; // checkin: numbers are only ever shown through trimNum / esc
  }

  // ---------- state ----------
  // In memory for fast rendering; every change is written through to IndexedDB.
  let state = { plan: clone(window.DEFAULT_PLAN), logs: {}, checkins: [], settings: Object.assign({}, DEFAULT_SETTINGS), lastExport: null };
  const nowIso = () => new Date().toISOString();

  async function loadState() {
    const items = await store.all();
    const planItem = items.find(i => i.type === 'plan');
    state.plan = planItem && planItem.plan && validatePlan(planItem.plan).length === 0 ? planItem.plan : clone(window.DEFAULT_PLAN);
    if (planItem && state.plan !== planItem.plan) setTimeout(() => toast('Your saved plan has a problem, showing the default plan. Import your plan file again.', 6000), 500);
    state.logs = {};
    items.filter(i => i.type === 'log').forEach(l => { state.logs[l.id] = l; });
    state.checkins = items.filter(i => i.type === 'checkin');
    state.settings = Object.assign({}, DEFAULT_SETTINGS, (await store.getMeta('settings')) || {});
    state.lastExport = (await store.getMeta('lastExported')) || null;
  }
  function persist(item) {
    item.updatedAt = nowIso();
    store.put(item).catch(() => toast('Could not save. Export a backup now.'));
  }
  function saveSettings() { store.setMeta('settings', state.settings).catch(() => {}); }

  const ui = { tab: 'today', picked: {}, stopAnim: null };
  // Rest timer state, all in one place: end time, the 250 ms ticker, the auto-hide after "Go!", scheduled beep.
  const rest = { end: 0, ticker: null, hideTimer: null, beep: null };

  // ---------- plan helpers ----------
  const plan = () => state.plan;
  const exInfo = id => plan().exercises[id] || { name: id, machine: '', tips: [] };
  const sessionById = id => plan().sessions.find(s => s.id === id);
  const scheduledFor = date => plan().schedule[String(parse(date).getDay())] || null;
  const kindOf = item => item.kind || 'weight';

  function currentSessionId() {
    const t = today();
    if (ui.picked[t]) return ui.picked[t];
    const started = Object.values(state.logs).filter(l => l.date === t).sort((a, b) => ((b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1))[0];
    if (started && sessionById(started.session)) return started.session;
    const s = scheduledFor(t);
    return s && sessionById(s) ? s : null;
  }
  function getLog(date, sid, create) {
    let log = Object.values(state.logs).find(l => l.date === date && l.session === sid) || null;
    if (!log && create) {
      const now = nowIso();
      log = { id: uuid(), type: 'log', date, session: sid, sets: {}, cardio: {}, createdAt: now, updatedAt: now, deleted: false };
      state.logs[log.id] = log;
    }
    return log;
  }
  function logHasWork(l) {
    return Object.values(l.sets || {}).some(a => (a || []).some(s => s && s.done)) || Object.values(l.cardio || {}).some(c => c && c.done);
  }
  function lastPerf(exId, excludeId) {
    let best = null;
    for (const l of Object.values(state.logs)) {
      if (l.id === excludeId) continue;
      const sets = (l.sets[exId] || []).filter(s => s && s.done);
      if (!sets.length) continue;
      if (!best || l.date > best.date || (l.date === best.date && (l.updatedAt || '') > (best.updatedAt || ''))) best = { date: l.date, sets, updatedAt: l.updatedAt };
    }
    return best;
  }
  function readyToIncrease(item, last) {
    if (!last || !item.reps) return false;
    const n = item.sets || 0;
    if (last.sets.length < n) return false;
    return last.sets.slice(0, n).every(s => num(s.r) != null && num(s.r) >= item.reps[1]);
  }
  function plannedDates() {
    const out = [];
    const end = addDays(plan().goalDate, -1);
    for (let d = plan().startDate; d <= end; d = addDays(d, 1)) if (scheduledFor(d)) out.push(d);
    return out;
  }
  function doneLogs() {
    return Object.values(state.logs).filter(logHasWork).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  function daysToGoal() { return daysBetween(today(), plan().goalDate); }
  function weekNo() {
    const total = Math.max(1, Math.round(daysBetween(plan().startDate, plan().goalDate) / 7));
    const w = Math.floor(daysBetween(plan().startDate, today()) / 7) + 1;
    return { w: Math.min(Math.max(w, 1), total), total };
  }

  // ---------- rendering ----------
  function render() {
    stopAnim();
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
    const views = { today: renderToday, progress: renderProgress, checkin: renderCheckin, more: renderMore };
    try {
      $('#main').innerHTML = views[ui.tab]();
    } catch (err) {
      console.error(err);
      $('#main').innerHTML = `<h1>Something went wrong</h1><div class="card">
        <p>This screen couldn't be shown. Your data is still saved on this phone.</p>
        <p class="muted small">${esc(err && err.message)}</p>
        <p class="muted">Try another tab, or import a backup or plan file to repair it.</p>
        <button class="btn ghost" data-action="import">⬆ Import file</button><input type="file" id="importFile" accept=".json,application/json" class="hidden"></div>`;
    }
  }

  function countdownChip() {
    const d = daysToGoal();
    if (d > 0) return `<span class="chip accent">✈️ ${d} day${d === 1 ? '' : 's'} to ${esc(plan().goalLabel || fmt(plan().goalDate))}</span>`;
    if (d === 0) return `<span class="chip accent">✈️ Today's the day!</span>`;
    return '';
  }

  function renderToday() {
    const t = today();
    const sched = scheduledFor(t);
    const sid = currentSessionId();
    let h = `<div class="row between wrap"><h1>${fmt(t)}</h1>${countdownChip()}</div>`;

    // Saturday check-in reminder
    if (parse(t).getDay() === 6 && !state.checkins.some(c => daysBetween(c.date, t) < 6 && daysBetween(c.date, t) >= 0)) {
      h += `<div class="banner"><b>Saturday check-in</b><div class="muted">Measure your waist and take your progress photos before training.</div>
        <button class="btn small" style="margin-top:8px" data-tab="checkin">Do check-in</button></div>`;
    }

    h += `<div class="pills">` + plan().sessions.map(s =>
      `<button class="pill ${s.id === sid ? 'active' : ''}" data-action="pick" data-sid="${esc(s.id)}">${esc(s.name)}${s.id === sched ? '<span class="dot" title="Scheduled today"></span>' : ''}</button>`).join('') + `</div>`;

    if (!sid) {
      let next = null;
      for (let i = 1; i <= 7; i++) { const d = addDays(t, i); const s = scheduledFor(d); if (s && sessionById(s)) { next = { d, s: sessionById(s) }; break; } }
      h += `<div class="card"><div style="font-size:20px;font-weight:800">Rest day 😌</div>
        <p class="muted">Muscles grow while you recover. Aim for 8–10k steps today.</p>
        ${next ? `<p>Next: <b>${esc(next.s.name)}</b> on ${DAYS[parse(next.d).getDay()]}.</p>` : ''}
        <p class="muted small">Want to train anyway? Tap a session above.</p></div>`;
      return h;
    }

    const sess = sessionById(sid);
    const log = getLog(t, sid, false);
    const items = sess.items;
    const doneCount = items.filter(it => itemDone(it, log)).length;
    h += `<div class="row between" style="margin-top:6px"><div><div style="font-size:19px;font-weight:800">${esc(sess.name)}</div>
      <div class="muted">${esc(sess.focus || '')}</div></div><span class="chip ${doneCount === items.length ? 'good' : ''}">${doneCount}/${items.length} done</span></div>`;
    if (sid !== sched && sched) h += `<div class="muted small" style="margin-top:4px">Today's scheduled session is ${esc(sessionById(sched) ? sessionById(sched).name : sched)}.</div>`;

    let lastGroup = null;
    items.forEach(item => {
      if (item.group && item.group !== lastGroup) h += `<div class="group-head">⚡ ${esc(item.group)}</div>`;
      lastGroup = item.group || null;
      h += renderItem(item, log, t, sid);
    });

    if (log && log.finishedAt) {
      h += `<div class="banner good"><b>Workout saved 💪</b><div class="muted">Nice work. Don't forget the pool, jacuzzi and steam!</div></div>`;
    } else {
      h += `<button class="btn block" style="margin-top:16px" data-action="finish" ${log && logHasWork(log) ? '' : 'disabled'}>Finish workout</button>`;
    }
    return h;
  }

  function itemDone(item, log) {
    if (!log) return false;
    if (kindOf(item) === 'cardio') return !!(log.cardio[item.ex] && log.cardio[item.ex].done);
    const sets = log.sets[item.ex] || [];
    return sets.filter(s => s && s.done).length >= (item.sets || 1);
  }

  function renderItem(item, log, date, sid) {
    const ex = exInfo(item.ex);
    const kind = kindOf(item);
    const done = itemDone(item, log);
    const nameBtn = `<button class="ex-name" data-action="info" data-ex="${esc(item.ex)}">${esc(ex.name)}<span class="info">i</span></button>`;

    if (kind === 'cardio') {
      const c = (log && log.cardio[item.ex]) || {};
      return `<div class="card ${done ? 'done' : ''}" data-ex="${esc(item.ex)}" data-kind="cardio">
        <div class="ex-head"><div>${nameBtn}<div class="ex-meta">${esc(ex.machine)} · ${esc(item.minutes || '')} min</div></div></div>
        <div class="cardio-row"><input data-f="min" inputmode="decimal" placeholder="${esc(item.minutes || 'min')}" value="${esc(c.min == null ? '' : c.min)}" aria-label="Minutes">
        <span class="muted">min</span><span style="flex:1"></span>
        <button class="check ${c.done ? 'on' : ''}" data-action="cardio" aria-label="Mark done">✓</button></div></div>`;
    }

    const last = lastPerf(item.ex, log ? log.id : null);
    const up = kind === 'weight' && readyToIncrease(item, last);
    const topTime = kind === 'time' && readyToIncrease(item, last);
    const unit = kind === 'time' ? 'sec' : 'reps';
    const target = `${esc(item.sets)} × ${repsText(item)}${kind === 'time' ? ' sec' : ''}`;
    let lastTxt = '';
    if (last) {
      const parts = last.sets.map(s => kind === 'time' ? `${esc(s.r)}s` : `${s.w != null && s.w !== '' ? esc(s.w) + ' kg × ' : ''}${esc(s.r)}`);
      lastTxt = `<div class="ex-last">Last time (${fmt(last.date)}): <b>${parts.join(' · ')}</b></div>`;
    } else {
      lastTxt = `<div class="ex-last">First time: pick a weight you can do ${esc(item.reps[0])}–${esc(item.reps[1])} times with good form.</div>`;
    }
    const cur = (log && log.sets[item.ex]) || [];
    let rows = '';
    for (let i = 0; i < item.sets; i++) {
      const s = cur[i] || {};
      const ls = last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null;
      const wVal = s.w != null && s.w !== '' ? s.w : (ls && ls.w != null ? ls.w : '');
      const rPh = ls && ls.r != null ? ls.r : (item.reps[0] + '–' + item.reps[1]);
      rows += `<tr data-i="${i}" class="${s.done ? 'isdone' : ''}"><td class="n">${i + 1}</td>
        ${kind === 'weight' ? `<td><input data-f="w" inputmode="decimal" value="${esc(wVal)}" aria-label="Weight in kg, set ${i + 1}"></td>` : ''}
        <td><input data-f="r" inputmode="numeric" placeholder="${esc(rPh)}" value="${esc(s.r == null ? '' : s.r)}" aria-label="${unit}, set ${i + 1}"></td>
        <td><button class="check" data-action="toggle" aria-label="Set ${i + 1} done">✓</button></td></tr>`;
    }
    return `<div class="card ${done ? 'done' : ''}" data-ex="${esc(item.ex)}" data-kind="${kind}">
      <div class="ex-head"><div>${nameBtn}<div class="ex-meta">${esc(ex.machine)} · ${target}</div></div>
      ${up ? '<span class="badge-up">⬆ Add weight today</span>' : ''}${topTime ? '<span class="chip good">Top reached ✓</span>' : ''}</div>
      ${lastTxt}
      <table class="sets"><thead><tr><th>Set</th>${kind === 'weight' ? '<th>kg</th>' : ''}<th>${unit}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- progress ----------
  function sparkline(vals, w = 110, h = 34) {
    if (vals.length < 2) return '';
    const min = Math.min(...vals), max = Math.max(...vals);
    const rng = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 6) + 3).toFixed(1)},${(h - 4 - (v - min) / rng * (h - 8)).toFixed(1)}`).join(' ');
    const lastP = pts.split(' ').pop().split(',');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lastP[0]}" cy="${lastP[1]}" r="3" fill="#f59e0b"/></svg>`;
  }

  function waistChart(cs) {
    const W = 320, H = 150, padL = 34, padR = 10, padT = 12, padB = 24;
    const vals = cs.map(c => c.waist);
    const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
    const x = i => padL + (cs.length === 1 ? (W - padL - padR) / 2 : i / (cs.length - 1) * (W - padL - padR));
    const y = v => padT + (max - v) / (max - min) * (H - padT - padB);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
    [min, (min + max) / 2, max].forEach(v => {
      s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3442"/><text x="${padL - 6}" y="${y(v) + 4}" fill="#8b97a8" font-size="10" text-anchor="end">${trimNum(v)}</text>`;
    });
    s += `<polyline points="${cs.map((c, i) => `${x(i)},${y(c.waist)}`).join(' ')}" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linejoin="round"/>`;
    cs.forEach((c, i) => {
      s += `<circle cx="${x(i)}" cy="${y(c.waist)}" r="3.5" fill="#34d399"/>`;
      if (cs.length <= 7 || i === 0 || i === cs.length - 1) s += `<text x="${x(i)}" y="${H - 6}" fill="#8b97a8" font-size="10" text-anchor="middle">${parse(c.date).getDate()} ${MON[parse(c.date).getMonth()]}</text>`;
    });
    return s + '</svg>';
  }

  function strengthSeries() {
    const logs = doneLogs();
    const out = [];
    const seen = new Set();
    plan().sessions.forEach(s => s.items.forEach(it => {
      if (kindOf(it) !== 'weight' || seen.has(it.ex)) return;
      seen.add(it.ex);
      const pts = [];
      logs.forEach(l => {
        const sets = (l.sets[it.ex] || []).filter(x => x && x.done && num(x.w) != null);
        if (sets.length) pts.push({ date: l.date, w: Math.max(...sets.map(x => num(x.w))) });
      });
      if (pts.length) out.push({ ex: it.ex, pts });
    }));
    return out;
  }

  function renderProgress() {
    const d = daysToGoal();
    const wk = weekNo();
    const planned = plannedDates();
    const done = doneLogs();
    const doneInPlan = done.filter(l => l.date >= plan().startDate && l.date < plan().goalDate).length;
    const pct = planned.length ? Math.min(100, Math.round(doneInPlan / planned.length * 100)) : 0;

    let h = `<h1>Progress</h1>`;
    h += `<div class="stat-grid" style="margin-top:10px">
      <div class="stat"><div class="muted">Days to ${esc(plan().goalLabel || fmt(plan().goalDate))}</div><div class="big">${Math.max(d, 0)}</div><div class="muted small">Week ${wk.w} of ${wk.total}</div></div>
      <div class="stat"><div class="muted">Workouts done</div><div class="big">${doneInPlan}<span class="muted" style="font-size:18px"> / ${planned.length}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
    </div>`;

    const cs = state.checkins.filter(c => num(c.waist) != null).sort((a, b) => (a.date < b.date ? -1 : 1));
    h += `<h2>Waist</h2>`;
    if (cs.length) {
      const diff = cs[cs.length - 1].waist - cs[0].waist;
      h += `<div class="card"><div class="row between"><div><span style="font-size:22px;font-weight:800">${trimNum(cs[cs.length - 1].waist)} cm</span>
        <span class="muted"> latest</span></div>${cs.length > 1 ? `<span class="${diff <= 0 ? 'delta-down' : ''}">${diff <= 0 ? '▼' : '▲'} ${trimNum(Math.abs(diff))} cm since ${fmt(cs[0].date)}</span>` : ''}</div>
        ${waistChart(cs)}</div>`;
    } else {
      h += `<div class="card muted">No check-ins yet. Your first one is on Saturday.</div>`;
    }

    const series = strengthSeries();
    h += `<h2>Strength</h2>`;
    if (series.length) {
      h += `<div class="card">` + series.map(s => {
        const f = s.pts[0].w, l = s.pts[s.pts.length - 1].w;
        const diff = l - f;
        return `<div class="list-row"><div><div style="font-weight:600">${esc(exInfo(s.ex).name)}</div>
          <div class="muted small">${trimNum(f)} → <b style="color:var(--text)">${trimNum(l)} kg</b> ${diff > 0 ? `<span class="delta-up">+${trimNum(diff)}</span>` : ''}</div></div>${sparkline(s.pts.map(p => p.w))}</div>`;
      }).join('') + `</div>`;
    } else {
      h += `<div class="card muted">Log your first workout and your lifts will show up here.</div>`;
    }

    h += `<h2>Workout history</h2>`;
    const recent = done.slice().reverse();
    if (recent.length) {
      h += `<div class="card">` + recent.map(l => {
        const s = sessionById(l.session);
        return `<details class="hist list-row" style="display:block"><summary class="row between"><span><b>${fmt(l.date)}</b> · ${esc(s ? s.name : l.session)}</span><span class="muted">›</span></summary>
          <pre>${esc(logText(l))}</pre><button class="btn small danger" data-action="del-log" data-id="${esc(l.id)}">Delete this workout</button></details>`;
      }).join('') + `</div>`;
    } else {
      h += `<div class="card muted">No workouts yet.</div>`;
    }
    return h;
  }

  // ---------- check-in ----------
  function renderCheckin() {
    const t = today();
    const existing = state.checkins.find(c => c.date === t) || {};
    let h = `<h1>Weekly check-in</h1><div class="muted">Every Saturday morning, before eating or training.</div>`;
    h += `<div class="card">
      <label class="field"><span>Date</span><input type="date" id="ciDate" value="${t}"></label>
      <label class="field"><span>Waist (cm) — at the belly button, relaxed, after breathing out</span><input id="ciWaist" inputmode="decimal" placeholder="e.g. 96.5" value="${esc(existing.waist == null ? '' : existing.waist)}"></label>
      <label class="field"><span>Body weight (kg) — optional</span><input id="ciWeight" inputmode="decimal" placeholder="optional" value="${esc(existing.weight == null ? '' : existing.weight)}"></label>
      <label class="switch"><span>📸 Progress photos taken<br><span class="muted small">Front, side, arms flexed. Same spot, same light. They stay in your phone's gallery.</span></span>
        <input type="checkbox" id="ciPhotos" ${existing.photos ? 'checked' : ''}></label>
      <button class="btn block" data-action="save-checkin" style="margin-top:8px">Save check-in</button></div>`;
    const cs = state.checkins.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (cs.length) {
      const first = cs[cs.length - 1];
      h += `<h2>Previous check-ins</h2><div class="card">` + cs.map(c => {
        const dw = c.waist != null && first.waist != null && c !== first ? c.waist - first.waist : null;
        return `<div class="list-row"><div><b>${fmt(c.date)}</b><div class="muted small">${c.weight != null ? trimNum(c.weight) + ' kg · ' : ''}${c.photos ? '📸 photos' : 'no photos'}</div></div>
          <div class="row"><span style="font-weight:700">${c.waist != null ? trimNum(c.waist) + ' cm' : '—'}</span>${dw != null ? `<span class="muted small">(${dw <= 0 ? '' : '+'}${trimNum(dw)})</span>` : ''}
          <button class="icon-btn" data-action="del-checkin" data-date="${esc(c.date)}" aria-label="Delete check-in">✕</button></div></div>`;
      }).join('') + `</div>`;
    }
    return h;
  }

  // ---------- more ----------
  function renderMore() {
    const st = state.settings;
    const le = state.lastExport;
    const ago = le ? daysBetween(le.slice(0, 10), today()) : null;
    let h = `<h1>More</h1>`;
    h += `<h2>Review with Claude</h2><div class="card">
      <p class="muted" style="margin-top:0">Export a file and attach it in chat, or copy a text summary and paste it.</p>
      <div class="row wrap"><button class="btn" data-action="export">⬇ Export file</button><button class="btn ghost" data-action="copy-summary">📋 Copy summary</button></div>
      <div class="muted small" style="margin-top:8px">${le ? `Last export: ${fmt(le.slice(0, 10))}${ago >= 7 ? ' — time for a fresh backup' : ''}` : 'Not exported yet. The export file is also your backup.'}</div></div>`;
    h += `<h2>Import</h2><div class="card">
      <p class="muted" style="margin-top:0">Bring in an updated plan from chat (your logs are kept), or restore a backup.</p>
      <button class="btn ghost" data-action="import">⬆ Import file</button><input type="file" id="importFile" accept=".json,application/json" class="hidden"></div>`;
    h += `<h2>Rest timer</h2><div class="card">
      <label class="switch"><span>Start a rest timer after each set</span><input type="checkbox" data-setting="restOn" ${st.restOn ? 'checked' : ''}></label>
      <label class="field"><span>Rest length</span><select data-setting="rest">${[60, 75, 90, 120, 150].map(s => `<option value="${s}" ${st.rest === s ? 'selected' : ''}>${Math.floor(s / 60)}:${p2(s % 60)}</option>`).join('')}</select></label>
      <label class="switch"><span>Beep when rest is over</span><input type="checkbox" data-setting="sound" ${st.sound ? 'checked' : ''}></label></div>`;

    h += `<h2>Current plan</h2><div class="card"><div style="font-weight:700">${esc(plan().name)}</div>
      <div class="muted small">Version ${esc(plan().version)} · ${fmt(plan().startDate)} → ${fmt(plan().goalDate)}</div>`;
    const dayOf = sid => Object.keys(plan().schedule).filter(k => plan().schedule[k] === sid).map(k => DAYS[+k]).join(', ');
    plan().sessions.forEach(s => {
      h += `<div style="margin-top:12px"><b>${esc(s.name)}</b> <span class="muted small">${esc(dayOf(s.id))}</span><ul class="tips muted small">` +
        s.items.map(it => `<li>${esc(exInfo(it.ex).name)} — ${kindOf(it) === 'cardio' ? esc(it.minutes) + ' min' : `${esc(it.sets)} × ${repsText(it)}${kindOf(it) === 'time' ? ' sec' : ''}`}</li>`).join('') + `</ul></div>`;
    });
    h += `</div>`;
    h += `<h2>Install on iPhone</h2><div class="card muted">In Safari: tap <b style="color:var(--text)">Share</b> → <b style="color:var(--text)">Add to Home Screen</b>. It then opens like an app and works offline at the gym.</div>`;
    h += `<p class="muted small" style="text-align:center;margin-top:18px">Gym Tracker · data stays on this phone</p>`;
    return h;
  }

  // ---------- text export ----------
  function logText(l) {
    const s = sessionById(l.session);
    const lines = [];
    const order = s ? s.items.map(i => i.ex) : [];
    const exIds = Array.from(new Set(order.concat(Object.keys(l.sets || {}), Object.keys(l.cardio || {}))));
    exIds.forEach(id => {
      const item = s ? s.items.find(i => i.ex === id) : null;
      const kind = item ? kindOf(item) : (l.cardio && l.cardio[id] ? 'cardio' : 'weight');
      if (kind === 'cardio') {
        const c = l.cardio[id];
        if (c && (c.done || c.min)) lines.push(`${exInfo(id).name}: ${c.min ? c.min + ' min' : ''}${c.done ? ' ✓' : ''}`.trim());
        return;
      }
      const sets = (l.sets[id] || []).filter(x => x && x.done);
      if (!sets.length) return;
      lines.push(`${exInfo(id).name}: ` + sets.map(x => kind === 'time' ? `${x.r}s` : `${x.w != null && x.w !== '' ? x.w + '×' : ''}${x.r}`).join(', '));
    });
    return lines.join('\n') || '(nothing logged)';
  }

  function summaryText() {
    const out = [];
    const planned = plannedDates();
    const done = doneLogs();
    const wk = weekNo();
    out.push(`Gym Tracker summary — exported ${fmt(today())} ${parse(today()).getFullYear()}`);
    out.push(`Plan: ${plan().name} (v${plan().version}), ${fmt(plan().startDate)} → ${fmt(plan().goalDate)}`);
    out.push(`Workouts done: ${done.filter(l => l.date >= plan().startDate && l.date < plan().goalDate).length} of ${planned.length} planned · week ${wk.w} of ${wk.total}`);
    const cs = state.checkins.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (cs.length) {
      out.push('', 'Check-ins:');
      cs.forEach(c => out.push(`  ${fmt(c.date)}: waist ${c.waist != null ? c.waist + ' cm' : '—'}${c.weight != null ? ', weight ' + c.weight + ' kg' : ''}${c.photos ? ', photos taken' : ''}`));
    }
    out.push('', 'Workouts (weight × reps):');
    done.forEach(l => {
      const s = sessionById(l.session);
      out.push(`${fmt(l.date)} — ${s ? s.name : l.session}${l.finishedAt ? '' : ' (not finished)'}`);
      logText(l).split('\n').forEach(x => out.push('  ' + x));
    });
    return out.join('\n');
  }

  // ---------- actions ----------
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function rowContext(el) {
    const card = el.closest('.card[data-ex]');
    const tr = el.closest('tr[data-i]');
    return { card, tr, ex: card && card.dataset.ex, kind: card && card.dataset.kind, i: tr ? Number(tr.dataset.i) : null };
  }

  function saveInput(el) {
    const { ex, kind, i } = rowContext(el);
    if (!ex) return;
    const sid = currentSessionId();
    const log = getLog(today(), sid, true);
    if (kind === 'cardio') {
      log.cardio[ex] = Object.assign({}, log.cardio[ex], { min: el.value.trim() });
    } else {
      const arr = log.sets[ex] = log.sets[ex] || [];
      arr[i] = Object.assign({}, arr[i], { [el.dataset.f]: el.value.trim() });
    }
    persist(log);
  }

  function toggleSet(btn) {
    const { tr, ex, kind, i } = rowContext(btn);
    const sid = currentSessionId();
    const log = getLog(today(), sid, true);
    const arr = log.sets[ex] = log.sets[ex] || [];
    const cur = Object.assign({}, arr[i]);
    if (cur.done) {
      cur.done = false;
    } else {
      const wIn = tr.querySelector('input[data-f="w"]');
      const rIn = tr.querySelector('input[data-f="r"]');
      let r = rIn.value.trim();
      if (r === '' && /^\d+(\.\d+)?$/.test(rIn.placeholder)) r = rIn.placeholder; // same as last time
      if (r === '' || num(r) == null) { rIn.focus(); toast(kind === 'time' ? 'Enter the seconds you held' : 'Enter how many reps you did'); return; }
      const w = wIn ? wIn.value.trim().replace(',', '.') : '';
      if (w !== '' && !(num(w) != null && num(w) >= 0 && num(w) <= 500)) { wIn.focus(); toast('Enter the weight in kg, e.g. 42.5'); return; }
      cur.r = r;
      if (wIn) cur.w = w;
      cur.done = true;
      startRest();
    }
    arr[i] = cur;
    persist(log);
    render();
  }

  function toggleCardio(btn) {
    const { card, ex } = rowContext(btn);
    const log = getLog(today(), currentSessionId(), true);
    const c = Object.assign({}, log.cardio[ex]);
    const minIn = card.querySelector('input[data-f="min"]');
    c.min = minIn.value.trim();
    c.done = !c.done;
    log.cardio[ex] = c;
    persist(log);
    render();
  }

  // Rest timer with a beep scheduled through Web Audio (works on iPhone once unlocked by a tap).
  let audio = null;
  function unlockAudio() {
    if (!state.settings.sound) return null;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
    return audio;
  }
  function scheduleBeep(secFromNow) {
    cancelBeep();
    const ctx = unlockAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + secFromNow;
    const oscs = [0, 0.22, 0.44].map((d, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = k === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.2);
      return o;
    });
    rest.beep = oscs;
  }
  function cancelBeep() { (rest.beep || []).forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); rest.beep = null; }

  function clearRestTimers() {
    clearInterval(rest.ticker);
    clearTimeout(rest.hideTimer); // a "Go!" from the previous rest must never hide a new timer
    rest.ticker = rest.hideTimer = null;
  }
  function startRest(sec) {
    if (!state.settings.restOn) return;
    sec = sec || state.settings.rest || 90;
    clearRestTimers();
    rest.end = Date.now() + sec * 1000;
    scheduleBeep(sec);
    $('#rest').classList.remove('hidden', 'go');
    tickRest();
    rest.ticker = setInterval(tickRest, 250);
  }
  function tickRest() {
    const left = Math.ceil((rest.end - Date.now()) / 1000);
    if (left > 0) { $('#restTime').textContent = `${Math.floor(left / 60)}:${p2(left % 60)}`; return; }
    clearRestTimers();
    $('#rest').classList.add('go');
    $('#restTime').textContent = 'Go! Next set 💪';
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    rest.hideTimer = setTimeout(stopRest, 5000);
  }
  function addRest(sec) {
    const left = (rest.end - Date.now()) / 1000;
    if (left <= 0) return startRest(sec); // rest already over: start a fresh one
    rest.end += sec * 1000;
    scheduleBeep(left + sec);
  }
  function stopRest() {
    clearRestTimers();
    cancelBeep();
    $('#rest').classList.add('hidden');
  }

  function openSheet(exId) {
    const ex = exInfo(exId);
    $('#sheetTitle').textContent = ex.name;
    $('#sheetSub').textContent = ex.machine || '';
    $('#sheetTips').innerHTML = (ex.tips || []).map(t => `<li>${esc(t)}</li>`).join('');
    const box = document.querySelector('.anim-box');
    stopAnim();
    if (ex.anim && window.GymAnim && GymAnim.has(ex.anim)) {
      box.classList.remove('hidden');
      ui.stopAnim = GymAnim.play($('#sheetAnim'), ex.anim);
    } else {
      box.classList.add('hidden');
    }
    $('#sheet').classList.remove('hidden');
  }
  function stopAnim() { if (ui.stopAnim) { ui.stopAnim(); ui.stopAnim = null; } }
  function closeSheet() { stopAnim(); $('#sheet').classList.add('hidden'); }

  async function doExport() {
    try {
      await requestPersistence();
      const r = await store.exportBackup({ preferShare: true });
      if (r && r.cancelled) return;
      state.lastExport = r.exportedAt;
      render();
      toast('Backup exported ✓');
    } catch (e) { toast('Export failed: ' + e.message); }
  }

  function copySummary() {
    const text = summaryText();
    const done = () => toast('Summary copied. Paste it in chat.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); }
    ta.remove();
  }

  function validatePlan(p) {
    const errs = [];
    if (!p || typeof p !== 'object') return ['Not a plan file.'];
    if (!p.exercises || typeof p.exercises !== 'object') errs.push('Missing "exercises".');
    if (!Array.isArray(p.sessions) || !p.sessions.length) errs.push('Missing "sessions".');
    if (!p.schedule || typeof p.schedule !== 'object') errs.push('Missing "schedule".');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.goalDate || '')) errs.push('startDate / goalDate must look like 2026-12-24.');
    if (errs.length) return errs;
    const ids = new Set();
    p.sessions.forEach(s => {
      if (!s.id || ids.has(s.id)) errs.push(`Session id missing or repeated: ${s.id}`);
      ids.add(s.id);
      if (!Array.isArray(s.items) || !s.items.length) { errs.push(`Session ${s.id} has no exercises.`); return; }
      s.items.forEach(it => {
        if (!it || !p.exercises[it.ex]) { errs.push(`Unknown exercise "${it && it.ex}" in ${s.name}.`); return; }
        const k = it.kind || 'weight';
        if (!['weight', 'time', 'cardio'].includes(k)) errs.push(`"${it.ex}" in ${s.name} has an unknown kind "${k}".`);
        if (k !== 'cardio' && !(isInt(it.sets, 1, 20) && Array.isArray(it.reps) && it.reps.length === 2 &&
          isInt(it.reps[0], 1, 600) && isInt(it.reps[1], it.reps[0], 600))) errs.push(`"${it.ex}" in ${s.name} needs whole-number sets (1–20) and reps [min, max].`);
      });
    });
    Object.entries(p.schedule).forEach(([k, v]) => {
      if (!/^[0-6]$/.test(k)) errs.push(`Schedule day "${k}" must be 0–6.`);
      if (!ids.has(v)) errs.push(`Schedule points to unknown session "${v}".`);
    });
    Object.values(p.exercises).forEach(e => { if (!e || typeof e !== 'object') errs.push('Every exercise needs details.'); });
    return errs;
  }

  async function importFile(file) {
    let text;
    try { text = await file.text(); } catch (e) { toast('Could not read that file.'); return; }
    let data = null;
    try { data = JSON.parse(text); } catch (e) { toast('That file isn\'t valid JSON.'); return; }
    // A plan file made in chat: replaces the plan, keeps all logs and check-ins.
    if (data && data.type === 'gym-tracker-plan') {
      const errs = validatePlan(data);
      if (errs.length) { alert('This plan has problems:\n\n' + errs.slice(0, 8).join('\n')); return; }
      if (!confirm(`Replace your plan with "${data.name}" (version ${data.version})?\n\nYour workout logs and check-ins are kept.`)) return;
      state.plan = data;
      const now = nowIso();
      persist({ id: PLAN_ID, type: 'plan', plan: data, createdAt: now, updatedAt: now, deleted: false });
      ui.picked = {}; render();
      toast('New plan loaded ✓');
      return;
    }
    // Otherwise a backup: merged item by item, the newer version of each wins.
    try {
      const r = await store.importBackup(text);
      await loadState();
      ui.picked = {}; render();
      alert(`Backup merged.\n\nAdded: ${r.added}\nUpdated: ${r.updated}\nUnchanged: ${r.unchanged + r.keptLocal}${r.invalid ? `\nSkipped (invalid): ${r.invalid}` : ''}`);
    } catch (e) { toast(e.message || 'Import failed.'); }
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    switch (act) {
      case 'pick': ui.picked[today()] = a.dataset.sid; render(); break;
      case 'toggle': unlockAudio(); toggleSet(a); break;
      case 'cardio': toggleCardio(a); break;
      case 'info': openSheet(a.dataset.ex); break;
      case 'sheet-close': closeSheet(); break;
      case 'rest-skip': stopRest(); break;
      case 'rest-add': addRest(15); break;
      case 'finish': {
        const log = getLog(today(), currentSessionId(), false);
        if (!log) return;
        log.finishedAt = Date.now();
        persist(log); stopRest(); render(); window.scrollTo(0, document.body.scrollHeight);
        toast('Workout saved 💪');
        break;
      }
      case 'save-checkin': {
        const date = $('#ciDate').value || today();
        const waist = num($('#ciWaist').value.trim());
        const weight = num($('#ciWeight').value.trim());
        if (waist == null) { toast('Enter your waist in cm'); $('#ciWaist').focus(); return; }
        let ci = state.checkins.find(c => c.date === date);
        if (!ci) { const now = nowIso(); ci = { id: uuid(), type: 'checkin', date, createdAt: now, deleted: false }; state.checkins.push(ci); }
        Object.assign(ci, { waist, weight, photos: $('#ciPhotos').checked });
        persist(ci); render(); toast('Check-in saved ✓');
        break;
      }
      case 'del-checkin':
        if (confirm('Delete this check-in?')) {
          const gone = state.checkins.filter(c => c.date === a.dataset.date);
          state.checkins = state.checkins.filter(c => c.date !== a.dataset.date);
          store.removeMany(gone.map(c => c.id)).catch(() => {}); render();
        }
        break;
      case 'del-log':
        if (confirm('Delete this workout?')) { delete state.logs[a.dataset.id]; store.remove(a.dataset.id).catch(() => {}); render(); }
        break;
      case 'export': doExport(); break;
      case 'copy-summary': copySummary(); break;
      case 'import': $('#importFile').click(); break;
    }
  });

  document.addEventListener('input', e => {
    if (e.target.matches('input[data-f]')) saveInput(e.target);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'importFile' && el.files && el.files[0]) { importFile(el.files[0]); el.value = ''; return; }
    if (el.dataset && el.dataset.setting) {
      const k = el.dataset.setting;
      state.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
      saveSettings();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  // Refresh "Today" when the app comes back to the foreground on a new day.
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today() !== lastDay) { lastDay = today(); render(); }
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  loadState().catch(() => toast('Could not open storage.')).then(render);
  // Ask the browser to keep this app's data permanently (the phone is the only copy between exports).
  requestPersistence().catch(() => {});

  // Exposed for testing in the browser console.
  window.GymTracker = { state: () => state, summaryText, ready: () => loadState() };
