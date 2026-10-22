// On-device face anonymization (v1.6). Runs before ANY photo leaves the phone (AI analysis, iOS share sheet).
// Detector: MediaPipe Tasks Vision FaceDetector + BlazeFace short-range model, vendored in js/vendor/mediapipe (no CDN, no network).
// Stored originals are never modified; we only render anonymized copies. A manual box, if Sal adjusts one, is kept as p.faceBox (coords only).
import { h, icon, toast, sheet, confirmSheet } from './ui.js';

const BASE = new URL('./vendor/mediapipe/', import.meta.url).href;
export const FALLBACK_BAND = 0.2; // top 20% when no face is found
let detP = null, detFailed = false;
export function loadDetector() {
  if (detP) return detP;
  detP = (async () => {
    const { FaceDetector } = await import('./vendor/mediapipe/vision_bundle.mjs');
    return FaceDetector.createFromOptions({ wasmLoaderPath: BASE + 'wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + 'wasm/vision_wasm_internal.wasm' },
      { baseOptions: { modelAssetPath: BASE + 'models/blaze_face_short_range.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.55, minSuppressionThreshold: 0.3 });
  })().catch((e) => { detP = null; detFailed = true; console.warn('face detector unavailable', e); return null; });
  return detP;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function clampBox(b) { const x = clamp01(b.x), y = clamp01(b.y); return { x, y, w: Math.max(0.02, Math.min(1 - x, b.w)), h: Math.max(0.02, Math.min(1 - y, b.h)) }; }
// BlazeFace boxes cover brows→mouth; grow to hide hair, ears, chin and jaw.
function grow(b) { return clampBox({ x: b.x - b.w * 0.4, y: b.y - b.h * 0.75, w: b.w * 1.8, h: b.h * 2.05 }); }
const iou = (a, b) => { const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return i / (a.w * a.h + b.w * b.h - i || 1); };

function canvasFrom(src, sx, sy, sw, sh, edge) {
  const sc = Math.min(1, edge / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * sc)); c.height = Math.max(1, Math.round(sh * sc));
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
}
// Returns normalized raw face boxes (before growing). Full frame first; then overlapping squares over the top 65%
// because in full-body mirror shots the face is tiny relative to the frame.
export async function detectFaces(bitmap) {
  const det = await loadDetector(); if (!det) return null;
  const W = bitmap.width, H = bitmap.height; const found = [];
  const run = (sx, sy, sw, sh) => {
    const c = canvasFrom(bitmap, sx, sy, sw, sh, 640);
    for (const d of det.detect(c).detections || []) {
      const bb = d.boundingBox, score = d.categories?.[0]?.score ?? 0; if (!bb || score < 0.55) continue;
      const k = sw / c.width;
      found.push({ x: (sx + bb.originX * k) / W, y: (sy + bb.originY * k) / H, w: (bb.width * k) / W, h: (bb.height * k) / H, score });
    }
  };
  run(0, 0, W, H);
  if (!found.length) {
    const s = Math.round(Math.min(W, H) * 0.5), step = Math.round(s / 2), maxY = Math.max(0, Math.round(H * 0.65) - s);
    for (let y = 0; y <= maxY; y += step) for (let x = 0; x + s <= W; x += step) run(x, y, s, s);
    if (W - s > 0 && (W - s) % step) for (let y = 0; y <= maxY; y += step) run(W - s, y, s, s);
  }
  const out = [];
  for (const b of found.sort((a, b) => b.score - a.score)) if (!out.some((o) => iou(o, b) > 0.2)) out.push(b);
  // A real face in these photos is never tiny-and-low; drop torso false positives below 70% height.
  return out.filter((b) => b.y + b.h / 2 < 0.7).slice(0, 4);
}
// Plan = { mode: 'face'|'fallback'|'manual'|'none', boxes: [{x,y,w,h}] normalized }
export async function planFor(p, bitmap) {
  if (p.faceBox?.boxes) return { mode: p.faceBox.boxes.length ? 'manual' : 'none', boxes: p.faceBox.boxes.map(clampBox) };
  let faces = null; try { faces = await detectFaces(bitmap); } catch (e) { console.warn(e); }
  if (faces?.length) return { mode: 'face', boxes: faces.map(grow) };
  return { mode: 'fallback', boxes: [{ x: 0, y: 0, w: 1, h: FALLBACK_BAND }], noDetector: faces == null };
}
// Paint the anonymization: very heavy blur (downsample to a few px, upscale), then a near-solid dark fill on top.
export function paint(ctx, W, H, boxes) {
  for (const b0 of boxes) {
    const b = clampBox(b0); const x = Math.floor(b.x * W), y = Math.floor(b.y * H), w = Math.ceil(b.w * W), hh = Math.ceil(b.h * H);
    if (w < 2 || hh < 2) continue;
    const t = document.createElement('canvas'); t.width = Math.max(2, Math.round(w / 48)); t.height = Math.max(2, Math.round(hh / 48));
    const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(ctx.canvas, x, y, w, hh, 0, 0, t.width, t.height);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, hh);
    ctx.fillStyle = 'rgba(28,28,30,0.9)'; ctx.fillRect(x, y, w, hh); ctx.restore();
  }
}
export async function render(bitmap, plan, edge = 1600, quality = 0.85) {
  const c = canvasFrom(bitmap, 0, 0, bitmap.width, bitmap.height, edge);
  paint(c.getContext('2d'), c.width, c.height, plan.boxes);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}
export const MODE_LABEL = { face: 'Face hidden (auto)', fallback: 'No face found: top 20% hidden', manual: 'Your blur box', none: 'Nothing hidden' };

// Prepare anonymized copies for a list of photos. getBlob(p) returns the decrypted original. onEach(i, item) for progressive UI.
export async function prepare(list, getBlob, { edge = 1600, quality = 0.85, onEach } = {}) {
  loadDetector();
  const out = [];
  for (const [i, p] of list.entries()) {
    const bitmap = await createImageBitmap(await getBlob(p));
    const plan = await planFor(p, bitmap);
    const blob = await render(bitmap, plan, edge, quality);
    const item = { p, bitmap, plan, blob, url: URL.createObjectURL(blob) };
    out.push(item); onEach?.(i, item);
  }
  return out;
}
export async function rerender(item, plan, { edge = 1600, quality = 0.85 } = {}) {
  item.plan = plan; URL.revokeObjectURL(item.url);
  item.blob = await render(item.bitmap, plan, edge, quality); item.url = URL.createObjectURL(item.blob); return item;
}
export function release(items) { for (const it of items || []) { try { URL.revokeObjectURL(it.url); it.bitmap?.close?.(); } catch {} } }

// ───────────────────────── Manual editor: drag to move, drag the corner to resize, add/remove boxes.
// Shows the ORIGINAL on this phone with live blur boxes on top; resolves to a plan or null (cancel).
export function editBoxes(item, { originalURL }) {
  return new Promise((resolve) => {
    let boxes = item.plan.boxes.map((b) => ({ ...b })); let result = null;
    const stage = h('div', { class: 'anon-stage' });
    const img = h('img', { class: 'anon-img', src: originalURL, alt: 'Photo being edited', draggable: 'false' });
    stage.append(img);
    const draw = () => {
      stage.querySelectorAll('.anon-box').forEach((n) => n.remove());
      boxes.forEach((b, i) => {
        const el = h('div', { class: 'anon-box', style: { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' } },
          h('button', { class: 'anon-del', 'aria-label': 'Remove box', onclick: (e) => { e.stopPropagation(); boxes.splice(i, 1); draw(); } }, icon('close', 12)),
          h('div', { class: 'anon-handle', 'aria-label': 'Resize' }));
        let start = null;
        el.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.anon-del')) return;
          e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
          const r = stage.getBoundingClientRect(); start = { x: e.clientX, y: e.clientY, b: { ...b }, r, resize: !!e.target.closest('.anon-handle') };
        });
        el.addEventListener('pointermove', (e) => {
          if (!start) return; const dx = (e.clientX - start.x) / start.r.width, dy = (e.clientY - start.y) / start.r.height;
          const nb = start.resize ? { ...start.b, w: Math.max(0.05, start.b.w + dx), h: Math.max(0.04, start.b.h + dy) }
            : { ...start.b, x: Math.min(1 - start.b.w, Math.max(0, start.b.x + dx)), y: Math.min(1 - start.b.h, Math.max(0, start.b.y + dy)) };
          Object.assign(b, clampBox(nb)); Object.assign(el.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
        });
        const end = () => { start = null; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
        stage.append(el);
      });
    };
    draw();
    const s = sheet(h('div', { class: 'stack' },
      h('div', { class: 'muted small' }, 'Drag a box to move it, drag its corner to resize. Everything under a box is blurred and covered before the photo leaves your phone. Your original stays unchanged.'),
      stage,
      h('div', { class: 'row gap-s wrap' },
        h('button', { class: 'chip press', onclick: () => { boxes.push({ x: 0.35, y: 0.05, w: 0.3, h: 0.2 }); draw(); } }, '+ Add box'),
        h('button', { class: 'chip press', onclick: () => { boxes = [{ x: 0, y: 0, w: 1, h: FALLBACK_BAND }]; draw(); } }, 'Top 20% band'),
        h('button', { class: 'chip press', onclick: async () => { const f = await detectFaces(item.bitmap).catch(() => null); if (f?.length) { boxes = f.map(grow); draw(); toast('Face found', { icon: 'check' }); } else toast(f == null ? 'Face detector unavailable on this device' : 'No face found: place a box by hand'); } }, 'Auto-detect'))), {
      title: 'Adjust blur', tall: true, onClose: () => resolve(result),
      actions: [h('button', { class: 'btn ghost', onclick: () => s.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: async () => {
          if (!boxes.length && !(await confirmSheet('No blur at all?', 'Your face may be visible in what you send. Use this only if the photo has no face in it.', 'Send unblurred', true))) return;
          result = { mode: boxes.length ? 'manual' : 'none', boxes: boxes.map(clampBox) }; s.close();
        } }, 'Use this')],
    });
  });
}
// Tile used in review steps: anonymized preview + status + Adjust button.
export function previewTile(item, { onAdjust, onToggle, excluded = false, caption = '' } = {}) {
  return h('div', { class: 'anon-tile' + (excluded ? ' excluded' : '') },
    h('button', { class: 'anon-thumb press', onclick: onToggle || null, 'aria-label': onToggle ? 'Include or leave out' : 'Preview' },
      h('img', { src: item.url, alt: 'Anonymized preview' }), caption ? h('span', { class: 'photo-tag' }, caption) : null, excluded ? h('span', { class: 'pick-dot' }, icon('close', 12)) : null),
    h('div', { class: 'anon-meta' }, h('span', { class: 'pill tiny anon-' + item.plan.mode }, MODE_LABEL[item.plan.mode]),
      h('button', { class: 'link small', onclick: onAdjust }, 'Adjust')));
}
export const _test = { grow, clampBox, iou, detectorFailed: () => detFailed };
