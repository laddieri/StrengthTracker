// Phone → TV link for the basement-TV dashboard.
//
// The app has no backend: workout data lives only in the phone's browser. To
// show it on a TV, the TV page displays a pairing code, the phone enters it,
// and the phone publishes snapshots of the in-progress workout to a free
// public pub/sub relay (ntfy.sh). Both sides derive the relay topic and an
// AES-GCM key from the pairing code, so the relay only ever sees ciphertext
// on an unguessable topic.
//
// ntfy.sh caches each topic's messages for several hours, so a TV that turns
// on (or reconnects) mid-workout fetches the latest snapshot straight away.

const RELAY = "https://ntfy.sh";
// No 0/O, 1/I/L to keep the code easy to read off a TV across the room.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 8;
const SALT = "strengthtracker-tv-v1";
const PREFIX = "st1.";
// ntfy turns messages over 4096 bytes into attachments; stay well under.
export const MAX_MESSAGE_BYTES = 3900;

export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Uppercases and drops the dash, spaces and anything else typed by accident.
export const normalizeCode = (input) => String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isValidCode = (code) => code.length === CODE_LEN && [...code].every((c) => ALPHABET.includes(c));
export const formatCode = (code) => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle && typeof TextEncoder !== "undefined";

const b64 = (bytes) => { let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

// Derives { topic, key } from a pairing code. PBKDF2 makes guessing codes
// expensive; the first 32 bytes are the AES key, the next 16 name the topic.
const linkCache = new Map();
export function deriveLink(code) {
  if (linkCache.has(code)) return linkCache.get(code);
  const p = (async () => {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SALT), iterations: 120000 }, base, 384));
    const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    return { topic: `st${hex(bits.slice(32, 48))}`, key };
  })();
  p.catch(() => linkCache.delete(code));
  linkCache.set(code, p);
  return p;
}

export async function encryptMessage(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return PREFIX + b64(out);
}

export async function decryptMessage(key, text) {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) throw new Error("not a StrengthTracker message");
  const raw = unb64(text.slice(PREFIX.length));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}

// Publishes an already-encrypted message. Throws on network/HTTP failure.
export async function publish(topic, message) {
  const res = await fetch(`${RELAY}/${topic}`, { method: "POST", body: message });
  if (!res.ok) throw new Error(res.status === 429 ? "Relay rate limit reached. Try again shortly." : `Relay error ${res.status}`);
}

// Subscribes to a topic. Calls onMessage(text) for the most recent cached
// message and every new one, and onStatus("connecting" | "live" | "offline").
// Returns an unsubscribe function.
export function subscribe(topic, { onMessage, onStatus }) {
  let closed = false, es = null, retry = null, lastId = null;
  const deliver = (m) => {
    if (!m || m.event !== "message" || m.id === lastId) return;
    lastId = m.id;
    onMessage(m.message);
  };
  const open = () => {
    if (closed) return;
    onStatus?.("connecting");
    const pollStart = Math.floor(Date.now() / 1000);
    // Fetch the latest cached snapshot first, then stream anything newer.
    fetch(`${RELAY}/${topic}/json?poll=1&since=latest`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => txt.split("\n").filter(Boolean).forEach((line) => { try { deliver(JSON.parse(line)); } catch { /* ignore */ } }))
      .catch(() => {})
      .finally(() => {
        if (closed) return;
        es = new EventSource(`${RELAY}/${topic}/sse?since=${encodeURIComponent(lastId || pollStart)}`);
        es.onopen = () => onStatus?.("live");
        es.onmessage = (e) => { try { deliver(JSON.parse(e.data)); } catch { /* ignore */ } };
        // Reconnect ourselves (re-polling, resuming after the last message
        // seen) rather than relying on EventSource's own retry.
        es.onerror = () => {
          es.close();
          onStatus?.("offline");
          clearTimeout(retry);
          retry = setTimeout(open, 3000);
        };
      });
  };
  open();
  return () => { closed = true; clearTimeout(retry); es?.close(); };
}
