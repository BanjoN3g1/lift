import { h, icon, haptic } from './ui.js';
import { S, saveSettings } from './store.js';

const CARDS = [
  { ic: 'swap', c: ['#0A84FF', '#5E5CE6'], t: 'A rotation, not a calendar', b: ['Your plan is A → B1 → C → D → A → B2 → C → D.', 'Whenever you get to the gym, do whatever is "Next up". Missed a day? Nothing is lost. The rotation waits for you.', 'Slept under 5 hours? Flip on Short version: just the first two exercises, about 25 minutes, and it still counts.'] },
  { ic: 'check', c: ['#30D158', '#64D2FF'], t: 'Log a set in two taps', b: ['Weights are pre-filled when the app knows them. Type the reps (or leave the grey target) and tap ✓.', 'RIR means reps in reserve: how many more you could have done. For the first 2 weeks, stop at 2–3.', 'The rest timer starts on its own. Hit the top of the range on every set and next time adds +5 lb.'] },
  { ic: 'plates', c: ['#FF9F0A', '#FF375F'], t: 'lb or kg, any machine', b: ['Flip lb/kg for the whole workout or for one exercise, and your numbers convert.', 'Type any weight and it tells you how many reps to aim for at that load.', 'Equipment taken? Tap Swap for 2–3 alternatives. Plates and Warm-up show exactly what to load.'] },
  { ic: 'lock', c: ['#BF5AF2', '#FF375F'], t: 'Private: it all stays on this phone', b: ['Workouts, body stats and photos stay on your iPhone unless you choose to share them. There’s no account and no cloud.', 'That also means no automatic backup. Every couple of weeks, go to Settings → Back up and save the file to iCloud Drive.', 'Keep the app on your Home Screen. Don’t clear Safari website data.'] },
];

export function maybeOnboard(force = false) {
  if (!force && S.settings.onboarded) return;
  let i = 0;
  const track = h('div', { class: 'ob-track' }, CARDS.map((c) => h('section', { class: 'ob-card' },
    h('div', { class: 'ob-ic', style: { background: `linear-gradient(135deg, ${c.c[0]}, ${c.c[1]})` } }, icon(c.ic, 40)),
    h('h2', null, c.t), h('div', { class: 'ob-body' }, c.b.map((p) => h('p', null, p))))));
  const dots = h('div', { class: 'ob-dots' }, CARDS.map(() => h('span')));
  const next = h('button', { class: 'btn primary big', onclick: () => (i < CARDS.length - 1 ? goTo(i + 1) : done()) }, 'Next');
  const root = h('div', { class: 'onboard' }, h('button', { class: 'ob-skip muted', onclick: () => done() }, 'Skip'), track, dots, h('div', { class: 'ob-foot' }, next));
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('open'));
  const sync = () => { [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); next.textContent = i === CARDS.length - 1 ? 'Let’s lift' : 'Next'; };
  function goTo(k) { i = k; track.scrollTo({ left: k * track.clientWidth, behavior: 'smooth' }); haptic('light'); sync(); }
  track.addEventListener('scroll', () => { const k = Math.round(track.scrollLeft / track.clientWidth); if (k !== i) { i = k; sync(); } }, { passive: true });
  async function done() { S.settings.onboarded = true; await saveSettings(); haptic('success'); root.classList.remove('open'); setTimeout(() => root.remove(), 350); }
  sync();
}
