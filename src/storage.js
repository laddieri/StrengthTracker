// Durable storage for StrengthTracker.
//
// localStorage is the fast synchronous primary store, but on its own it is
// fragile: browsers may evict it, a corrupt read used to fall back to empty
// defaults (which were then saved over the real data), and quota errors were
// silently ignored. This module adds several layers of protection:
//   1. Never overwrite stored data we failed to read (the raw text is stashed).
//   2. Ask the browser to mark this origin's storage as persistent.
//   3. Mirror every save into IndexedDB, plus rolling daily snapshots, so data
//      can be recovered if localStorage is cleared or damaged.
//   4. Full-backup export/restore to a file the user keeps off-device.

export const STORAGE_KEY = "strengthtracker_state";
const CORRUPT_PREFIX = "strengthtracker_corrupt_";
const LAST_EXPORT_KEY = "strengthtracker_last_export";
const DB_NAME = "strengthtracker";
const DB_STORE = "backups";
const SNAPSHOT_KEEP = 14;

// ---- localStorage ---------------------------------------------------------

// Returns { state, ok }. ok=false means data exists but couldn't be read, so
// the caller must not save over it until the user has recovered or reset.
export function readLocalState() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return { state: null, ok: false }; }
  if (!raw) return { state: null, ok: true };
  try {
    const state = JSON.parse(raw);
    if (state && typeof state === "object") return { state, ok: true };
  } catch { /* fall through */ }
  try { localStorage.setItem(CORRUPT_PREFIX + Date.now(), raw); } catch { /* ignore */ }
  return { state: null, ok: false };
}

// Returns an error message on failure, or null on success.
export function writeLocalState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch (e) {
    return e?.name === "QuotaExceededError" ? "Browser storage is full." : "Browser storage is unavailable.";
  }
}

// ---- Persistent storage ---------------------------------------------------

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch { return "unsupported"; }
}

// ---- IndexedDB mirror -----------------------------------------------------

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(DB_STORE, mode);
    const result = fn(t.objectStore(DB_STORE));
    t.oncomplete = () => resolve(result?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const dayKey = (d = new Date()) => `snapshot:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Saves the latest state plus a once-per-day snapshot, pruning old snapshots.
// Empty states never replace a snapshot that holds workout history.
export async function mirrorState(state) {
  try {
    const entry = { savedAt: Date.now(), state };
    const key = dayKey();
    const empty = !state.history?.length;
    const [latest, today] = empty
      ? await Promise.all([tx("readonly", (s) => s.get("latest")), tx("readonly", (s) => s.get(key))])
      : [null, null];
    const hasHistory = (e) => e?.state?.history?.length > 0;
    await tx("readwrite", (s) => {
      if (!hasHistory(latest)) s.put(entry, "latest");
      if (!hasHistory(today)) s.put(entry, key);
    });
    const keys = (await tx("readonly", (s) => s.getAllKeys())) || [];
    const snaps = keys.filter((k) => String(k).startsWith("snapshot:")).sort();
    if (snaps.length > SNAPSHOT_KEEP) {
      await tx("readwrite", (s) => snaps.slice(0, snaps.length - SNAPSHOT_KEEP).forEach((k) => s.delete(k)));
    }
  } catch { /* best effort */ }
}

// Lists recoverable backups, newest first: [{ key, savedAt, sessions, state }].
export async function listBackups() {
  try {
    const keys = (await tx("readonly", (s) => s.getAllKeys())) || [];
    const entries = await Promise.all(keys.map(async (k) => ({ key: String(k), ...(await tx("readonly", (s) => s.get(k))) })));
    return entries
      .filter((e) => e.state && typeof e.state === "object")
      .map((e) => ({ ...e, sessions: e.state.history?.length || 0 }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

// ---- File backup ----------------------------------------------------------

export function exportBackup(state) {
  const payload = { app: "StrengthTracker", version: 1, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `strengthtracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try { localStorage.setItem(LAST_EXPORT_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function lastExportTime() {
  try { return Number(localStorage.getItem(LAST_EXPORT_KEY)) || null; } catch { return null; }
}

// Parses a backup file's text into a state object, or throws.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  const state = data?.app === "StrengthTracker" ? data.state : data;
  if (!state || typeof state !== "object" || !Array.isArray(state.history) || !state.programs) {
    throw new Error("That file doesn't look like a StrengthTracker backup.");
  }
  return state;
}
