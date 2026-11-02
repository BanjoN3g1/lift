// Offline-first service worker. Caches the app shell; makes no other network requests.
const VERSION = 'lift-v1.9.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/app.css', './js/version.js', './js/app.js', './js/ui.js', './js/db.js', './js/data.js', './js/engine.js',
  './js/store.js', './js/logger.js', './js/progress.js', './js/body.js', './js/onboarding.js', './js/nutrition.js', './js/photos.js', './js/photolock.js', './js/ai.js', './js/anon.js', './js/vendor/zxing.min.js', './data/fndds.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon-maskable-512.png'];
// On-device face detector (MediaPipe, ~14 MB): cached at install too, but best-effort so a flaky connection can't block the update.
const FACE = ['./js/vendor/mediapipe/vision_bundle.mjs', './js/vendor/mediapipe/wasm/vision_wasm_internal.js', './js/vendor/mediapipe/wasm/vision_wasm_internal.wasm', './js/vendor/mediapipe/models/blaze_face_short_range.tflite'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS).then(() => c.addAll(FACE).catch(() => {}))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // v1.9: the app's own code (HTML/JS/CSS/manifest) is network-first with a 3-s timeout, so a new
  // version shows up the next time you open the app. Big static files stay cache-first. Offline still works.
  const p = url.pathname;
  const fresh = e.request.mode === 'navigate' || (/\.(js|css|webmanifest|html)$/.test(p) && !p.includes('/vendor/'));
  const save = (res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return res; };
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'));
  if (fresh) {
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { cached().then((r) => { if (!done && r) { done = true; resolve(r); } }); }, 3000);
      fetch(e.request, { cache: 'no-cache' }).then((res) => { clearTimeout(t); if (!done) { done = true; resolve(save(res)); } })
        .catch(() => { clearTimeout(t); cached().then((r) => { if (!done) { done = true; resolve(r || Response.error()); } }); });
    }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then(save).catch(() => caches.match('./index.html'))));
});
