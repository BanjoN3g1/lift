import { h, $, icon, haptic, toast, sheet, segmented, lineChart, barChart, confirmSheet } from './ui.js';
import { S, derive, proteinTotal, U } from './store.js';
import { db } from './db.js';
import * as E from './engine.js';
import { app } from './app.js';

const fmtDate = (d, o = { month: 'short', day: 'numeric' }) => new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString(undefined, o);
const IN = 2.54;
const waistTo = (v, from, to) => (from === to ? v : to === 'cm' ? v * IN : v / IN);

export function renderBody(page, opts) {
  const seg = opts.seg || app.bodySeg || 'metrics';
  app.bodySeg = seg;
  page.append(h('header', { class: 'large-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Recomp tracker'), h('h1', null, 'Body'))));
  page.append(segmented([{ label: 'Metrics', value: 'metrics' }, { label: 'Photos', value: 'photos' }], seg, (v) => { app.bodySeg = v; app.go('body', { force: true, seg: v }); }));
  const body = h('div', { class: 'stack' });
  page.append(body);
  if (seg === 'photos') photos(body); else metrics(body);
}

// ───────────────────────── Metrics
function metrics(body) {
  const u = U(), wu = S.settings.waistUnit;
  const wIn = h('input', { class: 'input num', inputmode: 'decimal', placeholder: u });
  const waIn = h('input', { class: 'input num', inputmode: 'decimal', placeholder: wu });
  const dIn = h('input', { class: 'input', type: 'date', value: E.dayKey() });
  body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Log a check-in'),
    h('div', { class: 'metric-form' },
      h('label', null, h('span', { class: 'muted tiny' }, `Weight (${u})`), wIn),
      h('label', null, h('span', { class: 'muted tiny' }, `Waist at navel (${wu})`), waIn),
      h('label', null, h('span', { class: 'muted tiny' }, 'Date'), dIn)),
    h('button', { class: 'btn primary', onclick: async () => {
      const w = +wIn.value.replace(',', '.'), wa = +waIn.value.replace(',', '.');
      if (!(w > 0) && !(wa > 0)) { toast('Enter weight or waist'); return; }
      const id = dIn.value || E.dayKey();
      const prev = S.body.find((b) => b.id === id) || { id, date: id };
      const rec = { ...prev, ...(w > 0 ? { weight: w, wUnit: u } : {}), ...(wa > 0 ? { waist: wa, waistUnit: wu } : {}) };
      await db.put('body', rec);
      S.body = [...S.body.filter((b) => b.id !== id), rec].sort((a, b) => a.date.localeCompare(b.date));
      derive(); haptic('success'); toast('Saved', { icon: 'check' }); app.refresh();
    } }, 'Save check-in'),
    h('div', { class: 'muted tiny' }, 'Best: weigh in the morning after the bathroom, measure the waist relaxed at the belly button. Weekly is plenty.')));

  const ws = S.body.filter((b) => b.weight > 0), wa = S.body.filter((b) => b.waist > 0);
  const tsOf = (b) => new Date(b.date + 'T12:00').getTime();
  const weightVals = ws.map((b) => ({ x: tsOf(b), y: E.fromKg(E.toKg(b.weight, b.wUnit || 'lb'), u) }));
  const waistVals = wa.map((b) => ({ x: tsOf(b), y: waistTo(b.waist, b.waistUnit || 'in', wu) }));
  const dW = weightVals.length > 1 ? weightVals.at(-1).y - weightVals[0].y : null;
  const dWa = waistVals.length > 1 ? waistVals.at(-1).y - waistVals[0].y : null;
  if (dW != null && dWa != null) {
    let msg;
    if (dWa < -0.2 && dW >= -0.5) msg = 'Waist down while weight holds or climbs — that’s a recomp working. Keep going.';
    else if (dWa < -0.2) msg = 'Waist and weight both down — you’re leaning out. Keep protein high so the muscle stays.';
    else if (dWa > 0.4 && dW > 1) msg = 'Waist creeping up with weight — trim a little at dinner or add steps on desk days.';
    else msg = 'Waist roughly steady. If strength keeps rising, you’re likely adding muscle without fat.';
    body.append(h('section', { class: 'card notice' }, icon('bolt', 22), h('div', { class: 'grow small' }, msg)));
  }
  body.append(h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Bodyweight'),
    dW != null ? h('div', { class: 'muted tiny' }, `${dW >= 0 ? '+' : ''}${dW.toFixed(1)} ${u} since ${fmtDate(ws[0].date)}`) : null),
    weightVals.length ? h('div', { class: 'big-num' }, weightVals.at(-1).y.toFixed(1), h('span', { class: 'muted small' }, ' ' + u)) : null,
    lineChart(weightVals, { fmt: (v) => v.toFixed(1), unit: ' ' + u, color: '#64D2FF', color2: '#0A84FF', dateFmt: (t) => new Date(t).toLocaleDateString() })));
  body.append(h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Waist'),
    dWa != null ? h('div', { class: 'muted tiny' }, `${dWa >= 0 ? '+' : ''}${dWa.toFixed(1)} ${wu} since ${fmtDate(wa[0].date)}`) : null),
    waistVals.length ? h('div', { class: 'big-num' }, waistVals.at(-1).y.toFixed(1), h('span', { class: 'muted small' }, ' ' + wu)) : null,
    lineChart(waistVals, { fmt: (v) => v.toFixed(1), unit: ' ' + wu, color: '#FF9F0A', color2: '#FFD60A', dateFmt: (t) => new Date(t).toLocaleDateString() })));

  // Protein, last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * E.DAY); const k = E.dayKey(d); days.push({ y: proteinTotal(k), label: i % 2 ? '' : String(d.getDate()), hl: i === 0 && proteinTotal(k) >= S.settings.proteinTarget }); }
  const logged = days.filter((d) => d.y > 0);
  const avg = logged.length ? logged.reduce((a, d) => a + d.y, 0) / logged.length : 0;
  body.append(h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Protein · 14 days'), h('div', { class: 'muted tiny' }, logged.length ? `avg ${Math.round(avg)} g on logged days` : 'log from Today')),
    barChart(days, { target: S.settings.proteinTarget, color: '#FF375F', color2: '#FF9F0A', height: 110 })));

  if (S.body.length) body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Entries'), h('div', { class: 'list' }, [...S.body].reverse().slice(0, 30).map((b) => h('div', { class: 'row' },
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, fmtDate(b.date, { weekday: 'short', month: 'short', day: 'numeric' })),
      h('div', { class: 'muted tiny mono' }, [b.weight ? `${b.weight} ${b.wUnit}` : null, b.waist ? `waist ${b.waist} ${b.waistUnit}` : null].filter(Boolean).join(' · '))),
    h('button', { class: 'icon-btn', 'aria-label': 'Delete entry', onclick: async () => { await db.del('body', b.id); S.body = S.body.filter((x) => x.id !== b.id); derive(); app.refresh(); } }, icon('trash', 16)))))));
}

// ───────────────────────── Photos
const urlCache = new Map();
function photoURL(p) { if (!urlCache.has(p.id)) urlCache.set(p.id, URL.createObjectURL(p.blob)); return urlCache.get(p.id); }
const POSES = [{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }];

function photos(body) {
  body.append(h('section', { class: 'card notice' }, icon('lock', 22), h('div', { class: 'grow small' }, 'Photos stay in this app on this phone only — not in your camera roll, never uploaded. Every 4 weeks is the sweet spot: same spot, same light, same time of day.')));
  body.append(h('div', { class: 'two-btn' },
    h('button', { class: 'btn primary', onclick: () => openCamera() }, icon('camera', 18), ' New check-in'),
    h('button', { class: 'btn ghost', disabled: S.photos.length < 2, onclick: () => openCompare() }, icon('swap', 18), ' Compare')));
  if (!S.photos.length) { body.append(h('section', { class: 'card empty' }, icon('image', 34), h('div', { class: 'title-s' }, 'No photos yet'), h('div', { class: 'muted small' }, 'Take front, side and back. The outline guide keeps every shot lined up.'))); return; }
  const byDate = {};
  for (const p of S.photos) (byDate[p.date] ||= []).push(p);
  for (const d of Object.keys(byDate).sort().reverse()) {
    body.append(h('div', { class: 'group-title' }, fmtDate(d, { month: 'long', day: 'numeric', year: 'numeric' })));
    body.append(h('div', { class: 'photo-grid' }, byDate[d].map((p) => h('button', { class: 'photo press', onclick: () => viewPhoto(p) }, h('img', { src: photoURL(p), alt: p.pose, loading: 'lazy' }), h('span', { class: 'photo-tag' }, p.pose)))));
  }
}

function viewPhoto(p) {
  const s = sheet(h('div', { class: 'photo-view' }, h('img', { src: photoURL(p), alt: '' }), h('div', { class: 'muted small' }, `${p.pose} · ${fmtDate(p.date, { month: 'long', day: 'numeric', year: 'numeric' })}`)), {
    title: '', tall: true,
    actions: [h('button', { class: 'btn danger-ghost', onclick: async () => { if (await confirmSheet('Delete photo?', 'This removes it from the phone permanently.', 'Delete', true)) { await db.del('photos', p.id); S.photos = S.photos.filter((x) => x.id !== p.id); s.close(); app.refresh(); } } }, icon('trash', 16), ' Delete'),
      h('button', { class: 'btn primary', onclick: () => { s.close(); openCompare(p); } }, 'Compare')],
  });
}

// Pose outlines (viewBox 0 0 200 400): head-top line at y=14, feet line at y=388
function outline(pose) {
  const P = {
    front: 'M100 16c13 0 22 11 22 26s-9 28-22 28-22-13-22-28 9-26 22-26zM90 70v10c-20 3-32 8-36 20-5 20-8 45-12 70-3 18-4 36-2 52M110 70v10c20 3 32 8 36 20 5 20 8 45 12 70 3 18 4 36 2 52M66 118c-2 18-1 40 2 58 2 12 0 22-2 32M134 118c2 18 1 40-2 58-2 12 0 22 2 32M66 208c-4 40-4 80 2 120 2 20 2 40 0 58h22c2-40 4-80 8-120l2-30 2 30c4 40 6 80 8 120h22c-2-18-2-38 0-58 6-40 6-80 2-120',
    back: 'M100 16c13 0 22 11 22 26s-9 28-22 28-22-13-22-28 9-26 22-26zM90 70v10c-20 3-32 8-36 20-5 20-8 45-12 70-3 18-4 36-2 52M110 70v10c20 3 32 8 36 20 5 20 8 45 12 70 3 18 4 36 2 52M66 118c-2 18-1 40 2 58 2 12 0 22-2 32M134 118c2 18 1 40-2 58-2 12 0 22 2 32M66 208c-4 40-4 80 2 120 2 20 2 40 0 58h22c2-40 4-80 8-120l2-30 2 30c4 40 6 80 8 120h22c-2-18-2-38 0-58 6-40 6-80 2-120M100 84v110',
    side: 'M98 16c13 0 21 11 21 26 0 10-2 18-8 23l-1 13c14 4 20 12 20 26 0 26-6 50-4 72 2 16 0 26-2 32-2 40 0 82 4 120 2 20 2 40 2 58H96c0-40-6-80-10-120-4-22-6-40-6-58 0-20 2-38-2-56-4-22-2-46 4-62 4-10 10-14 16-16l2-12c-8-5-12-14-12-24 0-15 9-25 20-25zM104 104c-4 30-4 60 0 92',
  };
  return h('svg:svg', { class: 'pose-outline', viewBox: '0 0 200 400', preserveAspectRatio: 'xMidYMid meet' },
    h('svg:line', { x1: 20, x2: 180, y1: 14, y2: 14, class: 'guide' }), h('svg:text', { x: 182, y: 17, class: 'guide-t' }, 'head'),
    h('svg:line', { x1: 20, x2: 180, y1: 388, y2: 388, class: 'guide' }), h('svg:text', { x: 182, y: 391, class: 'guide-t' }, 'feet'),
    h('svg:path', { d: P[pose], class: 'body-line' }));
}

async function savePhoto(blob, pose, w, hgt) {
  const now = new Date();
  const rec = { id: 'p' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5), date: E.dayKey(now), ts: now.getTime(), pose, blob, w, h: hgt };
  await db.put('photos', rec); S.photos.push(rec);
  return rec;
}
async function downscale(fileOrBlob, max = 1440) {
  const bmp = await createImageBitmap(fileOrBlob).catch(() => null);
  if (!bmp) return { blob: fileOrBlob, w: 0, h: 0 };
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = h('canvas', { width: Math.round(bmp.width * sc), height: Math.round(bmp.height * sc) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  return { blob, w: c.width, h: c.height };
}

export function openCamera() {
  let pose = 'front', facing = 'user', timer = 3, stream = null, counting = false;
  const video = h('video', { playsinline: true, autoplay: true, muted: true, class: 'cam-video' });
  const ov = h('div', { class: 'cam-overlay' }, outline(pose));
  const count = h('div', { class: 'cam-count' });
  const status = h('div', { class: 'cam-status muted small' }, 'Starting camera…');
  const fileIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const d = await downscale(f); await savePhoto(d.blob, pose, d.w, d.h); haptic('success'); toast(`${pose} photo saved`, { icon: 'check' }); fileIn.value = '';
    advancePose();
  } });
  const poseSeg = h('div', { class: 'cam-pose' });
  const drawPose = () => { poseSeg.replaceChildren(segmented(POSES, pose, (v) => { pose = v; ov.replaceChildren(outline(pose)); })); ov.replaceChildren(outline(pose)); };
  const advancePose = () => { const i = POSES.findIndex((p) => p.value === pose); if (i < POSES.length - 1) { pose = POSES[i + 1].value; drawPose(); } };
  drawPose();
  const timerBtn = h('button', { class: 'cam-btn', onclick: () => { timer = timer === 0 ? 3 : timer === 3 ? 10 : 0; timerBtn.textContent = timer ? `${timer}s` : 'Off'; haptic('light'); } }, '3s');
  const root = h('div', { class: 'camera' },
    h('div', { class: 'cam-stage' }, video, ov, count, status),
    h('div', { class: 'cam-top' }, h('button', { class: 'cam-btn', onclick: () => close() }, icon('close', 20)), poseSeg, timerBtn),
    h('div', { class: 'cam-bottom' },
      h('button', { class: 'cam-btn', 'aria-label': 'Import photo', onclick: () => fileIn.click() }, icon('image', 22)),
      h('button', { class: 'shutter', 'aria-label': 'Take photo', onclick: () => shoot() }, h('span')),
      h('button', { class: 'cam-btn', 'aria-label': 'Flip camera', onclick: () => { facing = facing === 'user' ? 'environment' : 'user'; start(); } }, icon('flip', 22))),
    fileIn);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('open'));
  async function start() {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user'); status.textContent = 'Line your head and feet up with the guides';
    } catch (err) {
      status.textContent = 'Camera unavailable here — use the photo button to pick or take one.';
    }
  }
  async function shoot() {
    if (counting) return;
    if (!stream || !video.videoWidth) { fileIn.click(); return; }
    counting = true;
    for (let t = timer; t > 0; t--) { count.textContent = t; count.classList.add('show'); haptic('light'); await new Promise((r) => setTimeout(r, 1000)); }
    count.classList.remove('show');
    const c = h('canvas', { width: video.videoWidth, height: video.videoHeight });
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    root.classList.add('flash'); setTimeout(() => root.classList.remove('flash'), 300);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    const d = await downscale(blob);
    await savePhoto(d.blob, pose, d.w, d.h); haptic('success'); toast(`${pose} saved`, { icon: 'check' });
    counting = false; advancePose();
  }
  function close() { stream?.getTracks().forEach((t) => t.stop()); root.classList.remove('open'); setTimeout(() => root.remove(), 300); app.refresh(); }
  start();
}

export function openCompare(focus) {
  const pose = focus?.pose || S.photos.at(-1).pose;
  let set = S.photos.filter((p) => p.pose === pose);
  if (set.length < 2) set = S.photos;
  let a = set[0], b = focus && focus !== set[0] ? focus : set.at(-1);
  let mode = 'slider', pos = 50;
  const stage = h('div', { class: 'cmp-stage' });
  const thumbs = h('div', { class: 'cmp-thumbs' });
  const label = h('div', { class: 'cmp-label' });
  const draw = () => {
    const imgA = h('img', { src: photoURL(a), class: 'cmp-img' }), imgB = h('img', { src: photoURL(b), class: 'cmp-img top' });
    const handle = h('div', { class: 'cmp-handle' }, h('span'));
    if (mode === 'side') { stage.className = 'cmp-stage side'; stage.replaceChildren(imgA, imgB); }
    else if (mode === 'ghost') { stage.className = 'cmp-stage'; imgB.style.opacity = pos / 100; stage.replaceChildren(imgA, imgB); }
    else { stage.className = 'cmp-stage'; imgB.style.clipPath = `inset(0 0 0 ${pos}%)`; handle.style.left = pos + '%'; stage.replaceChildren(imgA, imgB, handle); }
    const range = h('input', { type: 'range', min: 0, max: 100, value: pos, class: 'cmp-range', 'aria-label': 'Compare position', oninput: (e) => { pos = +e.target.value; if (mode === 'ghost') imgB.style.opacity = pos / 100; else { imgB.style.clipPath = `inset(0 0 0 ${pos}%)`; handle.style.left = pos + '%'; } } });
    if (mode !== 'side') stage.append(range);
    label.replaceChildren(h('span', null, 'Before · ' + fmtDate(a.date)), h('span', null, 'After · ' + fmtDate(b.date)));
    thumbs.replaceChildren(...S.photos.map((p) => h('button', { class: 'cmp-thumb' + (p === a ? ' a' : '') + (p === b ? ' b' : ''), onclick: () => { if (p === a || p === b) return; if (new Date(p.ts) < new Date(b.ts)) a = p; else b = p; haptic('light'); draw(); } },
      h('img', { src: photoURL(p) }), h('span', null, p === a ? 'A' : p === b ? 'B' : fmtDate(p.date)))));
  };
  draw();
  sheet(h('div', { class: 'compare' }, segmented([{ label: 'Slider', value: 'slider' }, { label: 'Fade', value: 'ghost' }, { label: 'Side by side', value: 'side' }], mode, (v) => { mode = v; draw(); }),
    stage, label, h('div', { class: 'muted tiny' }, 'Tap a thumbnail to change before/after.'), thumbs), { title: 'Compare', tall: true });
}
