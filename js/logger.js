import { h, $, $$, icon, haptic, toast, sheet, confirmSheet, segmented, confetti, beep, unlockAudio } from './ui.js';
import { S, derive, ctx, saveSettings, putSession, delSession, saveActiveSoon, bwKg, dispKg, discardActive, activeDoneSets } from './store.js';
import * as E from './engine.js';
import { EX, WORKOUTS, EQUIP_LABEL } from './data.js';
import { app, workoutBadge, weekInfo } from './app.js';

// The session being shown in the logger: S.active (live) or an edit copy of a past session.
let L = null; // { s, mode: 'live'|'edit', root }

export async function startWorkout(wid, { short = false, planned = true } = {}) {
  if (S.active) { app.go('train'); return; }
  const s = E.buildSession(wid, ctx(), { short, planned, rotIndex: S.d.nextIdx });
  S.active = s; await putSession(s);
  app.go('train', { force: true });
}

export function openLogger(session, mode = 'edit') {
  app.editSession = { s: structuredClone(session), mode };
  app.go('train', { force: true });
}

export function renderTrain(page) {
  if (app.editSession) { renderLogger(page, app.editSession.s, app.editSession.mode); return; }
  if (S.active) { renderLogger(page, S.active, 'live'); return; }
  // Picker
  page.append(h('header', { class: 'large-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Rotation · A B1 C D A B2 C D'), h('h1', null, 'Train'))));
  const next = S.d.next;
  page.append(h('div', { class: 'list cards' }, Object.values(WORKOUTS).map((w) => {
    const n = w.blocks.flat();
    return h('button', { class: 'card wk-card press' + (w.id === next ? ' next' : ''), style: { '--h1': w.hue[0], '--h2': w.hue[1] }, onclick: () => { unlockAudio(); haptic('medium'); startWorkout(w.id, { short: !!app.shortPref, planned: w.id === next }); } },
      workoutBadge(w.id, 'lg'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, w.name, w.id === next ? h('span', { class: 'pill tiny' }, 'Next') : null),
        h('div', { class: 'muted small' }, n.filter((i) => !i.optional && !i.bonus).map((i) => EX[i.ex].name).join(' · ')),
        h('div', { class: 'muted small' }, `~${w.est} min`)),
      icon('chevron', 18));
  })));
  page.append(h('p', { class: 'muted small pad' }, 'Tap any workout to start it. Doing one out of order is fine — only the planned one advances the rotation.'));
}

// ───────────────────────── Logger
function renderLogger(page, s, mode) {
  L = { s, mode, root: page };
  const w = WORKOUTS[s.workout];
  page.classList.add('logger');
  page.style.setProperty('--h1', w.hue[0]); page.style.setProperty('--h2', w.hue[1]);
  const elapsed = h('span', { class: 'mono' });
  const tick = () => { if (!document.body.contains(elapsed)) return clearInterval(iv); const sec = Math.floor((Date.now() - s.startedAt) / 1000); elapsed.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const iv = setInterval(tick, 1000); tick();
  const progress = h('div', { class: 'log-progress' }, h('div', { class: 'log-progress-fill' }));
  const head = h('div', { class: 'log-head glass' },
    h('div', { class: 'log-head-row' },
      mode === 'edit' ? h('button', { class: 'btn small ghost', onclick: () => { app.editSession = null; app.go('progress', { force: true, seg: 'history' }); } }, 'Cancel') :
        h('div', { class: 'log-head-l' }, h('button', { class: 'btn small danger-ghost', 'aria-label': 'Cancel workout', onclick: () => cancelWorkout() }, 'Cancel'),
          h('button', { class: 'icon-btn', 'aria-label': 'Workout options', onclick: () => sessionMenu() }, icon('more', 22))),
      h('div', { class: 'log-title' }, workoutBadge(s.workout, 'sm'), h('div', null, h('div', { class: 'title-s' }, w.name), h('div', { class: 'muted tiny' }, mode === 'edit' ? 'Editing' : elapsed, s.short ? ' · short' : '', s.deload ? ' · deload' : ''))),
      h('button', { class: 'btn small primary', onclick: () => (mode === 'edit' ? saveEdit() : finish()) }, mode === 'edit' ? 'Save' : 'Finish')),
    progress);
  page.append(head);

  // Meta row: date, session unit
  const dateIn = h('input', { class: 'input date', type: 'datetime-local', value: s.date, onchange: (e) => { s.date = e.target.value || s.date; persist(); } });
  page.append(h('div', { class: 'log-meta' },
    h('label', { class: 'meta-date' }, icon('calendar', 16), dateIn),
    h('div', { class: 'meta-unit' }, h('span', { class: 'muted tiny' }, 'All'), segmented([{ label: 'lb', value: 'lb' }, { label: 'kg', value: 'kg' }], commonUnit(s), (u) => { s.entries.forEach((e) => setUnit(e, u)); persist(); redrawAll(); }, 'mini'))));
  if (s.phase === 'intro' && !s.deload) page.append(h('div', { class: 'pill soft' }, icon('bolt', 14), ' Ramp-up: stop every set with 2–3 reps left. Weights climb fast from here.'));
  if (s.deload) page.append(h('div', { class: 'pill warn soft' }, icon('moon', 14), ' Deload: −10% weight, half the sets, easy effort.'));

  const list = h('div', { class: 'ex-list' });
  page.append(list);
  L.list = list; L.progress = progress;
  redrawAll();
  page.append(h('div', { class: 'log-foot' },
    h('button', { class: 'btn ghost', onclick: () => pickExercise((id) => addExercise(id)) }, icon('plus', 16), ' Add exercise'),
    mode === 'edit' ? h('button', { class: 'btn danger-ghost', onclick: deleteEdited }, icon('trash', 16), ' Delete workout')
      : h('button', { class: 'btn danger-ghost', onclick: () => cancelWorkout() }, icon('trash', 16), ' Cancel workout (discard)')));
  if (mode === 'live') restoreRest();
}

function commonUnit(s) { const u = s.entries.map((e) => e.unit); return u.every((x) => x === u[0]) ? u[0] : S.settings.unit; }

function persist() {
  if (L.mode === 'live') saveActiveSoon();
  updateProgress();
}
function updateProgress() {
  const all = L.s.entries.filter((e) => e.included && !e.skipped).flatMap((e) => e.sets);
  const done = all.filter((x) => x.done).length;
  const f = L.progress?.firstChild; if (f) f.style.width = (all.length ? (done / all.length) * 100 : 0) + '%';
}

function redrawAll() {
  const groups = [];
  L.s.entries.forEach((e, i) => {
    const last = groups[groups.length - 1];
    if (e.group && last && last.group === e.group) last.items.push(i); else groups.push({ group: e.group, items: [i] });
  });
  L.list.replaceChildren(...groups.map((g) => {
    if (g.items.length === 1) return exCard(g.items[0]);
    return h('div', { class: 'superset' }, h('div', { class: 'ss-label' }, icon('bolt', 12), ' Superset · alternate sets, rest after both'), g.items.map((i) => exCard(i)));
  }));
  updateProgress();
}
function redrawCard(i) { const old = L.list.querySelector(`[data-ei="${i}"]`); if (old) old.replaceWith(exCard(i)); updateProgress(); }

function setUnit(e, u) {
  if (e.unit === u) return;
  const ex = EX[e.ex];
  for (const x of e.sets) {
    if (x.w !== '' && x.w != null && !isNaN(+x.w)) x.w = E.roundW(E.conv(+x.w, e.unit, u), u, ex.equip);
    if (x.tw != null) x.tw = E.roundW(E.conv(+x.tw, e.unit, u), u, ex.equip);
  }
  e.unit = u;
}

function hist() { return S.d.hist; }
function e1For(e) {
  // History estimate, upgraded live by anything already done this session (so a strong first set updates the rest)
  const live = Math.max(0, ...e.sets.filter((y) => y.done && +y.reps > 0).map((y) => E.e1rm(E.loadKg(e.ex, y.w, e.unit, bwKg()), +y.reps, +y.rir || 0)));
  return Math.max(E.latestE1(hist(), e.ex, bwKg()), live);
}

function lastTime(e) {
  const past = S.sessions.filter((s) => s.status === 'done' && s.id !== L.s.id).sort((a, b) => b.date.localeCompare(a.date));
  const has = (s, sameSlot) => s.entries.find((x) => x.ex === e.ex && (!sameSlot || x.slot === e.slot) && !x.skipped && x.sets.some((y) => y.done));
  let sess = past.find((s) => has(s, true)), ent = sess && has(sess, true);
  if (!ent) { sess = past.find((s) => has(s, false)); ent = sess && has(sess, false); }
  if (!ent) return null;
  const sets = ent.sets.filter((y) => y.done).map((y) => (E.isNoLoad(e.ex) ? `${y.reps}` : `${E.fmtW(y.w)}×${y.reps}`)).join(', ');
  return `Last ${new Date(sess.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${sets}${E.isNoLoad(e.ex) ? ' reps' : ' ' + ent.unit}`;
}

const STATUS_TXT = { up: '▲ Weight up — you hit the top of the range', hold: '● Same weight — beat last time by a rep', miss: '◆ Hold weight — missed reps last time', reset: '▼ Reset 10% to build back momentum', 'reps-up': '▲ Maxed the range — slow the tempo or add a pause', seed: '★ Starting point from your old numbers (~70%)' };

function exCard(i) {
  const e = L.s.entries[i];
  const ex = EX[e.ex];
  const rest = e.group ? S.settings.restSuperset : ex.type === 'compound' ? S.settings.restCompound : S.settings.restSmall;
  const card = h('section', { class: 'card ex' + (e.skipped ? ' skipped' : '') + (!e.included ? ' collapsed' : ''), 'data-ei': i });
  const note = S.settings.notes?.[e.ex];
  card.append(h('div', { class: 'ex-head' },
    h('div', { class: 'grow' },
      h('div', { class: 'ex-name' }, ex.name, e.ex !== e.baseEx && e.baseEx ? h('span', { class: 'pill tiny' }, 'swapped') : null),
      h('div', { class: 'muted tiny' }, `${E.setsLabel(e.sets, ex.perSide)} · RIR ${e.rir[0]}–${e.rir[1]} · rest ${fmtSec(rest)} · ${EQUIP_LABEL[ex.equip]}`)),
    !E.isNoLoad(e.ex) ? segmented([{ label: 'lb', value: 'lb' }, { label: 'kg', value: 'kg' }], e.unit, (u) => { setUnit(e, u); persist(); redrawCard(i); }, 'mini') : null,
    h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: () => exMenu(i) }, icon('more', 20))));
  if (!e.included) {
    card.append(h('div', { class: 'collapsed-row' }, h('span', { class: 'muted small' }, e.optional ? (e.tip || 'Optional') : e.bonus ? 'Bonus · if you have 10 minutes' : 'Cut for the short version'),
      h('button', { class: 'btn small ghost', onclick: () => { e.included = true; haptic('light'); persist(); redrawCard(i); } }, icon('plus', 14), ' Add')));
    return card;
  }
  if (e.skipped) {
    card.append(h('div', { class: 'collapsed-row' }, h('span', { class: 'muted small' }, 'Skipped this time — targets carry over.'), h('button', { class: 'btn small ghost', onclick: () => { e.skipped = false; persist(); redrawCard(i); } }, 'Undo')));
    return card;
  }
  const info = [];
  if (e.prevStatus && STATUS_TXT[e.prevStatus]) info.push(h('div', { class: 'status ' + e.prevStatus }, STATUS_TXT[e.prevStatus]));
  const lt = lastTime(e); if (lt) info.push(h('div', { class: 'muted tiny' }, lt));
  if (e.tip && !e.optional) info.push(h('div', { class: 'muted tiny' }, e.tip));
  if (ex.note) info.push(h('div', { class: 'muted tiny' }, ex.note));
  if (note) info.push(h('button', { class: 'ex-note', onclick: () => noteSheet(e, i) }, icon('note', 14), ' ', note));
  if (!e.sets.some((x) => x.tw != null) && !E.isNoLoad(e.ex) && !e.sets.some((x) => x.done)) info.push(h('div', { class: 'muted tiny first' }, 'First time: pick a weight you could do for a few more reps. This session becomes your baseline.'));
  card.append(h('div', { class: 'ex-info' }, info));
  card.append(h('div', { class: 'set-head muted tiny' }, h('span', null, 'Set'), h('span', null, E.isBW(e.ex) ? `+${e.unit}` : E.isNoLoad(e.ex) ? '' : e.unit), h('span', null, 'Reps'), h('span', null, 'RIR'), h('span')));
  e.sets.forEach((x, j) => card.append(setRow(e, i, x, j)));
  card.append(h('div', { class: 'ex-actions' },
    h('button', { class: 'mini-btn', onclick: () => { const last = e.sets[e.sets.length - 1] || { min: 8, max: 12 }; e.sets.push({ ...last, done: false, reps: '', label: null, pr: false }); haptic('light'); persist(); redrawCard(i); } }, icon('plus', 14), 'Set'),
    ex.type === 'compound' && !E.isNoLoad(e.ex) ? h('button', { class: 'mini-btn', onclick: () => warmupSheet(e) }, icon('flame', 14), 'Warm-up') : null,
    ex.equip === 'barbell' || ex.equip === 'smith' ? h('button', { class: 'mini-btn', onclick: () => plateSheet(+e.sets[0]?.w || 0, e.unit) }, icon('plates', 14), 'Plates') : null,
    h('button', { class: 'mini-btn', onclick: () => swapSheet(i) }, icon('swap', 14), 'Swap'),
    h('button', { class: 'mini-btn', onclick: () => noteSheet(e, i) }, icon('note', 14), 'Note')));
  return card;
}

function fmtSec(s) { return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; }

function suggestion(e, x) {
  const ex = EX[e.ex];
  if (E.isNoLoad(e.ex)) return { reps: x.tr || x.min, text: `Aim ${x.min}–${x.max} controlled reps` };
  const w = +x.w;
  if (!(w > 0) && !E.isBW(e.ex)) return { reps: x.tr || x.min, text: `Pick a weight for ${x.min}–${x.max} reps at RIR ${e.rir[0]}–${e.rir[1]}` };
  if (x.tw != null && Math.abs(w - x.tw) < 0.01) return { reps: x.tr || x.min, text: `Target ${E.fmtW(w)} ${e.unit} × ${x.tr || x.min}` + (x.label ? ` · ${x.label.toLowerCase()} set` : '') };
  const e1 = e1For(e);
  if (!(e1 > 0)) return { reps: x.tr || x.min, text: `Aim ${x.min}–${x.max} reps, stop with ${e.rir[0]}–${e.rir[1]} left` };
  const load = E.loadKg(e.ex, w, e.unit, bwKg());
  const r = E.repsFor(e1, load, e.rir[0]);
  if (r == null) return { reps: x.min, text: '' };
  if (r < 1) return { reps: 1, text: `${E.fmtW(w)} ${e.unit} looks too heavy right now — go lighter`, tone: 'bad' };
  const rr = Math.min(r, 30);
  const tone = rr > x.max ? 'hi' : rr < x.min ? 'lo' : 'ok';
  const tail = tone === 'hi' ? ' — above range, go heavier' : tone === 'lo' ? ' — below range, go lighter' : ' ✓ in range';
  return { reps: Math.max(1, Math.min(rr, x.max + 5)), text: `≈ ${rr} reps at RIR ${e.rir[0]} (e1RM ${dispKg(e1, e.unit)} ${e.unit})${tail}`, tone };
}

function setRow(e, i, x, j) {
  const ex = EX[e.ex];
  const noLoad = E.isNoLoad(e.ex);
  const sg = suggestion(e, x);
  const hint = h('div', { class: 'set-hint ' + (sg.tone || '') }, sg.text);
  const wIn = h('input', { class: 'num w', type: 'text', inputmode: 'decimal', enterkeyhint: 'next', 'aria-label': 'Weight', value: noLoad ? '' : E.fmtW(x.w), placeholder: noLoad ? 'BW' : E.isBW(e.ex) ? '0' : '—', disabled: noLoad });
  const rIn = h('input', { class: 'num r', type: 'text', inputmode: 'numeric', enterkeyhint: 'done', 'aria-label': 'Reps', value: x.reps, placeholder: String(sg.reps) });
  const rirSel = h('select', { class: 'rir', 'aria-label': 'Reps in reserve' }, [0, 1, 2, 3, 4, 5].map((v) => h('option', { value: v, selected: +x.rir === v }, v === 5 ? '5+' : String(v))));
  const chk = h('button', { class: 'check' + (x.done ? ' on' : ''), 'aria-label': 'Complete set' }, icon('check', 20));
  const row = h('div', { class: 'set-row' + (x.done ? ' done' : '') + (x.pr ? ' pr' : '') },
    h('div', { class: 'set-idx' }, h('b', null, String(j + 1)), x.label ? h('small', null, x.label) : null),
    h('div', { class: 'field' }, wIn), h('div', { class: 'field' }, rIn), h('div', { class: 'field rir-f' }, rirSel), chk);
  const refresh = () => { const s2 = suggestion(e, x); hint.textContent = s2.text; hint.className = 'set-hint ' + (s2.tone || ''); rIn.placeholder = String(s2.reps); };
  wIn.addEventListener('focus', () => wIn.select());
  rIn.addEventListener('focus', () => rIn.select());
  wIn.addEventListener('input', (ev) => {
    if (ev.isTrusted) x.autoW = false;
    const v = wIn.value.replace(',', '.');
    x.w = v === '' ? '' : +v; refresh(); persist();
  });
  wIn.addEventListener('change', () => {
    // propagate a changed weight to later un-done sets with the same target (saves typing)
    const wraps = L.list.querySelectorAll(`[data-ei="${i}"] .set-wrap`);
    for (let k = j + 1; k < e.sets.length; k++) {
      const y = e.sets[k];
      let nw = null;
      if (!y.done && !y.backoff === !x.backoff) nw = x.w;
      else if (!y.done && y.backoff && !x.backoff && +x.w > 0 && (y.w === '' || y.autoW)) { nw = E.roundW(+x.w * (y.pct || 0.88), e.unit, ex.equip); y.autoW = true; }
      if (nw != null) { y.w = nw; const inp = wraps[k]?.querySelector('input.w'); if (inp) { inp.value = E.fmtW(y.w); inp.dispatchEvent(new Event('input')); } }
    }
    persist();
  });
  rIn.addEventListener('input', () => { x.reps = rIn.value === '' ? '' : +rIn.value; persist(); });
  rirSel.addEventListener('change', () => { x.rir = +rirSel.value; refresh(); persist(); haptic('light'); });
  chk.addEventListener('click', () => {
    unlockAudio();
    if (!x.done) {
      if (!noLoad && !E.isBW(e.ex) && !(+x.w > 0)) { row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 500); haptic('warn'); toast('Enter a weight first'); wIn.focus(); return; }
      if (x.reps === '' || x.reps == null) { x.reps = +rIn.placeholder || x.min; rIn.value = x.reps; }
      x.done = true; x.at = Date.now();
      row.classList.add('done'); chk.classList.add('on', 'pop'); setTimeout(() => chk.classList.remove('pop'), 500);
      haptic('success');
      checkPR(e, x, row);
      persist();
      L.list.querySelectorAll(`[data-ei="${i}"] input.w`).forEach((inp, k) => { if (k !== j && !e.sets[k]?.done) inp.dispatchEvent(new Event('input')); });
      afterSet(e, i, j);
    } else {
      x.done = false; x.pr = false; row.classList.remove('done', 'pr'); chk.classList.remove('on'); haptic('light'); persist();
    }
  });
  return h('div', { class: 'set-wrap' }, row, hint);
}
function redrawCardKeep(i) {
  const active = document.activeElement;
  const isInput = active && active.tagName === 'INPUT' && L.list.contains(active);
  if (isInput) return; // don't yank focus mid-typing
  redrawCard(i);
}

function checkPR(e, x, row) {
  if (E.isNoLoad(e.ex)) return;
  const load = E.loadKg(e.ex, x.w, e.unit, bwKg());
  const v = E.e1rm(load, +x.reps, +x.rir || 0);
  const prior = E.bestE1(hist(), e.ex, L.s.id);
  const sessBest = Math.max(0, ...e.sets.filter((y) => y !== x && y.done).map((y) => E.e1rm(E.loadKg(e.ex, y.w, e.unit, bwKg()), +y.reps, +y.rir || 0)));
  if (prior > 0 && v > prior * 1.005 && v > sessBest) {
    x.pr = true; row.classList.add('pr');
    confetti(); haptic('success');
    toast(`New PR · ${EX[e.ex].name} e1RM ${dispKg(v, e.unit)} ${e.unit}`, { icon: 'trophy', ms: 3200, tone: 'gold' });
  }
}

function afterSet(e, i, j) {
  if (L.mode !== 'live') return;
  const ents = L.s.entries;
  const remaining = ents.some((y) => y.included && !y.skipped && y.sets.some((z) => !z.done));
  if (!remaining) { stopRest(); toast('All sets done — tap Finish 🎉', { icon: 'check', ms: 3000 }); return; }
  if (e.group) {
    const members = ents.map((y, k) => [y, k]).filter(([y]) => y.group === e.group && y.included && !y.skipped);
    const pos = members.findIndex(([y]) => y === e);
    const partner = members.slice(pos + 1).find(([y]) => y.sets[j] && !y.sets[j].done);
    if (partner) {
      toast(`Superset → ${EX[partner[0].ex].name}`, { icon: 'bolt', ms: 1600 });
      const card = L.list.querySelector(`[data-ei="${partner[1]}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    startRest(S.settings.restSuperset, 'Superset rest');
    return;
  }
  if (L.mode !== 'live') return;
  const ex = EX[e.ex];
  startRest(ex.type === 'compound' ? S.settings.restCompound : S.settings.restSmall, ex.name);
}

// ───────────────────────── Rest timer
let restIv = null;
function restEl() {
  let el = $('#rest');
  if (!el) {
    el = h('div', { id: 'rest', class: 'rest glass' },
      h('div', { class: 'rest-ring' }, h('svg:svg', { viewBox: '0 0 44 44', width: 44, height: 44 }, h('svg:circle', { cx: 22, cy: 22, r: 19, class: 'rt-track' }), h('svg:circle', { cx: 22, cy: 22, r: 19, class: 'rt-arc', 'stroke-dasharray': 119.4, transform: 'rotate(-90 22 22)' }))),
      h('div', { class: 'grow' }, h('div', { class: 'rest-time mono' }, '0:00'), h('div', { class: 'rest-lbl muted tiny' }, 'Rest')),
      h('button', { class: 'mini-btn', onclick: () => adjRest(-15) }, '−15'), h('button', { class: 'mini-btn', onclick: () => adjRest(15) }, '+15'),
      h('button', { class: 'icon-btn', 'aria-label': 'Skip rest', onclick: () => { stopRest(); haptic('light'); } }, icon('close', 18)));
    document.body.append(el);
  }
  return el;
}
function startRest(sec, label) {
  if (!S.active) return;
  S.active.rest = { end: Date.now() + sec * 1000, total: sec, label };
  saveActiveSoon(); runRest();
}
function adjRest(d) { const r = S.active?.rest; if (!r) return; r.end += d * 1000; r.total = Math.max(5, r.total + d); saveActiveSoon(); haptic('light'); runRest(); }
function restoreRest() { if (S.active?.rest && S.active.rest.end > Date.now()) runRest(); }
function runRest() {
  const el = restEl(); el.classList.add('show'); el.classList.remove('done');
  clearInterval(restIv);
  const t = el.querySelector('.rest-time'), lbl = el.querySelector('.rest-lbl'), arc = el.querySelector('.rt-arc');
  const step = () => {
    const r = S.active?.rest; if (!r) return stopRest();
    const left = Math.max(0, Math.round((r.end - Date.now()) / 1000));
    t.textContent = fmtClock(left); lbl.textContent = `Rest · ${r.label || ''}`;
    arc.setAttribute('stroke-dashoffset', 119.4 * (1 - left / r.total));
    if (left <= 0) {
      clearInterval(restIv); el.classList.add('done'); t.textContent = 'Go'; lbl.textContent = 'Rest over — next set';
      haptic('timer'); if (S.settings.sound !== false) beep();
      S.active.rest = null; saveActiveSoon();
      setTimeout(() => el.classList.remove('show'), 4000);
    }
  };
  step(); restIv = setInterval(step, 250);
}
function stopRest() { clearInterval(restIv); $('#rest')?.classList.remove('show'); if (S.active) { S.active.rest = null; saveActiveSoon(); } }
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ───────────────────────── Sheets: menu, swap, warm-up, plates, notes
function exMenu(i) {
  const e = L.s.entries[i];
  const item = (ic, label, fn, cls = '') => h('button', { class: 'row press ' + cls, onclick: () => { s.close(); fn(); } }, icon(ic, 20), h('span', { class: 'grow' }, label));
  const s = sheet(h('div', { class: 'list' },
    item('swap', 'Swap exercise', () => swapSheet(i)),
    EX[e.ex].type === 'compound' && !E.isNoLoad(e.ex) ? item('flame', 'Warm-up sets', () => warmupSheet(e)) : null,
    item('plates', 'Plate calculator', () => plateSheet(+e.sets[0]?.w || 0, e.unit)),
    item('note', 'Exercise note', () => noteSheet(e, i)),
    e.sets.length > 1 ? item('minus', 'Remove last set', () => { e.sets.pop(); persist(); redrawCard(i); }) : null,
    item('skip', e.skipped ? 'Un-skip exercise' : 'Skip this exercise', () => { e.skipped = !e.skipped; persist(); redrawCard(i); }),
    (e.optional || e.bonus || e.slot.startsWith('X')) ? item('trash', 'Remove from workout', () => { e.included = false; persist(); redrawCard(i); }, 'danger-text') : null), { title: EX[e.ex].name });
}

function slotItem(slot) { for (const w of Object.values(WORKOUTS)) for (const b of w.blocks) for (const it of b) if (it.slot === slot) return it; return null; }

function swapSheet(i) {
  const e = L.s.entries[i];
  const base = e.baseEx || e.ex;
  const item = slotItem(e.slot);
  const sugg = [...new Set([...(item?.extraAlts || []), ...(EX[base].alts || []), base])].filter((id) => id !== e.ex && EX[id]);
  let remember = false;
  const pick = (id) => {
    if (e.sets.some((x) => x.done)) toast('Logged sets kept; new targets for the rest');
    const it = item || { slot: e.slot, sets: e.sets.map((x) => ({ min: x.min, max: x.max })) };
    const t = E.targetsFor(it, id, e.unit, ctx());
    const doneSets = e.sets.filter((x) => x.done);
    e.ex = id; e.rir = t.rir; e.prevStatus = t.status;
    e.sets = doneSets.length ? [...doneSets, ...t.sets.slice(doneSets.length)] : t.sets;
    if (remember && item) { S.settings.swaps[e.slot] = id === item.ex ? undefined : id; if (id === item.ex) delete S.settings.swaps[e.slot]; saveSettings(); }
    haptic('medium'); persist(); redrawAll(); s.close();
    toast(`Swapped to ${EX[id].name}`, { icon: 'swap' });
  };
  const exRow = (id, tag) => h('button', { class: 'row press', onclick: () => pick(id) },
    h('div', { class: 'equip-tag ' + EX[id].equip }, EQUIP_LABEL[EX[id].equip][0]),
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, EX[id].name), h('div', { class: 'muted tiny' }, EX[id].muscles + ' · ' + EQUIP_LABEL[EX[id].equip])),
    tag ? h('span', { class: 'pill tiny' }, tag) : null);
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search all exercises' });
  const all = h('div', { class: 'list' });
  const drawAll = () => { const q = search.value.toLowerCase(); all.replaceChildren(...Object.keys(EX).filter((id) => id !== e.ex && (!q || (EX[id].name + EX[id].muscles).toLowerCase().includes(q))).map((id) => exRow(id))); };
  search.addEventListener('input', drawAll); drawAll();
  const s = sheet(h('div', null,
    h('div', { class: 'muted small pad' }, `Replacing ${EX[e.ex].name} for today. Logged sets are kept.`),
    h('div', { class: 'group-title' }, 'Suggested — same muscles, different equipment'),
    h('div', { class: 'list' }, sugg.map((id) => exRow(id, id === base ? 'original' : null))),
    item ? h('div', { class: 'form-row' }, h('span', null, `Use the swap for future ${L.s.workout} workouts`), (() => { const t = h('button', { class: 'switch', role: 'switch', onclick: () => { remember = !remember; t.classList.toggle('on', remember); haptic('light'); } }, h('span')); return t; })()) : null,
    h('div', { class: 'group-title' }, 'Everything else'), search, all), { title: 'Swap exercise', tall: true });
}

function warmupSheet(e) {
  const ex = EX[e.ex];
  const W = +e.sets[0]?.w || 0;
  const bar = e.unit === 'kg' ? S.settings.barKg : S.settings.barLb;
  const ws = E.warmups(W, e.unit, ex.equip, bar);
  sheet(h('div', null,
    W > 0 ? h('p', { class: 'muted small pad' }, `Working weight ${E.fmtW(W)} ${e.unit}. Easy reps, short rests (~60 s). Don't count these as working sets.`) : h('p', { class: 'muted pad' }, 'Enter your first working weight to get warm-up sets.'),
    h('div', { class: 'list' }, ws.map((w) => h('div', { class: 'row' }, h('div', { class: 'big-num sm' }, E.fmtW(w.w), h('span', { class: 'muted small' }, ' ' + e.unit)),
      h('div', { class: 'grow muted small' }, `× ${w.reps}`, w.pct ? ` · ${Math.round(w.pct * 100)}%` : ' · empty bar'),
      ex.equip === 'barbell' || ex.equip === 'smith' ? plateViz(w.w, e.unit, bar, true) : null)))), { title: 'Warm-up' });
}

function plateViz(total, unit, bar, compact = false) {
  const p = E.plates(total, unit, bar);
  const colors = unit === 'kg' ? { 25: '#FF453A', 20: '#0A84FF', 15: '#FFD60A', 10: '#30D158', 5: '#f2f2f7', 2.5: '#FF375F', 1.25: '#8e8e93' } : { 45: '#0A84FF', 35: '#FFD60A', 25: '#30D158', 10: '#f2f2f7', 5: '#FF453A', 2.5: '#8e8e93' };
  const maxP = unit === 'kg' ? 25 : 45;
  return h('div', { class: 'plates' + (compact ? ' compact' : '') },
    h('div', { class: 'bar-end' }),
    p.side.map((x) => h('div', { class: 'plate', style: { height: (compact ? 18 : 36) + (x / maxP) * (compact ? 22 : 52) + 'px', background: colors[x] || '#888' }, title: x }, compact ? null : h('span', null, E.fmtW(x)))),
    !compact ? h('div', { class: 'plate-label muted tiny' }, p.under ? 'Below bar weight' : p.side.length ? `per side: ${p.side.map(E.fmtW).join(' + ')}${p.rem ? ` (+${p.rem} short)` : ''}` : 'Just the bar') : null);
}

export function plateSheet(W, unit) {
  let u = unit || S.settings.unit; let w = W || (u === 'kg' ? 60 : 135);
  let bar = u === 'kg' ? S.settings.barKg : S.settings.barLb;
  const out = h('div');
  const inp = h('input', { class: 'input num huge', inputmode: 'decimal', value: E.fmtW(w), oninput: (e) => { w = +e.target.value || 0; draw(); } });
  const bars = h('div', { class: 'chips' });
  const draw = () => {
    bars.replaceChildren(...(u === 'kg' ? [20, 15, 10, 0] : [45, 35, 25, 0]).map((b) => h('button', { class: 'chip' + (b === bar ? ' on' : ''), onclick: () => { bar = b; draw(); } }, b ? `${b} ${u} bar` : 'No bar')));
    out.replaceChildren(plateViz(w, u, bar));
  };
  draw();
  sheet(h('div', { class: 'plate-calc' },
    h('div', { class: 'row-between' }, inp, segmented([{ label: 'lb', value: 'lb' }, { label: 'kg', value: 'kg' }], u, (nu) => { w = E.roundW(E.conv(w, u, nu), nu, 'barbell'); u = nu; bar = u === 'kg' ? S.settings.barKg : S.settings.barLb; inp.value = E.fmtW(w); draw(); })),
    bars, out), { title: 'Plate calculator' });
}

function noteSheet(e, i) {
  const ta = h('textarea', { class: 'input ta', rows: 4, placeholder: 'e.g. cable stack 3, pin 7 · seat height 4 · grip just outside rings' }, S.settings.notes?.[e.ex] || '');
  const s = sheet(h('div', null, h('p', { class: 'muted small pad' }, 'Saved with this exercise and shown every time it comes up.'), ta), {
    title: `Note · ${EX[e.ex].name}`,
    actions: [h('button', { class: 'btn primary', onclick: async () => { S.settings.notes ||= {}; const v = ta.value.trim(); if (v) S.settings.notes[e.ex] = v; else delete S.settings.notes[e.ex]; await saveSettings(); s.close(); redrawCard(i); } }, 'Save note')],
  });
  setTimeout(() => ta.focus(), 350);
}

function pickExercise(cb) {
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search exercises' });
  const list = h('div', { class: 'list' });
  const draw = () => { const q = search.value.toLowerCase(); list.replaceChildren(...Object.keys(EX).filter((id) => !q || (EX[id].name + EX[id].muscles).toLowerCase().includes(q)).map((id) => h('button', { class: 'row press', onclick: () => { s.close(); cb(id); } },
    h('div', { class: 'equip-tag ' + EX[id].equip }, EQUIP_LABEL[EX[id].equip][0]), h('div', { class: 'grow' }, h('div', { class: 'title-s' }, EX[id].name), h('div', { class: 'muted tiny' }, EX[id].muscles))))); };
  search.addEventListener('input', draw); draw();
  const s = sheet(h('div', null, search, list), { title: 'Add exercise', tall: true });
}
function addExercise(id) {
  const n = L.s.entries.filter((e) => e.slot.startsWith('X')).length + 1;
  const ex = EX[id];
  const item = { slot: 'X' + id, sets: Array.from({ length: 3 }, () => (ex.type === 'compound' ? { min: 6, max: 10 } : { min: 10, max: 15 })) };
  const t = E.targetsFor(item, id, L.s.entries[0]?.unit || S.settings.unit, ctx());
  L.s.entries.push({ slot: item.slot, ex: id, baseEx: id, group: null, included: true, unit: L.s.entries[0]?.unit || S.settings.unit, rir: t.rir, prevStatus: t.status, sets: t.sets, skipped: false, added: true });
  persist(); redrawAll(); haptic('light');
  setTimeout(() => L.list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function sessionMenu() {
  const s = L.s;
  const item = (ic, label, fn, cls = '') => h('button', { class: 'row press ' + cls, onclick: () => { sh.close(); fn(); } }, icon(ic, 20), h('span', { class: 'grow' }, label));
  const sh = sheet(h('div', { class: 'list' },
    item('timer', 'Start a rest timer', () => startRest(S.settings.restCompound, 'Manual')),
    item('plates', 'Plate calculator', () => plateSheet(0, commonUnit(s))),
    item('plus', 'Add exercise', () => pickExercise(addExercise)),
    item('trash', 'Cancel workout (discard)', () => cancelWorkout(), 'danger-text')), { title: 'Workout' });
}

// Discard the live session with a danger-style confirm. Used by the logger header, menu, bottom button and home card.
export async function cancelWorkout() {
  const a = S.active; if (!a) return false;
  const n = activeDoneSets(a), w = WORKOUTS[a.workout];
  const msg = `${n ? `${n} logged set${n > 1 ? 's' : ''} will be deleted. ` : 'No sets logged. '}Nothing is saved to history: no PRs, no progression changes. Next up stays ${w?.name || a.workout}.`;
  if (!(await confirmSheet('Discard workout?', `${w?.name || 'This workout'}: ` + msg, 'Discard workout', true, 'Keep workout'))) return false;
  stopRest(); await discardActive(); haptic('medium');
  app.go('home', { force: true }); toast('Workout discarded');
  return true;
}

// ───────────────────────── Finish / save
async function finish() {
  const s = S.active;
  const sets = s.entries.filter((e) => e.included && !e.skipped).flatMap((e) => e.sets);
  const doneN = sets.filter((x) => x.done).length;
  if (!doneN) { if (await confirmSheet('No sets logged', 'Nothing to save. Discard this workout instead? Next up stays the same.', 'Discard workout', true)) { stopRest(); await discardActive(); app.go('home', { force: true }); toast('Workout discarded'); } return; }
  const left = sets.length - doneN;
  if (left > 0 && !(await confirmSheet('Finish workout?', `${left} planned set${left > 1 ? 's' : ''} not ticked off — they'll be left out, and those lifts keep their current targets.`, 'Finish'))) return;
  stopRest();
  const before = S.d.states;
  s.status = 'done'; s.finishedAt = Date.now(); s.createdAt = Date.now(); s.duration = s.finishedAt - s.startedAt; delete s.rest;
  if (s.deload && S.settings.deload?.active) {
    const r = (S.settings.deload.remaining || 1) - 1;
    S.settings.deload = r > 0 ? { ...S.settings.deload, remaining: r } : { active: false, remaining: 0, lastEnd: Date.now() };
    await saveSettings();
  }
  await putSession(s);
  S.active = null;
  derive();
  showSummary(s, before);
  app.go('home', { force: true });
}

function nextChanges(s) {
  const out = [];
  for (const e of s.entries) {
    if (!e.included || e.skipped || !e.sets.some((x) => x.done)) continue;
    const st = S.d.states[e.slot + '|' + e.ex];
    if (!st) continue;
    const ex = EX[e.ex];
    const txt = { up: `▲ ${E.fmtW(st.w)} ${st.unit} next time (+${E.inc(st.unit)})`, hold: `● Stay at ${E.fmtW(st.w)} ${st.unit}, add a rep`, miss: `◆ Hold ${E.fmtW(st.w)} ${st.unit} and own the reps`, reset: `▼ Reset to ${E.fmtW(st.w)} ${st.unit}`, 'reps-up': '▲ Range maxed — add a pause or slower tempo' }[st.status];
    if (txt && !(E.isNoLoad(e.ex) && st.status === 'hold')) out.push(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title-s' }, ex.name), h('div', { class: 'muted tiny status ' + st.status }, s.deload ? 'Deload — targets unchanged' : txt))));
  }
  return out;
}

function showSummary(s, before) {
  const st = E.sessionStats(s, bwKg());
  const prs = s.entries.flatMap((e) => e.sets.filter((x) => x.pr && x.done).map(() => EX[e.ex].name));
  const wk = weekInfo();
  if (prs.length || wk.n === 3 || wk.n === 4) setTimeout(() => confetti(), 300);
  const mins = Math.round((s.duration || 0) / 60000);
  sheet(h('div', { class: 'summary' },
    h('div', { class: 'sum-hero' }, workoutBadge(s.workout, 'xl'), h('h2', null, 'Workout saved'), h('div', { class: 'muted' }, WORKOUTS[s.workout].name)),
    h('div', { class: 'stat-grid' },
      stat(`${mins}`, 'minutes'), stat(String(st.sets), 'sets'), stat(dispKg(st.vol), `${S.settings.unit} volume`), stat(String(wk.n), 'this week')),
    prs.length ? h('div', { class: 'pr-banner' }, icon('trophy', 20), ` ${prs.length} PR${prs.length > 1 ? 's' : ''}: ${[...new Set(prs)].join(', ')}`) : null,
    wk.n === 3 ? h('div', { class: 'pr-banner green' }, '✓ Weekly minimum hit') : wk.n >= 4 ? h('div', { class: 'pr-banner green' }, '🔥 Good week — 4+ sessions') : null,
    h('div', { class: 'group-title' }, 'Next time'), h('div', { class: 'list' }, nextChanges(s)),
    h('div', { class: 'muted small pad' }, `Up next: ${S.d.next} · ${WORKOUTS[S.d.next].name}`)), { title: '' });
}
const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, v), h('div', { class: 'stat-l muted tiny' }, l));

async function saveEdit() {
  const s = L.s;
  if (s.status !== 'done') { s.status = 'done'; s.createdAt ||= Date.now(); s.finishedAt ||= Date.now(); }
  await putSession(s); derive();
  app.editSession = null; haptic('success'); toast('Workout saved', { icon: 'check' });
  app.go('progress', { force: true, seg: 'history' });
}
async function deleteEdited() {
  if (!(await confirmSheet('Delete this workout?', 'Its sets are removed from your history and progress. Targets recalculate automatically.', 'Delete', true))) return;
  await delSession(L.s.id); derive(); app.editSession = null; toast('Deleted');
  app.go('progress', { force: true, seg: 'history' });
}

export function newPastSession(wid, dateISO) {
  const s = E.buildSession(wid, ctx(), { planned: false });
  s.date = dateISO; s.startedAt = new Date(dateISO).getTime(); s.status = 'draft'; s.manual = true;
  s.entries.forEach((e) => e.sets.forEach((x) => (x.reps = '')));
  openLogger(s, 'edit');
}
