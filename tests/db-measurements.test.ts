import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb, initializeUserDatabase } from '../src/lib/db'
import { loadSnapshot, mutate } from '../src/lib/data'

describe('mittausten IndexedDB-tallennus', () => {
  beforeAll(async () => {
    await initializeUserDatabase({ id: 'measurement-test', email: 'test@example.com', role: 'member', status: 'active', loginMethod: 'Test', createdAt: new Date().toISOString(), identityLinked: true })
    await getDb().bodyMeasurements.clear(); await getDb().outbox.clear()
  })
  afterAll(async () => { await getDb().delete() })

  it('tallentaa useita saman päivän mittauksia snapshottiin', async () => {
    const updatedAt = '2026-07-15T12:00:00.000Z'
    await mutate('bodyMeasurements', 'body_measurements', { id: 'weight-test', type: 'weight', value: 84.5, unit: 'kg', measuredAt: updatedAt, updatedAt })
    await mutate('bodyMeasurements', 'body_measurements', { id: 'waist-test', type: 'waist', value: 88, unit: 'cm', measuredAt: updatedAt, updatedAt })
    const snapshot = await loadSnapshot()
    expect(snapshot.measurements).toHaveLength(2)
    expect(await getDb().outbox.count()).toBe(2)
  })
})
