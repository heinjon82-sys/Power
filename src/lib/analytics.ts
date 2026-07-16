import type { SessionExercise, SessionSet, WorkoutSession } from '../types'
import { volume } from './utils'

export type RangeKey = '7' | '30' | '90' | '365' | 'all'

export const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: '7', label: '7 pv' }, { key: '30', label: '30 pv' },
  { key: '90', label: '90 pv' }, { key: '365', label: '1 v' }, { key: 'all', label: 'Kaikki' }
]

export function rangeStart(range: RangeKey) {
  if (range === 'all') return null
  const date = new Date()
  date.setDate(date.getDate() - Number(range))
  return date
}

export function inRange(date: string, range: RangeKey) {
  const start = rangeStart(range)
  return !start || new Date(date) >= start
}

export function estimatedOneRepMax(load?: number, reps?: number) {
  if (!load || !reps) return 0
  return load * (1 + reps / 30)
}

export function sessionSets(
  sessionId: string,
  exercises: SessionExercise[],
  sets: SessionSet[]
) {
  const ids = new Set(exercises.filter((exercise) => exercise.sessionId === sessionId).map((exercise) => exercise.id))
  return sets.filter((set) => ids.has(set.sessionExerciseId) && set.isCompleted)
}

export function sessionSummary(session: WorkoutSession, exercises: SessionExercise[], sets: SessionSet[]) {
  const completed = sessionSets(session.id, exercises, sets)
  return {
    sets: completed.length,
    reps: completed.reduce((total, set) => total + (set.actualReps ?? 0), 0),
    volume: volume(completed),
    duration: session.durationSeconds ?? 0
  }
}

function weekStart(value: string) {
  const date = new Date(value)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function weeklySeries(sessions: WorkoutSession[], exercises: SessionExercise[], sets: SessionSet[], range: RangeKey) {
  const buckets = new Map<string, { date: Date; sessions: number; sets: number; duration: number; volume: number }>()
  sessions.filter((session) => session.status === 'completed' && inRange(session.endedAt ?? session.startedAt, range)).forEach((session) => {
    const date = weekStart(session.endedAt ?? session.startedAt)
    const key = date.toISOString().slice(0, 10)
    const current = buckets.get(key) ?? { date, sessions: 0, sets: 0, duration: 0, volume: 0 }
    const summary = sessionSummary(session, exercises, sets)
    current.sessions += 1
    current.sets += summary.sets
    current.duration += Math.round(summary.duration / 60)
    current.volume += Math.round(summary.volume)
    buckets.set(key, current)
  })
  return [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).map((item) => ({
    ...item,
    label: item.date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
  }))
}
