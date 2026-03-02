import { useState, useEffect } from "react";

const EXERCISE_LIBRARY = [
  { name: "Squat",        defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Lower" },
  { name: "Deadlift",     defaultSets: 1, defaultReps: 5,  increment: 10, category: "Lower" },
  { name: "Bench Press",  defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Upper" },
  { name: "Press",        defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Upper" },
  { name: "Power Clean",  defaultSets: 5, defaultReps: 3,  increment: 5,  category: "Power" },
  { name: "Barbell Row",  defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Upper" },
  { name: "Chin-Up",      defaultSets: 3, defaultReps: 5,  increment: 2.5,category: "Upper" },
  { name: "Dip",          defaultSets: 3, defaultReps: 5,  increment: 2.5,category: "Upper" },
  { name: "Romanian DL",  defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Lower" },
  { name: "Front Squat",  defaultSets: 3, defaultReps: 5,  increment: 5,  category: "Lower" },
  { name: "Power Snatch", defaultSets: 5, defaultReps: 3,  increment: 5,  category: "Power" },
  { name: "Good Morning", defaultSets: 3, defaultReps: 8,  increment: 5,  category: "Lower" },
];

const DEFAULT_WEIGHTS = {
  "Squat": 135, "Deadlift": 135, "Bench Press": 95, "Press": 65,
  "Power Clean": 95, "Barbell Row": 95, "Chin-Up": 0, "Dip": 0,
  "Romanian DL": 135, "Front Squat": 95, "Power Snatch": 65, "Good Morning": 65,
};

const DEFAULT_PROGRAMS = {
  "Starting Strength": [
    { id: "ss-a", label: "A", exercises: [
      { name: "Squat",       sets: 3, reps: 5, increment: 5  },
      { name: "Bench Press", sets: 3, reps: 5, increment: 5  },
      { name: "Deadlift",    sets: 1, reps: 5, increment: 10 },
    ]},
    { id: "ss-b", label: "B", exercises: [
      { name: "Squat",       sets: 3, reps: 5, increment: 5 },
      { name: "Press",       sets: 3, reps: 5, increment: 5 },
      { name: "Power Clean", sets: 5, reps: 3, increment: 5 },
    ]},
  ],
};

const CATEGORY_COLORS = { Lower: "#7eb8f7", Upper: "#c8f542", Power: "#f7a07e" };
const uid = () => Math.random().toString(36).slice(2, 9);
const initialState = () => ({ weights: { ...DEFAULT_WEIGHTS }, history: [], programs: DEFAULT_PROGRAMS, activeProgram: "Starting Strength", currentDayIndex: 0 });

function SetTracker({ sets, reps, onComplete }) {
  const [completed, setCompleted] = useState([]);
  const toggle = (i) => setCompleted((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i]);
  useEffect(() => { onComplete(completed.length === sets && sets > 0); }, [completed, sets]);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {Array.from({ length: sets }, (_, i) => (
        <button key={i} onClick={() => toggle(i)} style={{ width: 44, height: 44, borderRadius: 6, border: completed.includes(i) ? "2px solid #c8f542" : "2px solid #2a2a2a", background: completed.includes(i) ? "#c8f542" : "transparent", color: completed.includes(i) ? "#0a0a0a" : "#555", fontSize: 11, fontFamily: "monospace", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>{reps}r</button>
      ))}
    </div>
  );
}

function ExerciseCard({ exercise, weight, onWeightChange, onComplete }) {
  const [done, setDone] = useState(false);
  const lib = EXERCISE_LIBRARY.find((e) => e.name === exercise.name);
  const catColor = lib ? CATEGORY_COLORS[lib.category] : "#888";
  return (
    <div style={{ background: done ? "rgba(200,245,66,0.04)" : "#0f0f0f", border: `1px solid ${done ? "#c8f542" : "#1e1e1e"}`, borderLeft: `3px solid ${done ? "#c8f542" : catColor}`, borderRadius: 10, padding: "18px 20px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: done ? "#c8f542" : "#f0f0f0", letterSpacing: 1 }}>{exercise.name}</span>
            {done && <span style={{ color: "#c8f542" }}>✓</span>}
          </div>
          <div style={{ color: "#444", fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{exercise.sets}×{exercise.reps} — +{exercise.increment}lb/session</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => onWeightChange(Math.max(0, weight - exercise.increment))} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid #222", background: "#141414", color: "#777", cursor: "pointer", fontSize: 18 }}>−</button>
          <div style={{ minWidth: 56, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#c8f542" }}>{weight}</div>
            <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace" }}>LBS</div>
          </div>
          <button onClick={() => onWeightChange(weight + exercise.increment)} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid #222", background: "#141414", color: "#777", cursor: "pointer", fontSize: 18 }}>+</button>
        </div>
      </div>
      <SetTracker sets={exercise.sets} reps={exercise.reps} onComplete={(d) => { setDone(d); onComplete(exercise.name, d); }} />
    </div>
  );
}

function ExercisePicker({ usedNames, onAdd }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = EXERCISE_LIBRARY.filter((e) => !usedNames.includes(e.name) && e.name.toLowerCase().includes(search.toLowerCase()));
  const inp = { background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 12, padding: "7px 10px", outline: "none" };
  if (!open) return <button onClick={() => setOpen(true)} style={{ width: "100%", marginTop: 8, padding: 10, background: "transparent", border: "1px dashed #222", borderRadius: 6, color: "#444", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>+ ADD EXERCISE</button>;
  return (
    <div style={{ marginTop: 8 }}>
      <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises..." style={{ ...inp, width: "100%", marginBottom: 6 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {filtered.map((ex) => (
          <button key={ex.name} onClick={() => { onAdd(ex.name); setOpen(false); setSearch(""); }} style={{ padding: "6px 12px", borderRadius: 5, border: `1px solid ${CATEGORY_COLORS[ex.category]}44`, background: `${CATEGORY_COLORS[ex.category]}11`, color: CATEGORY_COLORS[ex.category], fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>{ex.name}</button>
        ))}
        {!filtered.length && <span style={{ color: "#333", fontSize: 12, fontFamily: "monospace" }}>No exercises found</span>}
      </div>
      <button onClick={() => setOpen(false)} style={{ marginTop: 6, background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>cancel</button>
    </div>
  );
}

function ProgramBuilder({ programs, editingName, onSave, onClose }) {
  const existing = editingName && programs[editingName];
  const [name, setName] = useState(editingName || "");
  const [days, setDays] = useState(() => existing ? JSON.parse(JSON.stringify(existing)) : [{ id: uid(), label: "A", exercises: [] }]);
  const addDay = () => setDays((d) => [...d, { id: uid(), label: String.fromCharCode(65 + d.length), exercises: [] }]);
  const removeDay = (id) => setDays((d) => d.filter((x) => x.id !== id));
  const updateLabel = (id, label) => setDays((d) => d.map((x) => x.id === id ? { ...x, label: label.slice(0, 3).toUpperCase() } : x));
  const addExercise = (dayId, exName) => { const lib = EXERCISE_LIBRARY.find((e) => e.name === exName); if (!lib) return; setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: [...day.exercises, { name: exName, sets: lib.defaultSets, reps: lib.defaultReps, increment: lib.increment }] })); };
  const removeExercise = (dayId, exName) => setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: day.exercises.filter((e) => e.name !== exName) }));
  const updateField = (dayId, exName, field, val) => setDays((d) => d.map((day) => day.id !== dayId ? day : { ...day, exercises: day.exercises.map((e) => e.name !== exName ? e : { ...e, [field]: val }) }));
  const moveEx = (dayId, exName, dir) => setDays((d) => d.map((day) => { if (day.id !== dayId) return day; const exes = [...day.exercises]; const idx = exes.findIndex((e) => e.name === exName); const next = idx + dir; if (next < 0 || next >= exes.length) return day; [exes[idx], exes[next]] = [exes[next], exes[idx]]; return { ...day, exercises: exes }; }));
  const handleSave = () => { if (!name.trim()) return alert("Enter a program name"); if (!days.length) return alert("Add at least one day"); if (days.some((d) => !d.exercises.length)) return alert("Every day needs at least one exercise"); onSave(name.trim(), days); };
  const inp = (extra = {}) => ({ background: "#080808", border: "1px solid #222", borderRadius: 6, color: "#f0f0f0", fontFamily: "monospace", fontSize: 12, padding: "6px 10px", outline: "none", ...extra });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 100, overflowY: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#c8f542", letterSpacing: 2 }}>{editingName ? "EDIT PROGRAM" : "NEW PROGRAM"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 24, padding: "4px 8px" }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 6 }}>PROGRAM NAME</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Texas Method, 3-Day Split..." style={{ ...inp({ width: "100%", fontSize: 14, padding: "10px 12px" }) }} />
        </div>
        {days.map((day, dayIdx) => (
          <div key={day.id} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>LABEL</span>
                <input value={day.label} onChange={(e) => updateLabel(day.id, e.target.value)} style={{ ...inp({ width: 50, textAlign: "center", fontSize: 18, color: "#c8f542", fontWeight: 900, padding: "4px 8px" }) }} />
              </div>
              {days.length > 1 && <button onClick={() => removeDay(day.id)} style={{ background: "none", border: "1px solid #222", borderRadius: 4, color: "#555", cursor: "pointer", padding: "5px 10px", fontFamily: "monospace", fontSize: 10 }}>REMOVE</button>}
            </div>
            {day.exercises.map((ex, exIdx) => {
              const lib = EXERCISE_LIBRARY.find((e) => e.name === ex.name);
              const c = lib ? CATEGORY_COLORS[lib.category] : "#888";
              return (
                <div key={ex.name} style={{ background: "#111", border: "1px solid #1e1e1e", borderLeft: `3px solid ${c}`, borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#ddd" }}>{ex.name}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => moveEx(day.id, ex.name, -1)} disabled={exIdx === 0} style={{ ...inp({ padding: "3px 8px", color: exIdx === 0 ? "#2a2a2a" : "#777", cursor: exIdx === 0 ? "default" : "pointer" }) }}>↑</button>
                      <button onClick={() => moveEx(day.id, ex.name, 1)} disabled={exIdx === day.exercises.length - 1} style={{ ...inp({ padding: "3px 8px", color: exIdx === day.exercises.length - 1 ? "#2a2a2a" : "#777", cursor: exIdx === day.exercises.length - 1 ? "default" : "pointer" }) }}>↓</button>
                      <button onClick={() => removeExercise(day.id, ex.name)} style={{ ...inp({ padding: "3px 8px", color: "#c0392b", cursor: "pointer" }) }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {[["SETS","sets",1],["REPS","reps",1],["+LB","increment",2.5]].map(([label, field, step]) => (
                      <div key={field}>
                        <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace", marginBottom: 3 }}>{label}</div>
                        <input type="number" value={ex[field]} min={0} step={step} onChange={(e) => updateField(day.id, ex.name, field, parseFloat(e.target.value) || 0)} style={{ ...inp({ width: 62, textAlign: "center" }) }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <ExercisePicker usedNames={day.exercises.map((e) => e.name)} onAdd={(n) => addExercise(day.id, n)} />
          </div>
        ))}
        <button onClick={addDay} style={{ width: "100%", padding: 12, background: "transparent", border: "1px dashed #1e1e1e", borderRadius: 8, color: "#444", cursor: "pointer", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>+ ADD DAY</button>
        <button onClick={handleSave} style={{ width: "100%", padding: 16, background: "#c8f542", border: "none", borderRadius: 8, color: "#0a0a0a", fontWeight: 900, fontSize: 15, letterSpacing: 2, cursor: "pointer" }}>SAVE PROGRAM</button>
      </div>
    </div>
  );
}

function HistoryView({ history }) {
  if (!history.length) return <div style={{ textAlign: "center", color: "#2a2a2a", padding: "60px 0", fontFamily: "monospace", fontSize: 12 }}>NO SESSIONS LOGGED YET</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...history].reverse().map((s, i) => (
        <div key={i} style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#c8f542", fontWeight: 700, fontSize: 14 }}>{s.programName} — DAY {s.dayLabel}</span>
            <span style={{ color: "#333", fontSize: 11, fontFamily: "monospace" }}>{new Date(s.date).toLocaleDateString()}</span>
          </div>
          {s.exercises.map((ex) => (
            <div key={ex.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", marginBottom: 2 }}>
              <span style={{ color: "#777" }}>{ex.name}</span>
              <span style={{ color: "#444" }}>{ex.sets}×{ex.reps} @ {ex.weight}lb</span>
            </div>
          ))}
        </div>
      ))}
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

  const program = state.programs[state.activeProgram] || [];
  const day = program[state.currentDayIndex] || program[0];
  const exercises = day?.exercises || [];
  const allDone = exercises.length > 0 && exercises.every((ex) => completedSets[ex.name]);

  const updateWeight = (name, val) => setState((s) => ({ ...s, weights: { ...s.weights, [name]: Math.max(0, val) } }));
  const markComplete = (name, isDone) => setCompletedSets((p) => ({ ...p, [name]: isDone }));
  const finishWorkout = () => {
    if (!day) return;
    const session = { date: Date.now(), programName: state.activeProgram, dayLabel: day.label, exercises: exercises.map((ex) => ({ name: ex.name, sets: ex.sets, reps: ex.reps, weight: state.weights[ex.name] ?? 0 })) };
    const newWeights = { ...state.weights };
    exercises.forEach((ex) => { newWeights[ex.name] = (state.weights[ex.name] ?? 0) + ex.increment; });
    setState((s) => ({ ...s, weights: newWeights, history: [...s.history, session], currentDayIndex: (state.currentDayIndex + 1) % program.length }));
    setCompletedSets({}); setSessionKey((k) => k + 1); setView("history");
  };
  const saveProgram = (name, days) => { setState((s) => ({ ...s, programs: { ...s.programs, [name]: days }, activeProgram: name, currentDayIndex: 0 })); setShowBuilder(false); setEditingProgram(null); setCompletedSets({}); setSessionKey((k) => k + 1); };
  const deleteProgram = (pname) => { if (!confirm(`Delete "${pname}"?`)) return; setState((s) => { const { [pname]: _, ...rest } = s.programs; return { ...s, programs: rest, activeProgram: Object.keys(rest)[0] || null, currentDayIndex: 0 }; }); };
  const selectProgram = (pname) => { setState((s) => ({ ...s, activeProgram: pname, currentDayIndex: 0 })); setCompletedSets({}); setSessionKey((k) => k + 1); setShowPicker(false); };
  const nav = (label, active, onClick) => <button onClick={onClick} style={{ padding: "7px 13px", borderRadius: 6, border: "none", background: active ? "#c8f542" : "#141414", color: active ? "#0a0a0a" : "#555", fontFamily: "monospace", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1 }}>{label}</button>;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0" }}>
      <div style={{ borderBottom: "1px solid #111", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#080808", zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3, color: "#c8f542" }}>STARTING STRENGTH</div>
          <div style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "monospace", letterSpacing: 2 }}>LINEAR PROGRESSION TRACKER</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {nav("Workout", view === "workout", () => setView("workout"))}
          {nav("History", view === "history", () => setView("history"))}
          {nav("Programs", view === "programs", () => setView("programs"))}
        </div>
      </div>

      <div style={{ maxWidth: 580, margin: "0 auto", padding: "16px 14px 80px" }}>
        {view === "workout" && <>
          <div style={{ background: "#0c0c0c", border: "1px solid #181818", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>ACTIVE PROGRAM</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#e0e0e0" }}>{state.activeProgram || "—"}</div>
              </div>
              <button onClick={() => setShowPicker(true)} style={{ background: "none", border: "1px solid #1e1e1e", borderRadius: 5, color: "#555", cursor: "pointer", padding: "6px 12px", fontFamily: "monospace", fontSize: 10 }}>SWITCH</button>
            </div>
            {program.length > 1 && (
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                {program.map((d, i) => (
                  <button key={d.id} onClick={() => { setState((s) => ({ ...s, currentDayIndex: i })); setCompletedSets({}); setSessionKey((k) => k + 1); }} style={{ padding: "5px 16px", borderRadius: 5, border: "none", background: state.currentDayIndex === i ? "#c8f542" : "#181818", color: state.currentDayIndex === i ? "#0a0a0a" : "#444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>DAY {d.label}</button>
                ))}
              </div>
            )}
          </div>
          {exercises.length === 0
            ? <div style={{ textAlign: "center", color: "#2a2a2a", padding: "60px 0", fontFamily: "monospace", fontSize: 12 }}>NO EXERCISES — GO TO PROGRAMS TAB</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }} key={sessionKey}>
                {exercises.map((ex) => <ExerciseCard key={ex.name} exercise={ex} weight={state.weights[ex.name] ?? 0} onWeightChange={(val) => updateWeight(ex.name, val)} onComplete={markComplete} />)}
              </div>
          }
          <button onClick={finishWorkout} disabled={!allDone} style={{ width: "100%", marginTop: 16, padding: 15, background: allDone ? "#c8f542" : "#0d0d0d", color: allDone ? "#0a0a0a" : "#222", border: `1px solid ${allDone ? "#c8f542" : "#181818"}`, borderRadius: 10, fontWeight: 900, fontSize: 14, letterSpacing: 2, cursor: allDone ? "pointer" : "not-allowed", transition: "all 0.2s" }}>{allDone ? "✓ FINISH & LOG WORKOUT" : "COMPLETE ALL SETS TO FINISH"}</button>
          {allDone && <div style={{ textAlign: "center", marginTop: 6, color: "#333", fontSize: 10, fontFamily: "monospace" }}>weights auto-increment on save</div>}
        </>}

        {view === "history" && <>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, marginBottom: 14 }}>SESSION HISTORY</div>
          <HistoryView history={state.history} />
        </>}

        {view === "programs" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>MY PROGRAMS</div>
            <button onClick={() => { setEditingProgram(null); setShowBuilder(true); }} style={{ padding: "8px 16px", background: "#c8f542", border: "none", borderRadius: 6, color: "#0a0a0a", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>+ NEW</button>
          </div>
          {Object.entries(state.programs).map(([pname, days]) => (
            <div key={pname} style={{ background: pname === state.activeProgram ? "rgba(200,245,66,0.03)" : "#0c0c0c", border: `1px solid ${pname === state.activeProgram ? "#c8f542" : "#181818"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: pname === state.activeProgram ? "#c8f542" : "#d0d0d0" }}>
                    {pname} {pname === state.activeProgram && <span style={{ fontSize: 10, fontFamily: "monospace", marginLeft: 6 }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>{days.length} day{days.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {pname !== state.activeProgram && <button onClick={() => selectProgram(pname)} style={{ padding: "5px 10px", background: "#141414", border: "1px solid #222", borderRadius: 5, color: "#777", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>USE</button>}
                  <button onClick={() => { setEditingProgram(pname); setShowBuilder(true); }} style={{ padding: "5px 10px", background: "#141414", border: "1px solid #222", borderRadius: 5, color: "#777", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>EDIT</button>
                  {Object.keys(state.programs).length > 1 && <button onClick={() => deleteProgram(pname)} style={{ padding: "5px 10px", background: "#141414", border: "1px solid #222", borderRadius: 5, color: "#c0392b", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>DEL</button>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {days.map((d) => (
                  <div key={d.id} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 6, padding: "8px 12px", minWidth: 90 }}>
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
          <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12, padding: 24, width: "90%", maxWidth: 360 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2, marginBottom: 14 }}>SELECT PROGRAM</div>
            {Object.keys(state.programs).map((pname) => (
              <button key={pname} onClick={() => selectProgram(pname)} style={{ display: "block", width: "100%", padding: "12px 14px", marginBottom: 6, borderRadius: 7, textAlign: "left", background: pname === state.activeProgram ? "#c8f542" : "#141414", border: `1px solid ${pname === state.activeProgram ? "#c8f542" : "#1e1e1e"}`, color: pname === state.activeProgram ? "#0a0a0a" : "#aaa", fontFamily: "monospace", fontSize: 13, cursor: "pointer" }}>{pname}</button>
            ))}
            <button onClick={() => setShowPicker(false)} style={{ marginTop: 6, background: "none", border: "none", color: "#333", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>cancel</button>
          </div>
        </div>
      )}

      {showBuilder && <ProgramBuilder programs={state.programs} editingName={editingProgram} onSave={saveProgram} onClose={() => { setShowBuilder(false); setEditingProgram(null); }} />}
    </div>
  );
}
