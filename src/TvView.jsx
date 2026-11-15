// Big-screen, read-only workout dashboard for a TV (open /tv on the TV).
// It shows a pairing code, then mirrors the live workout the phone publishes
// through the relay in tvLink.js. Sized in viewport units so it reads the
// same on a 960×540 TV browser and a 4K one, with padding for TV overscan.
import { useEffect, useMemo, useState } from "react";
import { pairingUrl, generateCode, isValidCode, formatCode, deriveLink, decryptMessage, subscribe, cryptoAvailable } from "./tvLink.js";
import qrcode from "qrcode-generator";
import "./tv.css";

const CODE_KEY = "strengthtracker_tv_display_code";
const SNAP_KEY = "strengthtracker_tv_display_snapshot";
const STALE_MS = 6 * 60 * 60 * 1000; // older than this = a previous workout

const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const fmtW = (w) => (Number.isInteger(w) ? String(w) : String(Math.round(w * 100) / 100));

function loadCode() {
  try { const c = localStorage.getItem(CODE_KEY); if (c && isValidCode(c)) return c; } catch { /* ignore */ }
  const c = generateCode();
  try { localStorage.setItem(CODE_KEY, c); } catch { /* ignore */ }
  return c;
}
function loadSnap() {
  try { const s = JSON.parse(localStorage.getItem(SNAP_KEY)); if (s?.v === 1 && Date.now() - s.t < STALE_MS) return s; } catch { /* ignore */ }
  return null;
}

// Keep the TV from dimming or starting its screensaver mid-workout.
function useWakeLock() {
  useEffect(() => {
    if (!navigator.wakeLock) return;
    let lock = null;
    const acquire = () => { if (document.visibilityState === "visible") navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { document.removeEventListener("visibilitychange", acquire); lock?.release().catch(() => {}); };
  }, []);
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

// Turns the raw snapshot into what the screen needs: which exercise and set
// is up next, rest timing and overall progress.
function analyze(snap) {
  const ex = (snap?.ex || []).map((e, i) => {
    const sets = e.s.map(([w, r, c, at, p]) => ({ w, r, c: !!c, at, p }));
    const warm = e.wu.map(([w, r, d, p]) => ({ w, r, d: !!d, p }));
    const lastAt = Math.max(0, ...sets.map((s) => s.at));
    return { i, name: e.n, weight: e.w, reps: e.r, light: !!e.light, sets, warm, lastAt, done: sets.length > 0 && sets.every((s) => s.c), doneCount: sets.filter((s) => s.c).length };
  });
  const lastAt = Math.max(0, ...ex.map((e) => e.lastAt));
  const firstAt = Math.min(Infinity, ...ex.flatMap((e) => e.sets.filter((s) => s.at).map((s) => s.at)));
  const allDone = ex.length > 0 && ex.every((e) => e.done);
  // The exercise you're on: the one you last logged a set in, unless it's
  // finished, in which case the first unfinished one in workout order.
  const recent = ex.find((e) => e.lastAt === lastAt && lastAt > 0);
  const current = recent && !recent.done ? recent : ex.find((e) => !e.done) || null;
  let step = null; // { kind: "warm" | "work", idx }
  if (current) {
    const firstWarm = current.warm.findIndex((w) => !w.d);
    if (current.doneCount === 0 && firstWarm >= 0) step = { kind: "warm", idx: firstWarm };
    else step = { kind: "work", idx: current.sets.findIndex((s) => !s.c) };
  }
  const next = current ? ex.find((e) => !e.done && e.i > current.i) || ex.find((e) => !e.done && e !== current) || null : null;
  return { ex, lastAt, firstAt: Number.isFinite(firstAt) ? firstAt : null, allDone, current, step, next };
}

// Plates on one sleeve, drawn to scale so you can load the bar by eye.
const PLATE_STYLE = {
  45: { h: 100, c: "#4a7fd6" }, 35: { h: 88, c: "#e3c34a" }, 25: { h: 76, c: "#4caf6a" },
  10: { h: 58, c: "#e8e8e8" }, 5: { h: 46, c: "#d65a5a" }, 2.5: { h: 38, c: "#9a9a9a" }, 1.25: { h: 32, c: "#bbbbbb" },
};
function PlateStack({ text }) {
  if (!text) return null;
  if (text === "bar") return <div className="tv-plates-label">Empty bar</div>;
  if (text === "?") return <div className="tv-plates-label tv-warn">Can't load with your plates</div>;
  const plates = text.split(" + ").flatMap((part) => {
    const [a, b] = part.includes("×") ? part.split("×") : ["1", part];
    return Array.from({ length: Number(a) }, () => Number(b));
  });
  return (
    <div className="tv-plates">
      <div className="tv-sleeve">
        <div className="tv-collar" />
        {plates.map((w, i) => {
          const st = PLATE_STYLE[w] || { h: Math.max(30, Math.min(100, 30 + w * 1.5)), c: "#888" };
          return <div key={i} className="tv-plate" style={{ height: `${st.h}%`, background: st.c, width: `${w >= 10 ? 2.1 : 1.3}vw` }} />;
        })}
        <div className="tv-sleeve-end" />
      </div>
      <div className="tv-plates-label">{text} <span className="tv-dim">per side</span></div>
    </div>
  );
}

// QR code for the phone's camera: opens the app with the code filled in.
function PairQr({ code, className }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(pairingUrl(code));
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { size: n + 8, path: d }; // 4-module quiet zone on each side
  }, [code]);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code to link your phone">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

function PairingScreen({ code, status, error }) {
  return (
    <div className="tv-root tv-center">
      <div className="tv-brand">STRENGTH TRACKER · TV</div>
      <div className="tv-pair-body">
        <div className="tv-pair-col">
          <PairQr code={code} className="tv-pair-qr" />
          <div className="tv-pair-steps">Scan with your phone's camera</div>
        </div>
        <div className="tv-pair-or">or</div>
        <div className="tv-pair-col">
          <div className="tv-pair-code">{formatCode(code)}</div>
          <div className="tv-pair-steps">Enter in <b>Settings</b> → <b>TV Display</b></div>
        </div>
      </div>
      <div className="tv-pair-status">
        {error ? <span className="tv-warn">{error}</span> : status === "live" ? "Waiting for your phone…" : "Connecting…"}
      </div>
    </div>
  );
}

export default function TvView() {
  const [code] = useState(loadCode);
  const [snap, setSnap] = useState(loadSnap);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(cryptoAvailable() ? null : "This browser can't decrypt the link. Open the page over HTTPS.");
  const [showCode, setShowCode] = useState(false);
  const now = useNow();
  useWakeLock();

  useEffect(() => {
    document.title = "Strength Tracker · TV";
    if (!cryptoAvailable()) return;
    let unsub = () => {}, alive = true, statusTimer = null;
    deriveLink(code).then(({ topic, key }) => {
      if (!alive) return;
      unsub = subscribe(topic, {
        // Show "live" at once, but only show a dropped connection if it
        // lasts, so brief network blips don't flash a warning.
        onStatus: (st) => {
          clearTimeout(statusTimer);
          if (st === "live") setStatus("live");
          else statusTimer = setTimeout(() => setStatus(st), 10000);
        },
        onMessage: (text) => decryptMessage(key, text).then((s) => {
          if (s?.v !== 1) return;
          setSnap((prev) => (prev && prev.t > s.t ? prev : s));
          try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch { /* ignore */ }
        }).catch(() => {}),
      });
    }).catch(() => setError("Couldn't set up the secure link on this browser."));
    return () => { alive = false; clearTimeout(statusTimer); unsub(); };
  }, [code]);

  // Any remote button briefly shows the pairing code (e.g. to link a new phone).
  useEffect(() => {
    let t;
    const onKey = () => { setShowCode(true); clearTimeout(t); t = setTimeout(() => setShowCode(false), 8000); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, []);

  const a = useMemo(() => analyze(snap), [snap]);
  if (!snap || error) return <PairingScreen code={code} status={status} error={error} />;

  const { ex, current, step, next, allDone, lastAt, firstAt } = a;
  const resting = !allDone && lastAt > 0 && now - lastAt < 30 * 60 * 1000;
  const restSec = resting ? (now - lastAt) / 1000 : 0;
  const staleMin = Math.floor((now - snap.t) / 60000);
  const clock = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const curSet = current && step ? (step.kind === "warm" ? current.warm[step.idx] : current.sets[step.idx]) : null;

  return (
    <div className="tv-root">
      <header className="tv-header">
        <div>
          <div className="tv-brand">STRENGTH TRACKER</div>
          <div className="tv-title">{snap.title}{snap.sub && <span className="tv-dim"> · {snap.sub}</span>}</div>
        </div>
        <div className="tv-header-right">
          {firstAt && <div className="tv-elapsed"><span className="tv-dim">WORKOUT</span> {fmtClock((now - firstAt) / 1000)}</div>}
          <div className="tv-clock">{clock}</div>
        </div>
      </header>

      {ex.length === 0 ? (
        <div className="tv-center tv-grow"><div className="tv-big-msg">No exercises yet.<div className="tv-dim tv-small">Add some on your phone and they'll show up here.</div></div></div>
      ) : (
        <main className="tv-main">
          <section className="tv-now">
            {allDone ? (
              <div className="tv-center tv-grow">
                <div className="tv-done-check">✓</div>
                <div className="tv-big-msg">Workout complete<div className="tv-dim tv-small">Finish &amp; log it on your phone.</div></div>
              </div>
            ) : current && (
              <>
                <div className="tv-now-label">
                  {step?.kind === "warm" ? <span className="tv-pink">WARMUP {step.idx + 1} OF {current.warm.length}</span>
                    : <span className="tv-green">WORK SET {step.idx + 1} OF {current.sets.length}</span>}
                  {current.light && <span className="tv-blue"> · LIGHT DAY</span>}
                </div>
                <div className="tv-ex-name">{current.name}</div>
                {curSet && (
                  <div className={`tv-target ${step.kind === "warm" ? "tv-pink" : "tv-green"}`}>
                    {curSet.w > 0 ? <>{fmtW(curSet.w)}<span className="tv-unit">lb</span></> : <span className="tv-unit">Bodyweight</span>}
                    <span className="tv-x">×</span>{curSet.r}
                  </div>
                )}
                {curSet && <PlateStack text={curSet.p} />}
                <div className="tv-chips">
                  {current.warm.length > 0 && (
                    <div className="tv-chip-row">
                      <span className="tv-chip-label tv-pink">WARMUP</span>
                      {current.warm.map((w, i) => {
                        const on = step.kind === "warm" && step.idx === i;
                        return <div key={i} className={`tv-chip tv-chip-warm${w.d ? " is-done" : ""}${on ? " is-current" : ""}`}>{w.d ? "✓" : `${fmtW(w.w)}×${w.r}`}</div>;
                      })}
                    </div>
                  )}
                  <div className="tv-chip-row">
                    <span className="tv-chip-label tv-green">WORK</span>
                    {current.sets.map((st, i) => {
                      const on = step.kind === "work" && step.idx === i;
                      return <div key={i} className={`tv-chip tv-chip-work${st.c ? " is-done" : ""}${on ? " is-current" : ""}`}>{st.c ? `✓ ${fmtW(st.w)}×${st.r}` : `${fmtW(st.w)}×${st.r}`}</div>;
                    })}
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="tv-side">
            <div className={`tv-rest${resting ? " is-resting" : ""}`}>
              <div className="tv-rest-label">{resting ? "RESTING" : allDone ? "DONE" : "READY"}</div>
              <div className="tv-rest-time">{resting ? fmtClock(restSec) : allDone ? "💪" : "GO"}</div>
              {!allDone && next && <div className="tv-rest-next"><span className="tv-dim">After this:</span> {next.name}</div>}
            </div>
            <div className="tv-list">
              {ex.map((e) => (
                <div key={e.i} className={`tv-row${e === current && !allDone ? " is-current" : ""}${e.done ? " is-done" : ""}`}>
                  <div className="tv-row-name">{e.done ? "✓ " : ""}{e.name}</div>
                  <div className="tv-row-meta">
                    <span>{e.weight > 0 ? `${fmtW(e.weight)} lb` : "BW"} · {e.sets.length}×{e.reps}</span>
                    <span className="tv-dots">{e.sets.map((s, i) => <span key={i} className={`tv-dot${s.c ? " on" : ""}`} />)}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}

      <footer className="tv-footer">
        <span className={status === "live" ? "tv-green" : "tv-warn"}>● {status === "live" ? "LIVE" : status === "connecting" ? "CONNECTING" : "RECONNECTING"}</span>
        {staleMin >= 10 && <span className="tv-dim"> · last update {staleMin} min ago</span>}
        {showCode && <span className="tv-dim"> · TV code <b className="tv-green">{formatCode(code)}</b></span>}
      </footer>
      {showCode && (
        <div className="tv-qr-pop">
          <PairQr code={code} className="tv-qr-pop-img" />
          <div>Scan to link a phone</div>
        </div>
      )}
    </div>
  );
}
