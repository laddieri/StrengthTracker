import { useState, useEffect, useRef, useMemo } from "react";

const EXERCISE_LIBRARY = [
  { name: "Squat",                defaultSets: 3, defaultReps: 5, increment: 5,   category: "Lower" },
  { name: "Deadlift",             defaultSets: 1, defaultReps: 5, increment: 10,  category: "Lower" },
  { name: "Bench Press",          defaultSets: 3, defaultReps: 5, increment: 2.5, category: "Upper" },
  { name: "Close-Grip Bench Press", defaultSets: 3, defaultReps: 8, increment: 2.5, category: "Upper" },
  { name: "Overhead Press",       defaultSets: 3, defaultReps: 5, increment: 2.5, category: "Upper" },
  { name: "Barbell Curl",         defaultSets: 3, defaultReps: 8, increment: 2.5, category: "Upper" },
  { name: "Skull Crusher",        defaultSets: 3, defaultReps: 8, increment: 2.5, category: "Upper" },
  { name: "Chin-Up",              defaultSets: 3, defaultReps: 5, increment: 2.5, category: "Upper" },
];

const DEFAULT_WEIGHTS = {
  "Squat": 135, "Deadlift": 135, "Bench Press": 95, "Close-Grip Bench Press": 85,
  "Overhead Press": 65, "Barbell Curl": 45, "Skull Crusher": 45, "Chin-Up": 0,
};

const DEFAULT_PROGRAMS = {
  "Starting Strength": [
    { id: "ss-a", label: "A", exercises: [
      { name: "Squat",       sets: 3, reps: 5, increment: 5  },
      { name: "Bench Press", sets: 3, reps: 5, increment: 2.5 },
      { name: "Deadlift",    sets: 1, reps: 5, increment: 10 },
    ]},
    { id: "ss-b", label: "B", exercises: [
      { name: "Squat",          sets: 3, reps: 5, increment: 5   },
      { name: "Overhead Press", sets: 3, reps: 5, increment: 2.5 },
      { name: "Chin-Up",        sets: 3, reps: 5, increment: 2.5 },
    ]},
  ],
};

const DEFAULT_EQUIPMENT = {
  activeBar: "45lb Bar",
  bars: [
    { name: "45lb Bar", weight: 45 },
    { name: "20lb Bar", weight: 20 },
  ],
  plates: [
    { weight: 45,   count: 8 },
    { weight: 35,   count: 4 },
    { weight: 25,   count: 4 },
    { weight: 10,   count: 8 },
    { weight: 5,    count: 8 },
    { weight: 2.5,  count: 4 },
    { weight: 1.25, count: 4 },
  ],
};

const WARMUP_PROTOCOL = [
  { pct: 0.4, reps: 5 },
  { pct: 0.5, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.7, reps: 2 },
];

// Per-exercise overrides for warmup protocol and smallest weight increment.
// state.exerciseSettings[name] = { increment, warmup: [{ pct, reps }] }
function defaultIncrementFor(name) {
  return EXERCISE_LIBRARY.find((e) => e.name === name)?.increment ?? 5;
}

function getExerciseSettings(state, name) {
  const stored = state.exerciseSettings?.[name] || {};
  return {
    increment: stored.increment ?? defaultIncrementFor(name),
    warmup: stored.warmup?.length ? stored.warmup : WARMUP_PROTOCOL,
  };
}

// Collect every exercise the user has touched (library + programs + history).
function allExerciseNames(state) {
  const names = new Set(EXERCISE_LIBRARY.map((e) => e.name));
  Object.values(state.programs || {}).forEach((days) =>
    days.forEach((d) => d.exercises.forEach((e) => names.add(e.name)))
  );
  (state.history || []).forEach((s) => s.exercises.forEach((e) => names.add(e.name)));
  return [...names].sort();
}

// Full set of selectable exercises for the picker: the built-in library plus
// any exercise that appears in saved programs or imported/logged history.
// Non-library exercises get sensible defaults (reps inferred from history).
function buildExerciseList(state) {
  const byName = new Map();
  EXERCISE_LIBRARY.forEach((e) => byName.set(e.name, { ...e }));
  allExerciseNames(state).forEach((name) => {
    if (byName.has(name)) return;
    let defaultSets = 3, defaultReps = 5;
    for (let i = (state.history || []).length - 1; i >= 0; i--) {
      const ex = state.history[i].exercises.find((e) => e.name === name);
      if (ex) { defaultReps = ex.reps || defaultReps; break; }
    }
    byName.set(name, { name, category: null, defaultSets, defaultReps, increment: getExerciseSettings(state, name).increment });
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Walk history for an exercise: heaviest single (1-rep PR), best session volume, and per-session log.
function getExerciseStats(history, name) {
  let heaviestSingle = null; // { weight, date }
  let maxVolume = null;      // best single set by reps×weight: { reps, weight, volume, date }
  const sessions = [];
  (history || []).forEach((s) => {
    const ex = s.exercises.find((e) => e.name === name);
    if (!ex) return;
    const sets = ex.setsData?.length ? ex.setsData : (ex.weight ? [{ weight: ex.weight, reps: ex.reps }] : []);
    if (!sets.length) return;
    let volume = 0;
    sets.forEach((set) => {
      const w = set.weight || 0, r = set.reps || 0;
      const vol = w * r;
      volume += vol;
      if (r === 1 && (!heaviestSingle || w > heaviestSingle.weight)) heaviestSingle = { weight: w, date: s.date };
      if (vol > 0 && (!maxVolume || vol > maxVolume.volume)) maxVolume = { reps: r, weight: w, volume: vol, date: s.date };
    });
    sessions.push({ date: s.date, sets, volume });
  });
  return { heaviestSingle, maxVolume, sessions: sessions.reverse() };
}

function calcPlateLoading(targetWeight, barWeight, plates) {
  const perSide = (targetWeight - barWeight) / 2;
  if (perSide < 0) return null;
  if (perSide < 0.001) return [];
  const result = [];
  let rem = perSide;
  const sorted = [...plates].sort((a, b) => b.weight - a.weight);
  for (const p of sorted) {
    const use = Math.min(Math.floor(rem / p.weight + 1e-9), Math.floor(p.count / 2));
    if (use > 0) { result.push({ weight: p.weight, count: use }); rem = Math.round((rem - use * p.weight) * 1000) / 1000; }
  }
  return Math.abs(rem) < 0.01 ? result : null;
}

function calcWarmupSets(workingWeight, barWeight, protocol = WARMUP_PROTOCOL, rounding = 2.5) {
  const unit = rounding > 0 ? rounding : 2.5;
  const pctSets = protocol.map(({ pct, reps }) => ({
    pct, reps,
    weight: Math.max(Math.round(workingWeight * pct / unit) * unit, barWeight),
  }));
  // Always start with an empty-bar set for 10 reps, then ramp up by percentage.
  return [{ pct: null, reps: 10, weight: barWeight, barOnly: true }, ...pctSets];
}

const CATEGORY_COLORS = { Lower: "#7eb8f7", Upper: "#c8f542", Power: "#f7a07e" };
const uid = () => Math.random().toString(36).slice(2, 9);

// Format a duration in seconds as m:ss.
const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

// Derive each set's rest time (seconds since the previously-completed set) from
// completion timestamps, so the data stays correct even when sets are toggled.
function computeRests(sets) {
  const order = sets.map((s, idx) => ({ idx, at: s.completedAt })).filter((o) => o.at).sort((a, b) => a.at - b.at);
  const restByIdx = {};
  order.forEach((o, k) => { restByIdx[o.idx] = k === 0 ? null : Math.round((o.at - order[k - 1].at) / 1000); });
  return sets.map((s, idx) => ({ ...s, restSec: s.completedAt ? (restByIdx[idx] ?? null) : null }));
}

// ---- Strong CSV import ----------------------------------------------------
const KG_TO_LB = 1 / 0.45359237;
const roundWeight = (lb) => Math.round((Math.round(lb / 0.25) * 0.25) * 100) / 100;

// Map Strong's exercise names onto this app's library where they correspond.
const STRONG_ALIASES = {
  "Squat": "Squat",
  "Bench Press": "Bench Press",
  "Deadlift": "Deadlift",
  "Overhead Press": "Overhead Press",
  "Chin Up": "Chin-Up",
  "Bicep Curl": "Barbell Curl",
  "Skullcrusher": "Skull Crusher",
  "Bench Press - Close Grip": "Close-Grip Bench Press",
};

function autoMapExerciseName(raw) {
  const base = raw.replace(/\s*\((?:Barbell|Dumbbell|Machine|Cable|Smith Machine|Bodyweight|Plate Loaded|Weighted)\)\s*$/i, "").trim();
  return STRONG_ALIASES[base] || base;
}

// Character-level CSV parser: handles quoted fields, escaped quotes, and
// newlines inside quotes. Delimiter is configurable (Strong uses ';').
function parseCSV(text, delim) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parse a Strong export into a normalized, flat list of rep-based sets.
function parseStrongCsv(text) {
  const delim = (text.split("\n")[0].match(/;/g) || []).length >= (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const rows = parseCSV(text, delim).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) throw new Error("File looks empty.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (pred) => header.findIndex(pred);
  const idx = {
    workoutNo: col((h) => h.includes("workout") && h.includes("#")),
    date: col((h) => h === "date"),
    workoutName: col((h) => h === "workout name"),
    exercise: col((h) => h === "exercise name"),
    setOrder: col((h) => h === "set order"),
    weight: col((h) => h.includes("weight")),
    reps: col((h) => h === "reps"),
  };
  if (idx.exercise < 0 || idx.reps < 0 || idx.weight < 0) throw new Error("This doesn't look like a Strong export (missing Exercise/Weight/Reps columns).");
  const weightIsKg = (header[idx.weight] || "").includes("kg");

  const sets = [];
  const exerciseCounts = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const order = (r[idx.setOrder] || "").trim();
    if (order === "Rest Timer" || order === "Note") continue; // metadata rows, not sets
    const reps = parseInt(r[idx.reps], 10);
    if (!Number.isFinite(reps) || reps <= 0) continue; // skip cardio / time-only rows
    const rawWeight = parseFloat(r[idx.weight]) || 0;
    const setType = order === "W" ? "warmup" : order === "D" ? "drop" : "work";
    const srcExercise = (r[idx.exercise] || "Unknown").trim();
    const dateMs = Date.parse((r[idx.date] || "").replace(" ", "T"));
    sets.push({
      workoutNo: (r[idx.workoutNo] || "").trim() || String(dateMs),
      dateMs: Number.isFinite(dateMs) ? dateMs : 0,
      workoutName: (r[idx.workoutName] || "Workout").trim(),
      srcExercise,
      setType,
      weight: roundWeight(weightIsKg ? rawWeight * KG_TO_LB : rawWeight),
      reps,
    });
    exerciseCounts[srcExercise] = (exerciseCounts[srcExercise] || 0) + 1;
  }
  if (!sets.length) throw new Error("No logged sets found in the file.");
  const dates = sets.map((s) => s.dateMs).filter(Boolean).sort((a, b) => a - b);
  const workouts = new Set(sets.map((s) => s.workoutNo));
  return {
    sets,
    exerciseCounts,
    summary: { sets: sets.length, workouts: workouts.size, exercises: Object.keys(exerciseCounts).length, from: dates[0], to: dates[dates.length - 1] },
  };
}

// Turn parsed sets + a source→target name mapping into app-format sessions.
function buildImportSessions(parsed, mapping) {
  const groups = new Map(); // workoutNo -> { dateMs, workoutName, exercises: Map }
  for (const s of parsed.sets) {
    if (!groups.has(s.workoutNo)) groups.set(s.workoutNo, { dateMs: s.dateMs, workoutName: s.workoutName, exercises: new Map() });
    const g = groups.get(s.workoutNo);
    const target = (mapping[s.srcExercise] || s.srcExercise).trim();
    if (!target) continue;
    if (!g.exercises.has(target)) g.exercises.set(target, []);
    g.exercises.get(target).push({ weight: s.weight, reps: s.reps, completed: true, _type: s.setType });
  }
  const sessions = [];
  for (const [workoutNo, g] of groups) {
    const exercises = [...g.exercises].map(([name, items]) => {
      const work = items.filter((it) => it._type !== "warmup");
      const ref = (work.length ? work : items).reduce((a, b) => (b.weight > a.weight ? b : a));
      return { name, sets: items.length, reps: ref.reps, weight: ref.weight, setsData: items.map(({ weight, reps, completed }) => ({ weight, reps, completed })) };
    });
    sessions.push({ date: g.dateMs, programName: g.workoutName, dayLabel: "", exercises, imported: true, srcId: `strong:${workoutNo}:${g.dateMs}` });
  }
  return sessions.sort((a, b) => a.date - b.date);
}

const STORAGE_KEY = "strengthtracker_state";
const initialState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { equipment: DEFAULT_EQUIPMENT, customWorkout: { exercises: [] }, exerciseSettings: {}, ...JSON.parse(saved) };
  } catch {}
  return { weights: { ...DEFAULT_WEIGHTS }, history: [], programs: DEFAULT_PROGRAMS, activeProgram: "Starting Strength", currentDayIndex: 0, equipment: DEFAULT_EQUIPMENT, customWorkout: { exercises: [] }, exerciseSettings: {} };
};

function PlateLoadingDisplay({ weight, barWeight, plates }) {
  if (weight <= 0) return null;
  if (weight < barWeight) return <span style={{ fontSize: 10, fontFamily: "monospace", color: "#909090" }}>bar only</span>;
  const loading = calcPlateLoading(weight, barWeight, plates);
  if (loading === null) return <span style={{ fontSize: 10, fontFamily: "monospace", color: "#e05252" }}>can't load</span>;
  if (loading.length === 0) return <span style={{ fontSize: 10, fontFamily: "monospace", color: "#808080" }}>bar only</span>;
  return (
    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#909090" }}>
      {loading.map(({ weight: pw, count }, i) => (
        <span key={pw}>{i > 0 && <span style={{ color: "#707070" }}> + </span>}<span style={{ color: "#7eb8f7" }}>{count > 1 ? `${count}×` : ""}{pw}</span></span>
      ))}
      <span style={{ color: "#707070" }}> / side</span>
    </span>
  );
}

function WarmupSection({ workingWeight, equipment, protocol, rounding }) {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState({});
  const bar = equipment.bars.find((b) => b.name === equipment.activeBar) || equipment.bars[0];
  const sets = calcWarmupSets(workingWeight, bar.weight, protocol, rounding);
  const toggle = (i) => setDone((d) => ({ ...d, [i]: !d[i] }));
  const doneCount = sets.filter((_, i) => done[i]).length;
  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "1px solid #383838", borderRadius: 4, color: "#808080", cursor: "pointer", fontFamily: "monospace", fontSize: 9, padding: "4px 10px", letterSpacing: 1 }}>
        {open ? "▲ WARMUP" : "▼ WARMUP"} <span style={{ color: doneCount === sets.length ? "#c8f542" : "#707070" }}>{doneCount}/{sets.length}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {sets.map(({ pct, reps, weight, barOnly }, i) => (
            <div key={i} style={{ background: done[i] ? "rgba(200,245,66,0.06)" : "#1d1d1d", border: `1px solid ${done[i] ? "#c8f542" : "#383838"}`, borderRadius: 6, padding: "7px 10px 7px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <span style={{ color: "#808080", fontFamily: "monospace", fontSize: 10, minWidth: 28 }}>{barOnly ? "BAR" : `${Math.round(pct * 100)}%`}</span>
                <span style={{ color: "#999", fontFamily: "monospace", fontSize: 10 }}>{reps}r</span>
                <span style={{ color: "#c0c0c0", fontWeight: 700, fontSize: 13 }}>{weight}lb</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PlateLoadingDisplay weight={weight} barWeight={bar.weight} plates={equipment.plates} />
                <button onClick={() => toggle(i)} style={{ width: 28, height: 28, borderRadius: 6, border: `2px solid ${done[i] ? "#c8f542" : "#4a4a4a"}`, background: done[i] ? "#c8f542" : "transparent", color: done[i] ? "#0a0a0a" : "#4a4a4a", fontSize: 14, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>{done[i] ? "✓" : ""}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetTracker({ sets, defaultReps, defaultWeight, onUpdate, step = 2.5 }) {
  const [setsData, setSetsData] = useState(
    () => Array.from({ length: sets }, () => ({ weight: defaultWeight, reps: defaultReps, completed: false }))
  );
  const prevWeight = useRef(defaultWeight);

  useEffect(() => {
    if (prevWeight.current !== defaultWeight) {
      setSetsData((prev) => prev.map((s) => s.completed ? s : { ...s, weight: defaultWeight }));
      prevWeight.current = defaultWeight;
    }
  }, [defaultWeight]);

  useEffect(() => {
    onUpdate(setsData.length > 0 && setsData.every((s) => s.completed), setsData);
  }, [setsData]);

  const toggle = (i) => setSetsData((prev) => {
    const now = Date.now();
    const next = prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed, completedAt: !s.completed ? now : null } : s);
    return computeRests(next);
  });
  const updateField = (i, field, val) => setSetsData((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const addSet = () => setSetsData((prev) => {
    const last = prev[prev.length - 1] || { weight: defaultWeight, reps: defaultReps };
    return [...prev, { weight: last.weight, reps: last.reps, completed: false }];
  });
  const removeSet = (i) => setSetsData((prev) => prev.length > 1 ? computeRests(prev.filter((_, idx) => idx !== i)) : prev);

  // Live count-up rest timer: runs from the most recent set completion while
  // there are still sets left to do.
  const lastCompletedAt = setsData.reduce((m, s) => (s.completedAt && s.completedAt > m ? s.completedAt : m), 0);
  const resting = lastCompletedAt > 0 && setsData.some((s) => !s.completed);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resting, lastCompletedAt]);
  const restElapsed = resting ? Math.max(0, Math.round((nowTs - lastCompletedAt) / 1000)) : null;

  const canRemove = setsData.length > 1;
  const inpStyle = { background: "#111", border: "1px solid #3c3c3c", borderRadius: 4, color: "#e0e0e0", textAlign: "center", fontSize: 14, fontWeight: 700, padding: "4px 0", fontFamily: "monospace", outline: "none" };
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
      {restElapsed != null && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(126,184,247,0.08)", border: "1px solid #7eb8f7", borderRadius: 8, padding: "6px 12px" }}>
          <span style={{ color: "#7eb8f7", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>⏱ RESTING</span>
          <span style={{ color: "#7eb8f7", fontFamily: "monospace", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(restElapsed)}</span>
        </div>
      )}
      {setsData.map((set, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: set.completed ? "rgba(200,245,66,0.06)" : "#1a1a1a", border: `1px solid ${set.completed ? "#c8f542" : "#383838"}`, borderRadius: 8, padding: "7px 10px", transition: "all 0.15s" }}>
          <button onClick={() => removeSet(i)} disabled={!canRemove} style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid #383838", background: "transparent", color: canRemove ? "#909090" : "#383838", cursor: canRemove ? "pointer" : "default", fontSize: 15, flexShrink: 0, lineHeight: 1 }}>−</button>
          <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 10, minWidth: 14, textAlign: "center" }}>{i + 1}</span>
          <input type="number" value={set.weight} min={0} step={step} onChange={(e) => updateField(i, "weight", parseFloat(e.target.value) || 0)} style={{ ...inpStyle, width: 56 }} />
          <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 10 }}>lb×</span>
          <input type="number" value={set.reps} min={0} onChange={(e) => updateField(i, "reps", parseInt(e.target.value) || 0)} style={{ ...inpStyle, width: 32 }} />
          <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 10, flex: 1 }}>r{set.restSec != null && <span style={{ color: "#7eb8f7", marginLeft: 6 }}>· rest {fmtDuration(set.restSec)}</span>}</span>
          <button onClick={() => toggle(i)} style={{ width: 34, height: 34, borderRadius: 6, border: `2px solid ${set.completed ? "#c8f542" : "#4a4a4a"}`, background: set.completed ? "#c8f542" : "transparent", color: set.completed ? "#0a0a0a" : "#4a4a4a", fontSize: 16, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>{set.completed ? "✓" : ""}</button>
        </div>
      ))}
      <button onClick={addSet} style={{ width: "100%", padding: "6px 0", background: "transparent", border: "1px dashed #3c3c3c", borderRadius: 6, color: "#808080", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>+ ADD SET</button>
    </div>
  );
}

function ExerciseCard({ exercise, weight, onWeightChange, onComplete, equipment, settings, onOpenDetail }) {
  const [done, setDone] = useState(false);
  const lib = EXERCISE_LIBRARY.find((e) => e.name === exercise.name);
  const catColor = lib ? CATEGORY_COLORS[lib.category] : "#888";
  const bar = equipment?.bars.find((b) => b.name === equipment.activeBar) || equipment?.bars[0];
  const increment = settings?.increment ?? exercise.increment;
  return (
    <div style={{ background: done ? "rgba(200,245,66,0.04)" : "#1c1c1c", border: `1px solid ${done ? "#c8f542" : "#383838"}`, borderLeft: `3px solid ${done ? "#c8f542" : catColor}`, borderRadius: 10, padding: "18px 20px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onOpenDetail?.(exercise.name)} style={{ background: "none", border: "none", padding: 0, fontSize: 17, fontWeight: 700, color: done ? "#c8f542" : "#f0f0f0", letterSpacing: 1, cursor: onOpenDetail ? "pointer" : "default", textAlign: "left" }}>{exercise.name}</button>
            {onOpenDetail && <button onClick={() => onOpenDetail(exercise.name)} title="History & settings" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#707070", padding: 0 }}>📊</button>}
            {done && <span style={{ color: "#c8f542" }}>✓</span>}
          </div>
          <div style={{ color: "#808080", fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{exercise.sets}×{exercise.reps} — +{exercise.increment}lb/session</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onWeightChange(Math.max(0, weight - increment))} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 18 }}>−</button>
            <div style={{ minWidth: 56, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#c8f542" }}>{weight}</div>
              <div style={{ fontSize: 9, color: "#808080", fontFamily: "monospace" }}>LBS</div>
            </div>
            <button onClick={() => onWeightChange(weight + increment)} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 18 }}>+</button>
          </div>
          {bar && weight > 0 && <PlateLoadingDisplay weight={weight} barWeight={bar.weight} plates={equipment.plates} />}
        </div>
      </div>
      {equipment && weight > 0 && <div style={{ marginTop: 12 }}><WarmupSection workingWeight={weight} equipment={equipment} protocol={settings?.warmup} rounding={increment} /></div>}
      <SetTracker sets={exercise.sets} defaultReps={exercise.reps} defaultWeight={weight} step={increment} onUpdate={(isDone, setsData) => { setDone(isDone); onComplete(exercise.name, isDone, setsData); }} />
    </div>
  );
}

function ExercisePicker({ usedNames, onAdd, exercises = EXERCISE_LIBRARY }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = exercises.filter((e) => !usedNames.includes(e.name) && e.name.toLowerCase().includes(q));
  const exactMatch = exercises.some((e) => e.name.toLowerCase() === q) || usedNames.some((n) => n.toLowerCase() === q);
  const inp = { background: "#1d1d1d", border: "1px solid #3c3c3c", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 12, padding: "7px 10px", outline: "none" };
  const add = (name) => { onAdd(name); setOpen(false); setSearch(""); };
  if (!open) return <button onClick={() => setOpen(true)} style={{ width: "100%", marginTop: 8, padding: 10, background: "transparent", border: "1px dashed #3c3c3c", borderRadius: 6, color: "#808080", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>+ ADD EXERCISE</button>;
  return (
    <div style={{ marginTop: 8 }}>
      <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or type a new exercise..." style={{ ...inp, width: "100%", marginBottom: 6 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {filtered.map((ex) => {
          const c = CATEGORY_COLORS[ex.category] || "#9a9a9a";
          return <button key={ex.name} onClick={() => add(ex.name)} style={{ padding: "6px 12px", borderRadius: 5, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>{ex.name}</button>;
        })}
        {q && !exactMatch && <button onClick={() => add(search.trim())} style={{ padding: "6px 12px", borderRadius: 5, border: "1px dashed #c8f542", background: "rgba(200,245,66,0.08)", color: "#c8f542", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>+ create “{search.trim()}”</button>}
        {!filtered.length && !q && <span style={{ color: "#707070", fontSize: 12, fontFamily: "monospace" }}>No exercises found</span>}
      </div>
      <button onClick={() => setOpen(false)} style={{ marginTop: 6, background: "none", border: "none", color: "#707070", cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>cancel</button>
    </div>
  );
}

function ProgramBuilder({ programs, editingName, onSave, onClose, exercises = EXERCISE_LIBRARY }) {
  const existing = editingName && programs[editingName];
  const [name, setName] = useState(editingName || "");
  const [days, setDays] = useState(() => existing ? JSON.parse(JSON.stringify(existing)) : [{ id: uid(), label: "A", exercises: [] }]);
  const addDay = () => setDays((d) => [...d, { id: uid(), label: String.fromCharCode(65 + d.length), exercises: [] }]);
  const removeDay = (id) => setDays((d) => d.filter((x) => x.id !== id));
  const updateLabel = (id, label) => setDays((d) => d.map((x) => x.id === id ? { ...x, label: label.slice(0, 3).toUpperCase() } : x));
  const addExercise = (dayId, exName) => { const lib = exercises.find((e) => e.name === exName) || { defaultSets: 3, defaultReps: 5, increment: 5 }; setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: [...day.exercises, { name: exName, sets: lib.defaultSets, reps: lib.defaultReps, increment: lib.increment }] })); };
  const removeExercise = (dayId, exName) => setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: day.exercises.filter((e) => e.name !== exName) }));
  const updateField = (dayId, exName, field, val) => setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: day.exercises.map((e) => e.name !== exName ? e : { ...e, [field]: val }) }));
  const moveEx = (dayId, exName, dir) => setDays((d) => d.map((day) => { if (day.id !== dayId) return day; const exes = [...day.exercises]; const idx = exes.findIndex((e) => e.name === exName); const next = idx + dir; if (next < 0 || next >= exes.length) return day; [exes[idx], exes[next]] = [exes[next], exes[idx]]; return { ...day, exercises: exes }; }));
  const handleSave = () => { if (!name.trim()) return alert("Enter a program name"); if (!days.length) return alert("Add at least one day"); if (days.some((d) => !d.exercises.length)) return alert("Every day needs at least one exercise"); onSave(name.trim(), days); };
  const inp = (extra = {}) => ({ background: "#080808", border: "1px solid #3c3c3c", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 12, padding: "6px 10px", outline: "none", ...extra });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 100, overflowY: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#c8f542", letterSpacing: 2 }}>{editingName ? "EDIT PROGRAM" : "NEW PROGRAM"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#909090", cursor: "pointer", fontSize: 24, padding: "4px 8px" }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#808080", fontFamily: "monospace", marginBottom: 6 }}>PROGRAM NAME</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Texas Method, 3-Day Split..." style={{ ...inp({ width: "100%", fontSize: 14, padding: "10px 12px" }) }} />
        </div>
        {days.map((day, dayIdx) => (
          <div key={day.id} style={{ background: "#1d1d1d", border: "1px solid #383838", borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#808080", fontFamily: "monospace" }}>LABEL</span>
                <input value={day.label} onChange={(e) => updateLabel(day.id, e.target.value)} style={{ ...inp({ width: 50, textAlign: "center", fontSize: 18, color: "#c8f542", fontWeight: 900, padding: "4px 8px" }) }} />
              </div>
              {days.length > 1 && <button onClick={() => removeDay(day.id)} style={{ background: "none", border: "1px solid #3c3c3c", borderRadius: 4, color: "#909090", cursor: "pointer", padding: "5px 10px", fontFamily: "monospace", fontSize: 10 }}>REMOVE</button>}
            </div>
            {day.exercises.map((ex, exIdx) => {
              const lib = exercises.find((e) => e.name === ex.name);
              const c = (lib && CATEGORY_COLORS[lib.category]) || "#9a9a9a";
              return (
                <div key={ex.name} style={{ background: "#1a1a1a", border: "1px solid #383838", borderLeft: `3px solid ${c}`, borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#ddd" }}>{ex.name}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => moveEx(day.id, ex.name, -1)} disabled={exIdx === 0} style={{ ...inp({ padding: "3px 8px", color: exIdx === 0 ? "#4a4a4a" : "#aaa", cursor: exIdx === 0 ? "default" : "pointer" }) }}>↑</button>
                      <button onClick={() => moveEx(day.id, ex.name, 1)} disabled={exIdx === day.exercises.length - 1} style={{ ...inp({ padding: "3px 8px", color: exIdx === day.exercises.length - 1 ? "#4a4a4a" : "#aaa", cursor: exIdx === day.exercises.length - 1 ? "default" : "pointer" }) }}>↓</button>
                      <button onClick={() => removeExercise(day.id, ex.name)} style={{ ...inp({ padding: "3px 8px", color: "#e05252", cursor: "pointer" }) }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {[["SETS","sets",1],["REPS","reps",1],["+LB","increment",2.5]].map(([label, field, step]) => (
                      <div key={field}>
                        <div style={{ fontSize: 9, color: "#808080", fontFamily: "monospace", marginBottom: 3 }}>{label}</div>
                        <input type="number" value={ex[field]} min={0} step={step} onChange={(e) => updateField(day.id, ex.name, field, parseFloat(e.target.value) || 0)} style={{ ...inp({ width: 62, textAlign: "center" }) }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <ExercisePicker usedNames={day.exercises.map((e) => e.name)} onAdd={(n) => addExercise(day.id, n)} exercises={exercises} />
          </div>
        ))}
        <button onClick={addDay} style={{ width: "100%", padding: 12, background: "transparent", border: "1px dashed #3c3c3c", borderRadius: 8, color: "#808080", cursor: "pointer", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>+ ADD DAY</button>
        <button onClick={handleSave} style={{ width: "100%", padding: 16, background: "#c8f542", border: "none", borderRadius: 8, color: "#0a0a0a", fontWeight: 900, fontSize: 15, letterSpacing: 2, cursor: "pointer" }}>SAVE PROGRAM</button>
      </div>
    </div>
  );
}

function HistoryView({ history }) {
  if (!history.length) return <div style={{ textAlign: "center", color: "#707070", padding: "60px 0", fontFamily: "monospace", fontSize: 12 }}>NO SESSIONS LOGGED YET</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...history].reverse().map((s, i) => (
        <div key={i} style={{ background: "#1c1c1c", border: "1px solid #383838", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#c8f542", fontWeight: 700, fontSize: 14 }}>
              {s.programName}{s.dayLabel ? ` — DAY ${s.dayLabel}` : ""}
              {s.imported && <span style={{ color: "#707070", fontSize: 9, fontFamily: "monospace", marginLeft: 6, border: "1px solid #383838", borderRadius: 3, padding: "1px 5px" }}>IMPORTED</span>}
            </span>
            <span style={{ color: "#707070", fontSize: 11, fontFamily: "monospace" }}>{new Date(s.date).toLocaleDateString()}</span>
          </div>
          {s.exercises.map((ex) => (
            <div key={ex.name} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace" }}>
                <span style={{ color: "#aaa" }}>{ex.name}</span>
                {!ex.setsData?.length && <span style={{ color: "#808080" }}>{ex.sets}×{ex.reps} @ {ex.weight}lb</span>}
              </div>
              {ex.setsData?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                  {ex.setsData.map((set, si) => (
                    <span key={si} title={set.restSec != null ? `${fmtDuration(set.restSec)} rest before this set` : undefined} style={{ fontSize: 10, fontFamily: "monospace", color: "#808080", background: "#252525", borderRadius: 4, padding: "2px 6px" }}>{set.weight}lb×{set.reps}{set.restSec != null && <span style={{ color: "#5a7ea6" }}> ⏱{fmtDuration(set.restSec)}</span>}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EquipmentView({ equipment, onUpdate }) {
  const updateBar = (name) => onUpdate({ ...equipment, activeBar: name });
  const updateCount = (weight, delta) => onUpdate({
    ...equipment,
    plates: equipment.plates.map((p) => p.weight === weight ? { ...p, count: Math.max(0, p.count + delta) } : p),
  });
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, marginBottom: 16 }}>EQUIPMENT</div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: "#808080", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>BARBELL</div>
        <div style={{ display: "flex", gap: 8 }}>
          {equipment.bars.map((b) => (
            <button key={b.name} onClick={() => updateBar(b.name)} style={{ padding: "10px 16px", borderRadius: 7, border: `1px solid ${b.name === equipment.activeBar ? "#c8f542" : "#1e1e1e"}`, background: b.name === equipment.activeBar ? "rgba(200,245,66,0.08)" : "#1c1c1c", color: b.name === equipment.activeBar ? "#c8f542" : "#909090", fontFamily: "monospace", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: "#808080", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>PLATES — adjust how many you have available</div>
        {equipment.plates.map((p) => (
          <div key={p.weight} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1c1c1c", border: "1px solid #383838", borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
            <div>
              <span style={{ color: "#d0d0d0", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{p.weight}lb</span>
              <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 10, marginLeft: 10 }}>{Math.floor(p.count / 2)} pair{Math.floor(p.count / 2) !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => updateCount(p.weight, -2)} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 16 }}>−</button>
              <span style={{ minWidth: 28, textAlign: "center", color: "#c8f542", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{p.count}</span>
              <button onClick={() => updateCount(p.weight, 2)} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 16 }}>+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrCard({ label, value, sub }) {
  return (
    <div style={{ flex: 1, background: "#1c1c1c", border: "1px solid #383838", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, color: "#808080", fontFamily: "monospace", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: value ? "#c8f542" : "#4a4a4a", marginTop: 4 }}>{value || "—"}</div>
      {sub && <div style={{ fontSize: 9, color: "#707070", fontFamily: "monospace", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ExerciseDetailView({ name, history, settings, onUpdateSettings, onBack }) {
  const lib = EXERCISE_LIBRARY.find((e) => e.name === name);
  const catColor = lib ? CATEGORY_COLORS[lib.category] : "#888";
  const stats = getExerciseStats(history, name);
  const warmup = settings.warmup;

  const setIncrement = (val) => onUpdateSettings(name, { increment: Math.max(0, val) });
  const updateWarmupRow = (i, field, val) =>
    onUpdateSettings(name, { warmup: warmup.map((w, idx) => idx === i ? { ...w, [field]: val } : w) });
  const addWarmupRow = () => {
    const last = warmup[warmup.length - 1] || { pct: 0.5, reps: 5 };
    onUpdateSettings(name, { warmup: [...warmup, { pct: Math.min(1, last.pct + 0.1), reps: last.reps }] });
  };
  const removeWarmupRow = (i) => onUpdateSettings(name, { warmup: warmup.filter((_, idx) => idx !== i) });
  const resetWarmup = () => onUpdateSettings(name, { warmup: WARMUP_PROTOCOL.map((w) => ({ ...w })) });

  const inp = (extra = {}) => ({ background: "#080808", border: "1px solid #3c3c3c", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 13, padding: "6px 10px", outline: "none", textAlign: "center", ...extra });
  const sectionLabel = { fontSize: 10, color: "#808080", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "1px solid #383838", borderRadius: 5, color: "#909090", cursor: "pointer", padding: "6px 12px", fontFamily: "monospace", fontSize: 10, marginBottom: 14 }}>← BACK</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: catColor }} />
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>{name}</div>
      </div>
      {lib && <div style={{ fontSize: 11, color: "#707070", fontFamily: "monospace", marginBottom: 18 }}>{lib.category.toUpperCase()}</div>}

      {/* PRs */}
      <div style={sectionLabel}>PERSONAL RECORDS</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <PrCard
          label="HEAVIEST SINGLE"
          value={stats.heaviestSingle ? `${stats.heaviestSingle.weight}lb` : ""}
          sub={stats.heaviestSingle ? new Date(stats.heaviestSingle.date).toLocaleDateString() : "no 1-rep sets logged"}
        />
        <PrCard
          label="MAX VOLUME"
          value={stats.maxVolume ? `${stats.maxVolume.reps} × ${stats.maxVolume.weight}lb` : ""}
          sub={stats.maxVolume ? new Date(stats.maxVolume.date).toLocaleDateString() : "no sets logged"}
        />
      </div>

      {/* Settings */}
      <div style={sectionLabel}>SETTINGS</div>
      <div style={{ background: "#1c1c1c", border: "1px solid #383838", borderRadius: 10, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#d0d0d0", fontWeight: 700 }}>Smallest weight increment</div>
            <div style={{ fontSize: 10, color: "#707070", fontFamily: "monospace", marginTop: 2 }}>step for +/− buttons & auto-progression</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setIncrement(Math.round((settings.increment - 1.25) * 100) / 100)} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 16 }}>−</button>
            <input type="number" min={0} step={1.25} value={settings.increment} onChange={(e) => setIncrement(parseFloat(e.target.value) || 0)} style={{ ...inp({ width: 64, fontWeight: 700, color: "#c8f542" }) }} />
            <button onClick={() => setIncrement(Math.round((settings.increment + 1.25) * 100) / 100)} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#aaa", cursor: "pointer", fontSize: 16 }}>+</button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: "#d0d0d0", fontWeight: 700 }}>Warmup sets</div>
          <button onClick={resetWarmup} style={{ background: "none", border: "1px solid #3c3c3c", borderRadius: 4, color: "#909090", cursor: "pointer", padding: "4px 10px", fontFamily: "monospace", fontSize: 9 }}>RESET</button>
        </div>
        <div style={{ fontSize: 10, color: "#707070", fontFamily: "monospace", marginBottom: 10 }}>an empty-bar set of 10 reps is always added first, then these percentage sets</div>
        <div style={{ display: "flex", gap: 8, padding: "0 4px 6px", fontSize: 9, color: "#707070", fontFamily: "monospace" }}>
          <span style={{ width: 32 }}>#</span>
          <span style={{ flex: 1 }}>% OF WORK SET</span>
          <span style={{ flex: 1 }}>REPS</span>
          <span style={{ width: 30 }} />
        </div>
        {warmup.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ width: 32, textAlign: "center", color: "#707070", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="number" min={0} max={100} step={5} value={Math.round(w.pct * 100)} onChange={(e) => updateWarmupRow(i, "pct", (parseFloat(e.target.value) || 0) / 100)} style={{ ...inp({ width: "100%" }) }} />
              <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 11 }}>%</span>
            </div>
            <div style={{ flex: 1 }}>
              <input type="number" min={1} step={1} value={w.reps} onChange={(e) => updateWarmupRow(i, "reps", parseInt(e.target.value) || 0)} style={{ ...inp({ width: "100%" }) }} />
            </div>
            <button onClick={() => removeWarmupRow(i)} disabled={warmup.length <= 1} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: warmup.length <= 1 ? "#3c3c3c" : "#e05252", cursor: warmup.length <= 1 ? "default" : "pointer", fontSize: 13 }}>✕</button>
          </div>
        ))}
        <button onClick={addWarmupRow} style={{ width: "100%", padding: "6px 0", marginTop: 4, background: "transparent", border: "1px dashed #3c3c3c", borderRadius: 6, color: "#808080", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>+ ADD WARMUP SET</button>
      </div>

      {/* History */}
      <div style={sectionLabel}>LIFT HISTORY</div>
      {!stats.sessions.length
        ? <div style={{ textAlign: "center", color: "#707070", padding: "40px 0", fontFamily: "monospace", fontSize: 12 }}>NO SESSIONS LOGGED YET</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.sessions.map((s, i) => (
              <div key={i} style={{ background: "#1c1c1c", border: "1px solid #383838", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "#c0c0c0", fontFamily: "monospace", fontSize: 11 }}>{new Date(s.date).toLocaleDateString()}</span>
                  <span style={{ color: "#707070", fontFamily: "monospace", fontSize: 10 }}>
                    {(() => { const r = s.sets.map((x) => x.restSec).filter((x) => x != null); return r.length ? `⏱ ${fmtDuration(r.reduce((a, b) => a + b, 0) / r.length)} avg · ` : ""; })()}
                    vol {s.volume.toLocaleString()}lb
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {s.sets.map((set, si) => (
                    <span key={si} title={set.restSec != null ? `${fmtDuration(set.restSec)} rest before this set` : undefined} style={{ fontSize: 11, fontFamily: "monospace", color: "#aaa", background: "#252525", borderRadius: 4, padding: "3px 8px" }}>{set.weight}lb×{set.reps}{set.restSec != null && <span style={{ color: "#7eb8f7" }}> ⏱{fmtDuration(set.restSec)}</span>}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function ImportModal({ existingHistory, onConfirm, onClose }) {
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name); setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const p = parseStrongCsv(String(e.target.result));
        setParsed(p);
        const m = {};
        Object.keys(p.exerciseCounts).forEach((src) => { m[src] = autoMapExerciseName(src); });
        setMapping(m);
      } catch (err) { setParsed(null); setError(err.message || "Could not parse the file."); }
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(file);
  };

  const existingIds = useMemo(() => new Set((existingHistory || []).filter((s) => s.srcId).map((s) => s.srcId)), [existingHistory]);
  const result = useMemo(() => {
    if (!parsed) return null;
    const all = buildImportSessions(parsed, mapping);
    const fresh = all.filter((s) => !existingIds.has(s.srcId));
    const latestWeights = {};
    fresh.forEach((s) => s.exercises.forEach((ex) => { latestWeights[ex.name] = ex.weight; }));
    return { fresh, dupes: all.length - fresh.length, latestWeights };
  }, [parsed, mapping, existingIds]);

  const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString() : "—");
  const inp = { background: "#080808", border: "1px solid #3c3c3c", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 12, padding: "6px 9px", outline: "none" };
  const libNames = EXERCISE_LIBRARY.map((e) => e.name);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 100, overflowY: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#c8f542", letterSpacing: 2 }}>IMPORT HISTORY</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#909090", cursor: "pointer", fontSize: 24, padding: "4px 8px" }}>✕</button>
        </div>

        <div style={{ fontSize: 11, color: "#909090", fontFamily: "monospace", lineHeight: 1.6, marginBottom: 16 }}>
          Export your history from the Strong app (Settings → Export Data) and select the <span style={{ color: "#c8f542" }}>.csv</span> file. Weights are converted from kg to lb automatically.
        </div>

        <datalist id="lib-exercises">{libNames.map((n) => <option key={n} value={n} />)}</datalist>

        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: 16, background: "transparent", border: "1px dashed #4a4a4a", borderRadius: 8, color: "#c0c0c0", cursor: "pointer", fontFamily: "monospace", fontSize: 12, marginBottom: 14 }}>
          {fileName ? `📄 ${fileName} — choose a different file` : "📂 CHOOSE STRONG .CSV FILE"}
        </button>

        {error && <div style={{ background: "rgba(224,82,82,0.1)", border: "1px solid #e05252", borderRadius: 8, padding: "10px 14px", color: "#e05252", fontFamily: "monospace", fontSize: 11, marginBottom: 14 }}>{error}</div>}

        {parsed && result && <>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {[["WORKOUTS", parsed.summary.workouts], ["SETS", parsed.summary.sets.toLocaleString()], ["EXERCISES", parsed.summary.exercises], ["RANGE", `${fmtDate(parsed.summary.from)} → ${fmtDate(parsed.summary.to)}`]].map(([l, v]) => (
              <div key={l} style={{ flex: "1 1 120px", background: "#1c1c1c", border: "1px solid #383838", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#808080", fontFamily: "monospace", letterSpacing: 1 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#c8f542", marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: "#808080", fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>EXERCISE MAPPING</div>
          <div style={{ fontSize: 10, color: "#707070", fontFamily: "monospace", marginBottom: 10 }}>edit a name to rename or merge lifts — names matching the library link to its page & settings</div>
          {Object.keys(parsed.exerciseCounts).sort((a, b) => parsed.exerciseCounts[b] - parsed.exerciseCounts[a]).map((src) => {
            const mapped = mapping[src];
            const inLib = libNames.includes(mapped);
            return (
              <div key={src} style={{ display: "flex", alignItems: "center", gap: 8, background: "#1a1a1a", border: "1px solid #383838", borderRadius: 8, padding: "8px 10px", marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#d0d0d0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src}</div>
                  <div style={{ fontSize: 9, color: "#707070", fontFamily: "monospace" }}>{parsed.exerciseCounts[src]} sets</div>
                </div>
                <span style={{ color: "#707070", fontSize: 14 }}>→</span>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <input list="lib-exercises" value={mapped} onChange={(e) => setMapping((m) => ({ ...m, [src]: e.target.value }))} style={{ ...inp, width: "100%", textAlign: "right" }} />
                  <span style={{ fontSize: 8, fontFamily: "monospace", color: inLib ? "#c8f542" : "#707070" }}>{inLib ? "✓ library" : "custom"}</span>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 18, fontSize: 11, color: "#909090", fontFamily: "monospace", lineHeight: 1.6 }}>
            <span style={{ color: "#c8f542", fontWeight: 700 }}>{result.fresh.length}</span> new session{result.fresh.length !== 1 ? "s" : ""} will be added.
            {result.dupes > 0 && <> <span style={{ color: "#f7a07e" }}>{result.dupes}</span> already imported (skipped).</>}
          </div>
          <button onClick={() => onConfirm(result.fresh, result.latestWeights)} disabled={!result.fresh.length} style={{ width: "100%", marginTop: 14, padding: 16, background: result.fresh.length ? "#c8f542" : "#161616", border: "none", borderRadius: 8, color: result.fresh.length ? "#0a0a0a" : "#777", fontWeight: 900, fontSize: 14, letterSpacing: 2, cursor: result.fresh.length ? "pointer" : "not-allowed" }}>
            {result.fresh.length ? `IMPORT ${result.fresh.length} SESSION${result.fresh.length !== 1 ? "S" : ""}` : "NOTHING NEW TO IMPORT"}
          </button>
        </>}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState("workout");
  const [completedSets, setCompletedSets] = useState({});
  const [sessionKey, setSessionKey] = useState(0);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const importHistory = (sessions, latestWeights) => {
    setState((s) => ({
      ...s,
      history: [...s.history, ...sessions].sort((a, b) => a.date - b.date),
      weights: { ...s.weights, ...latestWeights },
    }));
    setShowImport(false);
    setView("history");
  };

  const openExerciseDetail = (name) => { setSelectedExercise(name); setView("exercises"); };
  const updateExerciseSettings = (name, patch) => setState((s) => ({
    ...s,
    exerciseSettings: { ...s.exerciseSettings, [name]: { ...getExerciseSettings(s, name), ...patch } },
  }));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const exerciseList = useMemo(() => buildExerciseList(state), [state]);
  const program = state.programs[state.activeProgram] || [];
  const day = program[state.currentDayIndex] || program[0];
  const programExercises = day?.exercises || [];
  const activeExercises = isCustomMode ? (state.customWorkout?.exercises || []) : programExercises;
  const allDone = activeExercises.length > 0 && activeExercises.every((ex) => completedSets[ex.name]?.done);

  const updateWeight = (name, val) => setState((s) => ({ ...s, weights: { ...s.weights, [name]: Math.max(0, val) } }));
  const markComplete = (name, isDone, setsData) => setCompletedSets((p) => ({ ...p, [name]: { done: isDone, sets: setsData } }));
  const finishWorkout = () => {
    if (!isCustomMode && !day) return;
    const exes = isCustomMode ? (state.customWorkout?.exercises || []) : programExercises;
    const session = {
      date: Date.now(),
      programName: isCustomMode ? "Custom" : state.activeProgram,
      dayLabel: isCustomMode ? "Custom" : day.label,
      exercises: exes.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: state.weights[ex.name] ?? 0,
        setsData: (completedSets[ex.name]?.sets || []).map(({ weight, reps, completed, restSec }) => ({ weight, reps, completed, ...(restSec != null ? { restSec } : {}) })),
      })),
    };
    const newWeights = { ...state.weights };
    exes.forEach((ex) => { newWeights[ex.name] = (state.weights[ex.name] ?? 0) + getExerciseSettings(state, ex.name).increment; });
    setState((s) => ({
      ...s,
      weights: newWeights,
      history: [...s.history, session],
      ...(isCustomMode ? { customWorkout: { exercises: [] } } : { currentDayIndex: (state.currentDayIndex + 1) % program.length }),
    }));
    setCompletedSets({}); setSessionKey((k) => k + 1);
    if (isCustomMode) setIsCustomMode(false);
    setView("history");
  };
  const addCustomExercise = (exName) => {
    const lib = exerciseList.find((e) => e.name === exName) || { defaultSets: 3, defaultReps: 5, increment: 5 };
    setState((s) => ({ ...s, customWorkout: { exercises: [...(s.customWorkout?.exercises || []), { name: exName, sets: lib.defaultSets, reps: lib.defaultReps, increment: lib.increment }] } }));
  };
  const removeCustomExercise = (exName) => {
    setState((s) => ({ ...s, customWorkout: { exercises: (s.customWorkout?.exercises || []).filter((e) => e.name !== exName) } }));
    setCompletedSets((p) => { const next = { ...p }; delete next[exName]; return next; });
  };
  const moveCustomExercise = (exName, dir) => {
    setState((s) => {
      const exes = [...(s.customWorkout?.exercises || [])];
      const idx = exes.findIndex((e) => e.name === exName);
      const next = idx + dir;
      if (next < 0 || next >= exes.length) return s;
      [exes[idx], exes[next]] = [exes[next], exes[idx]];
      return { ...s, customWorkout: { exercises: exes } };
    });
  };
  const saveProgram = (name, days) => { setState((s) => ({ ...s, programs: { ...s.programs, [name]: days }, activeProgram: name, currentDayIndex: 0 })); setShowBuilder(false); setEditingProgram(null); setCompletedSets({}); setSessionKey((k) => k + 1); };
  const deleteProgram = (pname) => { if (!confirm(`Delete "${pname}"?`)) return; setState((s) => { const { [pname]: _, ...rest } = s.programs; return { ...s, programs: rest, activeProgram: Object.keys(rest)[0] || null, currentDayIndex: 0 }; }); };
  const selectProgram = (pname) => { setState((s) => ({ ...s, activeProgram: pname, currentDayIndex: 0 })); setCompletedSets({}); setSessionKey((k) => k + 1); setShowPicker(false); };
  const updateEquipment = (eq) => setState((s) => ({ ...s, equipment: eq }));
  const nav = (label, active, onClick) => <button onClick={onClick} style={{ padding: "7px 13px", borderRadius: 6, border: "none", background: active ? "#c8f542" : "#1d1d1d", color: active ? "#0a0a0a" : "#909090", fontFamily: "monospace", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1 }}>{label}</button>;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0" }}>
      <div className="app-header">
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3, color: "#c8f542" }}>STARTING STRENGTH</div>
          <div style={{ fontSize: 9, color: "#707070", fontFamily: "monospace", letterSpacing: 2 }}>LINEAR PROGRESSION TRACKER</div>
        </div>
        <div className="app-nav">
          {nav("Workout", view === "workout", () => setView("workout"))}
          {nav("Exercises", view === "exercises", () => { setSelectedExercise(null); setView("exercises"); })}
          {nav("History", view === "history", () => setView("history"))}
          {nav("Programs", view === "programs", () => setView("programs"))}
          {nav("Equipment", view === "equipment", () => setView("equipment"))}
        </div>
      </div>

      <div style={{ maxWidth: 580, margin: "0 auto", padding: "16px 14px 80px" }}>
        {view === "workout" && <>
          {isCustomMode ? (
            <div style={{ background: "#181818", border: "1px solid #383838", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#c8f542" }}>CUSTOM WORKOUT</div>
                <button onClick={() => { setIsCustomMode(false); setCompletedSets({}); setSessionKey((k) => k + 1); }} style={{ background: "none", border: "1px solid #383838", borderRadius: 5, color: "#909090", cursor: "pointer", padding: "5px 10px", fontFamily: "monospace", fontSize: 10 }}>← PROGRAM</button>
              </div>
              {(state.customWorkout?.exercises || []).map((ex, idx) => {
                const lib = exerciseList.find((e) => e.name === ex.name);
                const c = (lib && CATEGORY_COLORS[lib.category]) || "#9a9a9a";
                const last = idx === (state.customWorkout?.exercises || []).length - 1;
                return (
                  <div key={ex.name} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a1a1a", border: "1px solid #383838", borderLeft: `3px solid ${c}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5 }}>
                    <span style={{ flex: 1, fontSize: 13, color: "#d0d0d0", fontWeight: 600 }}>{ex.name}</span>
                    <span style={{ fontSize: 10, color: "#808080", fontFamily: "monospace" }}>{ex.sets}×{ex.reps}</span>
                    <button onClick={() => moveCustomExercise(ex.name, -1)} disabled={idx === 0} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: idx === 0 ? "#4a4a4a" : "#aaa", cursor: idx === 0 ? "default" : "pointer", fontSize: 13 }}>↑</button>
                    <button onClick={() => moveCustomExercise(ex.name, 1)} disabled={last} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: last ? "#4a4a4a" : "#aaa", cursor: last ? "default" : "pointer", fontSize: 13 }}>↓</button>
                    <button onClick={() => removeCustomExercise(ex.name)} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #3c3c3c", background: "#1e1e1e", color: "#e05252", cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                );
              })}
              <ExercisePicker usedNames={(state.customWorkout?.exercises || []).map((e) => e.name)} onAdd={addCustomExercise} exercises={exerciseList} />
            </div>
          ) : (
            <div style={{ background: "#181818", border: "1px solid #383838", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 9, color: "#707070", fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>ACTIVE PROGRAM</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#e0e0e0" }}>{state.activeProgram || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setIsCustomMode(true); setCompletedSets({}); setSessionKey((k) => k + 1); }} style={{ background: "none", border: "1px solid #383838", borderRadius: 5, color: "#909090", cursor: "pointer", padding: "6px 12px", fontFamily: "monospace", fontSize: 10 }}>CUSTOM</button>
                  <button onClick={() => setShowPicker(true)} style={{ background: "none", border: "1px solid #383838", borderRadius: 5, color: "#909090", cursor: "pointer", padding: "6px 12px", fontFamily: "monospace", fontSize: 10 }}>SWITCH</button>
                </div>
              </div>
              {program.length > 1 && (
                <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                  {program.map((d, i) => (
                    <button key={d.id} onClick={() => { setState((s) => ({ ...s, currentDayIndex: i })); setCompletedSets({}); setSessionKey((k) => k + 1); }} style={{ padding: "5px 16px", borderRadius: 5, border: "none", background: state.currentDayIndex === i ? "#c8f542" : "#181818", color: state.currentDayIndex === i ? "#0a0a0a" : "#808080", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>DAY {d.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeExercises.length === 0
            ? <div style={{ textAlign: "center", color: "#707070", padding: "60px 0", fontFamily: "monospace", fontSize: 12 }}>{isCustomMode ? "ADD EXERCISES ABOVE TO BEGIN" : "NO EXERCISES — GO TO PROGRAMS TAB"}</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }} key={sessionKey}>
                {activeExercises.map((ex) => <ExerciseCard key={ex.name} exercise={ex} weight={state.weights[ex.name] ?? 0} onWeightChange={(val) => updateWeight(ex.name, val)} onComplete={markComplete} equipment={state.equipment} settings={getExerciseSettings(state, ex.name)} onOpenDetail={openExerciseDetail} />)}
              </div>
          }
          <button onClick={finishWorkout} disabled={!allDone} style={{ width: "100%", marginTop: 16, padding: 15, background: allDone ? "#c8f542" : "#161616", color: allDone ? "#0a0a0a" : "#777", border: `1px solid ${allDone ? "#c8f542" : "#181818"}`, borderRadius: 10, fontWeight: 900, fontSize: 14, letterSpacing: 2, cursor: allDone ? "pointer" : "not-allowed", transition: "all 0.2s" }}>{allDone ? "✓ FINISH & LOG WORKOUT" : "COMPLETE ALL SETS TO FINISH"}</button>
          {allDone && <div style={{ textAlign: "center", marginTop: 6, color: "#707070", fontSize: 10, fontFamily: "monospace" }}>weights auto-increment on save</div>}
        </>}

        {view === "history" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>SESSION HISTORY</div>
            <button onClick={() => setShowImport(true)} style={{ padding: "8px 14px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 6, color: "#c8f542", fontFamily: "monospace", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>↓ IMPORT</button>
          </div>
          <HistoryView history={state.history} />
        </>}

        {view === "exercises" && (
          selectedExercise
            ? <ExerciseDetailView name={selectedExercise} history={state.history} settings={getExerciseSettings(state, selectedExercise)} onUpdateSettings={updateExerciseSettings} onBack={() => setSelectedExercise(null)} />
            : <>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, marginBottom: 6 }}>EXERCISES</div>
                <div style={{ fontSize: 11, color: "#707070", fontFamily: "monospace", marginBottom: 16 }}>tap an exercise for history, PRs & settings</div>
                {allExerciseNames(state).map((exName) => {
                  const lib = EXERCISE_LIBRARY.find((e) => e.name === exName);
                  const c = lib ? CATEGORY_COLORS[lib.category] : "#888";
                  const st = getExerciseStats(state.history, exName);
                  return (
                    <button key={exName} onClick={() => setSelectedExercise(exName)} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", background: "#1c1c1c", border: "1px solid #383838", borderLeft: `3px solid ${c}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8, cursor: "pointer", textAlign: "left" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0" }}>{exName}</div>
                        <div style={{ fontSize: 10, color: "#707070", fontFamily: "monospace", marginTop: 2 }}>{st.sessions.length} session{st.sessions.length !== 1 ? "s" : ""}{st.heaviestSingle ? ` · single ${st.heaviestSingle.weight}lb` : ""}</div>
                      </div>
                      <span style={{ color: "#707070", fontSize: 18 }}>›</span>
                    </button>
                  );
                })}
              </>
        )}

        {view === "equipment" && <EquipmentView equipment={state.equipment} onUpdate={updateEquipment} />}

        {view === "programs" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>MY PROGRAMS</div>
            <button onClick={() => { setEditingProgram(null); setShowBuilder(true); }} style={{ padding: "8px 16px", background: "#c8f542", border: "none", borderRadius: 6, color: "#0a0a0a", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>+ NEW</button>
          </div>
          {Object.entries(state.programs).map(([pname, days]) => (
            <div key={pname} style={{ background: pname === state.activeProgram ? "rgba(200,245,66,0.03)" : "#181818", border: `1px solid ${pname === state.activeProgram ? "#c8f542" : "#181818"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: pname === state.activeProgram ? "#c8f542" : "#d0d0d0" }}>
                    {pname} {pname === state.activeProgram && <span style={{ fontSize: 10, fontFamily: "monospace", marginLeft: 6 }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#707070", fontFamily: "monospace" }}>{days.length} day{days.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {pname !== state.activeProgram && <button onClick={() => selectProgram(pname)} style={{ padding: "5px 10px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 5, color: "#aaa", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>USE</button>}
                  <button onClick={() => { setEditingProgram(pname); setShowBuilder(true); }} style={{ padding: "5px 10px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 5, color: "#aaa", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>EDIT</button>
                  {Object.keys(state.programs).length > 1 && <button onClick={() => deleteProgram(pname)} style={{ padding: "5px 10px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 5, color: "#e05252", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>DEL</button>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {days.map((d) => (
                  <div key={d.id} style={{ background: "#1a1a1a", border: "1px solid #383838", borderRadius: 6, padding: "8px 12px", minWidth: 90 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#c8f542", marginBottom: 4 }}>DAY {d.label}</div>
                    {d.exercises.map((ex) => { const lib = EXERCISE_LIBRARY.find((e) => e.name === ex.name); const c = lib ? CATEGORY_COLORS[lib.category] : "#666"; return <div key={ex.name} style={{ fontSize: 10, color: c, fontFamily: "monospace", marginBottom: 1 }}>{ex.name} {ex.sets}×{ex.reps}</div>; })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>}
      </div>

      {showPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1c1c1c", border: "1px solid #383838", borderRadius: 12, padding: 24, width: "90%", maxWidth: 360 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2, marginBottom: 14 }}>SELECT PROGRAM</div>
            {Object.keys(state.programs).map((pname) => (
              <button key={pname} onClick={() => selectProgram(pname)} style={{ display: "block", width: "100%", padding: "12px 14px", marginBottom: 6, borderRadius: 7, textAlign: "left", background: pname === state.activeProgram ? "#c8f542" : "#1d1d1d", border: `1px solid ${pname === state.activeProgram ? "#c8f542" : "#1e1e1e"}`, color: pname === state.activeProgram ? "#0a0a0a" : "#aaa", fontFamily: "monospace", fontSize: 13, cursor: "pointer" }}>{pname}</button>
            ))}
            <button onClick={() => setShowPicker(false)} style={{ marginTop: 6, background: "none", border: "none", color: "#707070", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>cancel</button>
          </div>
        </div>
      )}

      {showBuilder && <ProgramBuilder programs={state.programs} editingName={editingProgram} onSave={saveProgram} onClose={() => { setShowBuilder(false); setEditingProgram(null); }} exercises={exerciseList} />}

      {showImport && <ImportModal existingHistory={state.history} onConfirm={importHistory} onClose={() => setShowImport(false)} />}
    </div>
  );
}
