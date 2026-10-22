// UI primitives: DOM builder, sheets, toasts, haptics, charts, rings, confetti. No libraries.
export function h(tag, attrs, ...kids) {
  const el = tag.includes(':') ? document.createElementNS('http://www.w3.org/2000/svg', tag.split(':')[1]) : document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') { el[k] = !!v; }
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const svg = (tag, attrs, ...kids) => h('svg:' + tag, attrs, ...kids);

// Icons (SF-Symbols-ish line icons)
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  train: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11',
  chart: 'M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7',
  body: 'M12 5.5a2 2 0 1 0 0-.01M8 21l1.5-7L7 9.5h10L14.5 14 16 21M9.5 14h5',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  note: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5',
  flame: 'M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2 2 2.5C10 8 12 3 12 3z',
  timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  skip: 'M5 5l9 7-9 7zM18 5v14',
  close: 'M6 6l12 12M18 6 6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  plates: 'M4 12h16M7 7v10M10 5v14M14 5v14M17 7v10',
  fire: 'M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2 2 2.5C10 8 12 3 12 3z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4v3h-4z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  flip: 'M4 7h12l-3-3M20 17H8l3 3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  scale: 'M5 4h14l1 16H4zM9 9a3 3 0 0 1 6 0M12 9l1.5-2',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
};
export function icon(name, size = 22, cls = '') {
  return h('svg:svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ic ' + cls, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    h('svg:path', { d: P[name] || P.more }));
}

// ── Haptics. Android: Vibration API. iOS 18+: toggling a native <input switch> fires the Taptic Engine.
let hapticLabel;
export function haptic(kind = 'light') {
  const patterns = { light: 8, medium: 15, heavy: 25, success: [12, 60, 18], warn: [30, 50, 30], timer: [180, 90, 180, 90, 260] };
  try {
    if (navigator.vibrate && navigator.vibrate(patterns[kind] ?? 10)) return;
  } catch {}
  try {
    if (!hapticLabel) {
      hapticLabel = h('label', { 'aria-hidden': 'true', style: 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none' }, h('input', { type: 'checkbox', switch: '' }));
      document.body.appendChild(hapticLabel);
    }
    const times = kind === 'success' || kind === 'warn' ? 2 : kind === 'timer' ? 3 : 1;
    for (let i = 0; i < times; i++) setTimeout(() => hapticLabel.click(), i * 110);
  } catch {}
}

// ── Sound (generated, no files): short "ding" for timers
let actx;
export function unlockAudio() { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume().catch(() => {}); } catch {} }
export function beep() {
  try {
    unlockAudio(); if (!actx) return;
    const t = actx.currentTime;
    [0, 0.18].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = i ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.4);
    });
  } catch {}
}

// ── Toast
export function toast(msg, { icon: ic = null, ms = 2200, tone = '' } = {}) {
  const host = $('#toasts');
  const el = h('div', { class: 'toast ' + tone }, ic ? icon(ic, 18) : null, h('span', null, msg));
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, ms);
}

// ── Bottom sheet with drag-to-dismiss
export function sheet(content, { title = '', onClose, tall = false, actions = null } = {}) {
  const back = h('div', { class: 'sheet-back' });
  const body = h('div', { class: 'sheet-body' }, content);
  const head = h('div', { class: 'sheet-head' }, h('div', { class: 'grabber' }), title ? h('div', { class: 'sheet-title' }, title) : null,
    h('button', { class: 'icon-btn sheet-x', 'aria-label': 'Close', onclick: () => close() }, icon('close', 18)));
  const el = h('div', { class: 'sheet' + (tall ? ' tall' : ''), role: 'dialog' }, head, body, actions ? h('div', { class: 'sheet-actions' }, actions) : null);
  const wrap = h('div', { class: 'sheet-wrap' }, back, el);
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    wrap.classList.remove('open');
    el.style.transform = '';
    setTimeout(() => { wrap.remove(); if (!$('.sheet-wrap')) document.body.classList.remove('sheet-open'); }, 380);
    onClose && onClose();
  }
  back.addEventListener('click', close);
  // drag down to dismiss
  let y0 = null, dy = 0;
  head.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; el.style.transition = 'none'; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; el.style.transition = ''; y0 = null; if (dy > 110) close(); else el.style.transform = ''; };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  return { close, el, body };
}

export function confirmSheet(title, msg, okLabel = 'Confirm', danger = false, cancelLabel = 'Cancel') {
  return new Promise((res) => {
    let val = false;
    const s = sheet(h('div', { class: 'confirm' }, h('p', { class: 'muted' }, msg)), {
      title, onClose: () => res(val),
      actions: [h('button', { class: 'btn ghost', onclick: () => s.close() }, cancelLabel),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { val = true; s.close(); } }, okLabel)],
    });
  });
}

export function promptSheet(title, fields, okLabel = 'Save') {
  return new Promise((res) => {
    let val = null;
    const inputs = fields.map((f) => h('input', { class: 'input', type: f.type || 'text', inputmode: f.inputmode, placeholder: f.placeholder || '', value: f.value ?? '' }));
    const s = sheet(h('div', { class: 'form' }, fields.map((f, i) => h('label', { class: 'form-row' }, h('span', null, f.label), inputs[i]))), {
      title, onClose: () => res(val),
      actions: [h('button', { class: 'btn ghost', onclick: () => s.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { val = inputs.map((x) => x.value); s.close(); } }, okLabel)],
    });
    setTimeout(() => inputs[0]?.focus(), 350);
  });
}

// ── Ring
let gid = 0;
export function ring(pct, { size = 120, stroke = 12, colors = ['#30D158', '#A6FF4D'], track = 'rgba(255,255,255,0.09)', children = null, pct2 = null, colors2 = ['#0A84FF', '#64D2FF'] } = {}) {
  const id = 'rg' + (++gid);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const r2 = r - stroke - 3, c2 = 2 * Math.PI * r2;
  const mk = (rad, circ, p, grad) => [
    svg('circle', { cx: size / 2, cy: size / 2, r: rad, stroke: track, 'stroke-width': stroke, fill: 'none' }),
    svg('circle', { class: 'ring-arc', cx: size / 2, cy: size / 2, r: rad, stroke: `url(#${grad})`, 'stroke-width': stroke, fill: 'none', 'stroke-linecap': 'round',
      'stroke-dasharray': circ, 'stroke-dashoffset': circ, 'data-off': circ * (1 - Math.min(1, Math.max(0, p))), transform: `rotate(-90 ${size / 2} ${size / 2})` }),
  ];
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'ring' },
    svg('defs', null,
      svg('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 }, svg('stop', { offset: 0, 'stop-color': colors[0] }), svg('stop', { offset: 1, 'stop-color': colors[1] })),
      svg('linearGradient', { id: id + 'b', x1: 0, y1: 0, x2: 1, y2: 1 }, svg('stop', { offset: 0, 'stop-color': colors2[0] }), svg('stop', { offset: 1, 'stop-color': colors2[1] }))),
    mk(r, c, pct, id), pct2 != null ? mk(r2, c2, pct2, id + 'b') : null);
  const wrap = h('div', { class: 'ring-wrap', style: { width: size + 'px', height: size + 'px' } }, s, children ? h('div', { class: 'ring-center' }, children) : null);
  requestAnimationFrame(() => setTimeout(() => s.querySelectorAll('.ring-arc').forEach((a) => a.setAttribute('stroke-dashoffset', a.dataset.off)), 60));
  return wrap;
}

// ── Charts
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.18;
    d += ` C${x1 + (x2 - x0) * t},${y1 + (y2 - y0) * t} ${x2 - (x3 - x1) * t},${y2 - (y3 - y1) * t} ${x2},${y2}`;
  }
  return d;
}
export function lineChart(points, { height = 170, color = '#0A84FF', color2 = '#64D2FF', fmt = (v) => v.toFixed(0), unit = '', ref = null, refLabel = '', dateFmt } = {}) {
  const W = 340, H = height, pad = { l: 8, r: 8, t: 22, b: 20 };
  const wrap = h('div', { class: 'chart' });
  if (!points.length) { wrap.appendChild(h('div', { class: 'chart-empty' }, 'Log a session to see your trend')); return wrap; }
  const id = 'lc' + (++gid);
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y).concat(ref != null ? [ref] : []);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const span = Math.max(1, y1 - y0); y0 -= span * 0.15; y1 += span * 0.2;
  const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const pts = points.map((p) => [X(p.x), Y(p.y)]);
  const line = smoothPath(pts);
  const area = line + ` L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' },
    svg('defs', null,
      svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('stop', { offset: 0, 'stop-color': color, 'stop-opacity': 0.45 }), svg('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 })),
      svg('linearGradient', { id: id + 's', x1: 0, y1: 0, x2: 1, y2: 0 }, svg('stop', { offset: 0, 'stop-color': color }), svg('stop', { offset: 1, 'stop-color': color2 }))),
    [0.25, 0.5, 0.75].map((f) => svg('line', { x1: 0, x2: W, y1: pad.t + f * (H - pad.t - pad.b), y2: pad.t + f * (H - pad.t - pad.b), stroke: 'rgba(255,255,255,0.06)' })),
    ref != null ? [svg('line', { x1: 0, x2: W, y1: Y(ref), y2: Y(ref), stroke: 'rgba(255,214,10,0.6)', 'stroke-dasharray': '4 5' }),
      svg('text', { x: W - 6, y: Y(ref) - 5, 'text-anchor': 'end', class: 'chart-ref' }, refLabel)] : null,
    svg('path', { d: area, fill: `url(#${id})`, class: 'chart-area' }),
    svg('path', { d: line, fill: 'none', stroke: `url(#${id}s)`, 'stroke-width': 3, 'stroke-linecap': 'round', class: 'chart-line', pathLength: 1 }),
    pts.map(([x, y], i) => svg('circle', { cx: x, cy: y, r: i === pts.length - 1 ? 4.5 : 2.6, fill: i === pts.length - 1 ? '#fff' : color2, class: 'chart-dot' })));
  const tip = h('div', { class: 'chart-tip' });
  const cursor = h('div', { class: 'chart-cursor' });
  wrap.append(s, cursor, tip);
  const show = (clientX) => {
    const r = s.getBoundingClientRect();
    const fx = ((clientX - r.left) / r.width) * W;
    let bi = 0, bd = 1e9; pts.forEach(([x], i) => { const d = Math.abs(x - fx); if (d < bd) { bd = d; bi = i; } });
    const p = points[bi]; const px = (pts[bi][0] / W) * r.width; const py = (pts[bi][1] / H) * r.height;
    tip.textContent = `${fmt(p.y)}${unit} · ${dateFmt ? dateFmt(p.x) : new Date(p.x).toLocaleDateString()}`;
    tip.style.left = Math.min(r.width - 70, Math.max(70, px)) + 'px'; tip.style.top = Math.max(0, py - 34) + 'px';
    cursor.style.left = px + 'px'; wrap.classList.add('scrub');
  };
  wrap.addEventListener('pointerdown', (e) => show(e.clientX));
  wrap.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') show(e.clientX); });
  wrap.addEventListener('pointerleave', () => wrap.classList.remove('scrub'));
  wrap.addEventListener('pointerup', () => setTimeout(() => wrap.classList.remove('scrub'), 1200));
  return wrap;
}
export function barChart(points, { height = 120, color = '#5E5CE6', color2 = '#BF5AF2', target = null, labels = true } = {}) {
  const W = 340, H = height, pad = 18;
  const wrap = h('div', { class: 'chart bars' });
  if (!points.length) { wrap.appendChild(h('div', { class: 'chart-empty' }, 'No data yet')); return wrap; }
  const id = 'bc' + (++gid);
  const max = Math.max(...points.map((p) => p.y), target || 0) * 1.12 || 1;
  const bw = (W - 8) / points.length;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' },
    svg('defs', null, svg('linearGradient', { id, x1: 0, y1: 1, x2: 0, y2: 0 }, svg('stop', { offset: 0, 'stop-color': color }), svg('stop', { offset: 1, 'stop-color': color2 }))),
    target ? svg('line', { x1: 0, x2: W, y1: H - pad - (target / max) * (H - pad - 6), y2: H - pad - (target / max) * (H - pad - 6), stroke: 'rgba(255,255,255,0.35)', 'stroke-dasharray': '3 4' }) : null,
    points.map((p, i) => {
      const bh = Math.max(2, (p.y / max) * (H - pad - 6));
      return svg('rect', { x: 4 + i * bw + bw * 0.18, y: H - pad - bh, width: bw * 0.64, height: bh, rx: Math.min(6, bw * 0.3), fill: p.hl ? '#fff' : `url(#${id})`, opacity: p.dim ? 0.35 : 1, class: 'bar', style: `animation-delay:${i * 30}ms` });
    }),
    labels ? points.map((p, i) => svg('text', { x: 4 + i * bw + bw / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-lbl' }, p.label || '')) : null);
  wrap.appendChild(s);
  return wrap;
}

// ── Confetti
export function confetti({ count = 140, colors = ['#0A84FF', '#30D158', '#FFD60A', '#FF375F', '#BF5AF2', '#64D2FF'] } = {}) {
  const c = h('canvas', { class: 'confetti' });
  document.body.appendChild(c);
  const dpr = devicePixelRatio || 1; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.38, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  (function frame(t) {
    const el = t - t0; ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - el / 2200); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    if (el < 2200) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

export function segmented(options, value, onChange, cls = '') {
  const el = h('div', { class: 'seg ' + cls, role: 'tablist' });
  const pill = h('div', { class: 'seg-pill' });
  el.appendChild(pill);
  const btns = options.map((o) => h('button', { class: 'seg-btn' + (o.value === value ? ' on' : ''), role: 'tab', onclick: (e) => { e.stopPropagation(); if (o.value === value) return; value = o.value; sync(); haptic('light'); onChange(o.value); } }, o.label));
  btns.forEach((b) => el.appendChild(b));
  function sync() {
    const i = options.findIndex((o) => o.value === value);
    btns.forEach((b, j) => b.classList.toggle('on', j === i));
    pill.style.width = `calc(${100 / options.length}% - 4px)`;
    pill.style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`;
    pill.style.opacity = i < 0 ? 0 : 1;
  }
  sync();
  return el;
}

export function toggle(on, onChange, label = '') {
  const el = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on, 'aria-label': label, onclick: (e) => { e.stopPropagation(); on = !on; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); haptic('light'); onChange(on); } }, h('span'));
  return el;
}
