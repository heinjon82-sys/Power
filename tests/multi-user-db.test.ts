import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { migrateLegacyDatabase, PunttisDatabase } from '../src/lib/db'

const userA = new PunttisDatabase('punttis-user-a-test')
const userB = new PunttisDatabase('punttis-user-b-test')

describe('käyttäjäkohtainen IndexedDB', () => {
  afterAll(async () => { await userA.delete(); await userB.delete() })

  it('pitää saman UUID:n tietueet erillään eri käyttäjillä', async () => {
    const createdAt = new Date().toISOString()
    await userA.workoutTemplates.put({ id: 'same-id', name: 'Käyttäjä A', createdAt, updatedAt: createdAt })
    await userB.workoutTemplates.put({ id: 'same-id', name: 'Käyttäjä B', createdAt, updatedAt: createdAt })
    expect((await userA.workoutTemplates.get('same-id'))?.name).toBe('Käyttäjä A')
    expect((await userB.workoutTemplates.get('same-id'))?.name).toBe('Käyttäjä B')
  })

  it('pitää outboxit erillään', async () => {
    const createdAt = new Date().toISOString()
    await userA.outbox.put({ id: 'change-a', entity: 'workout_templates', recordId: 'one', record: {}, createdAt })
    expect(await userA.outbox.count()).toBe(1)
    expect(await userB.outbox.count()).toBe(0)
  })

  it('siirtää vanhan paikallisdatan vain omistajan tietokantaan', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    })
    const legacy = new PunttisDatabase('punttis')
    const target = new PunttisDatabase('punttis-owner-migration-test')
    const timestamp = new Date().toISOString()
    await legacy.workoutTemplates.put({ id: 'legacy-template', name: 'Vanha ohjelma', createdAt: timestamp, updatedAt: timestamp })
    await migrateLegacyDatabase(target, {
      id: 'owner-migration-test', email: 'owner@example.com', role: 'owner', status: 'active',
      loginMethod: 'test', createdAt: timestamp, identityLinked: true
    })
    expect((await target.workoutTemplates.get('legacy-template'))?.name).toBe('Vanha ohjelma')
    expect(await legacy.workoutTemplates.count()).toBe(1)
    await legacy.delete()
    await target.delete()
    vi.unstubAllGlobals()
  })
})
