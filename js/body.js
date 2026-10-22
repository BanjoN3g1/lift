import { h, $, icon, haptic, toast, sheet, segmented, lineChart, barChart, confirmSheet } from './ui.js';
import { S, derive, proteinTotal, U } from './store.js';
import { db } from './db.js';
import * as E from './engine.js';
import { app } from './app.js';
import { photos } from './photos.js';
export { openCamera, openCompare } from './photos.js';

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
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * E.DAY); const k = E.dayKey(d); days.push({ y: proteinTotal(k), label: i % 2 ? '' : String(d.getDate()), hl: i === 0 && proteinTotal(k) >= S.settings.nutrition.protein }); }
  const logged = days.filter((d) => d.y > 0);
  const avg = logged.length ? logged.reduce((a, d) => a + d.y, 0) / logged.length : 0;
  body.append(h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Protein · 14 days'), h('div', { class: 'muted tiny' }, logged.length ? `avg ${Math.round(avg)} g on logged days` : 'log in Fuel')),
    barChart(days, { target: S.settings.nutrition.protein, color: '#FF375F', color2: '#FF9F0A', height: 110 })));

  if (S.body.length) body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Entries'), h('div', { class: 'list' }, [...S.body].reverse().slice(0, 30).map((b) => h('div', { class: 'row' },
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, fmtDate(b.date, { weekday: 'short', month: 'short', day: 'numeric' })),
      h('div', { class: 'muted tiny mono' }, [b.weight ? `${b.weight} ${b.wUnit}` : null, b.waist ? `waist ${b.waist} ${b.waistUnit}` : null].filter(Boolean).join(' · '))),
    h('button', { class: 'icon-btn', 'aria-label': 'Delete entry', onclick: async () => { await db.del('body', b.id); S.body = S.body.filter((x) => x.id !== b.id); derive(); app.refresh(); } }, icon('trash', 16)))))));
}

