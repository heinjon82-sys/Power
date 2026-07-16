import { getActiveUserId, getDb } from './db'
import { id, now } from './utils'
import type { EntityName, SyncChange } from '../types'

export async function queueChange(entity: EntityName, record: Record<string, unknown>, baseUpdatedAt?: string) {
  const db = getDb()
  const change: SyncChange = { id: id(), entity, recordId: String(record.id), record, baseUpdatedAt, createdAt: now() }
  await db.outbox.put(change)
}

export async function bootstrapExercises(exercises: Array<Record<string, unknown>>) {
  if (!navigator.onLine) return
  const response = await fetch('/api/bootstrap', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exercises })
  })
  // Paikallisessa Vite-kehityksessä API-reittiä ei ole; tuotannossa virhe nostetaan näkyville synkan yhteydessä.
  if (response.status >= 500) throw new Error('Liikepankin alustus epäonnistui')
}

export async function syncChanges() {
  const db = getDb()
  const userId = getActiveUserId()
  if (!navigator.onLine) return { status: 'offline' as const }
  const tables: Record<EntityName, string> = {
    exercises: 'exercises', workout_templates: 'workoutTemplates', template_exercises: 'templateExercises', template_sets: 'templateSets',
    workout_sessions: 'workoutSessions', session_exercises: 'sessionExercises', session_sets: 'sessionSets',
    session_runtime: 'sessionRuntime', body_measurements: 'bodyMeasurements'
  }
  const cursorKey = `punttis-sync-cursor:${userId}`
  let cursor = localStorage.getItem(cursorKey) ?? ''
  let hasMore = true
  while (hasMore) {
    const pull = await fetch(`/api/sync/pull?cursor=${encodeURIComponent(cursor)}`)
    if (!pull.ok) throw new Error('Synkronoinnin lataus epäonnistui')
    const remote = await pull.json() as {
      changes: Array<{ entity: EntityName; record: Record<string, unknown> }>
      cursor: string
      hasMore: boolean
    }
    for (const change of remote.changes) {
      await (db as unknown as Record<string, { put: (record: unknown) => Promise<unknown> }>)[tables[change.entity]].put(change.record)
    }
    cursor = remote.cursor
    localStorage.setItem(cursorKey, cursor)
    hasMore = remote.hasMore
  }
  const changes = await db.outbox.toArray()
  if (!changes.length) return { status: 'idle' as const }
  const response = await fetch('/api/sync/push', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes })
  })
  if (!response.ok) throw new Error('Synkronointi epäonnistui')
  const result = await response.json() as {
    accepted: string[]
    rejected?: string[]
    conflicts?: Array<{ id: string; entity: EntityName; record: Record<string, unknown> }>
  }
  await db.outbox.bulkDelete([...(result.accepted ?? []), ...(result.rejected ?? [])])
  for (const conflict of result.conflicts ?? []) {
    await (db as unknown as Record<string, { put: (record: unknown) => Promise<unknown> }>)[tables[conflict.entity]].put(conflict.record)
  }
  await db.outbox.bulkDelete((result.conflicts ?? []).map((conflict) => conflict.id))
  return { status: result.conflicts?.length ? 'conflict' as const : 'synced' as const }
}
