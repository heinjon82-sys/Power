import { getDb } from './db'
import { id, now, suggestedSet } from './utils'
import { queueChange } from './sync'
import type {
  BodyMeasurement, EntityName, Exercise, SessionExercise, SessionRuntime, SessionSet,
  TemplateExercise, TemplateSet, WorkoutSession, WorkoutTemplate
} from '../types'

export type Snapshot = {
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  templateExercises: TemplateExercise[]
  templateSets: TemplateSet[]
  sessions: WorkoutSession[]
  sessionExercises: SessionExercise[]
  sessionSets: SessionSet[]
  runtimes: SessionRuntime[]
  measurements: BodyMeasurement[]
}

export const emptySnapshot: Snapshot = {
  exercises: [], templates: [], templateExercises: [], templateSets: [], sessions: [],
  sessionExercises: [], sessionSets: [], runtimes: [], measurements: []
}

export type LocalTable =
  | 'exercises' | 'workoutTemplates' | 'templateExercises' | 'templateSets'
  | 'workoutSessions' | 'sessionExercises' | 'sessionSets' | 'sessionRuntime'
  | 'bodyMeasurements'

export async function mutate<T extends { id: string; updatedAt: string }>(
  table: LocalTable,
  entity: EntityName,
  record: T,
  baseUpdatedAt?: string
) {
  const db = getDb()
  await (db as unknown as Record<string, { put: (value: T) => Promise<unknown> }>)[table].put(record)
  await queueChange(entity, record as unknown as Record<string, unknown>, baseUpdatedAt)
}

const live = <T extends { deletedAt?: string }>(records: T[]) => records.filter((record) => !record.deletedAt)

export async function loadSnapshot(): Promise<Snapshot> {
  const db = getDb()
  return {
    exercises: await db.exercises.orderBy('name').toArray(),
    templates: live(await db.workoutTemplates.toArray()),
    templateExercises: live(await db.templateExercises.toArray()),
    templateSets: live(await db.templateSets.toArray()),
    sessions: live(await db.workoutSessions.toArray()),
    sessionExercises: live(await db.sessionExercises.toArray()),
    sessionSets: live(await db.sessionSets.toArray()),
    runtimes: live(await db.sessionRuntime.toArray()),
    measurements: live(await db.bodyMeasurements.toArray())
  }
}

export async function previousSets(exerciseId: string, excludeSessionId?: string) {
  const db = getDb()
  const matching = live(await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray())
  const candidates = await Promise.all(matching.map(async (exercise) => ({
    exercise,
    session: await db.workoutSessions.get(exercise.sessionId)
  })))
  const latest = candidates
    .filter(({ session }) => session?.status === 'completed' && session.id !== excludeSessionId)
    .sort((a, b) => (b.session?.endedAt ?? '').localeCompare(a.session?.endedAt ?? ''))[0]
  if (!latest) return []
  return live(await db.sessionSets.where('sessionExerciseId').equals(latest.exercise.id).toArray())
    .filter((set) => set.isCompleted)
    .sort((a, b) => a.setIndex - b.setIndex)
}

export async function createSessionFromTemplate(template: WorkoutTemplate, snapshot: Snapshot) {
  const timestamp = now()
  const session: WorkoutSession = {
    id: id(), templateId: template.id, name: template.name, status: 'active',
    startedAt: timestamp, updatedAt: timestamp
  }
  await mutate('workoutSessions', 'workout_sessions', session)
  const templateExercises = snapshot.templateExercises
    .filter((item) => item.templateId === template.id)
    .sort((a, b) => a.orderIndex - b.orderIndex)
  for (const item of templateExercises) {
    const exercise = snapshot.exercises.find((candidate) => candidate.id === item.exerciseId)
    if (!exercise) continue
    const sessionExercise: SessionExercise = {
      id: id(), sessionId: session.id, exerciseId: exercise.id, nameSnapshot: exercise.name,
      orderIndex: item.orderIndex, restSeconds: item.restSeconds, notes: item.notes, updatedAt: timestamp
    }
    await mutate('sessionExercises', 'session_exercises', sessionExercise)
    const blueprint = snapshot.templateSets
      .filter((set) => set.templateExerciseId === item.id)
      .sort((a, b) => a.setIndex - b.setIndex)const previous = await previousSets(exercise.id)
const previousLastSet = previous[previous.length - 1]

for (const [setIndex, set] of blueprint.entries()) {
  const suggestion = suggestedSet(
    previous[setIndex],
    {
      plannedLoad: set.targetLoad,
      plannedReps: set.targetReps
    },
    previousLastSet
  )targetReps })
      await mutate('sessionSets', 'session_sets', {
        id: id(), sessionExerciseId: sessionExercise.id, setIndex, isCompleted: false,
        updatedAt: timestamp, ...suggestion
      })
    }
  }
  const runtime: SessionRuntime = { id: session.id, sessionId: session.id, updatedAt: timestamp }
  await mutate('sessionRuntime', 'session_runtime', runtime)
  return session
}

export async function softDeleteTemplate(template: WorkoutTemplate, snapshot: Snapshot) {
  const timestamp = now()
  await mutate('workoutTemplates', 'workout_templates', { ...template, deletedAt: timestamp, updatedAt: timestamp }, template.updatedAt)
  const children = snapshot.templateExercises.filter((item) => item.templateId === template.id)
  for (const child of children) {
    await mutate('templateExercises', 'template_exercises', { ...child, deletedAt: timestamp, updatedAt: timestamp }, child.updatedAt)
    for (const set of snapshot.templateSets.filter((item) => item.templateExerciseId === child.id)) {
      await mutate('templateSets', 'template_sets', { ...set, deletedAt: timestamp, updatedAt: timestamp }, set.updatedAt)
    }
  }
}
