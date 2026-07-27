import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Dumbbell, History, Plus, TimerReset, X } from 'lucide-react'
import type { Exercise, SessionExercise, SessionRuntime, SessionSet, WorkoutSession } from '../types'
import type { Snapshot } from '../lib/data'
import { mutate, previousSets } from '../lib/data'
import { getDb } from '../lib/db'
import { addedSetSuggestion, elapsed, id, kg, now, restRemaining, time, volume } from '../lib/utils'
import { ExercisePicker } from './ExercisePicker'
import { ExerciseAvatar, Glass, KebabMenu, Modal } from './ui'

export type WorkoutSummary = { name: string; duration: number; sets: number; reps: number; volume: number }

function parseNumber(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : undefined
}
function roundToPlateWeight(weight: number) {
  return Math.round(weight / 2.5) * 2.5
}
function SetRow({ set, onDraft, onLocalDraft, onToggle }: {
  set: SessionSet
  onLocalDraft: (set: SessionSet, load?: number, repetitions?: number) => void
  onDraft: (set: SessionSet, load?: number, repetitions?: number) => Promise<void>
  onToggle: (set: SessionSet, load?: number, repetitions?: number) => Promise<void>
}) {
  const [load, setLoad] = useState(set.actualLoad == null ? '' : String(set.actualLoad).replace('.', ','))
  const [repetitions, setRepetitions] = useState(set.actualReps == null ? '' : String(set.actualReps))
  const local = (nextLoad: string, nextReps: string) => onLocalDraft(set, parseNumber(nextLoad), parseNumber(nextReps))
  return <div className={`set-row ${set.isCompleted ? 'completed' : ''}`}>
    <span className="set-number">{set.setIndex + 1}</span>
    <input aria-label={`Sarja ${set.setIndex + 1} paino`} inputMode="decimal" value={load} placeholder={set.plannedLoad == null ? '—' : String(set.plannedLoad).replace('.', ',')} onChange={(event) => { setLoad(event.target.value); local(event.target.value, repetitions) }} onBlur={() => void onDraft(set, parseNumber(load), parseNumber(repetitions))}/>
    <input aria-label={`Sarja ${set.setIndex + 1} toistot`} inputMode="numeric" value={repetitions} placeholder={set.plannedReps == null ? '—' : String(set.plannedReps)} onChange={(event) => { setRepetitions(event.target.value); local(load, event.target.value) }} onBlur={() => void onDraft(set, parseNumber(load), parseNumber(repetitions))}/>
    <button className="complete-set" aria-label={set.isCompleted ? 'Merkitse keskeneräiseksi' : 'Merkitse valmiiksi'} onClick={() => void onToggle(set, parseNumber(load), parseNumber(repetitions))}>{set.isCompleted && <Check size={18}/>}</button>
    {(set.previousLoad != null || set.previousReps != null) && <small className="previous">Edellinen {set.previousLoad == null ? '—' : `${String(set.previousLoad).replace('.', ',')} kg`} × {set.previousReps ?? '—'}</small>}
  </div>
}

function ExerciseCard({ exercise, info, sets, onRefresh, onStartRest, onAddSet, onEditRest, onEditNotes, onHistory, onRemove }: {
  exercise: SessionExercise
  info?: Exercise
  sets: SessionSet[]
  onRefresh: () => Promise<void>
  onStartRest: () => Promise<void>
  onAddSet: () => Promise<void>
  onEditRest: () => void
  onEditNotes: () => void
  onHistory: () => void
  onRemove: () => void
}) {const [warmupOpen, setWarmupOpen] = useState(false)

const firstSet = [...sets].sort((a, b) => a.setIndex - b.setIndex)[0]
const workWeight = firstSet?.plannedLoad ?? firstSet?.actualLoad ?? 0

const warmupSets = workWeight > 20
  ? [
      { label: 'Tanko', weight: 20, reps: 10 },
      { weight: roundToPlateWeight(workWeight * 0.5), reps: 7 },
      { weight: roundToPlateWeight(workWeight * 0.7), reps: 4 },
      { weight: roundToPlateWeight(workWeight * 0.85), reps: 2 },
      { weight: roundToPlateWeight(workWeight * 0.93), reps: 1 }
    ].filter((item, index, list) =>
      item.weight < workWeight &&
      list.findIndex((candidate) => candidate.weight === item.weight) === index
    )
  : []
  const localDraft = (set: SessionSet, load?: number, repetitions?: number) => {
    void getDb().sessionSets.put({ ...set, actualLoad: load, actualReps: repetitions, updatedAt: now() })
  }
  const saveDraft = async (set: SessionSet, load?: number, repetitions?: number) => {
    await mutate('sessionSets', 'session_sets', { ...set, actualLoad: load, actualReps: repetitions, updatedAt: now() }, set.updatedAt)
  }
  const toggle = async (set: SessionSet, load?: number, repetitions?: number) => {
    const completing = !set.isCompleted
    const updated: SessionSet = {
      ...set,
      actualLoad: load ?? set.actualLoad ?? set.plannedLoad,
      actualReps: repetitions ?? set.actualReps ?? set.plannedReps,
      isCompleted: completing,
      completedAt: completing ? now() : undefined,
      updatedAt: now()
    }
    await mutate('sessionSets', 'session_sets', updated, set.updatedAt)
    navigator.vibrate?.(10)
    if (completing) await onStartRest()
    await onRefresh()
  }
  return <Glass id={`exercise-${exercise.id}`} className="exercise-card" as="article">
    <div className="exercise-title"><ExerciseAvatar exercise={info} size="large"/><div><h2>{exercise.nameSnapshot}</h2><p><TimerReset size={15}/> Lepo {exercise.restSeconds >= 60 ? `${Math.floor(exercise.restSeconds / 60)} min${exercise.restSeconds % 60 ? ` ${exercise.restSeconds % 60} s` : ''}` : `${exercise.restSeconds} s`}</p></div><KebabMenu items={[
      { label: 'Lisää sarja', action: () => void onAddSet() },
      { label: 'Muuta lepoaikaa', action: onEditRest },
      { label: 'Muistiinpano', action: onEditNotes },
      { label: 'Liikkeen historia', action: onHistory },
      { label: 'Poista liike treenistä', action: onRemove, danger: true }
    ]}/></div>
    {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
    <button
  type="button"
  className="warmup-button"
  onClick={() => setWarmupOpen((open) => !open)}
>
  🔥 {warmupOpen ? 'Piilota lämmittely' : 'Näytä lämmittely'}
</button>

{warmupOpen && (
  <div className="warmup-card">
    <strong>Lämmittely</strong>

    {warmupSets.length > 0 ? (
      <>
        {warmupSets.map((item) => (
          <div className="warmup-set" key={`${item.weight}-${item.reps}`}>
            <span>{item.label ?? `${item.weight} kg`}</span>
            <span>× {item.reps}</span>
          </div>
        ))}

        <div className="warmup-work-weight">
          Työsarjat alkavat: {workWeight} kg
        </div>
      </>
    ) : (
      <p>Anna ensimmäiselle työsarjalle paino.</p>
    )}
  </div>
)}
    <div className="set-table"><div className="set-head"><span>SARJA</span><span>KG</span><span>TOISTOT</span><span/></div>{[...sets].sort((a, b) => a.setIndex - b.setIndex).map((set) => <SetRow key={set.id} set={set} onLocalDraft={localDraft} onDraft={saveDraft} onToggle={toggle}/>)}</div>
  </Glass>
}

export function WorkoutView({ session, snapshot, onDismiss, onRefresh, onComplete, onOpenHistory }: {
  session: WorkoutSession
  snapshot: Snapshot
  onDismiss: () => void
  onRefresh: () => Promise<void>
  onComplete: (summary: WorkoutSummary) => void
  onOpenHistory: (exerciseId: string) => void
}) {
  const [seconds, setSeconds] = useState(elapsed(session.startedAt))
  const [picker, setPicker] = useState(false)
  const [restEdit, setRestEdit] = useState<SessionExercise | null>(null)
  const [noteEdit, setNoteEdit] = useState<SessionExercise | null>(null)
  const [removeExercise, setRemoveExercise] = useState<SessionExercise | null>(null)
  const [restValue, setRestValue] = useState('')
  const [noteValue, setNoteValue] = useState('')
  const [clock, setClock] = useState(Date.now())
  const runtime = snapshot.runtimes.find((item) => item.sessionId === session.id)
  const items = useMemo(() => snapshot.sessionExercises.filter((exercise) => exercise.sessionId === session.id).sort((a, b) => a.orderIndex - b.orderIndex), [snapshot.sessionExercises, session.id])
  const sets = snapshot.sessionSets.filter((set) => items.some((exercise) => exercise.id === set.sessionExerciseId))
  const completed = sets.filter((set) => set.isCompleted)
  const remaining = restRemaining(runtime?.restTimerEndsAt, clock)

  useEffect(() => { const timer = window.setInterval(() => { setSeconds(elapsed(session.startedAt)); setClock(Date.now()) }, 1000); return () => clearInterval(timer) }, [session.startedAt])
  useEffect(() => { if (runtime) return; void mutate('sessionRuntime', 'session_runtime', { id: session.id, sessionId: session.id, updatedAt: now() }).then(onRefresh) }, [runtime, session.id, onRefresh])

  const updateRuntime = async (changes: Partial<SessionRuntime>) => {
    const base: SessionRuntime = runtime ?? { id: session.id, sessionId: session.id, updatedAt: now() }
    await mutate('sessionRuntime', 'session_runtime', { ...base, ...changes, updatedAt: now() }, base.updatedAt)
    await onRefresh()
  }
  const startRest = (exercise: SessionExercise) => {
    const current = Date.now()
    setClock(current)
    return updateRuntime({ activeExerciseId: exercise.id, restTimerEndsAt: new Date(current + exercise.restSeconds * 1000).toISOString() })
  }
  const adjustRest = (delta: number) => {
    const currentEnd = runtime?.restTimerEndsAt ? new Date(runtime.restTimerEndsAt).getTime() : Date.now()
    const next = Math.max(Date.now(), currentEnd + delta * 1000)
    return updateRuntime({ restTimerEndsAt: new Date(next).toISOString() })
  }
  const addSet = async (exercise: SessionExercise) => {
    const exerciseSets = sets.filter((set) => set.sessionExerciseId === exercise.id).sort((a, b) => a.setIndex - b.setIndex)
    const suggestion = addedSetSuggestion(exerciseSets)
    await mutate('sessionSets', 'session_sets', {
      id: id(), sessionExerciseId: exercise.id, ...suggestion, isCompleted: false, updatedAt: now()
    })
    await onRefresh()
  }
  const addExercise = async (exercise: Exercise) => {
    const timestamp = now()
    const sessionExercise: SessionExercise = {
      id: id(), sessionId: session.id, exerciseId: exercise.id, nameSnapshot: exercise.name,
      orderIndex: items.length, restSeconds: 90, updatedAt: timestamp
    }
    await mutate('sessionExercises', 'session_exercises', sessionExercise)
    const previous = await previousSets(exercise.id, session.id)
    for (let setIndex = 0; setIndex < 3; setIndex++) {
      const old = previous[setIndex]
      await mutate('sessionSets', 'session_sets', {
        id: id(), sessionExerciseId: sessionExercise.id, setIndex,
        plannedLoad: old?.actualLoad, plannedReps: old?.actualReps,
        previousLoad: old?.actualLoad, previousReps: old?.actualReps,
        isCompleted: false, updatedAt: timestamp
      })
    }
    setPicker(false)
    await onRefresh()
  }
  const confirmRemoveExercise = async () => {
    if (!removeExercise) return
    const timestamp = now()
    for (const set of sets.filter((item) => item.sessionExerciseId === removeExercise.id)) await mutate('sessionSets', 'session_sets', { ...set, deletedAt: timestamp, updatedAt: timestamp }, set.updatedAt)
    await mutate('sessionExercises', 'session_exercises', { ...removeExercise, deletedAt: timestamp, updatedAt: timestamp }, removeExercise.updatedAt)
    setRemoveExercise(null)
    await onRefresh()
  }
  const saveRest = async () => {
    if (!restEdit) return
    const restSeconds = Math.max(0, Math.min(900, Number(restValue) || restEdit.restSeconds))
    await mutate('sessionExercises', 'session_exercises', { ...restEdit, restSeconds, updatedAt: now() }, restEdit.updatedAt)
    setRestEdit(null); await onRefresh()
  }
  const saveNote = async () => {
    if (!noteEdit) return
    await mutate('sessionExercises', 'session_exercises', { ...noteEdit, notes: noteValue.trim() || undefined, updatedAt: now() }, noteEdit.updatedAt)
    setNoteEdit(null); await onRefresh()
  }
  const finish = async () => {
    const endedAt = now()
    const summary: WorkoutSummary = {
      name: session.name, duration: elapsed(session.startedAt, endedAt), sets: completed.length,
      reps: completed.reduce((sum, set) => sum + (set.actualReps ?? 0), 0), volume: volume(completed)
    }
    await mutate('workoutSessions', 'workout_sessions', { ...session, status: 'completed', endedAt, durationSeconds: summary.duration, updatedAt: endedAt }, session.updatedAt)
    if (runtime) await mutate('sessionRuntime', 'session_runtime', { ...runtime, deletedAt: endedAt, updatedAt: endedAt }, runtime.updatedAt)
    await onRefresh(); onComplete(summary)
  }

  return <div className="workout-layer"><main className="workout-shell">
    <header className="workout-topbar"><button className="back-button" onClick={onDismiss}>Takaisin</button><div><p className="eyebrow">KÄYNNISSÄ</p><h1>{session.name}</h1></div><button className="done-button" onClick={() => void finish()}>Valmis</button></header>
    <Glass className="workout-stats"><span><strong>{time(seconds)}</strong><small>Kesto</small></span><span><strong>{kg(volume(completed), true)}</strong><small>Volume</small></span><span><strong>{completed.length}</strong><small>Sarjat</small></span><span><strong>{completed.reduce((sum, set) => sum + (set.actualReps ?? 0), 0)}</strong><small>Toistot</small></span></Glass>
    <div className="workout-content">{items.map((exercise) => <ExerciseCard key={exercise.id} exercise={exercise} info={snapshot.exercises.find((item) => item.id === exercise.exerciseId)} sets={sets.filter((set) => set.sessionExerciseId === exercise.id)} onRefresh={onRefresh} onStartRest={() => startRest(exercise)} onAddSet={() => addSet(exercise)} onEditRest={() => { setRestEdit(exercise); setRestValue('') }} onEditNotes={() => { setNoteEdit(exercise); setNoteValue(exercise.notes ?? '') }} onHistory={() => onOpenHistory(exercise.exerciseId)} onRemove={() => setRemoveExercise(exercise)}/>)}</div>
    <button className="surface-button add-workout-exercise" onClick={() => setPicker(true)}><Plus size={19}/> Lisää liike treeniin</button>
    {runtime?.restTimerEndsAt && <Glass className={`rest-dock ${remaining === 0 ? 'done' : ''}`}><button className="rest-main" onClick={() => runtime.activeExerciseId && document.getElementById(`exercise-${runtime.activeExerciseId}`)?.scrollIntoView({ behavior: 'smooth' })}><small>{remaining === 0 ? 'VALMIS SEURAAVAAN SARJAAN' : items.find((item) => item.id === runtime.activeExerciseId)?.nameSnapshot ?? 'LEPO'}</small><strong>{time(remaining ?? 0)}</strong></button><div><button disabled={remaining === 0} onClick={() => void adjustRest(-10)}>−10 s</button><button onClick={() => void adjustRest(10)}>+10 s</button><button onClick={() => void updateRuntime({ restTimerEndsAt: undefined, activeExerciseId: undefined })}>Ohita</button></div></Glass>}
  </main>
  {picker && <ExercisePicker title="Lisää liike treeniin" exercises={snapshot.exercises} selectedIds={items.map((item) => item.exerciseId)} onDismiss={() => setPicker(false)} onSelect={(exercise) => void addExercise(exercise)}/>} 
  {restEdit && <Modal title="Lepoaika" onDismiss={() => setRestEdit(null)}><label className="field-label">Sekuntia<input autoFocus inputMode="numeric" value={restValue} placeholder={String(restEdit.restSeconds)} onChange={(event) => setRestValue(event.target.value)}/></label><button className="primary-button wide" onClick={() => void saveRest()}>Tallenna</button></Modal>}
  {noteEdit && <Modal title="Liikkeen muistiinpano" onDismiss={() => setNoteEdit(null)}><label className="field-label">Muistiinpano<textarea autoFocus value={noteValue} placeholder="Tekniikka, ote tai muu muistettava" onChange={(event) => setNoteValue(event.target.value)}/></label><button className="primary-button wide" onClick={() => void saveNote()}>Tallenna</button></Modal>}
  {removeExercise && <Modal title="Poista liike?" onDismiss={() => setRemoveExercise(null)}><div className="confirm-copy"><X size={28}/><p>{removeExercise.nameSnapshot} ja sen tämän treenin sarjat poistetaan.</p></div><button className="danger-button wide" onClick={() => void confirmRemoveExercise()}>Poista liike</button></Modal>}
  </div>
}

export function CompactWorkoutDock({ session, runtime, onResume, onDiscard }: { session: WorkoutSession; runtime?: SessionRuntime; onResume: () => void; onDiscard: () => void }) {
  const [tick, setTick] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const rest = restRemaining(runtime?.restTimerEndsAt, tick)
  return <Glass className="compact-workout-dock"><button onClick={onResume}><span><Clock3 size={17}/><span><small>{rest == null ? 'KÄYNNISSÄ' : rest === 0 ? 'LEPO VALMIS' : 'LEPO'}</small><strong>{rest == null ? time(elapsed(session.startedAt)) : time(rest)}</strong></span></span><span>Jatka</span></button><button className="dock-discard" aria-label="Hylkää treeni" onClick={onDiscard}><X size={18}/></button></Glass>
}
