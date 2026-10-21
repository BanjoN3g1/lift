// Tiny IndexedDB wrapper. Everything lives on-device; nothing is ever sent anywhere.
const DB_NAME = 'lift-local';
const VERSION = 2;
const STORES = { kv: 'k', sessions: 'id', body: 'id', photos: 'id', protein: 'id', nutrition: 'id' };
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const [s, key] of Object.entries(STORES)) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: key });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function run(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
export const db = {
  get: (s, k) => run(s, 'readonly', (st) => st.get(k)),
  put: (s, v) => run(s, 'readwrite', (st) => st.put(v)),
  del: (s, k) => run(s, 'readwrite', (st) => st.delete(k)),
  all: (s) => run(s, 'readonly', (st) => st.getAll()),
  clear: (s) => run(s, 'readwrite', (st) => st.clear()),
  async putMany(s, arr) { for (const v of arr) await db.put(s, v); },
  stores: Object.keys(STORES),
};
