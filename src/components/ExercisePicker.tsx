import { useMemo, useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import type { Exercise } from '../types'
import { ExerciseAvatar, Modal } from './ui'

export function ExercisePicker({ exercises, onSelect, onDismiss, selectedIds = [], title = 'Lisää liike' }: {
  exercises: Exercise[]
  onSelect: (exercise: Exercise) => void
  onDismiss: () => void
  selectedIds?: string[]
  title?: string
}) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const lowered = query.trim().toLocaleLowerCase('fi-FI')
    const filtered = exercises.filter((exercise) => !lowered || `${exercise.name} ${exercise.familyName} ${exercise.primaryMuscles.join(' ')}`.toLocaleLowerCase('fi-FI').includes(lowered))
    const result = new Map<string, Exercise[]>()
    filtered.forEach((exercise) => result.set(exercise.familyName, [...(result.get(exercise.familyName) ?? []), exercise]))
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b, 'fi-FI'))
  }, [exercises, query])

  return <Modal title={title} onDismiss={onDismiss} className="picker-modal">
    <label className="search-field"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hae liikepankista" /></label>
    <div className="exercise-picker-full">
      {groups.map(([family, familyExercises]) => <section key={family} className="exercise-family"><h3>{family}</h3>{familyExercises.map((exercise) => {
        const selected = selectedIds.includes(exercise.id)
        return <button key={exercise.id} onClick={() => onSelect(exercise)} disabled={selected}>
          <ExerciseAvatar exercise={exercise}/><span><strong>{exercise.name}</strong><small>{exercise.primaryMuscles.join(', ')}</small></span>{selected ? <Check size={19}/> : <Plus size={19}/>} 
        </button>
      })}</section>)}
      {!groups.length && <div className="empty-inline">Liikettä ei löytynyt.</div>}
    </div>
  </Modal>
}
