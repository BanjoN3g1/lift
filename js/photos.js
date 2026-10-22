// Progress photos (v1.4). Stored only in IndexedDB on this phone: downscaled, re-encoded (no EXIF/GPS), optionally encrypted.
// No network calls ever involve photos. The only ways a photo leaves the phone are the explicit Share and Export actions.
import { h, $, icon, haptic, toast, sheet, segmented, toggle, confirmSheet } from './ui.js';
import { S, U, blobToDataURL, dataURLToBlob } from './store.js';
import { db } from './db.js';
import * as E from './engine.js';
import * as L from './photolock.js';
import { app } from './app.js';

export const POSES = [{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }, { value: 'flex', label: 'Flex' }, { value: 'other', label: 'Other' }];
export const LIGHTS = [{ value: 'bathroom', label: 'Bathroom' }, { value: 'natural', label: 'Natural' }, { value: 'gym', label: 'Gym' }, { value: 'other', label: 'Other' }];
const FED = [{ value: 'fasted', label: 'Fasted' }, { value: 'fed', label: 'After eating' }];
const YN = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];
const lab = (arr, v) => arr.find((x) => x.value === v)?.label || null;
const MAX_EDGE = 1600;
const pad = (n) => String(n).padStart(2, '0');
const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (d, o = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(d + 'T12:00').toLocaleDateString(undefined, o);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ───────────────────────── Lock plumbing: relock when the app is backgrounded; close anything showing photos.
const sensitive = new Set();
let holdLock = 0; // >0 while the iOS photo picker / share sheet is up, so they don't relock mid-action
const hold = (on) => { holdLock = Math.max(0, holdLock + (on ? 1 : -1)); };
function track(s) { sensitive.add(s); const c = s.close; s.close = () => { sensitive.delete(s); c(); }; return s; }
const urls = new Map();
function clearURLs() { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }
function relock() {
  if (!L.lockInfo().on || L.isLocked()) return;
  L.lock(); clearURLs();
  for (const s of [...sensitive]) s.close();
  document.querySelector('.camera')?.remove();
  if (app.tab === 'body' && app.bodySeg === 'photos') app.refresh();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !holdLock) relock(); });
window.addEventListener('pagehide', () => { if (!holdLock) relock(); });

async function blobOf(p) { if (p.enc) { if (L.isLocked()) throw new Error('locked'); return L.decryptEnc(p.enc); } return p.blob; }
async function urlOf(p) { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(await blobOf(p))); return urls.get(p.id); }
function pimg(p, cls = '') { const img = h('img', { class: cls, alt: `${p.pose} photo`, decoding: 'async' }); urlOf(p).then((u) => (img.src = u)).catch(() => img.classList.add('broken')); return img; }

// ───────────────────────── EXIF DateTimeOriginal (read only to learn when the photo was taken; never stored with the image)
export async function exifDate(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let o = 2;
    while (o + 4 < v.byteLength) {
      const m = v.getUint16(o), len = v.getUint16(o + 2);
      if (m === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);
      if ((m & 0xff00) !== 0xff00 || m === 0xffda) break;
      o += 2 + len;
    }
  } catch {}
  return null;
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (x) => v.getUint16(x, le), u32 = (x) => v.getUint32(x, le);
  const str = (off, n) => { let s = ''; for (let i = 0; i < n - 1 && t + off + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(t + off + i)); return s; };
  const ifd = (off) => { const out = {}; const n = u16(t + off); for (let i = 0; i < n; i++) { const e = t + off + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), val: u32(e + 8) }; } return out; };
  const i0 = ifd(u32(t + 4));
  let tag = null;
  if (i0[0x8769]) { const ex = ifd(i0[0x8769].val); tag = ex[0x9003] || ex[0x9004]; }
  tag ||= i0[0x0132];
  if (!tag || tag.count < 19) return null;
  const m = str(tag.val, tag.count).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) || d.getFullYear() < 1990 || d.getTime() > Date.now() + 864e5 ? null : d.getTime();
}

// Downscale to ≤1600 px long edge and re-encode as JPEG. Re-encoding through a canvas drops all EXIF/GPS metadata.
async function processImage(fileOrBlob) {
  let src = await createImageBitmap(fileOrBlob).catch(() => null);
  if (!src) src = await new Promise((res) => { const u = URL.createObjectURL(fileOrBlob); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); res(null); }; im.src = u; });
  if (!src) throw new Error('Couldn’t read that image');
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  const sc = Math.min(1, MAX_EDGE / Math.max(W, H));
  const c = h('canvas', { width: Math.round(W * sc), height: Math.round(H * sc) });
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Couldn’t process that image');
  return { blob, w: c.width, h: c.height };
}

async function persistPhoto(rec, blob) {
  if (L.encryptNew()) rec.enc = await L.encryptBlob(blob); else rec.blob = blob;
  await db.put('photos', rec);
  S.photos = [...S.photos.filter((x) => x.id !== rec.id), rec].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
async function updateMeta(p, patch) { Object.assign(p, patch); await db.put('photos', p); }
let persistAsked = false;
async function askPersist() { if (persistAsked) return; persistAsked = true; try { await navigator.storage?.persist?.(); } catch {} }
async function storageLine() { try { const ok = await navigator.storage?.persisted?.(); return ok ? 'Storage: persistent ✓ (iOS won’t auto-clear it)' : 'Storage: not marked persistent yet. Installed Home Screen apps are usually kept; keep an Export if they matter.'; } catch { return ''; } }

// Re-encrypt / decrypt everything when the lock mode changes. Each photo is verified before its plaintext copy is replaced.
export async function encryptAllPlain() {
  let n = 0;
  for (const p of [...S.photos]) {
    if (p.enc || !p.blob) continue;
    const enc = await L.encryptBlob(p.blob);
    const back = await L.decryptEnc(enc);
    if (back.size !== p.blob.size) continue;
    const rec = { ...p, enc }; delete rec.blob;
    await db.put('photos', rec); Object.assign(p, rec); delete p.blob; n++;
  }
  return n;
}
async function decryptAll() { for (const p of S.photos) { if (!p.enc) continue; const blob = await L.decryptEnc(p.enc); const rec = { ...p, blob }; delete rec.enc; await db.put('photos', rec); p.blob = blob; delete p.enc; } }

// ───────────────────────── Page
let filter = 'all', selecting = false; const sel = new Set();
export function photos(body) {
  const info = L.lockInfo();
  if (info.on && L.isLocked()) return lockScreen(body);
  if (info.on && info.encrypt && S.photos.some((p) => p.blob && !p.enc)) encryptAllPlain().catch(() => {}); // e.g. after an import
  const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none', onchange: async (e) => { hold(false); const files = [...e.target.files]; fileIn.value = ''; if (files.length) await importFiles(files); } });
  body.append(fileIn);
  body.append(h('section', { class: 'card notice' }, icon('lock', 22), h('div', { class: 'grow small' },
    h('div', null, 'Only on this phone: not in your camera roll, never uploaded. ', info.on ? (info.encrypt ? 'Locked & encrypted.' : 'Locked (privacy screen).') : 'Tip: add a lock below.'),
    h('div', { class: 'muted tiny' }, 'For fair comparisons: same spot, same light, same time of day. Morning, fasted, before training is the easiest to repeat.'))));
  if (selecting) {
    body.append(h('section', { class: 'card sel-bar' }, h('div', { class: 'grow' }, h('div', { class: 'title-s' }, `${sel.size} selected`), h('div', { class: 'muted tiny' }, 'Pick a matched set (front/side/back) plus a reference if you have one. Shirtless only.')),
      h('button', { class: 'btn small ghost', onclick: () => { selecting = false; sel.clear(); app.refresh(); } }, 'Cancel'),
      h('button', { class: 'btn small primary', disabled: !sel.size, onclick: () => shareSelected() }, 'Share')));
  } else {
    body.append(h('div', { class: 'two-btn' },
      h('button', { class: 'btn primary', onclick: () => { hold(true); setTimeout(() => hold(false), 120000); fileIn.click(); } }, icon('image', 18), ' Add photos'),
      h('button', { class: 'btn ghost', onclick: () => openCamera() }, icon('camera', 18), ' Take photo')));
    body.append(h('div', { class: 'two-btn' },
      h('button', { class: 'btn ghost', disabled: S.photos.length < 2, onclick: () => openCompare() }, icon('swap', 18), ' Compare'),
      h('button', { class: 'btn ghost', disabled: !S.photos.length, onclick: () => { selecting = true; sel.clear(); app.refresh(); } }, icon('upload', 18), ' Share for analysis')));
  }
  if (!S.photos.length) {
    body.append(h('section', { class: 'card empty' }, icon('image', 34), h('div', { class: 'title-s' }, 'No photos yet'),
      h('div', { class: 'muted small' }, 'Add from your camera roll (several at once) or take one. Old photos from when you were in good shape can be backdated and marked as a reference.')));
  } else {
    const counts = Object.fromEntries(POSES.map((x) => [x.value, S.photos.filter((p) => p.pose === x.value).length]));
    body.append(h('div', { class: 'chips scroll' }, [{ value: 'all', label: `All ${S.photos.length}` }, ...POSES.filter((x) => counts[x.value]).map((x) => ({ value: x.value, label: `${x.label} ${counts[x.value]}` })),
      ...(S.photos.some((p) => p.ref) ? [{ value: 'ref', label: '★ Reference' }] : [])].map((c) => h('button', { class: 'chip press' + (filter === c.value ? ' on' : ''), onclick: () => { filter = c.value; app.refresh(); } }, c.label))));
    const shown = S.photos.filter((p) => filter === 'all' || (filter === 'ref' ? p.ref : p.pose === filter));
    const byDate = {}; for (const p of shown) (byDate[p.date] ||= []).push(p);
    for (const d of Object.keys(byDate).sort().reverse()) {
      const ps = byDate[d];
      body.append(h('div', { class: 'group-title row-between' }, h('span', null, fmtDate(d)), h('span', { class: 'ph-cond' }, condSummary(ps))));
      body.append(h('div', { class: 'photo-grid' }, ps.map((p) => h('button', { class: 'photo press' + (p.ref ? ' ref' : '') + (selecting && sel.has(p.id) ? ' picked' : ''), onclick: () => {
        if (selecting) { sel.has(p.id) ? sel.delete(p.id) : sel.add(p.id); haptic('light'); app.refresh(); } else viewPhoto(p);
      } }, pimg(p), h('span', { class: 'photo-tag' }, lab(POSES, p.pose) || p.pose), p.ref ? h('span', { class: 'ref-badge' }, '★ REF') : null,
        selecting ? h('span', { class: 'pick-dot' }, sel.has(p.id) ? icon('check', 14) : null) : null))));
    }
  }
  const store = h('div', { class: 'muted tiny' }); storageLine().then((t) => (store.textContent = t));
  body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Privacy & files'),
    h('div', { class: 'two-btn' },
      h('button', { class: 'btn ghost', onclick: () => lockSheet() }, icon('lock', 16), info.on ? ' Lock settings' : ' Set up lock'),
      h('button', { class: 'btn ghost', disabled: !S.photos.length, onclick: () => exportPhotos() }, icon('download', 16), ' Export photos')),
    h('label', { class: 'btn ghost file-btn' }, icon('upload', 16), ' Import a photo export…', h('input', { type: 'file', accept: 'application/json,.json', onclick: () => hold(true), onchange: async (e) => { hold(false); const f = e.target.files[0]; e.target.value = ''; if (f) await importPhotoExport(f); } })),
    store,
    h('div', { class: 'muted tiny' }, 'Photos are not part of the regular Back up file. Nothing about photos is ever sent over the network by this app.')));
}
function condSummary(ps) {
  const one = (f) => { const vs = [...new Set(ps.map(f))]; return vs.length === 1 ? vs[0] : null; };
  return [one((p) => lab(LIGHTS, p.light)), one((p) => (p.ts ? fmtTime(p.ts) : null)), one((p) => lab(FED, p.fed))].filter(Boolean).join(' · ');
}
function metaLines(p) {
  const time = p.ts ? `${fmtTime(p.ts)} ${p.tsSrc === 'exif' ? '(from photo)' : p.tsSrc === 'camera' ? '(taken in app)' : p.tsSrc === 'manual' ? '(you set it)' : '(time added, not taken)'}` : 'time unknown';
  return [`${fmtDate(p.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${time}`,
    `${lab(POSES, p.pose) || p.pose}${p.ref ? ' · ★ Reference (past good shape)' : ''}`,
    `Light: ${lab(LIGHTS, p.light) || 'not set'} · ${lab(FED, p.fed) || 'food: not set'} · Post-workout: ${p.post == null ? 'not set' : p.post ? 'yes' : 'no'}`,
    p.note ? `Note: ${p.note}` : null].filter(Boolean);
}

// ───────────────────────── Lock screen
function lockScreen(body) {
  const info = L.lockInfo();
  const inp = h('input', { class: 'input num big-in lock-in', type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Passcode' });
  const go = async () => { if (!inp.value) return; if (await L.unlockWithPass(inp.value)) { haptic('success'); app.refresh(); } else { haptic('warn'); inp.value = ''; toast('Wrong passcode', { tone: 'bad' }); } };
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  body.append(h('section', { class: 'card lock-card' }, h('div', { class: 'lock-ic' }, icon('lock', 34)), h('div', { class: 'title' }, 'Photos are locked'),
    h('div', { class: 'muted small' }, `${S.photos.length} photo${S.photos.length === 1 ? '' : 's'} · ${info.encrypt ? 'encrypted on this phone' : 'privacy screen'}`),
    inp, h('button', { class: 'btn primary', onclick: go }, 'Unlock'),
    info.faceId ? h('button', { class: 'btn ghost', onclick: async () => { try { if (await L.unlockWithFaceId()) { haptic('success'); app.refresh(); } else toast('Face ID didn’t unlock. Use the passcode.'); } catch (e) { toast(e.name === 'NotAllowedError' ? 'Face ID cancelled' : 'Face ID unavailable: use the passcode'); } } }, 'Unlock with Face ID') : null,
    h('button', { class: 'btn small ghost', onclick: () => forgotFlow() }, 'Forgot passcode?')));
  setTimeout(() => inp.focus(), 300);
}
async function forgotFlow() {
  const info = L.lockInfo();
  if (!info.encrypt) {
    if (await confirmSheet('Remove the lock?', 'Your photos aren’t encrypted, so they’re kept. The lock is removed and you can set a new one.', 'Remove lock', true)) { await L.removeLockConfig(); app.refresh(); }
    return;
  }
  const n = S.photos.filter((p) => p.enc).length;
  if (!(await confirmSheet('Encrypted photos can’t be recovered', `Without the passcode${info.faceId ? ' or Face ID' : ''}, nobody (not you, not me) can decrypt them. Resetting deletes the ${n} encrypted photo${n === 1 ? '' : 's'} and the lock.`, 'Continue', true))) return;
  if (!(await confirmSheet('Delete encrypted photos?', 'Last chance. If you might remember the passcode, cancel and try again later.', `Delete ${n} & reset`, true))) return;
  for (const p of S.photos.filter((x) => x.enc)) await db.del('photos', p.id);
  S.photos = S.photos.filter((x) => !x.enc); await L.removeLockConfig(); toast('Lock reset'); app.refresh();
}

// ───────────────────────── Lock settings
export async function lockSheet() {
  const info = L.lockInfo();
  const faceOK = await L.faceIdAvailable();
  if (!info.on) {
    const p1 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: 'New passcode (6+ digits)' });
    const p2 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: 'Repeat passcode' });
    let enc = true;
    const warn = h('div', { class: 'pill warn soft' }, 'If you forget this passcode (and Face ID isn’t set up or stops working), encrypted photos are gone for good. There is no reset or recovery. Keep an Export somewhere safe if they matter.');
    const s = sheet(h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Asks for a passcode (or Face ID) whenever you open Photos, and locks again as soon as you leave the app.'), p1, p2,
      h('div', { class: 'form-row' }, h('div', null, h('div', null, 'Encrypt photos'), h('div', { class: 'muted tiny' }, 'AES-256 with a key from your passcode. Off = privacy screen only.')), toggle(true, (v) => { enc = v; warn.style.display = v ? '' : 'none'; })),
      warn, h('div', { class: 'muted tiny' }, 'Without encryption the lock only hides photos in the app; someone with access to the unlocked phone and developer tools could still read the stored files.')), {
      title: 'Photo lock', actions: [h('button', { class: 'btn primary', onclick: async () => {
        if (!/^\d{6,}$/.test(p1.value)) { toast('Use 6 or more digits'); return; }
        if (p1.value !== p2.value) { toast('Passcodes don’t match'); return; }
        if (enc && !(await confirmSheet('No recovery', 'Encrypted photos can only be opened with this passcode or Face ID. Forget both and they’re lost. Continue?', 'I understand', true))) return;
        await L.setupLock(p1.value, enc);
        if (enc) { const n = await encryptAllPlain(); if (n) toast(`Encrypted ${n} photo${n > 1 ? 's' : ''}`, { icon: 'lock' }); }
        s.close(); haptic('success'); toast('Lock on', { icon: 'lock' }); app.refresh();
        if (faceOK) setTimeout(() => lockSheet(), 500);
      } }, 'Turn on lock')] });
    return;
  }
  const s = track(sheet(h('div', { class: 'settings' }, h('div', { class: 'group' },
    h('div', { class: 'form-row' }, h('span', null, 'Lock'), h('span', { class: 'muted' }, 'On · relocks when you leave the app')),
    h('div', { class: 'form-row' }, h('span', null, 'Photos'), h('span', { class: 'muted' }, info.encrypt ? 'Encrypted (AES-256-GCM)' : 'Privacy screen only')),
    h('div', { class: 'form-row' }, h('span', null, 'Face ID'), h('span', { class: 'muted' }, info.faceId ? (info.faceIdDecrypts ? 'On' : 'On (gate only)') : faceOK ? 'Off' : 'Not available here'))),
    faceOK && !info.faceId ? h('button', { class: 'btn ghost', onclick: async () => {
      try { const r = await L.enrollFaceId(); toast(r.decrypts ? 'Face ID added' : 'Face ID added (unlocks the screen)', { icon: 'check' }); s.close(); lockSheet(); }
      catch (e) { toast(e.name === 'NotAllowedError' ? 'Face ID setup cancelled' : e.message, { ms: 4000 }); }
    } }, 'Add Face ID unlock') : null,
    info.faceId ? h('button', { class: 'btn ghost', onclick: async () => { await L.removeFaceId(); toast('Face ID removed'); s.close(); lockSheet(); } }, 'Remove Face ID') : null,
    h('button', { class: 'btn ghost', onclick: () => { s.close(); changePassSheet(); } }, 'Change passcode'),
    h('button', { class: 'btn danger-ghost', onclick: async () => {
      if (!(await confirmSheet('Turn off the lock?', info.encrypt ? 'Photos will be decrypted and stored unencrypted on this phone.' : 'Photos open without a passcode again.', 'Turn off', true))) return;
      if (info.encrypt) await decryptAll();
      await L.removeLockConfig(); s.close(); toast('Lock off'); app.refresh();
    } }, 'Turn off lock'),
    h('div', { class: 'note muted small' }, info.encrypt ? 'Forgetting the passcode with no working Face ID means the encrypted photos can’t be recovered.' : 'This is a privacy screen, not encryption.')), { title: 'Photo lock' }));
}
function changePassSheet() {
  const o = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: 'Current passcode' });
  const n1 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: 'New passcode (6+ digits)' });
  const s = sheet(h('div', { class: 'stack' }, o, n1, h('div', { class: 'muted tiny' }, 'Photos don’t need re-encrypting; only the key wrapper changes.')), { title: 'Change passcode',
    actions: [h('button', { class: 'btn primary', onclick: async () => { if (!/^\d{6,}$/.test(n1.value)) { toast('Use 6 or more digits'); return; } if (await L.changePass(o.value, n1.value)) { s.close(); toast('Passcode changed', { icon: 'check' }); } else toast('Current passcode is wrong', { tone: 'bad' }); } }, 'Change')] });
}

// ───────────────────────── Add: tag sheet for a batch (files from the picker or in-app camera shots)
async function importFiles(files) {
  toast(`Processing ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  const items = [];
  for (const f of files) {
    try {
      const [ex, img] = await Promise.all([exifDate(f), processImage(f)]);
      items.push({ ...img, ts: ex || Date.now(), tsSrc: ex ? 'exif' : 'upload' });
    } catch (e) { toast(`${f.name || 'A photo'}: ${e.message}`, { tone: 'bad' }); }
  }
  if (items.length) tagSheet(items);
}
function tagSheet(items) {
  const autoPose = ['front', 'side', 'back'];
  items.forEach((it, i) => { it.pose = items.length <= 3 ? autoPose[i] : 'front'; const d = new Date(it.ts); it.date = E.dayKey(d); it.time = timeKey(d); it.url = URL.createObjectURL(it.blob); });
  const todays = S.sessions.some((x) => x.status === 'done' && x.date.slice(0, 10) === E.dayKey());
  const m = { ref: false, light: S.photos.at(-1)?.light || 'bathroom', fed: new Date().getHours() < 11 ? 'fasted' : null, post: todays ? 'yes' : 'no', note: '' };
  const allDate = h('input', { class: 'input date-in', type: 'date', max: E.dayKey(), value: items[0].date });
  const rows = items.map((it) => {
    const dIn = h('input', { class: 'input date-in', type: 'date', max: E.dayKey(), value: it.date, onchange: (e) => { it.date = e.target.value; it.dirty = true; } });
    const tIn = h('input', { class: 'input date-in', type: 'time', value: it.time, onchange: (e) => { it.time = e.target.value; it.tsSrc = 'manual'; } });
    const pSel = h('select', { class: 'input', onchange: (e) => (it.pose = e.target.value) }, POSES.map((x) => h('option', { value: x.value, selected: x.value === it.pose }, x.label)));
    it.dIn = dIn;
    return h('div', { class: 'tag-row' }, h('img', { src: it.url, class: 'tag-thumb', alt: '' }), h('div', { class: 'tag-fields' }, pSel, h('div', { class: 'row gap-s' }, dIn, tIn),
      h('div', { class: 'muted tiny' }, it.tsSrc === 'exif' ? 'Date & time read from the photo' : 'No capture time in the file: set it if this is an older photo')));
  });
  allDate.addEventListener('change', () => { for (const it of items) { it.date = allDate.value; it.dIn.value = allDate.value; } });
  const s = track(sheet(h('div', { class: 'stack' },
    items.length > 1 ? h('label', { class: 'form-row' }, h('span', null, 'Same date for all'), allDate) : null,
    h('div', { class: 'list' }, rows),
    h('div', { class: 'form-row' }, h('div', null, h('div', null, '★ Reference'), h('div', { class: 'muted tiny' }, 'A past photo from when you were in good shape')), toggle(false, (v) => (m.ref = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Lighting'), segmented(LIGHTS, m.light, (v) => (m.light = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Food'), segmented(FED, m.fed, (v) => (m.fed = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Just trained (pump)?'), segmented(YN, m.post, (v) => (m.post = v))),
    h('input', { class: 'input', placeholder: 'Note (optional), e.g. after a heavy dinner, vacation 2023', oninput: (e) => (m.note = e.target.value) }),
    h('div', { class: 'muted tiny' }, 'Saved resized (1600 px) with location and camera data stripped. Saving works on any day, workout or not.')), {
    title: `Tag ${items.length} photo${items.length > 1 ? 's' : ''}`, tall: true, onClose: () => items.forEach((it) => URL.revokeObjectURL(it.url)),
    actions: [h('button', { class: 'btn primary', onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        for (const it of items) {
          const [hh, mm] = (it.time || '12:00').split(':').map(Number);
          const dt = new Date(it.date + 'T00:00'); dt.setHours(hh || 0, mm || 0, 0, 0);
          await persistPhoto({ id: uid(), date: it.date, ts: dt.getTime(), tsSrc: it.tsSrc, pose: it.pose, ref: m.ref, light: m.light, fed: m.fed, post: m.post === 'yes', note: m.note.trim(), w: it.w, h: it.h, added: Date.now() }, it.blob);
        }
        askPersist(); haptic('success'); toast(`Saved ${items.length} photo${items.length > 1 ? 's' : ''}`, { icon: 'check' }); s.close(); app.refresh();
      } catch (e) { ev.currentTarget.disabled = false; toast('Couldn’t save: ' + e.message, { tone: 'bad' }); }
    } }, 'Save')],
  }));
}

// ───────────────────────── View / edit / delete
function viewPhoto(p) {
  const s = track(sheet(h('div', { class: 'photo-view' }, h('div', { class: 'pv-wrap' }, pimg(p), p.ref ? h('span', { class: 'ref-badge big' }, '★ Reference') : null),
    h('div', { class: 'list' }, metaLines(p).map((l) => h('div', { class: 'small' }, l)))), {
    title: lab(POSES, p.pose) || 'Photo', tall: true,
    actions: [h('button', { class: 'btn danger-ghost', onclick: async () => {
      if (!(await confirmSheet('Delete photo?', 'This removes it from the phone permanently. It can’t be undone.', 'Delete', true))) return;
      await db.del('photos', p.id); S.photos = S.photos.filter((x) => x.id !== p.id); if (urls.has(p.id)) { URL.revokeObjectURL(urls.get(p.id)); urls.delete(p.id); }
      s.close(); toast('Photo deleted'); app.refresh(); } }, icon('trash', 16), ' Delete'),
      h('button', { class: 'btn ghost', onclick: () => { s.close(); editPhoto(p); } }, icon('edit', 16), ' Edit'),
      h('button', { class: 'btn primary', disabled: S.photos.length < 2, onclick: () => { s.close(); openCompare(p); } }, 'Compare')],
  }));
}
function editPhoto(p) {
  const m = { pose: p.pose, ref: !!p.ref, light: p.light || null, fed: p.fed || null, post: p.post == null ? null : p.post ? 'yes' : 'no' };
  const dIn = h('input', { class: 'input date-in', type: 'date', max: E.dayKey(), value: p.date });
  const tIn = h('input', { class: 'input date-in', type: 'time', value: p.ts ? timeKey(new Date(p.ts)) : '' });
  const note = h('input', { class: 'input', value: p.note || '', placeholder: 'Note' });
  const s = track(sheet(h('div', { class: 'stack' },
    h('div', { class: 'row gap-s' }, dIn, tIn),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Pose'), segmented(POSES, m.pose, (v) => (m.pose = v), 'win5')),
    h('div', { class: 'form-row' }, h('span', null, '★ Reference (past good shape)'), toggle(m.ref, (v) => (m.ref = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Lighting'), segmented(LIGHTS, m.light, (v) => (m.light = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Food'), segmented(FED, m.fed, (v) => (m.fed = v))),
    h('div', { class: 'stack-s' }, h('div', { class: 'muted tiny' }, 'Just trained?'), segmented(YN, m.post, (v) => (m.post = v))), note), {
    title: 'Edit photo details',
    actions: [h('button', { class: 'btn primary', onclick: async () => {
      const patch = { date: dIn.value || p.date, pose: m.pose, ref: m.ref, light: m.light, fed: m.fed, post: m.post == null ? null : m.post === 'yes', note: note.value.trim() };
      const oldT = p.ts ? timeKey(new Date(p.ts)) : '';
      if (tIn.value && (tIn.value !== oldT || patch.date !== p.date)) { const [hh, mm] = tIn.value.split(':').map(Number); const dt = new Date(patch.date + 'T00:00'); dt.setHours(hh, mm, 0, 0); patch.ts = dt.getTime(); if (tIn.value !== oldT) patch.tsSrc = 'manual'; }
      await updateMeta(p, patch); S.photos.sort((a, b) => (a.ts || 0) - (b.ts || 0)); s.close(); toast('Saved', { icon: 'check' }); app.refresh();
    } }, 'Save')],
  }));
}

// ───────────────────────── Compare
function fairness(a, b) {
  const w = [];
  if (a.light && b.light && a.light !== b.light) w.push(`Lighting differs (${lab(LIGHTS, a.light)} vs ${lab(LIGHTS, b.light)})`);
  if (a.ts && b.ts) { const ha = new Date(a.ts).getHours() + new Date(a.ts).getMinutes() / 60, hb = new Date(b.ts).getHours() + new Date(b.ts).getMinutes() / 60; if (Math.abs(ha - hb) >= 3) w.push(`~${Math.round(Math.abs(ha - hb))} h apart in time of day`); }
  if (a.fed && b.fed && a.fed !== b.fed) w.push('one fasted, one after eating');
  if (a.post != null && b.post != null && a.post !== b.post) w.push('one has a post-workout pump');
  if (a.pose !== b.pose) w.push('different poses');
  return w;
}
export function openCompare(focus) {
  const multi = [...S.photos].reverse().find((x) => S.photos.filter((y) => y.pose === x.pose).length > 1);
  let pose = focus?.pose || (multi || S.photos.at(-1)).pose;
  let mode = 'side', pos = 50, a, b;
  const pick = () => {
    const set = S.photos.filter((p) => p.pose === pose);
    const pool = set.length >= 2 ? set : S.photos;
    a = focus && focus.pose === pose ? (pool[0] === focus ? focus : pool[0]) : pool[0];
    b = focus && focus.pose === pose && focus !== pool[0] ? focus : pool.at(-1);
    const ref = pool.filter((p) => p.ref).at(-1); if (ref && !focus) a = ref;
    if (a === b && pool.length > 1) b = pool.find((p) => p !== a);
  };
  pick();
  const root = h('div', { class: 'compare' });
  const optLabel = (p) => `${fmtDate(p.date)} · ${p.ts ? fmtTime(p.ts) : ''}${p.ref ? ' · ★' : ''}${p.pose !== pose ? ' · ' + (lab(POSES, p.pose) || p.pose) : ''}`;
  const draw = () => {
    const pool = S.photos.filter((p) => p.pose === pose).length >= 1 ? S.photos.filter((p) => p.pose === pose) : S.photos;
    const all = [...pool, ...S.photos.filter((p) => !pool.includes(p))];
    const selA = h('select', { class: 'input', onchange: (e) => { a = S.photos.find((p) => p.id === e.target.value); draw(); } }, all.map((p) => h('option', { value: p.id, selected: p === a }, optLabel(p))));
    const selB = h('select', { class: 'input', onchange: (e) => { b = S.photos.find((p) => p.id === e.target.value); draw(); } }, all.map((p) => h('option', { value: p.id, selected: p === b }, optLabel(p))));
    const imgA = pimg(a, 'cmp-img'), imgB = pimg(b, 'cmp-img top');
    let stage;
    if (mode === 'side') stage = h('div', { class: 'cmp-stage side' }, h('div', { class: 'cmp-cell' + (a.ref ? ' ref' : '') }, imgA, a.ref ? h('span', { class: 'ref-badge' }, '★ REF') : null), h('div', { class: 'cmp-cell' + (b.ref ? ' ref' : '') }, imgB, b.ref ? h('span', { class: 'ref-badge' }, '★ REF') : null));
    else {
      const handle = h('div', { class: 'cmp-handle', style: { left: pos + '%' } }, h('span'));
      imgB.style.clipPath = `inset(0 0 0 ${pos}%)`;
      stage = h('div', { class: 'cmp-stage' }, imgA, imgB, handle, h('input', { type: 'range', min: 0, max: 100, value: pos, class: 'cmp-range', 'aria-label': 'Compare position', oninput: (e) => { pos = +e.target.value; imgB.style.clipPath = `inset(0 0 0 ${pos}%)`; handle.style.left = pos + '%'; } }));
    }
    const fw = fairness(a, b);
    const days = Math.round((new Date(b.date) - new Date(a.date)) / E.DAY);
    root.replaceChildren(
      segmented(POSES.filter((x) => S.photos.some((p) => p.pose === x.value)), pose, (v) => { pose = v; focus = null; pick(); draw(); }, 'win5'),
      h('div', { class: 'cmp-pickers' }, h('label', null, h('span', { class: 'muted tiny' }, 'A'), selA), h('label', null, h('span', { class: 'muted tiny' }, 'B'), selB)),
      segmented([{ label: 'Side by side', value: 'side' }, { label: 'Slider', value: 'slider' }], mode, (v) => { mode = v; draw(); }),
      stage,
      h('div', { class: 'cmp-meta' }, [a, b].map((p, i) => h('div', { class: 'cmp-meta-col' }, h('div', { class: 'title-s' }, i ? 'B' : 'A', p.ref ? h('span', { class: 'ref-badge inline' }, '★ REF') : null), metaLines(p).map((l) => h('div', { class: 'muted tiny' }, l))))),
      h('div', { class: 'small' }, a.date === b.date ? 'Same day' : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} apart`),
      fw.length ? h('div', { class: 'pill warn soft' }, 'Not quite apples to apples: ' + fw.join(', ') + '. Differences may partly be conditions, not change.') : h('div', { class: 'pill soft train' }, 'Conditions match ✓'),
      h('div', { class: 'muted tiny' }, 'Best comparisons: same spot, same light, same time of day, same food state.'));
  };
  draw();
  track(sheet(root, { title: 'Compare', tall: true }));
}

// ───────────────────────── Share for analysis (explicit, user-initiated; uses the iOS share sheet)
function nearestWeight(date) {
  const ws = S.body.filter((b) => b.weight > 0); if (!ws.length) return null;
  const t = new Date(date).getTime(); const best = ws.reduce((x, y) => (Math.abs(new Date(y.date) - t) < Math.abs(new Date(x.date) - t) ? y : x));
  if (Math.abs(new Date(best.date) - t) > 7 * E.DAY) return null;
  return `${best.weight} ${best.wUnit || 'lb'} (${best.date})`;
}
export function captionFor(list) {
  const lines = [`Lift progress photos for analysis (${list.length})`];
  list.forEach((p, i) => {
    const bw = nearestWeight(p.date);
    lines.push(`${i + 1}) ${p.date} · ${lab(POSES, p.pose) || p.pose}${p.ref ? ' · REFERENCE (past good shape)' : ''} · ${p.ts ? fmtTime(p.ts) : 'time unknown'}${p.tsSrc === 'upload' ? ' (time added, not taken)' : ''} · light: ${lab(LIGHTS, p.light) || 'n/a'} · ${lab(FED, p.fed) || 'food n/a'} · post-workout: ${p.post == null ? 'n/a' : p.post ? 'yes' : 'no'}${bw ? ` · bodyweight ~${bw}` : ''}${p.note ? ` · note: ${p.note}` : ''}`);
  });
  return lines.join('\n');
}
async function shareSelected() {
  const list = S.photos.filter((p) => sel.has(p.id)).sort((x, y) => (x.ts || 0) - (y.ts || 0));
  if (!list.length) return;
  // Build the files first so navigator.share() runs straight from the confirm tap (iOS needs a fresh user gesture).
  const files = [];
  for (const [i, p] of list.entries()) files.push(new File([await blobOf(p)], `lift-${p.date}-${p.pose}${p.ref ? '-ref' : ''}-${i + 1}.jpg`, { type: 'image/jpeg' }));
  const text = captionFor(list);
  if (!(await confirmSheet(`Share ${list.length} photo${list.length > 1 ? 's' : ''}?`, 'These photos will leave this phone through the iOS share sheet, wherever you send them (e.g. your assistant chat), and be stored there. Only share shirtless photos. Location and camera data are already stripped. A caption with date, pose, lighting, time and conditions goes with them.', 'Share', false))) return;
  let shared = false;
  hold(true);
  try {
    try { navigator.clipboard?.writeText(text).catch(() => {}); } catch {}
    if (navigator.canShare?.({ files, text })) { await navigator.share({ files, text, title: 'Lift progress photos' }); shared = true; }
    else if (navigator.canShare?.({ files })) { await navigator.share({ files, title: 'Lift progress photos' }); shared = true; toast('Caption copied: paste it with the photos', { ms: 3500 }); }
  } catch (e) { if (e.name === 'AbortError') { hold(false); return; } }
  finally { setTimeout(() => hold(false), 1500); }
  if (!shared) {
    for (const f of [...files, new File([text], `lift-photos-caption-${E.dayKey()}.txt`, { type: 'text/plain' })]) { const a = h('a', { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove(); await new Promise((r) => setTimeout(r, 250)); }
    toast('Sharing not supported here: downloaded the photos + a caption file', { ms: 3500 });
  }
  selecting = false; sel.clear(); app.refresh();
}

// ───────────────────────── Separate photo export / import (never part of the regular backup)
async function exportPhotos() {
  const out = [];
  for (const p of S.photos) { const { blob, enc, ...meta } = p; out.push({ ...meta, dataUrl: await blobToDataURL(await blobOf(p)) }); }
  const name = `lift-photos-${E.dayKey()}.json`;
  const file = new File([JSON.stringify({ app: 'lift', kind: 'photos', format: 1, exportedAt: new Date().toISOString(), photos: out })], name, { type: 'application/json' });
  if (!(await confirmSheet('Export photos?', `This makes one file with all ${S.photos.length} photos in it, NOT encrypted, readable by anyone who gets the file. Only save it somewhere you trust (e.g. Files → On My iPhone). It isn’t needed for the regular backup.`, 'Export', true))) return;
  let shared = false; hold(true);
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Lift photos export' }); shared = true; } } catch (e) { if (e.name === 'AbortError') { hold(false); return; } }
  finally { setTimeout(() => hold(false), 1500); }
  if (!shared) { const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove(); }
  toast('Photos exported', { icon: 'check' });
}
async function importPhotoExport(f) {
  try {
    const obj = JSON.parse(await f.text());
    const list = obj?.app === 'lift' ? obj.photos || [] : null;
    if (!list) throw new Error('Not a Lift photo export');
    const have = new Set(S.photos.map((p) => p.id));
    const fresh = list.filter((p) => p.dataUrl && !have.has(p.id));
    if (!(await confirmSheet('Import photos?', `${fresh.length} new photo${fresh.length === 1 ? '' : 's'} will be added (${list.length - fresh.length} already here). Nothing is removed.`, 'Import'))) return;
    for (const p of fresh) { const { dataUrl, ...meta } = p; await persistPhoto({ ...meta }, dataURLToBlob(dataUrl)); }
    toast(`Imported ${fresh.length}`, { icon: 'check' }); app.refresh();
  } catch (e) { toast('Couldn’t import: ' + e.message, { tone: 'bad', ms: 3500 }); }
}

// ───────────────────────── In-app camera (self-timer; no outline/pose guide). Shots go to the tag sheet.
export function openCamera() {
  let facing = 'user', timer = 3, stream = null, counting = false;
  const shots = [];
  const video = h('video', { playsinline: true, autoplay: true, muted: true, class: 'cam-video' });
  const count = h('div', { class: 'cam-count' });
  const status = h('div', { class: 'cam-status muted small' }, 'Starting camera…');
  const n = h('span', { class: 'cam-n' });
  const fallback = h('input', { type: 'file', accept: 'image/*', capture: 'user', style: 'display:none', onchange: async (e) => { hold(false); const files = [...e.target.files]; close(); if (files.length) await importFiles(files); } });
  const timerBtn = h('button', { class: 'cam-btn', onclick: () => { timer = timer === 0 ? 3 : timer === 3 ? 10 : 0; timerBtn.textContent = timer ? `${timer}s` : 'Off'; haptic('light'); } }, '3s');
  const doneBtn = h('button', { class: 'cam-btn done', onclick: () => finish() }, 'Done');
  const root = h('div', { class: 'camera' },
    h('div', { class: 'cam-stage' }, video, count, status),
    h('div', { class: 'cam-top' }, h('button', { class: 'cam-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close', 20)), timerBtn),
    h('div', { class: 'cam-bottom' }, doneBtn,
      h('button', { class: 'shutter', 'aria-label': 'Take photo', onclick: () => shoot() }, h('span'), n),
      h('button', { class: 'cam-btn', 'aria-label': 'Flip camera', onclick: () => { facing = facing === 'user' ? 'environment' : 'user'; start(); } }, icon('flip', 22))),
    fallback);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('open'));
  async function start() {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user'); status.textContent = 'Same spot, same light as last time. Prop the phone and use the timer.';
    } catch { status.textContent = 'Camera unavailable here. Tap the shutter to use the system camera.'; }
  }
  async function shoot() {
    if (counting) return;
    if (!stream || !video.videoWidth) { hold(true); setTimeout(() => hold(false), 120000); fallback.click(); return; }
    counting = true;
    for (let t = timer; t > 0; t--) { count.textContent = t; count.classList.add('show'); haptic('light'); await new Promise((r) => setTimeout(r, 1000)); }
    count.classList.remove('show');
    const c = h('canvas', { width: video.videoWidth, height: video.videoHeight });
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    root.classList.add('flash'); setTimeout(() => root.classList.remove('flash'), 300);
    const raw = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const img = await processImage(raw);
    shots.push({ ...img, ts: Date.now(), tsSrc: 'camera' }); n.textContent = shots.length; haptic('success');
    counting = false;
  }
  function finish() { const s = [...shots]; close(); if (s.length) tagSheet(s); }
  function close() { stream?.getTracks().forEach((t) => t.stop()); root.classList.remove('open'); setTimeout(() => root.remove(), 300); }
  start();
}
export const _test = { exifDate, captionFor, fairness, encryptAllPlain };
