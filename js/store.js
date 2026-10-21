// App state, persisted to IndexedDB on this device only.
import { db } from './db.js';
import * as E from './engine.js';
import { ROTATION } from './data.js';

export const DEFAULTS = {
  unit: 'lb', waistUnit: 'in', bodyweight: 145, bodyweightUnit: 'lb', proteinTarget: 145,
  barLb: 45, barKg: 20, restCompound: 150, restSmall: 75, restSuperset: 90,
  deloadEvery: 7, deload: { active: false, remaining: 0, lastEnd: null },
  favorites: [], swaps: {}, notes: {}, unitByEx: {}, rotOverride: null, lastBackup: null, name: 'Sal', sound: true,
};

export const S = { settings: structuredClone(DEFAULTS), sessions: [], body: [], protein: {}, photos: [], active: null, d: null };

export async function load() {
  const kv = await db.get('kv', 'settings');
  S.settings = { ...structuredClone(DEFAULTS), ...(kv?.v || {}) };
  S.sessions = await db.all('sessions');
  S.body = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date));
  S.protein = Object.fromEntries((await db.all('protein')).map((p) => [p.id, p]));
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

export async function saveSettings() { await db.put('kv', { k: 'settings', v: S.settings }); }
export async function putSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s; else S.sessions.push(s);
  await db.put('sessions', JSON.parse(JSON.stringify(s)));
}
export async function delSession(id) { S.sessions = S.sessions.filter((s) => s.id !== id); await db.del('sessions', id); }

let saveT;
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
export const proteinTotal = (k) => proteinDay(k).entries.reduce((a, e) => a + (+e.g || 0), 0);

// Backup
export async function exportData(includePhotos) {
  const photos = [];
  if (includePhotos) for (const p of S.photos) photos.push({ ...p, blob: undefined, dataUrl: await blobToDataURL(p.blob) });
  return { app: 'lift', format: 1, exportedAt: new Date().toISOString(), settings: S.settings, sessions: S.sessions.filter((s) => s.status !== 'active'),
    body: S.body, protein: Object.values(S.protein), photos };
}
export async function importData(obj) {
  if (!obj || obj.app !== 'lift') throw new Error('Not a Lift backup file');
  for (const s of db.stores) await db.clear(s);
  await db.put('kv', { k: 'settings', v: { ...DEFAULTS, ...obj.settings } });
  await db.putMany('sessions', obj.sessions || []);
  await db.putMany('body', obj.body || []);
  await db.putMany('protein', obj.protein || []);
  for (const p of obj.photos || []) { const { dataUrl, ...rest } = p; if (dataUrl) await db.put('photos', { ...rest, blob: await (await fetch(dataUrl)).blob() }); }
  await load();
}
export async function eraseAll() { for (const s of db.stores) await db.clear(s); await load(); }
function blobToDataURL(b) { return new Promise((res) => { if (!b) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }); }
