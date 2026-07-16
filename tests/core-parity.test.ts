import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { exercises } from '../src/data/exercises'
import { estimatedOneRepMax, sessionSummary, weeklySeries } from '../src/lib/analytics'
import { addedSetSuggestion, restRemaining } from '../src/lib/utils'
import { measurementRows } from '../src/components/MeasurementsView'
import { parseSyncCursor, syncPage } from '../worker/sync-pagination'
import type { BodyMeasurement, SessionExercise, SessionSet, WorkoutSession } from '../src/types'

describe('SwiftUI-core-pariteetti', () => {
  it('sisältää kaikki 69 liikettä ja molemmat kuvakoot', () => {
    expect(exercises).toHaveLength(69)
    for (const exercise of exercises) {
      expect(existsSync(path.resolve('public', exercise.imageThumbPath.slice(1)))).toBe(true)
      expect(existsSync(path.resolve('media-upload', `${exercise.id}.webp`))).toBe(true)
    }
  })

  it('lisäsarja jatkaa viimeisen sarjan syötetyillä tai suunnitelluilla arvoilla', () => {
    const sets = [
      { setIndex: 0, plannedLoad: 70, plannedReps: 8, isCompleted: true },
      { setIndex: 1, plannedLoad: 70, plannedReps: 8, actualLoad: 72.5, actualReps: 7, isCompleted: true }
    ] as SessionSet[]
    expect(addedSetSuggestion(sets)).toMatchObject({ setIndex: 2, plannedLoad: 72.5, plannedReps: 7 })
  })

  it('palauttaa taustalla kuluneen lepoajastimen päättymisajasta', () => {
    const now = Date.parse('2026-07-15T10:00:00.000Z')
    expect(restRemaining('2026-07-15T10:00:25.000Z', now)).toBe(25)
    expect(restRemaining('2026-07-15T09:59:00.000Z', now)).toBe(0)
  })

  it('laskee 1RM:n ja treeniyhteenvedon', () => {
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333, 2)
    const session = { id: 's', name: 'A', status: 'completed', startedAt: '2026-07-15T10:00:00Z', durationSeconds: 3600, updatedAt: '' } as WorkoutSession
    const sessionExercises = [{ id: 'e', sessionId: 's' }] as SessionExercise[]
    const sets = [{ sessionExerciseId: 'e', actualLoad: 100, actualReps: 5, isCompleted: true }] as SessionSet[]
    expect(sessionSummary(session, sessionExercises, sets)).toEqual({ sets: 1, reps: 5, volume: 500, duration: 3600 })
    expect(weeklySeries([session], sessionExercises, sets, 'all')[0]).toMatchObject({ sessions: 1, sets: 1, duration: 60, volume: 500 })
  })

  it('ryhmittelee samana päivänä tallennetut mitat yhdelle riville ja migroi arm-datan', () => {
    const base = { id: 'x', unit: 'cm', measuredAt: '2026-07-15T12:00:00Z', updatedAt: '' } as const
    const rows = measurementRows([
      { ...base, id: 'a', type: 'waist', value: 88 },
      { ...base, id: 'b', type: 'arm', value: 39 }
    ] as BodyMeasurement[], 'all')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ waist: 88, arm_right: 39 })
  })
})

describe('synkan vakaa sivutus', () => {
  it('tukee vanhaa aikaleimakursoria ja uutta yhdistelmäkursoria', () => {
    expect(parseSyncCursor('2026-07-15T10:00:00.000Z')).toEqual({ changedAt: '2026-07-15T10:00:00.000Z', id: '' })
    expect(parseSyncCursor('2026-07-15T10:00:00.000Z|abc')).toEqual({ changedAt: '2026-07-15T10:00:00.000Z', id: 'abc' })
  })

  it('ei kadota 501. muutosta samalta aikaleimalta', () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ id: String(index).padStart(3, '0'), changed_at: '2026-07-15T10:00:00.000Z' }))
    const page = syncPage(rows, '')
    expect(page.page).toHaveLength(500)
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe('2026-07-15T10:00:00.000Z|499')
  })
})
