// Optional built-in AI via Sal's own FREE Google AI Studio (Gemini API) key. The key lives only in IndexedDB on this phone
// (optionally encrypted with the photo-lock key). Requests go straight from the phone to generativelanguage.googleapis.com.
// v1.6: replaced the Anthropic integration. Any old Anthropic key (kv 'ai') is deleted on first load.
import { h, icon, haptic, toast, sheet, toggle, confirmSheet } from './ui.js';
import { db } from './db.js';
import * as L from './photolock.js';

// Verified against ai.google.dev/gemini-api/docs/models + /pricing on 2026-10-21: all three have a Free Tier, accept images.
export const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (default · free tier, vision)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (previous Flash · free tier)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (fastest · free tier, separate quota)' },
];
export const DEFAULT_MODEL = 'gemini-3.8-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const KV = 'gemini';
let cfg = null; // { key?: string, encKey?: {iv,ct}, model, last4, at }

// Upgrade from ≤1.5.0: remove the stored Anthropic key/config completely.
export const migrated = db.get('kv', 'ai').then((r) => (r ? db.del('kv', 'ai') : null)).catch(() => {});

async function loadCfg() { await migrated; cfg = (await db.get('kv', KV))?.v || {}; return cfg; }
async function saveCfg() { await db.put('kv', { k: KV, v: cfg }); }
export async function aiStatus() { const c = await loadCfg(); return { hasKey: !!(c.key || c.encKey), encrypted: !!c.encKey, model: c.model || DEFAULT_MODEL, last4: c.last4 || '' }; }
export async function hasKey() { return (await aiStatus()).hasKey; }
async function getKey() {
  const c = await loadCfg();
  if (c.key) return c.key;
  if (c.encKey) { if (!L.hasDek()) throw Object.assign(new Error('Your Gemini key is encrypted with the photo lock. Open Body → Photos and unlock first.'), { code: 'locked' }); return L.decryptText(c.encKey); }
  throw Object.assign(new Error('No Gemini API key yet. Add your free key in Settings → AI (Gemini).'), { code: 'nokey' });
}
export async function setKey(key, { encrypt = false, model } = {}) {
  const c = await loadCfg();
  key = key.trim();
  if (encrypt && L.canEncrypt()) { c.encKey = await L.encryptText(key); delete c.key; } else { c.key = key; delete c.encKey; }
  c.last4 = key.slice(-4); c.at = Date.now(); if (model) c.model = model;
  await saveCfg();
}
export async function setModel(m) { const c = await loadCfg(); c.model = (m || DEFAULT_MODEL).replace(/^models\//, ''); await saveCfg(); }
export async function clearKey() { const c = await loadCfg(); delete c.key; delete c.encKey; delete c.last4; await saveCfg(); }

const headers = (key) => ({ 'content-type': 'application/json', 'x-goog-api-key': key });
const fetchOpts = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
function retryIn(j) {
  const d = (j?.error?.details || []).find((x) => /RetryInfo/.test(x['@type'] || ''))?.retryDelay;
  const s = d ? Math.ceil(parseFloat(d)) : 0; return s > 0 ? s : 0;
}
export function friendlyError(status, j, model) {
  const m = j?.error?.message || '', reason = JSON.stringify(j?.error?.details || '') + ' ' + (j?.error?.status || '');
  if (status === 429) {
    const s = retryIn(j); const daily = /per ?day|PerDay|daily/i.test(m + reason);
    const e = new Error(daily
      ? 'Gemini’s free daily limit is used up for this model (429). It resets at midnight Pacific time. Meanwhile you can log with the on-device match or pick another free model in Settings → AI (Gemini).'
      : `Gemini’s free tier is busy or you hit the per-minute limit (429). Wait ${s ? `about ${s} s` : 'a minute'} and try again. Nothing was charged: free keys just slow down.`);
    e.code = 'rate'; return e;
  }
  if ((status === 400 && /API_KEY_INVALID|API key not valid/i.test(m + reason)) || status === 401) return Object.assign(new Error('Google rejected the API key. Check it in Settings → AI (Gemini).'), { code: 'badkey' });
  if (status === 403) return Object.assign(new Error('This key isn’t allowed to use the Gemini API (403). Make a new key at aistudio.google.com/apikey.'), { code: 'badkey' });
  if (status === 404) return new Error(`Model “${model || '?'}” isn’t available for your key (404). Pick another model in Settings → AI (Gemini).`);
  if (status === 400 && /location|region|country/i.test(m)) return new Error('The Gemini API free tier isn’t available in this region.');
  if (status >= 500) return new Error(`Gemini is having trouble right now (${status}). Try again in a minute.`);
  return new Error(`Gemini API error ${status}${m ? ': ' + m.slice(0, 200) : ''}`);
}
async function errFrom(res, model) { let j = null; try { j = await res.json(); } catch {} return friendlyError(res.status, j, model); }
export async function testKey(key) {
  key = key || (await getKey());
  let res;
  try { res = await fetch(`${API}/models?pageSize=1`, { headers: headers(key), ...fetchOpts }); }
  catch { throw new Error(navigator.onLine ? 'Couldn’t reach Google.' : 'You’re offline.'); }
  if (!res.ok) throw await errFrom(res);
  return true;
}
// JSON Schema (our app's format) → Gemini responseSchema (OpenAPI subset: upper-case types, no additionalProperties).
export function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties' || k === '$schema') continue;
    if (k === 'type') out.type = String(v).toUpperCase();
    else if (k === 'properties') { out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)])); out.propertyOrdering = Object.keys(v); }
    else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}
// Parts helpers so callers don't depend on the wire format.
export const textPart = (text) => ({ text });
export const jpegPart = (b64) => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
// Fallback chain when the chosen model is overloaded (500/503/504): 2 retries with backoff, then the next free model.
export const FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];
const RETRY_MS = [1200, 3500];
const TRANSIENT = new Set([500, 502, 503, 504]);
export const _cfg = { sleep: (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * 400)) };
async function callOnce(model, key, body, timeoutMs) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: ctl.signal, ...fetchOpts }); }
  catch (e) { throw Object.assign(new Error(e.name === 'AbortError' ? 'Gemini took too long. Try again.' : navigator.onLine ? 'Couldn’t reach Gemini.' : 'You’re offline.'), { code: e.name === 'AbortError' ? 'timeout' : 'network' }); }
  finally { clearTimeout(tm); }
}
// One generateContent request (with retry + fallback). Returns { text, json?, usage, model, requested, fallback, tries, stop }.
export async function ask({ system, parts, schema, maxTokens = 8192, timeoutMs = 180000, onStatus }) {
  const key = await getKey();
  const requested = (await aiStatus()).model;
  const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxTokens } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (schema) { body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = toGeminiSchema(schema); }
  const chain = [requested, ...FALLBACKS.filter((m) => m !== requested)];
  let res = null, model = requested, tries = 0, lastErr = null;
  outer: for (const [mi, m] of chain.entries()) {
    model = m;
    for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
      tries++;
      if (mi || attempt) onStatus?.(mi ? `${requested} is busy. Trying ${m}…` : `Gemini busy, retrying (${attempt}/${RETRY_MS.length})…`);
      try { res = await callOnce(m, key, body, timeoutMs); } catch (e) { if (e.code === 'network' && !navigator.onLine) throw e; lastErr = e; res = null; continue outer; } // timeout/network: next model, don't wait again
      if (res && res.ok) break outer;
      if (res && !TRANSIENT.has(res.status)) {
        if (res.status === 404 && mi === 0 && m !== DEFAULT_MODEL && chain.length > 1) { lastErr = await errFrom(res, m); continue outer; } // bad custom id → try the free fallbacks
        throw await errFrom(res, m);
      }
      if (res) lastErr = await errFrom(res, m);
      if (attempt < RETRY_MS.length) await _cfg.sleep(RETRY_MS[attempt]);
    }
  }
  if (!res || !res.ok) { if (lastErr?.code === 'timeout' || lastErr?.code === 'network') throw lastErr; } if (!res || !res.ok) throw Object.assign(new Error(`Gemini is overloaded right now (${chain.join(', ')} all busy after retries). Your text is kept.`), { code: 'unavailable', cause: lastErr });
  const j = await res.json();
  if (j.promptFeedback?.blockReason) throw new Error(`Gemini declined this request (${j.promptFeedback.blockReason}).`);
  const c = j.candidates?.[0];
  const stop = c?.finishReason || 'UNKNOWN';
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(stop)) throw new Error(`Gemini declined this request (${stop}).`);
  const text = (c?.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
  if (stop === 'MAX_TOKENS' && schema) throw new Error('Gemini’s answer was cut off. Try fewer items at once.');
  let json;
  if (schema) { try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('Gemini returned something unreadable. Try again.'); } }
  return { text, json, usage: j.usageMetadata, model: j.modelVersion || model, requested, fallback: model !== requested, tries, stop };
}

// Tiny, safe Markdown → DOM (headings, bullets, numbered lists, bold/italic). Text is never injected as HTML.
export function md(text) {
  const root = h('div', { class: 'md' });
  const inline = (s) => { const out = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g; let i = 0, m; while ((m = re.exec(s))) { if (m.index > i) out.push(s.slice(i, m.index)); out.push(m[0].startsWith('**') ? h('b', null, m[0].slice(2, -2)) : h('i', null, m[0].slice(1, -1))); i = m.index + m[0].length; } if (i < s.length) out.push(s.slice(i)); return out; };
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const hm = line.match(/^(#{1,4})\s+(.*)/), bm = line.match(/^\s*[-*•]\s+(.*)/), nm = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (bm || nm) { const tag = bm ? 'ul' : 'ol'; if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag); root.append(list); } list.append(h('li', null, inline((bm || nm)[bm ? 1 : 2]))); continue; }
    list = null;
    if (hm) root.append(h(hm[1].length <= 2 ? 'h3' : 'h4', null, inline(hm[2])));
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) root.append(h('hr'));
    else if (line.trim()) root.append(h('p', null, inline(line)));
  }
  return root;
}

// ───────────────────────── Settings sheet
export async function aiSettingsSheet() {
  const st = await aiStatus();
  const keyIn = h('input', { class: 'input key-in', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: st.hasKey ? `Saved · ••••${st.last4}` : 'Paste key: AIza…' });
  const modelSel = h('select', { class: 'input', onchange: async (e) => { await setModel(e.target.value); toast('Model saved', { icon: 'check' }); } },
    MODELS.map((m) => h('option', { value: m.id, selected: m.id === st.model }, m.label)),
    !MODELS.some((m) => m.id === st.model) ? h('option', { value: st.model, selected: true }, st.model + ' (custom)') : null);
  const custom = h('input', { class: 'input', placeholder: 'Or type a model ID (e.g. gemini-flash-latest)', autocapitalize: 'off', spellcheck: 'false', onchange: async (e) => { if (e.target.value.trim()) { await setModel(e.target.value.trim()); toast('Model saved'); } } });
  const lockOK = L.canEncrypt();
  let enc = lockOK && st.encrypted;
  const status = h('div', { class: 'muted tiny' }, st.hasKey ? `Key saved${st.encrypted ? ' · encrypted with photo lock' : ''}.` : 'No key yet: AI features will show this setup.');
  const s = sheet(h('div', { class: 'settings' },
    h('div', { class: 'note muted small' }, 'Uses your own free Google AI Studio key (Gemini API). Get one at aistudio.google.com/apikey → Create API key. Free: no card needed.'),
    h('div', { class: 'group' },
      h('div', { class: 'stack-s pad' }, keyIn, status),
      lockOK ? h('div', { class: 'form-row' }, h('div', null, h('div', null, 'Encrypt key with photo lock'), h('div', { class: 'muted tiny' }, 'Then AI needs Photos unlocked first.')), toggle(enc, (v) => (enc = v))) : null,
      h('div', { class: 'two-btn pad' },
        h('button', { class: 'btn primary', onclick: async () => {
          const v = keyIn.value.trim();
          if (!v) { toast('Paste the key first'); return; }
          if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(v) && !(await confirmSheet('That doesn’t look like a Google API key', 'Google AI Studio keys usually start with AIza. Save anyway?', 'Save'))) return;
          await setKey(v, { encrypt: enc }); keyIn.value = ''; haptic('success'); toast('Key saved on this phone', { icon: 'lock' }); s.close(); aiSettingsSheet();
        } }, 'Save key'),
        h('button', { class: 'btn ghost', onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true; b.textContent = 'Testing…';
          try { await testKey(keyIn.value.trim() || undefined); toast('Key works ✓', { icon: 'check' }); } catch (e) { toast(e.message, { tone: 'bad', ms: 4500 }); }
          b.disabled = false; b.textContent = 'Test';
        } }, 'Test')),
      st.hasKey ? h('button', { class: 'btn danger-ghost', onclick: async () => { if (await confirmSheet('Remove the key?', 'AI features turn off until you add one again.', 'Remove', true)) { await clearKey(); s.close(); toast('Key removed'); } } }, 'Clear key') : null),
    h('div', { class: 'group-title' }, 'Model'),
    h('div', { class: 'group' }, h('div', { class: 'stack-s pad' }, modelSel, custom)),
    h('div', { class: 'card notice warn-soft small ai-free-note' }, h('b', null, 'Free tier: '), 'Google may use what you send (text and photos) to improve its products, and human reviewers may read it. To stay free, don’t set up billing on this key’s Google Cloud project. Free keys have per-minute and daily limits; if you hit one, the app tells you to wait.'),
    h('div', { class: 'note muted small' }, icon('lock', 13), ' Nothing is sent until you tap Estimate or Analyze. Faces are blurred on this phone before any photo leaves it. The key is never in backups.')), { title: 'AI (Gemini)', tall: true });
}
export function setupPrompt(msg = 'Add your free Gemini API key to turn this on.') {
  return h('div', { class: 'card notice ai-setup' }, icon('bolt', 22), h('div', { class: 'grow small' }, h('div', { class: 'title-s' }, 'AI not set up'), h('div', { class: 'muted small' }, msg)),
    h('button', { class: 'btn small primary', onclick: () => aiSettingsSheet() }, 'Set up'));
}
