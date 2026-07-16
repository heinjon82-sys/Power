import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { Exercise, TemplateExercise, WorkoutTemplate } from '../types'
import type { Snapshot } from '../lib/data'
import { mutate } from '../lib/data'
import { id, now } from '../lib/utils'
import { ExercisePicker } from './ExercisePicker'
import { ExerciseAvatar, Modal } from './ui'

type ChosenExercise = {
  exercise: Exercise
  values: { sets: string; load: string; reps: string; rest: string; notes: string }
  defaults: { sets: string; load: string; reps: string; rest: string }
}

const createChosen = (exercise: Exercise): ChosenExercise => ({
  exercise,
  values: { sets: '', load: '', reps: '', rest: '', notes: '' },
  defaults: { sets: '3', load: '', reps: '8', rest: '90' }
})

function existingChosen(exercise: Exercise, templateExercise: TemplateExercise, snapshot: Snapshot): ChosenExercise {
  const sets = snapshot.templateSets.filter((set) => set.templateExerciseId === templateExercise.id).sort((a, b) => a.setIndex - b.setIndex)
  return {
    exercise,
    values: { sets: '', load: '', reps: '', rest: '', notes: templateExercise.notes ?? '' },
    defaults: {
      sets: String(Math.max(1, sets.length)),
      load: sets[0]?.targetLoad == null ? '' : String(sets[0].targetLoad).replace('.', ','),
      reps: sets[0]?.targetReps == null ? '' : String(sets[0].targetReps),
      rest: String(templateExercise.restSeconds)
    }
  }
}

export function ProgramEditor({ snapshot, template, onDismiss, onSaved }: {
  snapshot: Snapshot
  template?: WorkoutTemplate
  onDismiss: () => void
  onSaved: () => Promise<void>
}) {
  const initialChosen = useMemo(() => {
    if (!template) return []
    return snapshot.templateExercises.filter((item) => item.templateId === template.id).sort((a, b) => a.orderIndex - b.orderIndex).flatMap((item) => {
      const exercise = snapshot.exercises.find((candidate) => candidate.id === item.exerciseId)
      return exercise ? [existingChosen(exercise, item, snapshot)] : []
    })
  }, [snapshot, template])
  const [name, setName] = useState(template?.name ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [chosen, setChosen] = useState<ChosenExercise[]>(initialChosen)
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  const update = (exerciseId: string, field: keyof ChosenExercise['values'], value: string) => setChosen((items) => items.map((item) => item.exercise.id === exerciseId ? { ...item, values: { ...item.values, [field]: value } } : item))
  const move = (index: number, delta: number) => setChosen((items) => {
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return items
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })

  const save = async () => {
    if (!name.trim() || !chosen.length || saving) return
    setSaving(true)
    const timestamp = now()
    const templateId = template?.id ?? id()
    const record: WorkoutTemplate = {
      id: templateId,
      name: name.trim(),
      notes: notes.trim() || undefined,
      createdAt: template?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
    await mutate('workoutTemplates', 'workout_templates', record, template?.updatedAt)
    if (template) {
      const previousExercises = snapshot.templateExercises.filter((item) => item.templateId === template.id)
      for (const previous of previousExercises) {
        await mutate('templateExercises', 'template_exercises', { ...previous, deletedAt: timestamp, updatedAt: timestamp }, previous.updatedAt)
        for (const set of snapshot.templateSets.filter((item) => item.templateExerciseId === previous.id)) {
          await mutate('templateSets', 'template_sets', { ...set, deletedAt: timestamp, updatedAt: timestamp }, set.updatedAt)
        }
      }
    }
    for (const [orderIndex, item] of chosen.entries()) {
      const number = (value: string, fallback: string) => Number((value || fallback).replace(',', '.'))
      const count = Math.max(1, Math.min(12, Math.round(number(item.values.sets, item.defaults.sets) || 3)))
      const load = number(item.values.load, item.defaults.load)
      const reps = Math.max(1, Math.round(number(item.values.reps, item.defaults.reps) || 8))
      const rest = Math.max(0, Math.round(number(item.values.rest, item.defaults.rest) || 90))
      const templateExercise = {
        id: id(), templateId, exerciseId: item.exercise.id, orderIndex, restSeconds: rest,
        notes: item.values.notes.trim() || undefined, updatedAt: timestamp
      }
      await mutate('templateExercises', 'template_exercises', templateExercise)
      for (let setIndex = 0; setIndex < count; setIndex++) {
        await mutate('templateSets', 'template_sets', {
          id: id(), templateExerciseId: templateExercise.id, setIndex,
          targetLoad: load || undefined, targetReps: reps, updatedAt: timestamp
        })
      }
    }
    await onSaved()
    onDismiss()
  }

  return <>
    <Modal title={template ? 'Muokkaa ohjelmaa' : 'Uusi ohjelma'} onDismiss={onDismiss} className="editor-modal">
      <label className="field-label">Nimi<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Esim. Ylävartalo A" /></label>
      <label className="field-label">Ohjelman muistiinpano<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Vapaaehtoinen" /></label>
      <div className="programming-list">{chosen.map((item, index) => <article className="programming-card" key={item.exercise.id}>
        <header><ExerciseAvatar exercise={item.exercise}/><div><strong>{item.exercise.name}</strong><small>{item.exercise.primaryMuscles.join(', ')}</small></div><div className="order-buttons"><button disabled={index === 0} onClick={() => move(index, -1)} aria-label="Siirrä ylös"><ArrowUp size={16}/></button><button disabled={index === chosen.length - 1} onClick={() => move(index, 1)} aria-label="Siirrä alas"><ArrowDown size={16}/></button><button className="danger" onClick={() => setChosen((items) => items.filter((candidate) => candidate.exercise.id !== item.exercise.id))} aria-label="Poista liike"><Trash2 size={16}/></button></div></header>
        <div className="programming-fields">
          <label>Sarjat<input inputMode="numeric" value={item.values.sets} placeholder={item.defaults.sets} onChange={(event) => update(item.exercise.id, 'sets', event.target.value)} /></label>
          <label>Kg<input inputMode="decimal" value={item.values.load} placeholder={item.defaults.load || '—'} onChange={(event) => update(item.exercise.id, 'load', event.target.value)} /></label>
          <label>Toistot<input inputMode="numeric" value={item.values.reps} placeholder={item.defaults.reps} onChange={(event) => update(item.exercise.id, 'reps', event.target.value)} /></label>
          <label>Lepo s<input inputMode="numeric" value={item.values.rest} placeholder={item.defaults.rest} onChange={(event) => update(item.exercise.id, 'rest', event.target.value)} /></label>
        </div>
        <label className="notes-inline">Liikkeen muistiinpano<input value={item.values.notes} onChange={(event) => update(item.exercise.id, 'notes', event.target.value)} placeholder="Vapaaehtoinen" /></label>
      </article>)}</div>
      <button className="surface-button wide" onClick={() => setPicker(true)}><Plus size={18}/> Lisää liike</button>
      <button className="primary-button wide" disabled={!name.trim() || !chosen.length || saving} onClick={() => void save()}>{saving ? 'Tallennetaan…' : template ? 'Tallenna muutokset' : 'Tallenna ohjelma'}</button>
    </Modal>
    {picker && <ExercisePicker exercises={snapshot.exercises} selectedIds={chosen.map((item) => item.exercise.id)} onDismiss={() => setPicker(false)} onSelect={(exercise) => { setChosen((items) => [...items, createChosen(exercise)]); setPicker(false) }} />}
  </>
}
