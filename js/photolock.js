// Photo lock + optional encryption. All local: WebCrypto (PBKDF2 → AES-GCM) and, if available, a platform passkey (Face ID).
// Design: a random 256-bit data key (DEK) encrypts photo bytes. The DEK is stored only wrapped: by a passcode-derived key and,
// optionally, by a Face ID passkey's PRF output. Forgotten passcode + no Face ID = encrypted photos are unrecoverable (by design).
import { db } from './db.js';

const ITER = 310000;
const te = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

let cfg = null;          // persisted config (kv 'photolock'), never includes the raw key
let dekRaw = null, dek = null; // in-memory only while unlocked
let unlockedPlain = false;     // unlocked state for lock-without-encryption
const listeners = new Set();

export async function loadLock() { cfg = (await db.get('kv', 'photolock'))?.v || null; return cfg; }
async function saveCfg() { if (cfg) await db.put('kv', { k: 'photolock', v: cfg }); else await db.del('kv', 'photolock'); }
export const lockInfo = () => (cfg ? { on: true, encrypt: !!cfg.encrypt, faceId: !!cfg.wa, faceIdDecrypts: !!cfg.wa?.wrapped } : { on: false });
export const isLocked = () => !!cfg && !(cfg.encrypt ? dek : unlockedPlain);
export const onLockChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((f) => { try { f(); } catch {} });

async function kekFromPass(pass, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function kekFromPrf(bytes) { return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function wrap(kek, raw) { const iv = rand(12); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw)) }; }
async function unwrap(kek, w) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, kek, unb64(w.ct))); }
async function setDek(raw) { dekRaw = raw; dek = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }

// Set up a new lock. Returns nothing; photos are migrated by the caller via encryptAllPlain().
export async function setupLock(pass, encrypt) {
  const salt = rand(16), raw = rand(32);
  cfg = { v: 1, iter: ITER, salt: b64(salt), encrypt: !!encrypt, pass: await wrap(await kekFromPass(pass, salt), raw), at: Date.now() };
  await saveCfg(); await setDek(raw); unlockedPlain = true; emit();
}
export async function unlockWithPass(pass) {
  if (!cfg) return true;
  try { const raw = await unwrap(await kekFromPass(pass, unb64(cfg.salt), cfg.iter), cfg.pass); await setDek(raw); unlockedPlain = true; emit(); return true; } catch { return false; }
}
export async function changePass(oldPass, newPass) {
  if (!(await unlockWithPass(oldPass))) return false;
  const salt = rand(16); cfg.salt = b64(salt); cfg.iter = ITER; cfg.pass = await wrap(await kekFromPass(newPass, salt), dekRaw); await saveCfg(); return true;
}
export function lock() { if (!cfg) return; dekRaw = null; dek = null; unlockedPlain = false; emit(); }
export async function removeLockConfig() { cfg = null; dekRaw = null; dek = null; unlockedPlain = false; await saveCfg(); emit(); }

// ── Photo bytes
export async function encryptBlob(blob) {
  const iv = rand(12);
  return { iv: b64(iv), ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, await blob.arrayBuffer()), type: blob.type || 'image/jpeg' };
}
export async function decryptEnc(enc) { return new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, dek, enc.ct)], { type: enc.type || 'image/jpeg' }); }
export const encryptNew = () => !!cfg?.encrypt && !!dek;

// ── Face ID (WebAuthn platform authenticator). With PRF it can also unwrap the data key; without PRF it is only a gate.
export async function faceIdAvailable() {
  try { return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
export async function enrollFaceId() {
  if (!cfg || isLocked()) throw new Error('Unlock first');
  const prfSalt = rand(32);
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'Lift photos' }, user: { id: rand(16), name: 'lift-photos', displayName: 'Lift photos' }, challenge: rand(32),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000,
    extensions: { prf: { eval: { first: prfSalt } } } } });
  const wa = { id: b64(cred.rawId), prfSalt: b64(prfSalt) };
  let prf = cred.getClientExtensionResults?.().prf;
  let out = prf?.results?.first;
  if (!out && prf?.enabled) out = await faceIdAssert(wa).catch(() => null);
  if (out) wa.wrapped = await wrap(await kekFromPrf(new Uint8Array(out)), dekRaw);
  else if (cfg.encrypt) throw new Error('This device’s passkey can’t unlock encrypted photos (no PRF support). Use the passcode.');
  cfg.wa = wa; await saveCfg(); return { decrypts: !!wa.wrapped };
}
async function faceIdAssert(wa) {
  const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(wa.id) }], userVerification: 'required', timeout: 60000,
    extensions: { prf: { eval: { first: unb64(wa.prfSalt) } } } } });
  if (!a) throw new Error('Cancelled');
  return a.getClientExtensionResults?.().prf?.results?.first || null;
}
export async function unlockWithFaceId() {
  if (!cfg?.wa) return false;
  const out = await faceIdAssert(cfg.wa);
  if (cfg.wa.wrapped) { if (!out) return false; try { await setDek(await unwrap(await kekFromPrf(new Uint8Array(out)), cfg.wa.wrapped)); } catch { return false; } }
  else if (cfg.encrypt) return false;
  unlockedPlain = true; emit(); return true;
}
export async function removeFaceId() { if (cfg) { delete cfg.wa; await saveCfg(); } }

// Generic text encryption with the data key (used for the AI key and photo reports when encryption is on)
export async function encryptText(str, key = dek) { const iv = rand(12); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(str))) }; }
export const currentKey = () => (cfg?.encrypt ? dek : null); // captured before long async work so a relock mid-way can't cause a plaintext save
export async function decryptText(e) { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, dek, unb64(e.ct))); }
export const canEncrypt = () => !!cfg?.encrypt && !!dek;
export const hasDek = () => !!dek;
