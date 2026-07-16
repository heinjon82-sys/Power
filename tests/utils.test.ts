import { describe, expect, it } from 'vitest'
import { suggestedSet, volume } from '../src/lib/utils'
import { isVersionConflict } from '../worker/sync-guards'

describe('treenihistoria', () => {
  it('käyttää edellisen suorituksen painoa ja toistoja ehdotuksena', () => {
    expect(suggestedSet({ actualLoad: 82.5, actualReps: 8 }, { plannedLoad: 80, plannedReps: 6 })).toEqual({ plannedLoad: 82.5, plannedReps: 8, previousLoad: 82.5, previousReps: 8 })
  })
  it('palaa ohjelman tavoitearvoihin, kun historiaa ei ole', () => {
    expect(suggestedSet(undefined, { plannedLoad: 60, plannedReps: 10 })).toEqual({ plannedLoad: 60, plannedReps: 10, previousLoad: undefined, previousReps: undefined })
  })
  it('laskee vain valmistuneet sarjat volyymiin', () => {
    expect(volume([{ actualLoad: 100, actualReps: 5, isCompleted: true }, { actualLoad: 100, actualReps: 5, isCompleted: false }])).toBe(500)
  })
})

describe('synkkaristiriidat', () => {
  it('hyväksyy saman palvelinversion päälle tehdyn muutoksen', () => {
    expect(isVersionConflict('2026-07-15T10:00:00.000Z', '2026-07-15T10:00:00.000Z')).toBe(false)
  })
  it('estää vanhaan versioon perustuvan muutoksen', () => {
    expect(isVersionConflict('2026-07-15T10:01:00.000Z', '2026-07-15T10:00:00.000Z')).toBe(true)
  })
})
