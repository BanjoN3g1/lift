// App state, persisted to IndexedDB on this device only.
import { db } from './db.js';
import * as E from './engine.js';
import { ROTATION } from './data.js';

export const DEFAULTS = {
  unit: 'lb', waistUnit: 'in', bodyweight: 145, bodyweightUnit: 'lb', proteinTarget: 145,
  barLb: 45, barKg: 20, restCompound: 150, restSmall: 75, restSuperset: 90,
  deloadEvery: 7, deload: { active: false, remaining: 0, lastEnd: null },
  nutrition: { kcalTrain: 2200, kcalRest: 1900, protein: 140, proteinFloor: 120, fatMin: 55, fiber: 30, favorites: [] },
  favorites: [], swaps: {}, notes: {}, unitByEx: {}, rotOverride: null, lastBackup: null, name: 'Sal', sound: true,
};

export const S = { settings: structuredClone(DEFAULTS), sessions: [], body: [], protein: {}, nutrition: {}, photos: [], active: null, d: null };

export async function load() {
  const kv = await db.get('kv', 'settings');
  S.settings = { ...structuredClone(DEFAULTS), ...(kv?.v || {}) };
  S.settings.nutrition = { ...structuredClone(DEFAULTS.nutrition), ...(S.settings.nutrition || {}) };
  S.sessions = await db.all('sessions');
  S.body = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date));
  S.protein = Object.fromEntries((await db.all('protein')).map((p) => [p.id, p]));
  S.nutrition = Object.fromEntries((await db.all('nutrition')).map((p) => [p.id, p]));
  await migrateProtein();
  S.photos = (await db.all('photos')).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  S.active = S.sessions.find((s) => s.status === 'active') || null;
  derive();
}

export function bwKg() {
  const last = [...S.body].reverse().find((b) => b.weight > 0);
  return last ? E.toKg(last.weight, last.wUnit || 'lb') : E.toKg(S.settings.bodyweight || 0, S.settings.bodyweightUnit || 'lb');
}

export function derive() {
  const st = { ...S.settings, bodyweight: E.fromKg(bwKg(), 'lb'), bodyweightUnit: 'lb' };
  const { states, hist } = E.replay(S.sessions, st);
  const phase = E.phaseFor(S.settings, S.sessions);
  const nextIdx = E.nextRotation(S.sessions, S.settings);
  const deload = E.deloadStatus(S.sessions, S.settings, states);
  S.d = { states, hist, phase, nextIdx, next: ROTATION[nextIdx], deload };
  return S.d;
}
export function ctx() { return { states: S.d.states, hist: S.d.hist, phase: S.d.phase, settings: { ...S.settings, bodyweight: E.fromKg(bwKg(), 'lb'), bodyweightUnit: 'lb' } }; }

// One-time move of the old protein-only tally + favorites into the Nutrition log.
// The legacy 'protein' store is left untouched (and still exported) as a safety copy.
async function migrateProtein() {
  if (S.settings.nutritionMigrated) return;
  for (const p of Object.values(S.protein)) {
    if (!p.entries?.length) continue;
    const day = S.nutrition[p.id] || { id: p.id, entries: [], training: null };
    for (const e of p.entries) {
      if (day.entries.some((x) => x.legacyT === e.t && x.p === +e.g)) continue;
      day.entries.push({ id: 'n' + (e.t || Date.now()).toString(36) + Math.random().toString(36).slice(2, 5), t: e.t || new Date(p.id + 'T12:00').getTime(), legacyT: e.t,
        meal: mealFor(e.t ? new Date(e.t) : new Date(p.id + 'T12:00')), name: e.name || 'Protein', kcal: null, p: +e.g || 0, src: 'quick' });
    }
    S.nutrition[p.id] = day; await db.put('nutrition', day);
  }
  const nf = S.settings.nutrition.favorites || [];
  for (const f of S.settings.favorites || []) if (!nf.some((x) => x.name === f.name)) nf.push({ id: 'f' + Math.random().toString(36).slice(2, 8), name: f.name, p: +f.g || 0, kcal: null });
  S.settings.nutrition.favorites = nf;
  S.settings.nutritionMigrated = true;
  await saveSettings();
}
export function mealFor(d = new Date()) { const hr = d.getHours() + d.getMinutes() / 60; return hr < 10.5 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 17.5 ? 'snack' : 'dinner'; }
export function nDay(k = today()) { return S.nutrition[k] || { id: k, entries: [], training: null }; }
export async function putNDay(day) { S.nutrition[day.id] = day; await db.put('nutrition', JSON.parse(JSON.stringify(day))); }
export const LOW_STEPS = 5000;
export function stepsFor(k) { const s = S.nutrition[k]?.steps; return s && Number.isFinite(+s.n) ? +s.n : null; }
export async function setSteps(k, n, src = 'manual') {
  const d = nDay(k);
  if (n == null) delete d.steps; else d.steps = { n: Math.round(n), src, at: Date.now() };
  await putNDay(d);
}
// Parses "#steps?date=YYYY-MM-DD&n=1234" (also n=1,234 / 1234.0) or pasted text "2026-10-21 8412" lines. Returns [[date, n], ...].
export function parseSteps(str) {
  const out = []; if (!str) return out;
  const t = String(str).trim();
  const q = t.match(/steps\?(.*)$/i);
  if (q) {
    const ps = new URLSearchParams(q[1]);
    const n = ps.get('n') ?? ps.get('steps'), d = ps.get('date') || today();
    if (n != null) out.push([d, n]);
    for (const pair of (ps.get('days') || '').split(',')) { const [dd, nn] = pair.split(':'); if (dd && nn) out.push([dd, nn]); }
  } else {
    for (const m of t.matchAll(/(\d{4}-\d{2}-\d{2})\D{1,12}?([\d.,]+)/g)) out.push([m[1], m[2]]);
  }
  return out.map(([d, n]) => [d.trim(), Math.round(parseFloat(String(n).replace(/,/g, '')))])
    .filter(([d, n]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && d <= today() && Number.isFinite(n) && n >= 0 && n < 150000);
}
export function nTotals(k) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, fb: 0, al: 0, n: 0, missingKcal: 0 };
  for (const e of nDay(k).entries) { t.n++; if (e.kcal == null) t.missingKcal++; for (const f of ['kcal', 'p', 'c', 'f', 'fb', 'al']) t[f] += +e[f] || 0; }
  return t;
}
export function isTrainingDay(k) {
  const d = S.nutrition[k];
  if (d && d.training != null) return d.training;
  return S.sessions.some((s) => s.status === 'done' && s.date.slice(0, 10) === k);
}
export function kcalTarget(k) { const n = S.settings.nutrition; return isTrainingDay(k) ? n.kcalTrain : n.kcalRest; }

export async function saveSettings() { await db.put('kv', { k: 'settings', v: S.settings }); }
export async function putSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s; else S.sessions.push(s);
  await db.put('sessions', JSON.parse(JSON.stringify(s)));
}
export async function delSession(id) { S.sessions = S.sessions.filter((s) => s.id !== id); await db.del('sessions', id); }

let saveT;
// Throws away the in-progress session entirely: not in history, so no PRs/progression, and the rotation
// pointer (derived only from done/skipped sessions) stays put.
export async function discardActive() {
  clearTimeout(saveT);
  const a = S.active; if (!a) return;
  S.active = null;
  await delSession(a.id);
  derive();
}
export function activeDoneSets(a = S.active) { return a ? a.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0) : 0; }
export function saveActiveSoon() { clearTimeout(saveT); saveT = setTimeout(() => S.active && putSession(S.active), 250); }

// Display helpers (global unit)
export const U = () => S.settings.unit;
export function dispKg(kg, unit = U(), dp = 0) { const v = E.fromKg(kg, unit); return dp ? v.toFixed(dp) : String(Math.round(v)); }

export function today() { return E.dayKey(); }
export function proteinDay(k = today()) { return S.protein[k] || { id: k, entries: [] }; }
export async function addProtein(g, name) {
  const p = proteinDay(); p.entries.push({ g: +g, name, t: Date.now() }); S.protein[p.id] = p; await db.put('protein', p);
}
export async function undoProtein() { const p = proteinDay(); const x = p.entries.pop(); S.protein[p.id] = p; await db.put('protein', p); return x; }
export const proteinTotal = (k = today()) => nTotals(k).p;

// Backup
export async function exportData(includePhotos) {
  const photos = [];
  if (includePhotos) for (const p of S.photos) photos.push({ ...p, blob: undefined, dataUrl: await blobToDataURL(p.blob) });
  return { app: 'lift', format: 1, exportedAt: new Date().toISOString(), settings: S.settings, sessions: S.sessions.filter((s) => s.status !== 'active'),
    body: S.body, protein: Object.values(S.protein), nutrition: Object.values(S.nutrition), photos };
}
export async function importData(obj) {
  if (!obj || obj.app !== 'lift') throw new Error('Not a Lift backup file');
  for (const s of db.stores) await db.clear(s);
  await db.put('kv', { k: 'settings', v: { ...DEFAULTS, ...obj.settings } });
  await db.putMany('sessions', obj.sessions || []);
  await db.putMany('body', obj.body || []);
  await db.putMany('protein', obj.protein || []);
  await db.putMany('nutrition', obj.nutrition || []);
  for (const p of obj.photos || []) { const { dataUrl, ...rest } = p; if (dataUrl) await db.put('photos', { ...rest, blob: await (await fetch(dataUrl)).blob() }); }
  await load();
}
export async function eraseAll() { for (const s of db.stores) await db.clear(s); await load(); }
function blobToDataURL(b) { return new Promise((res) => { if (!b) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }); }
