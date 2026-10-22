import { h, $, $$, icon, haptic, toast, sheet, confirmSheet, promptSheet, ring, segmented, toggle, confetti, unlockAudio } from './ui.js';
import { S, load, derive, ctx, saveSettings, putSession, delSession, proteinTotal, proteinDay, addProtein, undoProtein, exportData, importData, eraseAll, U } from './store.js';
import * as E from './engine.js';
import { EX, WORKOUTS, ROTATION } from './data.js';
import { renderTrain, startWorkout, openLogger, cancelWorkout } from './logger.js';
import { renderProgress } from './progress.js';
import { renderBody } from './body.js';
import { maybeOnboard } from './onboarding.js';
import { activeDoneSets, discardActive } from './store.js';
import { renderNutrition, targetsSheet } from './nutrition.js';
import { aiSettingsSheet } from './ai.js';
import { nTotals, kcalTarget, isTrainingDay, mealFor, nDay, putNDay, parseSteps, setSteps, LOW_STEPS } from './store.js';

export const app = { tab: 'home', go, refresh: () => render(true) };
window.__lift = { S, app };

const TABS = [
  { id: 'home', label: 'Today', icon: 'home' },
  { id: 'train', label: 'Train', icon: 'train' },
  { id: 'nutrition', label: 'Fuel', icon: 'drop' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'body', label: 'Body', icon: 'body' },
];

function go(tab, opts = {}) {
  if (app.tab === tab && !opts.force) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  app.tab = tab; app.opts = opts;
  render();
}

function render(keepScroll) {
  const view = $('#view');
  const y = view.scrollTop;
  const fn = { home: renderHome, train: renderTrain, nutrition: renderNutrition, progress: renderProgress, body: renderBody }[app.tab];
  const page = h('div', { class: 'page enter' });
  view.replaceChildren(page);
  fn(page, app.opts || {});
  requestAnimationFrame(() => page.classList.remove('enter'));
  if (keepScroll) view.scrollTop = y; else view.scrollTop = 0;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === app.tab));
  $('#tabbar').classList.toggle('live', !!S.active);
}

function tabbar() {
  return h('nav', { id: 'tabbar', class: 'glass' }, TABS.map((t) => h('button', { class: 'tab', 'data-tab': t.id, onclick: () => { haptic('light'); go(t.id); } },
    h('span', { class: 'tab-ic' }, icon(t.icon, 24)), h('span', { class: 'tab-lbl' }, t.label), t.id === 'train' ? h('span', { class: 'live-dot' }) : null)));
}

// ───────────────────────── Home
export function workoutBadge(wid, size = '') {
  const w = WORKOUTS[wid];
  return h('div', { class: 'badge ' + size, style: { background: `linear-gradient(135deg, ${w.hue[0]}, ${w.hue[1]})` } }, wid);
}
function greeting() { const hr = new Date().getHours(); return hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; }

function weekInfo() {
  const ws = E.weekStart().getTime();
  const days = new Set();
  let n = 0;
  for (const s of S.sessions) if (s.status === 'done') { const t = new Date(s.date).getTime(); if (t >= ws && t < ws + 7 * E.DAY) { n++; days.add((new Date(s.date).getDay() + 6) % 7); } }
  return { n, days };
}

function renderHome(page) {
  const d = S.d;
  const now = new Date();
  page.append(h('header', { class: 'large-head' },
    h('div', null, h('div', { class: 'eyebrow' }, now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
      h('h1', null, `${greeting()}, ${S.settings.name || 'there'}`)),
    h('button', { class: 'icon-btn glass-btn', 'aria-label': 'Settings', onclick: openSettings }, icon('gear', 22))));

  if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) page.append(installCard());

  if (S.active) {
    const w = WORKOUTS[S.active.workout];
    const done = S.active.entries.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
    page.append(h('section', { class: 'card resume-wrap' },
      h('button', { class: 'resume press', onclick: () => go('train') }, workoutBadge(S.active.workout),
        h('div', { class: 'grow' }, h('div', { class: 'eyebrow live-text' }, '● Workout in progress'), h('div', { class: 'title' }, w.name), h('div', { class: 'muted small' }, `${done} set${done === 1 ? '' : 's'} logged · tap to resume`)),
        icon('chevron', 20)),
      h('div', { class: 'resume-actions' },
        h('button', { class: 'btn small primary', onclick: () => go('train') }, 'Resume'),
        h('button', { class: 'btn small danger-ghost', onclick: () => cancelWorkout() }, 'Discard'))));
  }

  // Hero: next workout
  const wid = d.next, w = WORKOUTS[wid];
  let short = !!app.shortPref;
  const c = ctx();
  const preview = E.buildSession(wid, c, { short });
  const list = h('div', { class: 'hero-list' });
  const est = h('span');
  const drawList = () => {
    const p = E.buildSession(wid, c, { short });
    list.replaceChildren(...p.entries.map((e) => {
      const ex = EX[e.ex];
      const off = !e.included;
      return h('div', { class: 'hero-row' + (off ? ' off' : '') + (e.group ? ' ss' : '') },
        h('span', { class: 'dot', style: { background: w.hue[0] } }),
        h('span', { class: 'grow' }, ex.name, e.optional ? h('em', null, ' optional') : null, e.bonus ? h('em', null, ' bonus') : null),
        h('span', { class: 'muted small mono' }, E.setsLabel(e.sets, ex.perSide)));
    }));
    est.textContent = short ? '~25 min · short version' : `~${w.est} min · ${p.entries.filter((e) => e.included).length} exercises`;
  };
  drawList();
  const hero = h('section', { class: 'card hero', style: { '--h1': w.hue[0], '--h2': w.hue[1] } },
    h('div', { class: 'hero-glow' }),
    h('div', { class: 'hero-top' }, workoutBadge(wid, 'xl'),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, `Next up · ${d.nextIdx + 1} of ${ROTATION.length}`), h('h2', null, w.name), h('div', { class: 'muted small' }, est))),
    d.deload.active ? h('div', { class: 'pill warn' }, icon('moon', 14), ` Deload week · ${d.deload.remaining} sessions left`) : d.phase === 'intro' ? h('div', { class: 'pill' }, icon('bolt', 14), ' Ramp-up phase · leave 2–3 reps in the tank') : null,
    list,
    h('div', { class: 'short-row' }, h('div', { class: 'grow' }, h('div', { class: 'title-s' }, 'Short on sleep?'), h('div', { class: 'muted small' }, 'Under 5 hours → first two exercises only, ~25 min. Still counts.')),
      toggle(short, (v) => { short = v; app.shortPref = v; drawList(); }, 'Short version')),
    h('button', { class: 'btn primary big', disabled: !!S.active, onclick: () => { unlockAudio(); haptic('medium'); startWorkout(wid, { short, planned: true }); } }, S.active ? 'Finish current workout first' : 'Start workout'),
    h('div', { class: 'hero-actions' },
      h('button', { class: 'btn ghost', onclick: () => skipNext(wid) }, icon('skip', 16), ' Skip'),
      h('button', { class: 'btn ghost', onclick: () => chooseWorkout() }, icon('swap', 16), ' Do another')));
  page.append(hero);

  // Rotation strip
  page.append(h('div', { class: 'rot-strip' }, ROTATION.map((r, i) => h('div', { class: 'rot' + (i === d.nextIdx ? ' on' : i < d.nextIdx ? ' past' : ''), style: { '--h1': WORKOUTS[r].hue[0] } }, r))));

  // Deload suggestion
  if (!d.deload.active && d.deload.due) {
    page.append(h('section', { class: 'card notice' }, icon('moon', 22),
      h('div', { class: 'grow' }, h('div', { class: 'title-s' }, 'Time for an easy week'),
        h('div', { class: 'muted small' }, d.deload.byTime ? `It's been ${Math.floor(d.deload.weeks)} weeks of hard training.` : 'A few lifts have stalled.', ' 4 lighter sessions (−10% weight, half the sets) help you come back stronger.')),
      h('button', { class: 'btn small primary', onclick: async () => { S.settings.deload = { active: true, remaining: 4, lastEnd: S.settings.deload?.lastEnd || null }; await saveSettings(); derive(); render(true); toast('Deload on for 4 sessions', { icon: 'moon' }); } }, 'Start')));
  }

  // Week ring + protein side by side (stack on small)
  const wk = weekInfo();
  const week = h('section', { class: 'card week' },
    ring(Math.min(1, wk.n / 3), { size: 112, stroke: 13, pct2: Math.min(1, wk.n / 4), colors: ['#30D158', '#B4FF5A'], colors2: ['#0A84FF', '#64D2FF'],
      children: [h('div', { class: 'ring-num' }, String(wk.n)), h('div', { class: 'ring-sub' }, 'this week')] }),
    h('div', { class: 'grow' },
      h('div', { class: 'title-s' }, wk.n >= 4 ? 'Great week 🔥' : wk.n >= 3 ? 'Minimum hit ✓' : `${3 - wk.n} to your minimum`),
      h('div', { class: 'muted small' }, wk.n >= 4 ? 'Four or more sessions — that’s the good-week zone.' : 'Green ring: 3 sessions. Blue ring: 4+ for a good week.'),
      h('div', { class: 'days' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => h('div', { class: 'day' + (wk.days.has(i) ? ' on' : '') + (i === (now.getDay() + 6) % 7 ? ' today' : '') }, l)))));
  page.append(week);
  page.append(proteinCard());

  // Backup nudge
  const doneCount = S.sessions.filter((s) => s.status === 'done').length;
  const lb = S.settings.lastBackup;
  if (doneCount >= 3 && (!lb || Date.now() - lb > 14 * E.DAY)) {
    page.append(h('button', { class: 'card notice press', onclick: () => backupSheet() }, icon('lock', 22),
      h('div', { class: 'grow' }, h('div', { class: 'title-s' }, lb ? 'Back up your log' : 'Make your first backup'),
        h('div', { class: 'muted small' }, 'Everything lives only on this phone. Save a backup file to Files or iCloud Drive now and then.')), icon('chevron', 18)));
  }
  page.append(h('div', { class: 'foot muted small' }, icon('lock', 13), ' Stored only on this device · no account · no tracking'));
}

function installCard() {
  return h('section', { class: 'card notice' }, icon('download', 22), h('div', { class: 'grow' }, h('div', { class: 'title-s' }, 'Install on your Home Screen'),
    h('div', { class: 'muted small' }, 'In Safari tap Share ', h('b', null, '⎋'), ' → ', h('b', null, 'Add to Home Screen'), '. It then opens full-screen and works offline at the gym.')));
}
export function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

async function skipNext(wid) {
  const ok = await confirmSheet(`Skip ${wid}?`, `Moves the rotation to the next workout. Use this if you're deliberately dropping ${WORKOUTS[wid].name} this cycle. Missing a day doesn't need a skip — the rotation just waits for you.`, 'Skip it');
  if (!ok) return;
  const s = { id: 'k' + Date.now().toString(36), workout: wid, date: E.localISO(new Date()), status: 'skipped', rotIndex: S.d.nextIdx, createdAt: Date.now(), entries: [] };
  await putSession(s); derive(); render(true); haptic('light');
  toast(`Skipped ${wid} · next is ${S.d.next}`, { icon: 'skip' });
}

function chooseWorkout() {
  const s = sheet(h('div', { class: 'list' }, Object.values(WORKOUTS).map((w) => h('button', { class: 'row press', onclick: () => { s.close(); unlockAudio(); startWorkout(w.id, { short: !!app.shortPref, planned: w.id === S.d.next }); } },
    workoutBadge(w.id), h('div', { class: 'grow' }, h('div', { class: 'title-s' }, w.name), h('div', { class: 'muted small' }, `~${w.est} min` + (w.id === S.d.next ? ' · next in rotation' : ''))), icon('chevron', 18)))),
    { title: 'Pick a workout' });
  s.body.append(h('p', { class: 'muted small pad' }, 'Doing a different workout today doesn’t move the rotation — your next planned workout stays queued.'));
}

// ───────────────────────── Protein
function proteinCard() {
  const k = E.dayKey(), t = nTotals(k), n = S.settings.nutrition, kt = kcalTarget(k);
  const favs = (n.favorites || []).slice(0, 4);
  return h('section', { class: 'card protein' },
    h('div', { class: 'row-between' }, h('div', null, h('div', { class: 'eyebrow' }, `Fuel today · ${isTrainingDay(k) ? 'training' : 'rest'} day`),
      h('div', { class: 'big-num' }, String(Math.round(t.kcal)), h('span', { class: 'muted small' }, ` / ${kt} kcal`))),
      h('button', { class: 'btn small ghost', onclick: () => go('nutrition') }, 'Open')),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: Math.min(100, (t.kcal / kt) * 100) + '%' } })),
    h('div', { class: 'row-between small' }, h('span', null, `Protein ${Math.round(t.p)} / ${n.protein} g`), h('span', { class: 'muted tiny' }, t.p >= n.proteinFloor ? 'floor hit ✓' : `${Math.round(n.proteinFloor - t.p)} g to ${n.proteinFloor} g floor`)),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill green', style: { width: Math.min(100, (t.p / n.protein) * 100) + '%' } })),
    favs.length ? h('div', { class: 'chips' }, favs.map((f) => h('button', { class: 'chip press', onclick: async () => {
      const d = nDay(k); d.entries.push({ id: 'n' + Date.now().toString(36), t: Date.now(), name: f.name, kcal: f.kcal ?? null, p: +f.p || 0, c: f.c, f: f.f, fb: f.fb, meal: mealFor(), src: 'fav' });
      await putNDay(d); haptic('light'); toast(`+ ${f.name}`, { icon: 'plus' }); render(true); } }, h('b', null, f.p ? `+${f.p} g` : `${f.kcal} kcal`), ' ', f.name))) : null);
}

// ───────────────────────── Settings
export function openSettings() {
  const st = S.settings;
  const set = async (k, v) => { st[k] = v; await saveSettings(); derive(); };
  const numRow = (label, k, suffix, opts = {}) => h('label', { class: 'form-row' }, h('span', null, label),
    h('div', { class: 'with-suffix' }, h('input', { class: 'input num', inputmode: 'decimal', value: st[k], onchange: (e) => set(k, +e.target.value || opts.def || 0) }), h('span', { class: 'muted' }, suffix)));
  const d = S.d;
  const body = h('div', { class: 'settings' },
    h('div', { class: 'group-title' }, 'Units'),
    h('div', { class: 'group' },
      h('div', { class: 'form-row' }, h('span', null, 'Weight unit'), segmented([{ label: 'lb', value: 'lb' }, { label: 'kg', value: 'kg' }], st.unit, (v) => set('unit', v))),
      h('div', { class: 'form-row' }, h('span', null, 'Waist unit'), segmented([{ label: 'in', value: 'in' }, { label: 'cm', value: 'cm' }], st.waistUnit, (v) => set('waistUnit', v))),
      h('div', { class: 'note muted small' }, 'You can also flip lb/kg for a single workout or a single exercise while logging.')),
    h('div', { class: 'group-title' }, 'You'),
    h('div', { class: 'group' },
      h('label', { class: 'form-row' }, h('span', null, 'Name'), h('input', { class: 'input', value: st.name, onchange: (e) => set('name', e.target.value) })),
      h('label', { class: 'form-row' }, h('span', null, 'Bodyweight'), h('div', { class: 'with-suffix' }, h('input', { class: 'input num', inputmode: 'decimal', value: st.bodyweight, onchange: (e) => set('bodyweight', +e.target.value || 0) }), h('span', { class: 'muted' }, st.bodyweightUnit))),
      h('div', { class: 'note muted small' }, 'Used for pull-ups and dips. Your latest Body log entry overrides this.'),
      h('button', { class: 'btn ghost', onclick: () => targetsSheet() }, 'Nutrition targets (kcal, protein, fat, fiber)')),
    h('div', { class: 'group-title' }, 'Gym'),
    h('div', { class: 'group' },
      numRow('Barbell (lb)', 'barLb', 'lb', { def: 45 }), numRow('Barbell (kg)', 'barKg', 'kg', { def: 20 }),
      numRow('Rest · big lifts', 'restCompound', 'sec', { def: 150 }), numRow('Rest · small lifts', 'restSmall', 'sec', { def: 75 }), numRow('Rest · after superset', 'restSuperset', 'sec', { def: 90 }),
      h('div', { class: 'form-row' }, h('span', null, 'Timer sound'), toggle(st.sound !== false, (v) => set('sound', v)))),
    h('div', { class: 'group-title' }, 'Program'),
    h('div', { class: 'group' },
      h('div', { class: 'form-row' }, h('span', null, 'Phase'), h('span', { class: 'muted' }, d.phase === 'intro' ? 'Ramp-up (first 2 weeks)' : d.phase === 'deload' ? 'Deload' : 'Build')),
      h('label', { class: 'form-row' }, h('span', null, 'Next workout'), h('select', { class: 'input', onchange: async (e) => { st.rotOverride = { index: +e.target.value, at: Date.now() }; await saveSettings(); derive(); app.refresh(); toast('Rotation updated'); } },
        ROTATION.map((r, i) => h('option', { value: i, selected: i === d.nextIdx }, `${i + 1}. ${r} · ${WORKOUTS[r].name}`)))),
      numRow('Deload every', 'deloadEvery', 'weeks', { def: 7 }),
      h('div', { class: 'form-row' }, h('span', null, 'Deload now'), toggle(!!st.deload?.active, async (v) => { st.deload = v ? { active: true, remaining: 4, lastEnd: st.deload?.lastEnd || null } : { active: false, remaining: 0, lastEnd: Date.now() }; await saveSettings(); derive(); app.refresh(); })),
      Object.keys(st.swaps || {}).length ? h('button', { class: 'btn ghost', onclick: async () => { st.swaps = {}; await saveSettings(); toast('Saved swaps cleared'); } }, `Reset ${Object.keys(st.swaps).length} saved exercise swap(s)`) : null),
    h('div', { class: 'group-title' }, 'AI (Claude)'),
    h('div', { class: 'group' }, h('button', { class: 'btn ghost', onclick: () => aiSettingsSheet() }, icon('bolt', 16), ' AI (Claude): API key & model'),
      h('div', { class: 'note muted small' }, 'Optional. Powers food-text logging and photo progress analysis with your own Anthropic key.')),
    h('div', { class: 'group-title' }, 'Your data'),
    h('div', { class: 'group' },
      h('div', { class: 'note muted small' }, icon('lock', 13), ' Workouts, body stats and photos are stored only on this phone (IndexedDB). Nothing is uploaded automatically. Deleting the app or clearing Safari data erases it — keep a backup.'),
      h('button', { class: 'btn ghost', onclick: () => backupSheet() }, icon('download', 16), ' Back up / restore'),
      h('button', { class: 'btn ghost', onclick: () => maybeOnboard(true) }, 'Show the intro again'),
      h('div', { class: 'form-row' }, h('span', null, 'Last backup'), h('span', { class: 'muted' }, st.lastBackup ? new Date(st.lastBackup).toLocaleDateString() : 'Never')),
      h('button', { class: 'btn danger-ghost', onclick: async () => { if (await confirmSheet('Erase everything?', 'This deletes every workout, body entry and photo on this device. It cannot be undone.', 'Erase', true) && await confirmSheet('Really erase?', 'Last chance — export a backup first if unsure.', 'Erase all', true)) { await eraseAll(); app.tab = 'home'; app.refresh(); toast('All data erased'); } } }, 'Erase all data')),
    h('div', { class: 'foot muted small' }, 'Lift · v', window.LIFT_VERSION || ''));
  sheet(body, { title: 'Settings', tall: true, onClose: () => app.refresh() });
}

export function backupSheet() {
  const s = sheet(h('div', { class: 'settings' },
    h('p', { class: 'muted small pad' }, 'A backup is a single JSON file you keep (Files, iCloud Drive, AirDrop to your laptop). Restore it here on any phone.'),
    h('div', { class: 'group' },
      h('div', { class: 'note muted small' }, icon('lock', 13), ` Photos are never in this backup${S.photos.length ? ` (${S.photos.length} on this phone)` : ''}. To save them, use Body → Photos → Export photos.`),
      h('button', { class: 'btn primary', onclick: async () => {
        const data = await exportData();
        const name = `lift-backup-${E.dayKey()}.json`;
        const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
        let shared = false;
        try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Lift backup' }); shared = true; } } catch (e) { if (e.name === 'AbortError') return; }
        if (!shared) { const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove(); }
        S.settings.lastBackup = Date.now(); await saveSettings(); toast('Backup saved', { icon: 'check' });
      } }, icon('download', 16), ' Export backup')),
    h('div', { class: 'group' },
      h('label', { class: 'btn ghost file-btn' }, icon('upload', 16), ' Restore from backup…', h('input', { type: 'file', accept: 'application/json,.json', onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const obj = JSON.parse(await f.text());
          if (!(await confirmSheet('Replace all data?', `This backup has ${obj.sessions?.length || 0} workouts. It replaces workouts, body stats, nutrition and settings on this phone. Photos on this phone are kept${obj.photos?.length ? ` (the ${obj.photos.length} photos inside this older backup are added)` : ''}.`, 'Restore', true))) return;
          await importData(obj); s.close(); app.refresh(); toast('Restored', { icon: 'check' });
        } catch (err) { toast('Could not read that file: ' + err.message, { tone: 'bad', ms: 3500 }); }
      } })))), { title: 'Backup & restore' });
}

// ───────────────────────── Boot
// Apple Health steps via iOS Shortcut: #steps?date=YYYY-MM-DD&n=1234 — hash only, so nothing reaches any server.
async function handleStepsHash() {
  if (!/^#steps\b/i.test(location.hash)) return false;
  const rows = parseSteps(decodeURIComponent(location.hash));
  history.replaceState(null, '', location.pathname + location.search);
  if (!rows.length) { toast('Steps link not understood — expected #steps?date=YYYY-MM-DD&n=1234'); return false; }
  for (const [d, n] of rows) await setSteps(d, n, 'shortcut');
  const [d, n] = rows[rows.length - 1];
  app.nutDay = d; app.nutSeg = 'today'; go('nutrition', { force: true });
  haptic('success');
  toast(rows.length > 1 ? `Saved steps for ${rows.length} days` : `Saved ${n.toLocaleString()} steps for ${new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${n < LOW_STEPS ? ' · low-step day' : ''}`, { icon: 'check' });
  if (!navigator.standalone && !matchMedia('(display-mode: standalone)').matches && /iPhone|iPad/.test(navigator.userAgent))
    setTimeout(() => toast('Heads up: this opened in Safari, which keeps separate data from the Home Screen app. Use the webapp:// link in the Shortcut.'), 2600);
  return true;
}

// An in-progress workout with no completed sets that's over 12 h old was almost certainly started by accident.
async function staleActiveCheck() {
  const a = S.active; if (!a || activeDoneSets(a) > 0 || !S.settings.onboarded) return;
  const started = a.createdAt || Date.parse(a.date) || Date.now();
  if (Date.now() - started < 12 * 3600e3) return;
  const w = WORKOUTS[a.workout], when = new Date(started).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (await confirmSheet('Unfinished workout', `${w?.name || 'A workout'} was started ${when} with no sets logged. Discard it? Nothing gets saved and Next up stays ${w?.name || a.workout}.`, 'Discard workout', true, 'Keep workout')) {
    await discardActive(); toast('Workout discarded'); render(true);
  }
}

async function boot() {
  const root = $('#app');
  root.append(h('main', { id: 'view' }), tabbar(), h('div', { id: 'toasts' }));
  await load();
  try { navigator.storage?.persist?.(); } catch {}
  const fromShortcut = await handleStepsHash();
  if (!fromShortcut) render();
  maybeOnboard();
  staleActiveCheck();
  window.addEventListener('hashchange', () => handleStepsHash());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && app.tab === 'home') { derive(); render(true); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had) return; // first install, nothing to refresh
      if (!document.querySelector('.sheet') && !S.active) location.reload();
      else toast('App updated — reopen to load the new version', { icon: 'check' });
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
boot();

export { render, weekInfo, confetti, delSession };
