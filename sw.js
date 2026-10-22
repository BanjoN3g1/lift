// Offline-first service worker. Caches the app shell; makes no other network requests.
const VERSION = 'lift-v1.6.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/app.css', './js/version.js', './js/app.js', './js/ui.js', './js/db.js', './js/data.js', './js/engine.js',
  './js/store.js', './js/logger.js', './js/progress.js', './js/body.js', './js/onboarding.js', './js/nutrition.js', './js/photos.js', './js/photolock.js', './js/ai.js', './js/anon.js', './js/vendor/zxing.min.js', './data/fndds.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon-maskable-512.png'];
// On-device face detector (MediaPipe, ~14 MB): cached at install too, but best-effort so a flaky connection can't block the update.
const FACE = ['./js/vendor/mediapipe/vision_bundle.mjs', './js/vendor/mediapipe/wasm/vision_wasm_internal.js', './js/vendor/mediapipe/wasm/vision_wasm_internal.wasm', './js/vendor/mediapipe/models/blaze_face_short_range.tflite'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS).then(() => c.addAll(FACE).catch(() => {}))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
