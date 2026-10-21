import { h, icon, haptic, sheet, segmented, lineChart, barChart, confirmSheet, toast } from './ui.js';
import { S, derive, bwKg, dispKg, delSession, U } from './store.js';
import * as E from './engine.js';
import { EX, WORKOUTS, SEED_E1RM } from './data.js';
import { app, workoutBadge } from './app.js';
import { openLogger, newPastSession } from './logger.js';

const fmtDate = (d, o = { month: 'short', day: 'numeric' }) => new Date(d).toLocaleDateString(undefined, o);

export function renderProgress(page, opts) {
  const seg = opts.seg || app.progressSeg || 'lifts';
  app.progressSeg = seg;
  page.append(h('header', { class: 'large-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Your trend lines'), h('h1', null, 'Progress'))));
  page.append(segmented([{ label: 'Lifts', value: 'lifts' }, { label: 'History', value: 'history' }], seg, (v) => { app.progressSeg = v; app.go('progress', { force: true, seg: v }); }));
  const body = h('div', { class: 'stack' });
  page.append(body);
  if (seg === 'history') history(body); else lifts(body);
}

function goals() {
  const hist = S.d.hist;
  const cur = (id) => E.latestE1(hist, id, bwKg());
  const logged = (id) => (hist[id] || []).some((x) => x.e1 > 0);
  const rows = [];
  const g = (label, id, w, r) => {
    const need = E.toKg(E.e1rm(w, r, 0), 'lb');
    const have = logged(id) ? cur(id) : 0;
    rows.push(h('div', { class: 'goal' }, h('div', { class: 'row-between' }, h('span', { class: 'title-s' }, label), h('span', { class: 'muted tiny' }, have ? `e1RM ${dispKg(have)} / ${dispKg(need)} ${U()}` : 'log it to track')),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: Math.min(100, (have / need) * 100) + '%' } }))));
  };
  g('Squat 225 × 5', 'back_squat', 225, 5);
  g('Deadlift 245 × 5', 'deadlift', 245, 5);
  // Pull-ups: best strict bodyweight reps
  const pu = (hist.pullup_w || []).concat(hist.neutral_pullup || [], hist.chinup_w || []);
  let best = 0;
  for (const s of S.sessions) if (s.status === 'done') for (const e of s.entries) if (['pullup_w', 'neutral_pullup', 'chinup_w'].includes(e.ex)) for (const x of e.sets) if (x.done && !(+x.w > 0)) best = Math.max(best, +x.reps || 0);
  rows.push(h('div', { class: 'goal' }, h('div', { class: 'row-between' }, h('span', { class: 'title-s' }, '10 strict pull-ups'), h('span', { class: 'muted tiny' }, best ? `best ${best} at bodyweight` : pu.length ? 'do a bodyweight-only set to test' : 'log it to track')),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: Math.min(100, best * 10) + '%' } }))));
  return h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, '12-week goals'), rows,
    h('div', { class: 'muted tiny' }, 'Also: incline press back above your old numbers, waist steady or down while shoulders and chest fill out (track in Body).'));
}

function lifts(body) {
  const hist = S.d.hist;
  const ids = Object.keys(hist).filter((id) => hist[id].length).sort((a, b) => hist[b][hist[b].length - 1].date.localeCompare(hist[a][hist[a].length - 1].date));
  body.append(weekly());
  body.append(goals());
  if (!ids.length) {
    body.append(h('section', { class: 'card empty' }, icon('chart', 34), h('div', { class: 'title-s' }, 'Charts appear after your first session'),
      h('div', { class: 'muted small' }, 'Every set you log feeds an estimated 1-rep max (Epley, adjusted for reps in reserve) and volume trend for that lift.')));
    return;
  }
  let sel = app.progressEx && hist[app.progressEx] ? app.progressEx : ids.find((id) => EX[id].type === 'compound' && !E.isNoLoad(id)) || ids[0];
  const chips = h('div', { class: 'chips scroll' });
  const detail = h('div', { class: 'stack' });
  const draw = () => {
    chips.replaceChildren(...ids.map((id) => h('button', { class: 'chip' + (id === sel ? ' on' : ''), onclick: () => { sel = id; app.progressEx = id; haptic('light'); draw(); } }, EX[id].name)));
    detail.replaceChildren(exDetail(sel));
  };
  draw();
  body.append(chips, detail);
}

function exDetail(id) {
  const hs = S.d.hist[id] || [];
  const ex = EX[id];
  const u = U();
  const noLoad = E.isNoLoad(id);
  const latest = hs[hs.length - 1];
  const first = hs[0];
  const best = hs.reduce((a, x) => (x.e1 > (a?.e1 || 0) ? x : a), null);
  const card = h('section', { class: 'card' });
  if (noLoad) {
    card.append(h('div', { class: 'eyebrow' }, ex.name + ' · total reps per session'),
      h('div', { class: 'big-num' }, String(latest.reps), h('span', { class: 'muted small' }, ' reps last time')),
      lineChart(hs.map((x) => ({ x: new Date(x.date).getTime(), y: x.reps })), { fmt: (v) => v.toFixed(0), unit: ' reps', color: '#30D158', color2: '#64D2FF', dateFmt: (t) => fmtDate(t) }));
  } else {
    // Trend = best e1RM of the last 3 sessions, so light/volume days don't read as strength loss.
    const trend = hs.map((x, i) => ({ x: new Date(x.date).getTime(), y: Math.max(...hs.slice(Math.max(0, i - 2), i + 1).map((z) => z.e1)) }));
    const cur = trend[trend.length - 1].y;
    const delta = cur - trend[0].y;
    const seed = SEED_E1RM[id] ? E.toKg(SEED_E1RM[id], 'lb') : null;
    card.append(h('div', { class: 'eyebrow' }, ex.name + ' · estimated 1RM'),
      h('div', { class: 'row-between' }, h('div', { class: 'big-num' }, dispKg(cur), h('span', { class: 'muted small' }, ' ' + u)),
        hs.length > 1 ? h('div', { class: 'delta ' + (delta >= 0 ? 'up' : 'down') }, `${delta >= 0 ? '▲' : '▼'} ${dispKg(Math.abs(delta))} ${u}`, h('div', { class: 'muted tiny' }, 'since ' + fmtDate(first.date))) : null),
      lineChart(trend.map((p) => ({ x: p.x, y: E.fromKg(p.y, u) })), { fmt: (v) => v.toFixed(0), unit: ' ' + u, ref: seed ? E.fromKg(seed, u) : null, refLabel: 'old est. max', dateFmt: (t) => fmtDate(t) }),
      seed ? h('div', { class: 'muted tiny' }, `Dashed line: your estimated old max (${dispKg(seed)} ${u}). ${cur >= seed ? 'You’re past it. 🔥' : `${Math.round((cur / seed) * 100)}% of the way back.`}`) : null,
      h('div', { class: 'muted tiny' }, 'Estimated 1-rep max = Epley formula on each set, counting reps left in the tank. Line shows your best of the last 3 sessions.'));
  }
  const vol = hs.slice(-12).map((x) => ({ y: noLoad ? x.reps : E.fromKg(x.vol, u), label: fmtDate(x.date, { month: 'numeric', day: 'numeric' }) }));
  const card2 = h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, noLoad ? 'Reps per session' : `Volume per session (${u} × reps)`), barChart(vol, { color: '#5E5CE6', color2: '#BF5AF2' }));
  const top = [...hs].filter((x) => x.best).sort((a, b) => b.e1 - a.e1).slice(0, 5);
  const card3 = h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Best sets'),
    h('div', { class: 'list' }, top.map((x, i) => h('div', { class: 'row' }, h('div', { class: 'rank' + (i === 0 ? ' gold' : '') }, i === 0 ? icon('trophy', 16) : String(i + 1)),
      h('div', { class: 'grow' }, h('div', { class: 'title-s mono' }, noLoad ? `${x.best.reps} reps` : `${E.fmtW(E.roundW(E.conv(x.best.w, x.best.unit, u), u, ex.equip))} ${u} × ${x.best.reps}`, x.best.rir != null ? h('span', { class: 'muted tiny' }, ` @ RIR ${x.best.rir}`) : null),
        h('div', { class: 'muted tiny' }, fmtDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' }))),
      !noLoad ? h('div', { class: 'muted small mono' }, `e1RM ${dispKg(x.e1)}`) : null))),
    best && !noLoad ? h('div', { class: 'muted tiny' }, `${hs.length} sessions logged`) : null);
  return h('div', { class: 'stack' }, card, card2, card3);
}

function weekly() {
  const weeks = [];
  const ws = E.weekStart().getTime();
  for (let i = 7; i >= 0; i--) {
    const a = ws - i * 7 * E.DAY, b = a + 7 * E.DAY;
    const n = S.sessions.filter((s) => s.status === 'done' && new Date(s.date).getTime() >= a && new Date(s.date).getTime() < b).length;
    weeks.push({ y: n, label: fmtDate(a, { month: 'numeric', day: 'numeric' }), hl: i === 0 && n >= 4 });
  }
  const total = S.sessions.filter((s) => s.status === 'done').length;
  return h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Sessions per week'), h('div', { class: 'muted tiny' }, `${total} total`)),
    barChart(weeks, { target: 3, color: '#30D158', color2: '#B4FF5A', height: 110 }), h('div', { class: 'muted tiny' }, 'Dashed line = your 3-session minimum.'));
}

function history(body) {
  body.append(h('div', { class: 'row-between pad' }, h('div', { class: 'muted small' }, 'Tap a workout to view, edit or delete it.'),
    h('button', { class: 'btn small ghost', onclick: logPast }, icon('plus', 14), ' Log past')));
  const list = S.sessions.filter((s) => s.status === 'done' || s.status === 'skipped').sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) { body.append(h('section', { class: 'card empty' }, icon('calendar', 34), h('div', { class: 'title-s' }, 'No workouts yet'), h('div', { class: 'muted small' }, 'Finished workouts show up here with every set, dated.'))); return; }
  let month = '';
  for (const s of list) {
    const m = fmtDate(s.date, { month: 'long', year: 'numeric' });
    if (m !== month) { month = m; body.append(h('div', { class: 'group-title' }, m)); }
    const w = WORKOUTS[s.workout];
    if (s.status === 'skipped') {
      body.append(h('div', { class: 'card hist skipped' }, workoutBadge(s.workout, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'title-s' }, `${w.name} · skipped`), h('div', { class: 'muted tiny' }, fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' }))),
        h('button', { class: 'icon-btn', 'aria-label': 'Remove skip', onclick: async () => { await delSession(s.id); derive(); app.refresh(); toast('Skip removed'); } }, icon('trash', 16))));
      continue;
    }
    const st = E.sessionStats(s, bwKg());
    const prs = s.entries.reduce((a, e) => a + e.sets.filter((x) => x.pr && x.done).length, 0);
    body.append(h('button', { class: 'card hist press', onclick: () => detail(s) }, workoutBadge(s.workout, 'sm'),
      h('div', { class: 'grow' }, h('div', { class: 'title-s' }, w.name, s.short ? h('span', { class: 'pill tiny' }, 'short') : null, s.deload ? h('span', { class: 'pill tiny' }, 'deload') : null),
        h('div', { class: 'muted tiny' }, `${fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.duration ? Math.round(s.duration / 60000) + ' min · ' : ''}${st.sets} sets · ${dispKg(st.vol)} ${U()}`)),
      prs ? h('span', { class: 'pr-chip' }, icon('trophy', 12), ' ', prs) : null, icon('chevron', 16)));
  }
}

function detail(s) {
  const w = WORKOUTS[s.workout];
  const ents = s.entries.filter((e) => e.included && !e.skipped && e.sets.some((x) => x.done));
  const sh = sheet(h('div', { class: 'stack' },
    h('div', { class: 'row' }, workoutBadge(s.workout, 'lg'), h('div', { class: 'grow' }, h('div', { class: 'title' }, w.name),
      h('div', { class: 'muted small' }, new Date(s.date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })))),
    ents.map((e) => h('div', { class: 'card inner' }, h('div', { class: 'title-s' }, EX[e.ex].name),
      h('div', { class: 'detail-sets' }, e.sets.filter((x) => x.done).map((x, i) => h('div', { class: 'dset' + (x.pr ? ' pr' : '') },
        h('span', { class: 'muted tiny' }, x.label || `Set ${i + 1}`),
        h('span', { class: 'mono' }, E.isNoLoad(e.ex) ? `${x.reps} reps` : `${E.isBW(e.ex) ? '+' : ''}${E.fmtW(x.w)} ${e.unit} × ${x.reps}`),
        h('span', { class: 'muted tiny' }, `RIR ${x.rir ?? '–'}`), x.pr ? icon('trophy', 14, 'gold') : null))))),
    !ents.length ? h('p', { class: 'muted' }, 'No completed sets.') : null), {
    title: 'Workout', tall: true,
    actions: [h('button', { class: 'btn danger-ghost', onclick: async () => { if (await confirmSheet('Delete this workout?', 'Targets and charts recalculate automatically.', 'Delete', true)) { await delSession(s.id); derive(); sh.close(); app.refresh(); toast('Deleted'); } } }, icon('trash', 16), ' Delete'),
      h('button', { class: 'btn primary', onclick: () => { sh.close(); openLogger(s, 'edit'); } }, icon('edit', 16), ' Edit')],
  });
}

function logPast() {
  const d = new Date(Date.now() - E.DAY); d.setHours(8, 0, 0, 0);
  const dateIn = h('input', { class: 'input', type: 'datetime-local', value: E.localISO(d) });
  const s = sheet(h('div', { class: 'stack' }, h('label', { class: 'form-row' }, h('span', null, 'When'), dateIn),
    h('div', { class: 'list' }, Object.values(WORKOUTS).map((w) => h('button', { class: 'row press', onclick: () => { s.close(); newPastSession(w.id, dateIn.value); } }, workoutBadge(w.id), h('div', { class: 'grow title-s' }, w.name), icon('chevron', 16)))),
    h('p', { class: 'muted tiny' }, 'Past workouts count toward progress and targets but don’t move the rotation.')), { title: 'Log a past workout' });
}
