import type { SessionSet } from '../types'

export const now = () => new Date().toISOString()
export const id = () => crypto.randomUUID()

export const kg = (value?: number, compact = false) => {
  if (value == null) return '—'
  if (compact && value >= 1000) return `${String(Number((value / 1000).toFixed(1))).replace('.', ',')} t`
  return `${Number(value.toFixed(2)).toString().replace('.', ',')} kg`
}
export const reps = (value?: number) => value == null ? '—' : `${value}`

export const time = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60)
  if (hours > 0) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export const elapsed = (startedAt: string, endedAt?: string) =>
  Math.max(0, Math.floor(((endedAt ? new Date(endedAt) : new Date()).getTime() - new Date(startedAt).getTime()) / 1000))

export const restRemaining = (endsAt?: string, currentTime = Date.now()) =>
  endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - currentTime) / 1000)) : null

export const volume = (sets: Pick<SessionSet, 'actualLoad' | 'actualReps' | 'isCompleted'>[]) =>
  sets.filter((set) => set.isCompleted).reduce((total, set) => total + (set.actualLoad ?? 0) * (set.actualReps ?? 0), 0)

export const suggestedSet = (
  previous: Pick<SessionSet, 'actualLoad' | 'actualReps'> | undefined,
  fallback: Pick<SessionSet, 'plannedLoad' | 'plannedReps'>,
  progressionSource?: Pick<SessionSet, 'actualLoad' | 'actualReps'>
) => {
  const previousLoad = previous?.actualLoad ?? fallback.plannedLoad
  const targetReps = fallback.plannedReps
  const completedReps = progressionSource?.actualReps

  let plannedLoad = previousLoad

  if (
    previousLoad !== null &&
    targetReps !== null &&
    completedReps !== null &&
    completedReps !== undefined
  ) {
    const missingReps = targetReps - completedReps

    if (missingReps <= 0) {
      plannedLoad = previousLoad + 2.5
    } else if (missingReps >= 2) {
      plannedLoad = Math.max(0, previousLoad - 2.5)
    }
  }

  return {
    plannedLoad,
    plannedReps: fallback.plannedReps,
    previousLoad: previous?.actualLoad,
    previousReps: previous?.actualReps
  }
}

export const addedSetSuggestion = (sets: SessionSet[]) => {
  const ordered = [...sets].sort((a, b) => a.setIndex - b.setIndex)
  const last = ordered.at(-1)
  return {
    setIndex: ordered.length,
    plannedLoad: last?.actualLoad ?? last?.plannedLoad,
    plannedReps: last?.actualReps ?? last?.plannedReps,
    previousLoad: last?.previousLoad,
    previousReps: last?.previousReps
  }
}
