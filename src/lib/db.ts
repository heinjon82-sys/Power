import Dexie, { type Table } from 'dexie'
import type {
  AppUser, BodyMeasurement, Exercise, SessionExercise, SessionSet, SyncChange, TemplateExercise,
  SessionRuntime, TemplateSet, WorkoutSession, WorkoutTemplate
} from '../types'

export class PunttisDatabase extends Dexie {
  exercises!: Table<Exercise, string>
  workoutTemplates!: Table<WorkoutTemplate, string>
  templateExercises!: Table<TemplateExercise, string>
  templateSets!: Table<TemplateSet, string>
  workoutSessions!: Table<WorkoutSession, string>
  sessionExercises!: Table<SessionExercise, string>
  sessionSets!: Table<SessionSet, string>
  sessionRuntime!: Table<SessionRuntime, string>
  bodyMeasurements!: Table<BodyMeasurement, string>
  outbox!: Table<SyncChange, string>

  constructor(name = 'punttis') {
    super(name)
    this.version(1).stores({
      exercises: 'id, name, equipment',
      workoutTemplates: 'id, updatedAt, deletedAt',
      templateExercises: 'id, templateId, exerciseId, updatedAt',
      templateSets: 'id, templateExerciseId, updatedAt',
      workoutSessions: 'id, templateId, status, startedAt, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      sessionSets: 'id, sessionExerciseId, isCompleted, updatedAt',
      bodyMeasurements: 'id, type, measuredAt, updatedAt',
      outbox: 'id, entity, recordId, createdAt'
    })
    this.version(2).stores({
      exercises: 'id, name, equipment, familyId',
      workoutTemplates: 'id, updatedAt, deletedAt',
      templateExercises: 'id, templateId, exerciseId, updatedAt',
      templateSets: 'id, templateExerciseId, updatedAt',
      workoutSessions: 'id, templateId, status, startedAt, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      sessionSets: 'id, sessionExerciseId, isCompleted, updatedAt',
      sessionRuntime: 'id, sessionId, restTimerEndsAt, updatedAt',
      bodyMeasurements: 'id, type, measuredAt, updatedAt',
      outbox: 'id, entity, recordId, createdAt'
    }).upgrade(async (transaction) => {
      await transaction.table('bodyMeasurements').toCollection().modify((measurement) => {
        if (measurement.type === 'arm') measurement.type = 'arm_right'
      })
    })
  }
}

let activeDb: PunttisDatabase | undefined
let activeUserId: string | undefined

export function getDb() {
  if (!activeDb) throw new Error('Käyttäjän paikallista tietokantaa ei ole alustettu')
  return activeDb
}

export function getActiveUserId() {
  if (!activeUserId) throw new Error('Käyttäjää ei ole alustettu')
  return activeUserId
}

const userDatabaseName = (userId: string) => `punttis-${userId}`
const migrationMarker = (userId: string) => `punttis-legacy-migrated:${userId}`

export async function migrateLegacyDatabase(target: PunttisDatabase, user: AppUser) {
  if (user.role !== 'owner' || typeof localStorage === 'undefined') return
  if (localStorage.getItem(migrationMarker(user.id)) || !await Dexie.exists('punttis')) return
  const legacy = new PunttisDatabase('punttis')
  const tables = [
    'exercises', 'workoutTemplates', 'templateExercises', 'templateSets', 'workoutSessions',
    'sessionExercises', 'sessionSets', 'sessionRuntime', 'bodyMeasurements', 'outbox'
  ] as const
  await legacy.open()
  const legacyRows = new Map<string, unknown[]>()
  try {
    // Read the other IndexedDB connection completely before opening the target
    // transaction. Awaiting another database inside a Dexie transaction can make
    // the browser commit that transaction early (especially on iOS Safari).
    for (const name of tables) legacyRows.set(name, await legacy.table(name).toArray())
  } finally {
    legacy.close()
  }
  await target.transaction('rw', tables.map((name) => target.table(name)), async () => {
    for (const name of tables) {
      const rows = legacyRows.get(name) ?? []
      if (rows.length) await target.table(name).bulkPut(rows)
    }
  })
  localStorage.setItem(migrationMarker(user.id), new Date().toISOString())
}

export async function initializeUserDatabase(user: AppUser) {
  if (activeDb && activeUserId === user.id) return activeDb
  activeDb?.close()
  const next = new PunttisDatabase(userDatabaseName(user.id))
  await next.open()
  await migrateLegacyDatabase(next, user)
  activeDb = next
  activeUserId = user.id
  return next
}

export function closeUserDatabase() {
  activeDb?.close()
  activeDb = undefined
  activeUserId = undefined
}

export async function deleteUserDatabase(userId: string) {
  if (activeUserId === userId) closeUserDatabase()
  await Dexie.delete(userDatabaseName(userId))
}
