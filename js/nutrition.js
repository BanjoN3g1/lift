// Nutrition tab: daily log, quick add, favorites, food search (bundled USDA FNDDS + optional Open Food Facts),
// barcode scan, drinks, history. All logs stay in IndexedDB on this device.
import { h, $, $$, icon, haptic, toast, sheet, confirmSheet, segmented, toggle, ring, barChart } from './ui.js';
import { S, saveSettings, nDay, putNDay, nTotals, isTrainingDay, kcalTarget, mealFor, today, U, stepsFor, setSteps, parseSteps, LOW_STEPS } from './store.js';
import * as E from './engine.js';
import { app } from './app.js';

const MEALS = [{ value: 'breakfast', label: 'Breakfast' }, { value: 'lunch', label: 'Lunch' }, { value: 'snack', label: 'Snack' }, { value: 'dinner', label: 'Dinner' }];
const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.value, m.label]));
const SRC = {
  usda: { label: 'USDA FNDDS', cls: 'usda' }, off: { label: 'Open Food Facts · user-contributed', cls: 'off' },
  quick: { label: 'Quick add', cls: 'quick' }, fav: { label: 'Favorite', cls: 'fav' }, custom: { label: 'Your entry', cls: 'quick' },
};
const r0 = (v) => Math.round(+v || 0);
const r1 = (v) => Math.round((+v || 0) * 10) / 10;
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayLabel = (k) => { const t = today(); const y = E.dayKey(new Date(Date.now() - E.DAY)); return k === t ? 'Today' : k === y ? 'Yesterday' : new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
const shiftDay = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return E.dayKey(d); };
const T = () => S.settings.nutrition;

// ───────────────────────── Food database (bundled USDA FNDDS, lazy-loaded, cached offline by the SW)
let FOODS = null;
export async function foods() {
  if (FOODS) return FOODS;
  const res = await fetch('data/fndds.json');
  FOODS = (await res.json()).map((f) => ({ ...f, _l: f.n.toLowerCase() }));
  return FOODS;
}
const MIXED = /mixed|sandwich|burger|pizza|burrito|taco|fried rice|lo\/chow mein|pasta mixed|soups|stir-fry|restaurant|frozen meal/i;
function fromFNDDS(f) {
  return { name: f.n, per100: { kcal: f.k, p: f.p, c: f.c, f: f.f, fb: f.fb || 0, al: f.al || 0 }, portions: f.pt || [], src: 'usda', ref: f.i,
    est: MIXED.test(f.g || '') || /\bNFS\b/.test(f.n), cat: f.g };
}
const ALIAS = [[/\bprotein bars?\b/, 'nutrition bar'], [/\bprotein shakes?\b/, 'shake high protein'], [/\blox\b/, 'salmon smoked'], [/\boj\b/, 'orange juice'],
  [/\bboba\b/, 'bubble tea'], [/\bfries\b/, 'french fries'], [/\bcoke\b/, 'cola'], [/\bpb\b/, 'peanut butter'], [/\bpbj\b/, 'peanut butter and jelly']];
function searchLocal(q, list, limit = 40) {
  let ql = q.toLowerCase(); for (const [re, to] of ALIAS) ql = ql.replace(re, to);
  const r = searchAll(ql.split(/[\s,]+/).filter(Boolean), list, limit);
  if (r.length || ql.split(/\s+/).length < 2) return r;
  // multi-food query ("bagel lox cream cheese"): fall back to foods matching most of the words
  const toks = ql.split(/[\s,]+/).filter((t) => t.length > 2), out = [];
  for (const f of list) { const hit = toks.filter((t) => f._l.includes(t)).length; if (hit) out.push([-hit * 100 + f._l.length / 20 + (f._l.startsWith(toks.find((t) => f._l.includes(t))) ? 0 : 10), f]); }
  return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}
function searchAll(toks, list, limit) {
  if (!toks.length) return [];
  const out = [];
  for (const f of list) {
    if (!toks.every((t) => f._l.includes(t))) continue;
    let s = f._l.startsWith(toks[0]) ? 0 : 10;
    s += f._l.length / 20 + (f._l.includes(',') ? 1 : 0) + (/\bNFS\b/i.test(f.n) ? -2 : 0);
    out.push([s, f]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

// ───────────────────────── Open Food Facts (optional, online; sends only the query text or barcode)
const OFF = 'https://world.openfoodfacts.org';
function fromOFF(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null);
  const portions = [];
  if (+p.serving_quantity > 0) portions.push([`1 serving${p.serving_size ? ` (${p.serving_size})` : ''}`, +p.serving_quantity]);
  return { name: [p.product_name || 'Unnamed product', Array.isArray(p.brands) ? p.brands[0] : (p.brands || '').split(',')[0]].filter(Boolean).join(' · '),
    per100: { kcal: kcal ?? 0, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, fb: n.fiber_100g || 0, al: n.alcohol_100g || 0 },
    portions, src: 'off', ref: p.code, est: false, noKcal: kcal == null };
}
async function offSearch(q) {
  const fields = 'code,product_name,brands,nutriments,serving_quantity,serving_size';
  const tries = [
    [`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&fields=${fields}`, (d) => d.hits],
    [`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`, (d) => d.products],
  ];
  let lastErr;
  for (const [url, pick] of tries) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('Open Food Facts search is busy (' + res.status + ')');
      return (pick(await res.json()) || []).filter((p) => p.product_name && p.nutriments).map(fromOFF);
    } catch (e) { lastErr = e; } finally { clearTimeout(tm); }
  }
  throw lastErr;
}
async function offBarcode(code) {
  const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('Lookup failed (' + res.status + ')');
  const d = await res.json();
  if (d.status !== 1 || !d.product) return null;
  return fromOFF(d.product);
}

// ───────────────────────── Page
export function renderNutrition(page, opts) {
  const seg = opts.seg || app.nutSeg || 'today';
  app.nutSeg = seg;
  const day = app.nutDay || today();
  page.append(h('header', { class: 'large-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Calories · protein · recomp'), h('h1', null, 'Nutrition')),
    h('button', { class: 'icon-btn glass-btn', 'aria-label': 'Nutrition targets', onclick: targetsSheet }, icon('gear', 22))));
  page.append(segmented([{ label: 'Day', value: 'today' }, { label: 'History', value: 'history' }], seg, (v) => { app.nutSeg = v; app.go('nutrition', { force: true, seg: v }); }));
  const body = h('div', { class: 'stack' });
  page.append(body);
  if (seg === 'history') history(body); else dayView(body, day);
}
const rerender = () => app.refresh();

function dayView(body, k) {
  const tot = nTotals(k), tgt = T(), kt = kcalTarget(k), train = isTrainingDay(k);
  const d = nDay(k);
  // Day switcher
  body.append(h('div', { class: 'day-nav' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => { app.nutDay = shiftDay(k, -1); rerender(); } }, icon('back', 20)),
    h('div', { class: 'day-nav-t' }, h('div', { class: 'title-s' }, dayLabel(k)),
      h('button', { class: 'pill tiny day-type ' + (train ? 'train' : ''), onclick: async () => { d.training = !train; await putNDay(d); haptic('light'); rerender(); } },
        (train ? 'Training day' : 'Rest day') + (d.training == null ? ' · auto' : ' · set'), ' ⇄')),
    h('button', { class: 'icon-btn', 'aria-label': 'Next day', disabled: k >= today(), onclick: () => { app.nutDay = shiftDay(k, 1); rerender(); } }, icon('chevron', 20))));
  // Rings
  const kLeft = kt - tot.kcal;
  body.append(h('section', { class: 'card nut-rings' },
    ring(Math.min(1, tot.kcal / kt), { size: 150, stroke: 15, colors: ['#FF9F0A', '#FF375F'], pct2: Math.min(1, tot.p / tgt.protein), colors2: ['#30D158', '#B4FF5A'],
      children: [h('div', { class: 'ring-num' }, String(r0(tot.kcal))), h('div', { class: 'ring-sub' }, `of ${kt} kcal`)] }),
    h('div', { class: 'grow nut-legend' },
      legend('#FF9F0A', 'Calories', kLeft >= 0 ? `${r0(kLeft)} left` : `${r0(-kLeft)} over`, `${train ? 'training' : 'rest'} target ${kt}`),
      legend('#30D158', 'Protein', `${r0(tot.p)} / ${tgt.protein} g`, tot.p >= tgt.protein ? 'target hit ✓' : tot.p >= tgt.proteinFloor ? `floor ${tgt.proteinFloor} g hit ✓` : `${r0(tgt.proteinFloor - tot.p)} g to the ${tgt.proteinFloor} g floor`),
      tot.missingKcal ? h('div', { class: 'muted tiny' }, `${tot.missingKcal} item${tot.missingKcal > 1 ? 's' : ''} logged without calories`) : null)));
  body.append(h('section', { class: 'card macro-bars' },
    macroBar('Protein', tot.p, tgt.protein, 'g', tgt.proteinFloor, '#30D158'),
    macroBar('Fat', tot.f, tgt.fatMin, 'g', null, '#FFD60A', 'min'),
    macroBar('Fiber', tot.fb, tgt.fiber, 'g', null, '#64D2FF'),
    h('div', { class: 'row-between muted tiny' }, h('span', null, `Carbs ${r0(tot.c)} g`), tot.al ? h('span', null, `Alcohol ${r1(tot.al)} g · ${r0(tot.al * 7)} kcal`) : null)));
  body.append(stepsCard(k));
  // Quick add + actions
  body.append(h('section', { class: 'card' },
    h('div', { class: 'eyebrow' }, 'Quick add'),
    h('div', { class: 'quick-grid' },
      h('button', { class: 'qbtn press', onclick: () => quickAdd(k, 'p') }, h('b', null, '+ Protein'), h('span', { class: 'muted tiny' }, 'grams only')),
      h('button', { class: 'qbtn press', onclick: () => quickAdd(k, 'kcal') }, h('b', null, '+ Calories'), h('span', { class: 'muted tiny' }, 'kcal only')),
      h('button', { class: 'qbtn press', onclick: () => quickAdd(k, 'both') }, h('b', null, '+ Both'), h('span', { class: 'muted tiny' }, 'kcal + protein'))),
    favChips(k),
    h('div', { class: 'action-grid' },
      h('button', { class: 'abtn press', onclick: () => searchSheet(k) }, icon('note', 20), 'Search food'),
      h('button', { class: 'abtn press', onclick: () => barcodeSheet(k) }, icon('plates', 20), 'Barcode'),
      h('button', { class: 'abtn press', onclick: () => drinksSheet(k) }, icon('drop', 20), 'Drinks'),
      h('button', { class: 'abtn press', onclick: () => copyDay(shiftDay(k, -1), k) }, icon('swap', 20), 'Copy yesterday'))));
  // Meals
  const groups = MEALS.map((m) => ({ ...m, items: d.entries.filter((e) => (e.meal || 'snack') === m.value).sort((a, b) => a.t - b.t) })).filter((g) => g.items.length);
  if (!groups.length) body.append(h('section', { class: 'card empty' }, icon('drop', 30), h('div', { class: 'title-s' }, 'Nothing logged ' + (k === today() ? 'yet today' : 'this day')),
    h('div', { class: 'muted small' }, 'Quick-add numbers, tap a favorite, search the USDA list, or copy yesterday if you ate the same.')));
  for (const g of groups) {
    const gt = g.items.reduce((a, e) => ({ kcal: a.kcal + (+e.kcal || 0), p: a.p + (+e.p || 0) }), { kcal: 0, p: 0 });
    body.append(h('section', { class: 'card meal' },
      h('div', { class: 'row-between' }, h('div', null, h('div', { class: 'title-s' }, g.label), h('div', { class: 'muted tiny' }, `${r0(gt.kcal)} kcal · ${r0(gt.p)} g protein`)),
        h('button', { class: 'btn small ghost', onclick: () => repeatMeal(g.items, k) }, icon('plus', 14), k === today() ? ' Repeat' : ' Log today')),
      h('div', { class: 'list' }, g.items.map((e) => entryRow(e, k)))));
  }
  const recent = recentMeals(k);
  if (recent.length) body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Recent meals · one tap to log again'),
    h('div', { class: 'list' }, recent.map((m) => h('button', { class: 'row press', onclick: () => repeatMeal(m.items, k, m.meal) },
      h('div', { class: 'grow' }, h('div', { class: 'title-s' }, m.items.map((e) => e.name).join(' + ')), h('div', { class: 'muted tiny' }, `${MEAL_LABEL[m.meal]} · ${dayLabel(m.day)} · ${r0(m.kcal)} kcal · ${r0(m.p)} g`)),
      icon('plus', 18))))));
  body.append(h('div', { class: 'foot muted small' }, icon('lock', 13), ' Logged only on this phone. Online lookups send just the search text or barcode.'));
}

function legend(color, label, big, small) {
  return h('div', { class: 'legend' }, h('span', { class: 'lg-dot', style: { background: color } }), h('div', null, h('div', { class: 'muted tiny' }, label), h('div', { class: 'title-s' }, big), h('div', { class: 'muted tiny' }, small)));
}
function macroBar(label, v, target, unit, floor, color, kind) {
  const pct = Math.min(1, v / target);
  return h('div', { class: 'mbar' }, h('div', { class: 'row-between' }, h('span', { class: 'small' }, label), h('span', { class: 'muted tiny mono' }, `${r0(v)} / ${target} ${unit}${kind === 'min' ? ' min' : ''}`)),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: pct * 100 + '%', background: color } }),
      floor ? h('div', { class: 'bar-mark', style: { left: (floor / target) * 100 + '%' }, title: 'floor' }) : null));
}
function srcChip(e) {
  const s = SRC[e.src] || SRC.custom;
  return h('span', { class: 'src ' + s.cls }, s.label + (e.est ? ' · estimate' : ''));
}
function entryRow(e, k) {
  return h('button', { class: 'row press entry', onclick: () => editEntry(e, k) },
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, e.name), h('div', { class: 'muted tiny' }, [e.qtyLabel, new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')), srcChip(e)),
    h('div', { class: 'entry-n mono' }, h('div', null, e.kcal == null ? '—' : r0(e.kcal), h('span', { class: 'muted tiny' }, ' kcal')), h('div', { class: 'muted tiny' }, `${r0(e.p)} g P`)));
}

async function addEntries(k, items, { toast: msg } = {}) {
  const d = nDay(k);
  const base = k === today() ? Date.now() : new Date(k + 'T12:00').getTime();
  items.forEach((it, i) => d.entries.push({ ...it, id: uid() + i, t: it.keepTime && k !== today() ? it.t : base + i }));
  await putNDay(d); haptic('success');
  if (msg) toast(msg, { icon: 'check' });
  rerender();
}

// ───────────────────────── Steps (Apple Health via iOS Shortcut, or typed)
const fmtN = (n) => Math.round(n).toLocaleString();
function stepsCard(k) {
  const n = stepsFor(k), low = n != null && n < LOW_STEPS, src = S.nutrition[k]?.steps?.src;
  return h('section', { class: 'card steps-card' },
    h('div', { class: 'row-between' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Steps'),
        h('div', { class: 'title-s' }, n == null ? 'Not synced' : fmtN(n), n != null ? h('span', { class: 'pill tiny ' + (low ? 'warn soft' : 'train') }, low ? 'low · <5k' : 'ok') : null),
        h('div', { class: 'muted tiny' }, n == null ? 'Run the “Lift steps” Shortcut, paste, or type it' : (src === 'shortcut' ? 'from Apple Health via Shortcut' : src === 'paste' ? 'pasted from Shortcut' : 'entered by hand') + (low ? ' · low-movement day: lean toward the rest-day target' : ''))),
      h('div', { class: 'row gap-s' },
        h('button', { class: 'btn small ghost', onclick: () => pasteSteps(k) }, 'Paste'),
        h('button', { class: 'btn small ghost', onclick: () => editSteps(k) }, n == null ? 'Add' : 'Edit'))),
    n != null ? h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill' + (low ? '' : ' green'), style: { width: Math.min(100, (n / 10000) * 100) + '%' } })) : null);
}
async function pasteSteps(k) {
  let txt = '';
  try { txt = await navigator.clipboard.readText(); } catch { toast('Clipboard not available — tap Edit and type the number'); return; }
  let rows = parseSteps(txt);
  if (!rows.length && /^\s*[\d,.]+\s*$/.test(txt)) rows = parseSteps(`${k} ${txt.trim()}`);
  if (!rows.length) { toast('No steps found on the clipboard'); return; }
  for (const [d, n] of rows) await setSteps(d, n, 'paste');
  haptic('success'); toast(rows.length > 1 ? `Saved steps for ${rows.length} days` : `Saved ${fmtN(rows[0][1])} steps`, { icon: 'check' }); app.refresh();
}
function editSteps(k) {
  const inp = h('input', { class: 'input num big-in', inputmode: 'numeric', value: stepsFor(k) ?? '', placeholder: '0' });
  const s = sheet(h('div', { class: 'stack' }, h('div', { class: 'muted small' }, dayLabel(k)), inp,
    h('div', { class: 'muted tiny' }, 'From the Health app: Browse → Activity → Steps. Stored only on this phone.')), {
    title: 'Steps', actions: [
      stepsFor(k) != null ? h('button', { class: 'btn ghost', onclick: async () => { await setSteps(k, null); s.close(); app.refresh(); } }, 'Clear') : null,
      h('button', { class: 'btn primary', onclick: async () => { const v = parseInt(inp.value.replace(/\D/g, ''), 10); if (!Number.isFinite(v)) return; await setSteps(k, v, 'manual'); s.close(); haptic('success'); app.refresh(); } }, 'Save')].filter(Boolean) });
  setTimeout(() => inp.focus(), 300);
}

// ───────────────────────── Quick add + favorites
function quickAdd(k, mode) {
  let meal = k === today() ? mealFor() : 'snack';
  const kIn = h('input', { class: 'input num big-in', inputmode: 'numeric', placeholder: 'kcal' });
  const pIn = h('input', { class: 'input num big-in', inputmode: 'decimal', placeholder: 'g' });
  const nIn = h('input', { class: 'input', placeholder: 'What was it? (optional)' });
  let fav = false;
  const s = sheet(h('div', { class: 'stack' },
    h('div', { class: 'qa-fields' },
      mode !== 'p' ? h('label', null, h('span', { class: 'muted tiny' }, 'Calories'), kIn) : null,
      mode !== 'kcal' ? h('label', null, h('span', { class: 'muted tiny' }, 'Protein (g)'), pIn) : null),
    nIn, segmented(MEALS, meal, (v) => (meal = v)),
    h('div', { class: 'form-row' }, h('span', null, 'Also save as a favorite button'), toggle(false, (v) => (fav = v)))), {
    title: mode === 'p' ? 'Add protein' : mode === 'kcal' ? 'Add calories' : 'Quick add',
    actions: [h('button', { class: 'btn primary', onclick: async () => {
      const kcal = kIn.value === '' ? null : +kIn.value, p = pIn.value === '' ? 0 : +pIn.value.replace(',', '.');
      if (!(kcal > 0) && !(p > 0)) { toast('Enter a number'); return; }
      const name = nIn.value.trim() || (mode === 'p' ? 'Protein' : 'Quick add');
      if (fav) { T().favorites.push({ id: uid(), name, kcal, p }); await saveSettings(); }
      s.close(); await addEntries(k, [{ name, kcal, p, meal, src: 'quick' }], { toast: `Added ${[kcal ? kcal + ' kcal' : '', p ? p + ' g protein' : ''].filter(Boolean).join(' · ')}` });
    } }, 'Add')],
  });
  setTimeout(() => (mode === 'p' ? pIn : kIn).focus(), 380);
}
function favChips(k) {
  const favs = T().favorites || [];
  return h('div', { class: 'stack-s' },
    h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Favorites'), h('button', { class: 'btn small ghost', onclick: editFavorites }, 'Edit')),
    favs.length ? h('div', { class: 'chips' }, favs.map((f) => h('button', { class: 'chip press fav', onclick: () => addEntries(k, [{ name: f.name, kcal: f.kcal ?? null, p: +f.p || 0, c: f.c, f: f.f, fb: f.fb, meal: k === today() ? mealFor() : 'snack', src: 'fav' }], { toast: `+ ${f.name}` }) },
      h('span', null, f.name), h('span', { class: 'muted tiny' }, [f.kcal != null ? `${f.kcal} kcal` : null, f.p ? `${f.p} g` : null].filter(Boolean).join(' · ')))))
      : h('div', { class: 'muted tiny' }, 'Save things you eat often (Fairlife, your usual bar, a lunch order) with the numbers from the label. Tap Edit, or flip “save as favorite” when adding.'));
}
function editFavorites() {
  const favs = structuredClone(T().favorites || []);
  const list = h('div', { class: 'list' });
  const draw = () => list.replaceChildren(...favs.map((f, i) => h('div', { class: 'fav-edit' },
    h('input', { class: 'input', value: f.name, placeholder: 'Name', oninput: (e) => (f.name = e.target.value) }),
    h('input', { class: 'input num', value: f.kcal ?? '', inputmode: 'numeric', placeholder: 'kcal', oninput: (e) => (f.kcal = e.target.value === '' ? null : +e.target.value) }),
    h('input', { class: 'input num', value: f.p ?? '', inputmode: 'decimal', placeholder: 'g P', oninput: (e) => (f.p = +e.target.value || 0) }),
    h('button', { class: 'icon-btn', 'aria-label': 'Delete favorite', onclick: () => { favs.splice(i, 1); draw(); } }, icon('trash', 18)))),
    h('button', { class: 'btn ghost', onclick: () => { favs.push({ id: uid(), name: '', kcal: null, p: 0 }); draw(); } }, icon('plus', 16), ' Add favorite'));
  draw();
  const s = sheet(h('div', null, h('p', { class: 'muted small pad' }, 'Name · calories · protein per serving, from the label. Leave calories blank if you only track protein for it.'), list), {
    title: 'Favorites', tall: true,
    actions: [h('button', { class: 'btn primary', onclick: async () => { T().favorites = favs.filter((f) => f.name.trim() && (f.kcal > 0 || f.p > 0)).map((f) => ({ ...f, name: f.name.trim() })); await saveSettings(); s.close(); rerender(); } }, 'Save')],
  });
}

// ───────────────────────── Entry edit
function editEntry(e, k) {
  const d = nDay(k);
  const f = { kcal: h('input', { class: 'input num', inputmode: 'numeric', value: e.kcal ?? '' }), p: h('input', { class: 'input num', inputmode: 'decimal', value: e.p ?? '' }),
    c: h('input', { class: 'input num', inputmode: 'decimal', value: e.c ?? '' }), f: h('input', { class: 'input num', inputmode: 'decimal', value: e.f ?? '' }), fb: h('input', { class: 'input num', inputmode: 'decimal', value: e.fb ?? '' }) };
  const name = h('input', { class: 'input', value: e.name });
  let meal = e.meal || 'snack';
  const s = sheet(h('div', { class: 'stack' }, name, srcChip(e), e.qtyLabel ? h('div', { class: 'muted small' }, e.qtyLabel) : null,
    h('div', { class: 'group' }, [['Calories', 'kcal', 'kcal'], ['Protein', 'p', 'g'], ['Carbs', 'c', 'g'], ['Fat', 'f', 'g'], ['Fiber', 'fb', 'g']].map(([l, key, u]) =>
      h('label', { class: 'form-row' }, h('span', null, l), h('div', { class: 'with-suffix' }, f[key], h('span', { class: 'muted' }, u))))),
    segmented(MEALS, meal, (v) => (meal = v)),
    h('div', { class: 'two-btn' },
      h('button', { class: 'btn ghost', onclick: async () => { T().favorites.push({ id: uid(), name: name.value, kcal: f.kcal.value === '' ? null : +f.kcal.value, p: +f.p.value || 0, c: +f.c.value || 0, f: +f.f.value || 0, fb: +f.fb.value || 0 }); await saveSettings(); toast('Saved as favorite', { icon: 'check' }); } }, 'Save as favorite'),
      h('button', { class: 'btn ghost', onclick: async () => { s.close(); await addEntries(today(), [{ ...e, id: undefined }], { toast: 'Logged again today' }); } }, 'Log again today'))), {
    title: 'Edit item',
    actions: [h('button', { class: 'btn danger-ghost', onclick: async () => { d.entries = d.entries.filter((x) => x.id !== e.id); await putNDay(d); s.close(); rerender(); toast('Removed'); } }, icon('trash', 16), ' Delete'),
      h('button', { class: 'btn primary', onclick: async () => {
        Object.assign(e, { name: name.value.trim() || e.name, meal, kcal: f.kcal.value === '' ? null : +f.kcal.value, p: +f.p.value || 0, c: +f.c.value || 0, f: +f.f.value || 0, fb: +f.fb.value || 0 });
        await putNDay(d); s.close(); rerender();
      } }, 'Save')],
  });
}

// ───────────────────────── Copy / repeat
async function copyDay(from, to) {
  const src = nDay(from).entries;
  if (!src.length) { toast(`Nothing logged ${dayLabel(from).toLowerCase()}`); return; }
  if (!(await confirmSheet(`Copy ${dayLabel(from).toLowerCase()}?`, `Adds ${src.length} item${src.length > 1 ? 's' : ''} (${r0(src.reduce((a, e) => a + (+e.kcal || 0), 0))} kcal) to ${dayLabel(to).toLowerCase()}. You can delete anything you didn't eat.`, 'Copy'))) return;
  await addEntries(to, src.map(({ id, t, ...rest }) => rest), { toast: `Copied ${src.length} items` });
}
async function repeatMeal(items, k, meal) {
  const target = k === today() ? k : today();
  await addEntries(target, items.map(({ id, t, ...rest }) => ({ ...rest, meal: meal || rest.meal })), { toast: `Logged ${items.length} item${items.length > 1 ? 's' : ''} again` });
}
function recentMeals(k) {
  const seen = new Set(), out = [];
  for (let i = 1; i <= 10 && out.length < 4; i++) {
    const day = shiftDay(k, -i); const d = S.nutrition[day]; if (!d) continue;
    for (const m of MEALS) {
      const items = d.entries.filter((e) => e.meal === m.value && e.src !== 'quick');
      if (!items.length) continue;
      const key = items.map((e) => e.name).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      out.push({ day, meal: m.value, items, kcal: items.reduce((a, e) => a + (+e.kcal || 0), 0), p: items.reduce((a, e) => a + (+e.p || 0), 0) });
      if (out.length >= 4) break;
    }
  }
  return out;
}

// ───────────────────────── Search
function recentFoods() {
  const out = [], seen = new Set();
  const days = Object.keys(S.nutrition).sort().reverse().slice(0, 30);
  for (const k of days) for (const e of [...S.nutrition[k].entries].reverse()) {
    if (!e.per100 || seen.has(e.name)) continue; seen.add(e.name);
    out.push({ name: e.name, per100: e.per100, portions: e.portions || [], src: e.src, ref: e.ref, est: e.est });
    if (out.length >= 12) return out;
  }
  return out;
}
function foodRow(food, k, onPick) {
  return h('button', { class: 'row press', onclick: () => onPick(food) },
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, food.name),
      h('div', { class: 'muted tiny' }, `${r0(food.per100.kcal)} kcal · ${r1(food.per100.p)} g P per 100 g` + (food.portions[0] ? ` · ${food.portions[0][0]} = ${r0(food.portions[0][1])} g` : '')),
      srcChip(food)), icon('plus', 18));
}
export function searchSheet(k) {
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Search foods, e.g. pad thai, bagel, chicken', autocomplete: 'off' });
  const list = h('div', { class: 'list' });
  const offBox = h('div', { class: 'stack-s' });
  const pick = (food) => { s.close(); portionSheet(food, k); };
  let t;
  const run = async () => {
    const v = q.value.trim();
    offBox.replaceChildren();
    if (!v) { const rec = recentFoods(); list.replaceChildren(...(rec.length ? [h('div', { class: 'group-title' }, 'Recent'), ...rec.map((f) => foodRow(f, k, pick))] : [h('div', { class: 'muted small pad' }, 'About 5,300 generic & restaurant-style foods from USDA FNDDS are built in and work offline.')])); return; }
    const res = searchLocal(v, await foods()).map(fromFNDDS);
    list.replaceChildren(h('div', { class: 'group-title' }, `USDA FNDDS · ${res.length ? res.length + (res.length === 40 ? '+' : '') : 'no'} matches`), ...res.map((f) => foodRow(f, k, pick)));
    offBox.replaceChildren(h('button', { class: 'btn ghost', onclick: async (ev) => {
      if (!navigator.onLine) { toast('Offline — Open Food Facts needs a connection'); return; }
      ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Searching Open Food Facts…';
      try {
        const r = await offSearch(v);
        offBox.replaceChildren(h('div', { class: 'group-title' }, `Open Food Facts · ${r.length} products`), h('div', { class: 'muted tiny pad' }, 'Crowd-sourced label data — double-check against the package.'), ...r.map((f) => foodRow(f, k, pick)));
      } catch (err) { offBox.replaceChildren(h('div', { class: 'muted small pad' }, `${err.name === 'AbortError' ? 'Open Food Facts timed out' : 'Open Food Facts text search isn’t available right now'}. Barcode lookup (scan or type the number) still works, or enter the label manually.`)); }
    } }, icon('upload', 16), ' Search branded products online'),
    h('div', { class: 'muted tiny pad' }, 'Sends only the search text to Open Food Facts.'));
  };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 160); });
  const s = sheet(h('div', { class: 'stack' }, q, list, offBox,
    h('button', { class: 'btn ghost', onclick: () => { s.close(); customFood(k); } }, icon('edit', 16), ' Enter a food manually')), { title: 'Add food', tall: true });
  run(); setTimeout(() => q.focus(), 380);
}

function customFood(k) {
  const f = {}; const field = (key, ph) => (f[key] = h('input', { class: 'input num', inputmode: 'decimal', placeholder: ph }));
  const name = h('input', { class: 'input', placeholder: 'Name' });
  let meal = k === today() ? mealFor() : 'snack';
  const s = sheet(h('div', { class: 'stack' }, name, h('div', { class: 'group' }, [['Calories', 'kcal'], ['Protein g', 'p'], ['Carbs g', 'c'], ['Fat g', 'f'], ['Fiber g', 'fb']].map(([l, key]) => h('label', { class: 'form-row' }, h('span', null, l), field(key, '0')))),
    h('div', { class: 'muted tiny' }, 'Values for the whole portion you ate.'), segmented(MEALS, meal, (v) => (meal = v))), {
    title: 'Manual entry',
    actions: [h('button', { class: 'btn primary', onclick: async () => { if (!name.value.trim()) { toast('Add a name'); return; } s.close();
      await addEntries(k, [{ name: name.value.trim(), kcal: f.kcal.value === '' ? null : +f.kcal.value, p: +f.p.value || 0, c: +f.c.value || 0, f: +f.f.value || 0, fb: +f.fb.value || 0, meal, src: 'custom' }], { toast: 'Added' }); } }, 'Add')],
  });
}

// ───────────────────────── Portion picker
export function portionSheet(food, k, { defaultPortion = 0 } = {}) {
  const units = [...food.portions.map(([d, g]) => ({ label: d, g })), { label: 'grams', g: 1, isG: true }, { label: 'oz (weight)', g: 28.35 }];
  let ui = food.portions.length ? Math.min(defaultPortion, food.portions.length - 1) : units.findIndex((u) => u.isG);
  let qty = units[ui].isG ? 100 : 1;
  let meal = k === today() ? (food.drink ? 'snack' : mealFor()) : 'snack';
  const qIn = h('input', { class: 'input num huge', inputmode: 'decimal', value: qty });
  const unitSel = h('select', { class: 'input unit-sel' }, units.map((u, i) => h('option', { value: i, selected: i === ui }, u.isG ? 'grams' : `${u.label}${u.g !== 1 && !u.label.includes(' g') ? ` · ${r0(u.g)} g` : ''}`)));
  const out = h('div', { class: 'portion-out' });
  const grams = () => qty * units[ui].g;
  const calc = () => { const g = grams() / 100, p = food.per100; return { kcal: p.kcal * g, p: p.p * g, c: p.c * g, f: p.f * g, fb: p.fb * g, al: (p.al || 0) * g }; };
  const draw = () => {
    const m = calc();
    out.replaceChildren(...[h('div', { class: 'big-num' }, String(r0(m.kcal)), h('span', { class: 'muted small' }, ' kcal')),
      h('div', { class: 'macro-row' }, [['Protein', m.p], ['Carbs', m.c], ['Fat', m.f], ['Fiber', m.fb]].map(([l, v]) => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, r1(v)), h('div', { class: 'stat-l muted tiny' }, l + ' g')))),
      m.al ? h('div', { class: 'muted tiny' }, `Includes ${r1(m.al)} g alcohol (${r0(m.al * 7)} kcal)`) : null,
      h('div', { class: 'muted tiny' }, `${r0(grams())} g total`)].filter(Boolean));
  };
  const step = (dir) => { const u = units[ui]; const st = u.isG ? 10 : 0.5; qty = Math.max(0, Math.round((qty + dir * st) * 100) / 100); qIn.value = qty; haptic('light'); draw(); };
  qIn.addEventListener('input', () => { qty = +qIn.value.replace(',', '.') || 0; draw(); });
  unitSel.addEventListener('change', () => { ui = +unitSel.value; qty = units[ui].isG ? 100 : 1; qIn.value = qty; draw(); });
  draw();
  const s = sheet(h('div', { class: 'stack' },
    h('div', null, h('div', { class: 'title' }, food.name), srcChip(food)),
    food.est ? h('div', { class: 'pill warn soft' }, 'Estimate — USDA average recipe. Restaurant portions and oil vary a lot; round up if in doubt.') : null,
    food.src === 'off' ? h('div', { class: 'pill soft' }, 'User-contributed label data from Open Food Facts — check it against the package.') : null,
    food.noKcal ? h('div', { class: 'pill warn soft' }, 'No calorie value in this record — edit after adding.') : null,
    h('div', { class: 'qty-row' }, h('button', { class: 'step', onclick: () => step(-1) }, '−'), qIn, h('button', { class: 'step', onclick: () => step(1) }, '+')),
    unitSel, out, segmented(MEALS, meal, (v) => (meal = v))), {
    title: 'Portion', tall: true,
    actions: [h('button', { class: 'btn primary', onclick: async () => {
      if (!(grams() > 0)) { toast('Set an amount'); return; }
      const m = calc(); s.close();
      const u = units[ui];
      await addEntries(k, [{ name: food.name, kcal: food.noKcal ? null : r0(m.kcal), p: r1(m.p), c: r1(m.c), f: r1(m.f), fb: r1(m.fb), al: r1(m.al), meal, src: food.src, ref: food.ref, est: !!food.est,
        grams: r1(grams()), qtyLabel: u.isG ? `${r0(qty)} g` : `${qty} × ${u.label}`, per100: food.per100, portions: food.portions }], { toast: `Added ${food.name.split(',')[0]} · ${r0(m.kcal)} kcal` });
    } }, 'Add to log')],
  });
}

// ───────────────────────── Drinks
const DRINKS = [['Wine, red', 0], ['Wine, white', 0], ['Wine, rose', 0], ['Wine, sparkling', 0], ['Beer', 1], ['Beer, light', 1], ['Vodka', 0], ['Whiskey', 0], ['Tequila', 0], ['Gin', 0], ['Margarita', 0], ['Coffee, brewed', 0], ['Coffee, latte', 0]];
async function drinksSheet(k) {
  const all = await foods();
  const items = [];
  for (const [n, pi] of DRINKS) { const f = all.find((x) => x.n === n) || all.find((x) => x.n.startsWith(n + ',')) || all.find((x) => x.n.startsWith(n)); if (f && !items.some((i) => i.f === f)) items.push({ f, pi }); }
  const s = sheet(h('div', { class: 'stack' },
    h('p', { class: 'muted small pad' }, 'Wine defaults to a 5 oz glass. Alcohol is 7 kcal/g; it counts toward calories, not protein.'),
    h('div', { class: 'list' }, items.map(({ f, pi }) => {
      const food = { ...fromFNDDS(f), drink: true, est: false };
      const p = food.portions[pi] || food.portions[0];
      const kcal = p ? (food.per100.kcal * p[1]) / 100 : food.per100.kcal;
      return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title-s' }, f.n), h('div', { class: 'muted tiny' }, p ? `${p[0]} · ${r0(kcal)} kcal` : `${r0(kcal)} kcal / 100 g`), srcChip(food)),
        h('button', { class: 'btn small primary', onclick: async () => { s.close(); await addEntries(k, [{ name: f.n, kcal: r0(kcal), p: r1((food.per100.p * (p?.[1] || 100)) / 100), c: r1((food.per100.c * (p?.[1] || 100)) / 100), f: 0, fb: 0, al: r1((food.per100.al * (p?.[1] || 100)) / 100),
          meal: k === today() ? mealFor() : 'dinner', src: 'usda', ref: f.i, grams: p?.[1], qtyLabel: p ? `1 × ${p[0]}` : '100 g', per100: food.per100, portions: food.portions }], { toast: `+ ${f.n} · ${r0(kcal)} kcal` }); } }, '+1'),
        h('button', { class: 'icon-btn', 'aria-label': 'Choose amount', onclick: () => { s.close(); portionSheet(food, k, { defaultPortion: pi }); } }, icon('more', 18)));
    }))), { title: 'Drinks', tall: true });
}

// ───────────────────────── Barcode
let zxingP;
function loadZXing() { return (zxingP ||= new Promise((res, rej) => { if (window.ZXing) return res(window.ZXing); const sc = h('script', { src: 'js/vendor/zxing.min.js' }); sc.onload = () => res(window.ZXing); sc.onerror = rej; document.head.append(sc); })); }
export function barcodeSheet(k) {
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const status = h('div', { class: 'muted small' }, 'Point the camera at the barcode');
  const code = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'Or type the barcode number' });
  let stop = () => {}, done = false;
  const lookup = async (c) => {
    if (done) return; done = true; stop();
    c = String(c).replace(/\D/g, '');
    if (c.length < 6) { done = false; toast('That barcode looks too short'); return; }
    if (!navigator.onLine) { done = false; toast('Barcode lookup needs a connection'); return; }
    status.textContent = `Looking up ${c} on Open Food Facts…`; haptic('success');
    try {
      const food = await offBarcode(c);
      if (!food) { status.textContent = `${c} isn't in Open Food Facts. Use quick add or manual entry.`; done = false; return; }
      s.close(); portionSheet(food, k);
    } catch (err) { status.textContent = err.message; done = false; }
  };
  const s = sheet(h('div', { class: 'stack' }, h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-line' })), status,
    h('div', { class: 'row-between' }, code, h('button', { class: 'btn primary small', onclick: () => lookup(code.value) }, 'Look up')),
    h('div', { class: 'muted tiny' }, 'Products come from Open Food Facts (user-contributed). Only the barcode number is sent.')), { title: 'Scan barcode', tall: true, onClose: () => stop() });
  (async () => {
    try {
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; await video.play();
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        let on = true; stop = () => { on = false; stream.getTracks().forEach((t) => t.stop()); };
        const tick = async () => { if (!on) return; try { const r = await det.detect(video); if (r[0]) return lookup(r[0].rawValue); } catch {} setTimeout(tick, 200); };
        tick();
      } else {
        const ZX = await loadZXing();
        const hints = new Map(); hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
        const reader = new ZX.BrowserMultiFormatReader(hints, 300);
        stop = () => { try { reader.reset(); } catch {} };
        await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) lookup(res.getText()); });
      }
    } catch (err) { status.textContent = 'Camera unavailable — type the barcode number instead.'; }
  })();
}

// ───────────────────────── History
function history(body) {
  const n = T();
  const days = []; for (let i = 0; i < 28; i++) days.push(shiftDay(today(), -i));
  const info = days.map((k) => ({ k, t: nTotals(k), train: isTrainingDay(k), target: kcalTarget(k) }));
  const logged = (arr) => arr.filter((d) => d.t.n > 0);
  // calorie averages only count days where calories were logged (protein-only days would drag them toward 0)
  const avg = (arr, f) => { if (f === 'kcal') arr = arr.filter((d) => d.t.kcal > 0); return arr.length ? arr.reduce((a, d) => a + d.t[f], 0) / arr.length : null; };
  const kDays = (arr) => arr.filter((d) => d.t.kcal > 0).length;
  const w7 = logged(info.slice(0, 7)), w7p = logged(info.slice(7, 14));
  const bw = (from, to) => { const xs = S.body.filter((b) => b.weight > 0 && b.date >= shiftDay(today(), -to) && b.date <= shiftDay(today(), -from)).map((b) => E.fromKg(E.toKg(b.weight, b.wUnit || 'lb'), U())); return xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null; };
  const bwNow = bw(0, 6), bwPrev = bw(7, 13);
  const kAvg = avg(w7, 'kcal'), pAvg = avg(w7, 'p');
  const st7 = info.slice(0, 7).map((d) => stepsFor(d.k)).filter((x) => x != null);
  const stAvg = st7.length ? st7.reduce((a, x) => a + x, 0) / st7.length : null, lowDays = st7.filter((x) => x < LOW_STEPS).length;
  let verdict = 'Log a week of food and 2–3 weigh-ins to see the trend.';
  if (kAvg != null && kDays(w7) < 4) verdict = `Calories logged on ${kDays(w7)} of the last 7 days — log calories on 4+ days for a fair read vs. bodyweight.`;
  else if (bwNow != null && bwPrev != null && kAvg != null) {
    const dw = bwNow - bwPrev;
    verdict = Math.abs(dw) < 0.3 ? `Weight steady at ~${r0(kAvg)} kcal/day — roughly maintenance. Good for a recomp.` : dw > 0 ? `Weight up ${r1(dw)} ${U()} on ~${r0(kAvg)} kcal/day. Fine if lifts are climbing; if the waist is too, trim ~150 kcal.` : `Weight down ${r1(-dw)} ${U()} on ~${r0(kAvg)} kcal/day — a deficit. Keep protein high so strength holds.`;
  }
  body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Last 7 days'),
    h('div', { class: 'stat-grid three' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, kAvg != null ? r0(kAvg) : '—'), h('div', { class: 'stat-l muted tiny' }, `avg kcal · ${kDays(w7)}d`)),
      h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, pAvg != null ? r0(pAvg) : '—'), h('div', { class: 'stat-l muted tiny' }, 'avg protein g')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, bwNow != null ? r1(bwNow) : '—'), h('div', { class: 'stat-l muted tiny' }, `avg weight ${U()}`))),
    h('div', { class: 'muted tiny' }, `${w7.length} of 7 days logged · protein floor (${n.proteinFloor} g) hit on ${w7.filter((d) => d.t.p >= n.proteinFloor).length}` + (bwPrev != null && bwNow != null ? ` · prior week weight ${r1(bwPrev)} ${U()}` : '')),
    stAvg != null ? h('div', { class: 'row-between small' }, h('span', null, `Steps avg ${fmtN(stAvg)}/day`), h('span', { class: 'muted tiny' + (lowDays ? ' warn-text' : '') }, `${lowDays} of ${st7.length} synced days under 5k`)) : h('div', { class: 'muted tiny' }, 'Steps: none synced yet — see the Steps card on the Day view.'),
    h('div', { class: 'small' }, verdict)));
  const L28 = logged(info);
  const tr = L28.filter((d) => d.train), rs = L28.filter((d) => !d.train);
  body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Training vs rest days · 28 days'),
    h('div', { class: 'tvr' },
      h('div', { class: 'stat' }, h('div', { class: 'muted tiny' }, `Training (${tr.length})`), h('div', { class: 'stat-v' }, tr.length ? r0(avg(tr, 'kcal')) : '—'), h('div', { class: 'muted tiny' }, `target ${n.kcalTrain} · ${tr.length ? r0(avg(tr, 'p')) : '—'} g P`)),
      h('div', { class: 'stat' }, h('div', { class: 'muted tiny' }, `Rest (${rs.length})`), h('div', { class: 'stat-v' }, rs.length ? r0(avg(rs, 'kcal')) : '—'), h('div', { class: 'muted tiny' }, `target ${n.kcalRest} · ${rs.length ? r0(avg(rs, 'p')) : '—'} g P`)))));
  const last14 = info.slice(0, 14).reverse();
  body.append(h('section', { class: 'card' }, h('div', { class: 'row-between' }, h('div', { class: 'eyebrow' }, 'Calories · 14 days'), h('div', { class: 'muted tiny' }, 'white = training day')),
    barChart(last14.map((d) => ({ y: d.t.kcal, label: d.k.slice(8), hl: d.train && d.t.kcal > 0 })), { target: (n.kcalTrain + n.kcalRest) / 2, color: '#FF9F0A', color2: '#FF375F', height: 120 }),
    h('div', { class: 'eyebrow' }, 'Protein · 14 days'),
    barChart(last14.map((d) => ({ y: d.t.p, label: d.k.slice(8) })), { target: n.protein, color: '#30D158', color2: '#B4FF5A', height: 100 }),
    last14.some((d) => stepsFor(d.k) != null) ? [h('div', { class: 'eyebrow' }, 'Steps · 14 days'),
      barChart(last14.map((d) => ({ y: stepsFor(d.k) || 0, label: d.k.slice(8), hl: (stepsFor(d.k) ?? 1e9) < LOW_STEPS })), { target: LOW_STEPS, color: '#64D2FF', color2: '#0A84FF', height: 90 }),
      h('div', { class: 'muted tiny' }, 'Line = 5k. Highlighted bars are low-step days.')] : null));
  body.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Daily totals'), h('div', { class: 'list' }, info.slice(0, 21).map((d) => h('button', { class: 'row press', onclick: () => { app.nutDay = d.k; app.nutSeg = 'today'; app.go('nutrition', { force: true, seg: 'today' }); } },
    h('div', { class: 'grow' }, h('div', { class: 'title-s' }, dayLabel(d.k), d.train ? h('span', { class: 'pill tiny train' }, 'training') : null), h('div', { class: 'muted tiny' }, (d.t.n ? `${d.t.n} items` : 'not logged') + (stepsFor(d.k) != null ? ` · ${fmtN(stepsFor(d.k))} steps` : ''), stepsFor(d.k) != null && stepsFor(d.k) < LOW_STEPS ? h('span', { class: 'pill tiny warn soft' }, 'low steps') : null)),
    h('div', { class: 'entry-n mono' }, h('div', null, d.t.n ? r0(d.t.kcal) : '—', h('span', { class: 'muted tiny' }, ` / ${d.target}`)), h('div', { class: 'muted tiny' + (d.t.p >= n.proteinFloor ? ' ok-text' : '') }, `${r0(d.t.p)} g P`)))))));
}

// ───────────────────────── Targets
export function targetsSheet() {
  const n = T();
  const row = (label, key, unit) => h('label', { class: 'form-row' }, h('span', null, label), h('div', { class: 'with-suffix' }, h('input', { class: 'input num', inputmode: 'numeric', value: n[key], onchange: async (e) => { n[key] = +e.target.value || n[key]; await saveSettings(); } }), h('span', { class: 'muted' }, unit)));
  sheet(h('div', { class: 'settings' },
    h('div', { class: 'group' }, row('Training day', 'kcalTrain', 'kcal'), row('Rest day', 'kcalRest', 'kcal'), row('Protein (every day)', 'protein', 'g'), row('Protein floor', 'proteinFloor', 'g'), row('Fat (at least)', 'fatMin', 'g'), row('Fiber', 'fiber', 'g')),
    h('div', { class: 'note muted small' }, 'These are starting estimates, not facts. After 2–3 weeks of food logs and weigh-ins, compare the 7-day average calories with your weight trend in History, then nudge the targets ~100–150 kcal.'),
    h('div', { class: 'note muted small' }, 'A day counts as a training day automatically when a workout is logged on that date. Tap the day-type pill on the Day view to override it.')), { title: 'Nutrition targets', onClose: rerender });
}
export const _test = { offSearch, offBarcode, searchLocal };
