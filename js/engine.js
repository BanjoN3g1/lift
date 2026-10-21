// Training math: units, e1RM (Epley, RIR-adjusted), plate math, warm-ups,
// double progression, deloads, rotation. Pure functions where possible.
import { EX, WORKOUTS, ROTATION, SEED_E1RM, SEED_SLOTS } from './data.js';

export const LB = 0.45359237;
export const toKg = (w, u) => (u === 'kg' ? w : w * LB);
export const fromKg = (kg, u) => (u === 'kg' ? kg : kg / LB);
export const conv = (w, from, to) => (from === to ? w : fromKg(toKg(w, from), to));
export const DAY = 864e5;

export function step(unit, equip) {
  if (unit === 'lb') return equip === 'cable' || equip === 'machine' || equip === 'bodyweight' ? 2.5 : 5;
  if (equip === 'dumbbell') return 2;
  return equip === 'cable' || equip === 'machine' ? 1.25 : 2.5;
}
export const roundTo = (w, s) => Math.round(w / s) * s;
export function roundW(w, unit, equip) { return +roundTo(w, step(unit, equip)).toFixed(2); }
export const inc = (unit) => (unit === 'lb' ? 5 : 2.5);
export const fmtW = (w) => (w == null || w === '' || isNaN(w) ? '' : String(+(+w).toFixed(2)));

export const isBW = (id) => !!(EX[id]?.bw || id?.startsWith('assisted'));
export const isNoLoad = (id) => !!EX[id]?.noLoad;

// Epley with reps-in-reserve folded in: a set of r reps with RIR q ≈ (r+q) reps to failure.
export function e1rm(load, reps, rir = 0) {
  if (!(load > 0) || !(reps > 0)) return 0;
  const r = Math.min(reps + (rir || 0), 30);
  return r <= 1 ? load : load * (1 + r / 30);
}
export function repsFor(e1, load, rir = 0) {
  if (!(e1 > 0) || !(load > 0)) return null;
  return Math.round(30 * (e1 / load - 1) - rir);
}
export function weightFor(e1, reps, rir = 0) { return e1 / (1 + (reps + rir) / 30); }

// Load used for e1RM/volume (kg): bodyweight lifts add bodyweight to the logged (added) weight.
export function loadKg(exId, w, unit, bwKg) {
  const wk = toKg(+w || 0, unit);
  if (isNoLoad(exId)) return 0;
  if (isBW(exId)) return Math.max(0, (bwKg || 0) + wk);
  return wk;
}

export function plates(total, unit, bar) {
  const list = unit === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  let side = (total - bar) / 2;
  if (side < 0) return { side: [], rem: 0, under: true };
  const out = [];
  for (const p of list) while (side + 1e-6 >= p) { out.push(p); side -= p; }
  return { side: out, rem: +side.toFixed(2) };
}

export function warmups(W, unit, equip, bar) {
  if (!(W > 0)) return [];
  const sets = [];
  if (equip === 'barbell' || equip === 'smith') {
    const steps = [[0, 8], [0.5, 5], [0.7, 3], [0.85, 1]];
    for (const [p, r] of steps) {
      const w = p === 0 ? bar : Math.max(bar, roundW(W * p, unit, equip));
      if (w < W && !sets.some((s) => s.w === w)) sets.push({ w, reps: r, pct: p });
    }
  } else {
    for (const [p, r] of [[0.5, 8], [0.75, 4]]) {
      const w = roundW(W * p, unit, equip);
      if (w > 0 && w < W && !sets.some((s) => s.w === w)) sets.push({ w, reps: r, pct: p });
    }
  }
  return sets;
}

// RIR targets by phase. First 2 weeks: 2–3 in the tank. Deload: 3–4.
export function rirRange(type, phase) {
  if (phase === 'deload') return [3, 4];
  if (phase === 'intro') return [2, 3];
  return type === 'compound' ? [1, 2] : [0, 1];
}

export function programStart(sessions) {
  const d = sessions.filter((s) => s.status === 'done').map((s) => s.date).sort()[0];
  return d ? new Date(d).getTime() : null;
}
export function phaseFor(settings, sessions, now = Date.now()) {
  if (settings.deload?.active) return 'deload';
  const start = programStart(sessions);
  if (!start || now - start < 14 * DAY) return 'intro';
  return 'normal';
}

const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

// Replay every finished session in date order to derive progression state. Because state
// is derived, editing or deleting a past workout automatically re-flows the targets.
export function replay(sessions, settings) {
  const bwKg = toKg(settings.bodyweight || 0, settings.bodyweightUnit || 'lb');
  const states = {};
  for (const [k, v] of Object.entries(SEED_SLOTS)) states[k] = { ...v, status: 'seed', stalls: 0, missCount: 0 };
  const hist = {}; // exId -> [{date, e1, vol, best:{w,unit,reps,rir}, sessionId}]
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
  for (const s of done) {
    for (const e of s.entries) {
      if (e.skipped || e.included === false) continue;
      const sets = e.sets.filter((x) => x.done && +x.reps > 0);
      if (!sets.length) continue;
      // History for charts
      let best = null, bestE = 0, vol = 0, reps = 0;
      for (const x of sets) {
        const L = loadKg(e.ex, x.w, e.unit, bwKg);
        const v = e1rm(L, +x.reps, +x.rir || 0);
        vol += L * +x.reps; reps += +x.reps;
        if (v > bestE || (!best && isNoLoad(e.ex))) { bestE = v; best = x; }
      }
      (hist[e.ex] ||= []).push({ date: s.date, e1: bestE, vol, reps, best: best && { w: +best.w || 0, unit: e.unit, reps: +best.reps, rir: best.rir }, sessionId: s.id });
      if (s.deload) continue; // deload sessions don't move progression
      const key = e.slot + '|' + e.ex;
      const st = states[key] || { stalls: 0, missCount: 0 };
      const [lo] = e.rir || [1, 2];
      const working = sets.filter((x) => !x.backoff);
      const w = Math.max(...(working.length ? working : sets).map((x) => +x.w || 0));
      const planned = e.sets.length;
      const allTop = sets.length >= planned && sets.every((x) => +x.reps >= x.max && (x.rir == null || +x.rir >= lo));
      const miss = sets.some((x) => +x.reps < x.min);
      const total = sets.reduce((a, x) => a + +x.reps, 0);
      const ex = EX[e.ex] || {};
      let next = w, status, stalls = st.stalls || 0, missCount = 0;
      if (allTop) { next = isNoLoad(e.ex) ? w : roundW(w + inc(e.unit), e.unit, ex.equip); status = isNoLoad(e.ex) ? 'reps-up' : 'up'; stalls = 0; }
      else if (miss) {
        missCount = (st.missCount || 0) + 1; stalls += 1;
        if (missCount >= 2 && !isNoLoad(e.ex) && w > 0) { next = roundW(w * 0.9, e.unit, ex.equip); status = 'reset'; missCount = 0; stalls = 0; }
        else status = 'miss';
      } else {
        status = 'hold';
        const sameW = st.lastW != null && Math.abs(conv(st.lastW, st.unit || e.unit, e.unit) - w) < 0.01;
        stalls = sameW && total <= (st.total || 0) ? stalls + 1 : 0;
      }
      states[key] = { w: next, unit: e.unit, lastW: w, lastReps: e.sets.map((x) => (x.done ? +x.reps : null)), total, status, stalls, missCount, date: s.date, sets: planned };
    }
  }
  for (const k in hist) hist[k].sort((a, b) => a.date.localeCompare(b.date));
  return { states, hist };
}

export function bestE1(hist, exId, beforeSessionId) {
  let b = 0;
  for (const h of hist[exId] || []) if (h.sessionId !== beforeSessionId) b = Math.max(b, h.e1);
  return b;
}
export function latestE1(hist, exId, bwKg) {
  const h = (hist[exId] || []).filter((x) => x.e1 > 0);
  if (h.length) {
    // Use the best of the last 3 sessions — responsive to detraining but not to one bad day.
    return Math.max(...h.slice(-3).map((x) => x.e1));
  }
  if (SEED_E1RM[exId]) return toKg(SEED_E1RM[exId], 'lb');
  return 0;
}

export function nextRotation(sessions, settings) {
  const counted = sessions.filter((s) => (s.status === 'done' || s.status === 'skipped') && s.rotIndex != null).sort(byCreated);
  const last = counted[counted.length - 1];
  const ov = settings.rotOverride;
  if (ov && (!last || ov.at > (last.createdAt || 0))) return ov.index % ROTATION.length;
  return last ? (last.rotIndex + 1) % ROTATION.length : 0;
}

export function slotExercise(item, settings) {
  return settings.swaps?.[item.slot] || item.ex;
}

// Build the targets for one exercise entry in a new session.
export function targetsFor(item, exId, unit, ctx) {
  const { states, hist, phase, settings } = ctx;
  const ex = EX[exId];
  const rir = rirRange(ex.type, phase);
  const key = item.slot + '|' + exId;
  const st = states[key];
  const bwKg = toKg(settings.bodyweight || 0, settings.bodyweightUnit || 'lb');
  let w = null;
  if (st && st.w != null && !isNoLoad(exId)) w = roundW(conv(st.w, st.unit || 'lb', unit), unit, ex.equip);
  else if (!isNoLoad(exId) && !isBW(exId)) {
    const e1 = latestE1(hist, exId, bwKg);
    if (e1 > 0 && (hist[exId]?.length)) w = roundW(fromKg(weightFor(e1, item.sets[0].max, rir[1]), unit), unit, ex.equip);
  }
  let planned = item.sets.map((s, i) => ({ ...s, i }));
  if (phase === 'deload') planned = planned.slice(0, Math.max(1, Math.ceil(planned.length / 2)));
  const sets = planned.map((s, i) => {
    let tw = w;
    if (tw != null && s.pct) tw = roundW(tw * s.pct, unit, ex.equip);
    if (tw != null && phase === 'deload') tw = roundW(tw * 0.9, unit, ex.equip);
    let tr = s.min;
    if (st && (st.status === 'hold' || st.status === 'miss') && st.lastReps?.[i] != null) tr = Math.min(s.max, Math.max(s.min, st.lastReps[i] + (st.status === 'hold' ? 1 : 0)));
    if (st && st.status === 'reps-up') tr = s.max;
    return { min: s.min, max: s.max, label: s.label || null, backoff: !!s.pct, pct: s.pct || null, tw, tr, w: tw != null ? tw : '', reps: '', rir: rir[0], done: false };
  });
  return { sets, rir, status: st?.status || null };
}

export function buildSession(workoutId, ctx, { short = false, planned = true, rotIndex = null } = {}) {
  const wk = WORKOUTS[workoutId];
  const { settings } = ctx;
  const entries = [];
  let gi = 0;
  for (const block of wk.blocks) {
    gi++;
    for (const item of block) {
      const exId = slotExercise(item, settings);
      const unit = settings.unitByEx?.[exId] || settings.unit || 'lb';
      const t = targetsFor(item, exId, unit, ctx);
      entries.push({ slot: item.slot, ex: exId, baseEx: item.ex, group: block.length > 1 ? 'g' + gi : null, optional: !!item.optional, bonus: !!item.bonus,
        included: !(item.optional || item.bonus), tip: item.tip || null, unit, rir: t.rir, prevStatus: t.status, sets: t.sets, skipped: false });
    }
  }
  if (short) {
    // Short version: first two core exercises of the workout (~25 min).
    let n = 0;
    for (const e of entries) { if (e.included && n < 2) n++; else e.included = false; e.shortCut = !e.included && !(e.optional || e.bonus); }
  }
  const now = new Date();
  return { id: 's' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), workout: workoutId, date: localISO(now), startedAt: now.getTime(),
    status: 'active', short, deload: ctx.phase === 'deload', phase: ctx.phase, planned, rotIndex: planned ? rotIndex : null, entries };
}

export function localISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const dayKey = (d = new Date()) => localISO(d).slice(0, 10);
export function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }

export function deloadStatus(sessions, settings, states) {
  const dl = settings.deload || {};
  if (dl.active) return { active: true, remaining: dl.remaining };
  const start = dl.lastEnd || programStart(sessions);
  const weeks = start ? (Date.now() - start) / (7 * DAY) : 0;
  const stalled = Object.entries(states).filter(([k, s]) => (s.stalls >= 2 || s.status === 'reset') && EX[k.split('|')[1]]?.type === 'compound').map(([k]) => k);
  const every = settings.deloadEvery || 7;
  return { active: false, weeks, due: weeks >= every || stalled.length >= 2, byTime: weeks >= every, stalled };
}

export function sessionStats(s, bwKg) {
  let sets = 0, vol = 0, reps = 0;
  for (const e of s.entries) {
    if (e.skipped || e.included === false) continue;
    for (const x of e.sets) if (x.done && +x.reps > 0) { sets++; reps += +x.reps; vol += loadKg(e.ex, x.w, e.unit, bwKg) * +x.reps; }
  }
  return { sets, vol, reps };
}

// "1×5–8 + 2×8–10" style label from a set list
export function setsLabel(sets, perSide = false) {
  const parts = [];
  for (const x of sets) {
    const r = x.min === x.max ? `${x.min}` : `${x.min}–${x.max}`;
    const last = parts[parts.length - 1];
    if (last && last.r === r) last.n++; else parts.push({ n: 1, r });
  }
  return parts.map((p) => `${p.n}×${p.r}`).join(' + ') + (perSide ? '/side' : '');
}
