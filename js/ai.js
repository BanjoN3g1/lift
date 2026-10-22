// Optional built-in AI via Sal's own Anthropic API key. The key lives only in IndexedDB on this phone
// (optionally encrypted with the photo-lock key). Requests go straight from the phone to api.anthropic.com.
import { h, icon, haptic, toast, sheet, toggle, confirmSheet } from './ui.js';
import { db } from './db.js';
import * as L from './photolock.js';

export const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (default · fast, vision)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (deeper, ~2× cost)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest, quick food logs)' },
];
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1';
let cfg = null; // { key?: string, encKey?: {iv,ct}, model, last4, at }

async function loadCfg() { cfg = (await db.get('kv', 'ai'))?.v || {}; return cfg; }
async function saveCfg() { await db.put('kv', { k: 'ai', v: cfg }); }
export async function aiStatus() { const c = await loadCfg(); return { hasKey: !!(c.key || c.encKey), encrypted: !!c.encKey, model: c.model || DEFAULT_MODEL, last4: c.last4 || '' }; }
export async function hasKey() { return (await aiStatus()).hasKey; }
async function getKey() {
  const c = await loadCfg();
  if (c.key) return c.key;
  if (c.encKey) { if (!L.hasDek()) throw Object.assign(new Error('Your Claude key is encrypted with the photo lock. Open Body → Photos and unlock first.'), { code: 'locked' }); return L.decryptText(c.encKey); }
  throw Object.assign(new Error('No Claude API key yet. Add it in Settings → AI (Claude).'), { code: 'nokey' });
}
export async function setKey(key, { encrypt = false, model } = {}) {
  const c = await loadCfg();
  key = key.trim();
  if (encrypt && L.canEncrypt()) { c.encKey = await L.encryptText(key); delete c.key; } else { c.key = key; delete c.encKey; }
  c.last4 = key.slice(-4); c.at = Date.now(); if (model) c.model = model;
  await saveCfg();
}
export async function setModel(m) { const c = await loadCfg(); c.model = m || DEFAULT_MODEL; await saveCfg(); }
export async function clearKey() { const c = await loadCfg(); delete c.key; delete c.encKey; delete c.last4; await saveCfg(); }

function headers(key) {
  return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
}
async function errFrom(res) {
  let msg = `Claude API error ${res.status}`;
  try { const j = await res.json(); if (j?.error?.message) msg += `: ${j.error.message}`; } catch {}
  if (res.status === 401) msg = 'Claude rejected the API key (401). Check it in Settings → AI (Claude).';
  if (res.status === 429) msg = 'Claude rate limit or spend limit hit (429). Try again in a minute, or check your Anthropic console.';
  return new Error(msg);
}
export async function testKey(key) {
  key = key || (await getKey());
  const res = await fetch(`${API}/models?limit=1`, { headers: headers(key), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw await errFrom(res);
  return true;
}
// One Messages API call. Returns { text, json?, usage, model, stop }.
export async function ask({ system, content, schema, maxTokens = 8000, timeoutMs = 180000 }) {
  const key = await getKey();
  const model = (await aiStatus()).model;
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] };
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try { res = await fetch(`${API}/messages`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'Claude took too long. Try again.' : navigator.onLine ? 'Couldn’t reach Claude.' : 'You’re offline.'); }
  finally { clearTimeout(tm); }
  if (!res.ok) throw await errFrom(res);
  const j = await res.json();
  if (j.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (j.stop_reason === 'max_tokens' && schema) throw new Error('Claude’s answer was cut off. Try fewer items at once.');
  let json;
  if (schema) { try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('Claude returned something unreadable. Try again.'); } }
  return { text, json, usage: j.usage, model: j.model || model, stop: j.stop_reason };
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
  const keyIn = h('input', { class: 'input key-in', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: st.hasKey ? `Saved · sk-ant-…${st.last4}` : 'Paste key: sk-ant-…' });
  const modelSel = h('select', { class: 'input', onchange: async (e) => { if (e.target.value === '_custom') return; await setModel(e.target.value); toast('Model saved', { icon: 'check' }); } },
    MODELS.map((m) => h('option', { value: m.id, selected: m.id === st.model }, m.label)),
    !MODELS.some((m) => m.id === st.model) ? h('option', { value: st.model, selected: true }, st.model + ' (custom)') : null);
  const custom = h('input', { class: 'input', placeholder: 'Or type a model ID', autocapitalize: 'off', spellcheck: 'false', onchange: async (e) => { if (e.target.value.trim()) { await setModel(e.target.value.trim()); toast('Model saved'); } } });
  const lockOK = L.canEncrypt();
  let enc = lockOK && st.encrypted;
  const status = h('div', { class: 'muted tiny' }, st.hasKey ? `Key saved${st.encrypted ? ' · encrypted with photo lock' : ''}.` : 'No key yet: AI features will show this setup.');
  const s = sheet(h('div', { class: 'settings' },
    h('div', { class: 'note muted small' }, 'Uses your own Anthropic API key, billed to your Anthropic account. Get one at console.anthropic.com → API Keys.'),
    h('div', { class: 'group' },
      h('div', { class: 'stack-s pad' }, keyIn, status),
      lockOK ? h('div', { class: 'form-row' }, h('div', null, h('div', null, 'Encrypt key with photo lock'), h('div', { class: 'muted tiny' }, 'Then AI needs Photos unlocked first.')), toggle(enc, (v) => (enc = v))) : null,
      h('div', { class: 'two-btn pad' },
        h('button', { class: 'btn primary', onclick: async () => {
          const v = keyIn.value.trim();
          if (!v) { toast('Paste the key first'); return; }
          if (!/^sk-ant-/.test(v) && !(await confirmSheet('That doesn’t look like a Claude key', 'Claude API keys usually start with sk-ant-. Save anyway?', 'Save'))) return;
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
    h('div', { class: 'note muted small' }, icon('lock', 13), ' Photos and text you send for analysis go to Anthropic’s API. Nothing is sent until you tap Analyze or Estimate.')), { title: 'AI (Claude)', tall: true });
}
export function setupPrompt(msg = 'Add your Claude API key to turn this on.') {
  return h('div', { class: 'card notice ai-setup' }, icon('bolt', 22), h('div', { class: 'grow small' }, h('div', { class: 'title-s' }, 'AI not set up'), h('div', { class: 'muted small' }, msg)),
    h('button', { class: 'btn small primary', onclick: () => aiSettingsSheet() }, 'Set up'));
}
