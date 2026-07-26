import { getDb } from './db'
import { id, now } from './utils'
import type { EntityName, SyncChange } from '../types'

export async function queueChange(
  entity: EntityName,
  record: Record<string, unknown>,
  baseUpdatedAt?: string,
) {
  const db = getDb()

  const change: SyncChange = {
    id: id(),
    entity,
    recordId: String(record.id),
    record,
    baseUpdatedAt,
    createdAt: now(),
  }

  await db.outbox.put(change)
}

export async function bootstrapExercises() {
  // Ei tehdä mitään.
  return
}

export async function syncChanges() {
  const db = getDb()

  // Tyhjennetään mahdollinen synkronointijono.
  const pending = await db.outbox.toArray()
  if (pending.length) {
    await db.outbox.clear()
  }

  return {
    status: 'local' as const,
  }
}
