import rawExercises from './seed/engine_exercises.json'
import rawFamilies from './seed/engine_families.json'
import type { Exercise } from '../types'

const iconByEquipment: Record<string, string> = {
  barbell: 'T', dumbbell: 'K', cable: 'C', machine: 'M', bodyweight: 'O'
}

const familyNames = Object.fromEntries(rawFamilies.map((family) => [family.family_id, family.family_nimi]))

export const exercises: Exercise[] = rawExercises.map((exercise) => ({
  id: exercise.exercise_id,
  name: exercise.name,
  equipment: exercise.equipment,
  familyId: exercise.family_id,
  familyName: familyNames[exercise.family_id] ?? exercise.primary_muscles[0] ?? 'Muut',
  movementClass: exercise.movement_class,
  primaryMuscles: exercise.primary_muscles,
  secondaryMuscles: exercise.secondary_muscles,
  defaultStep: exercise.default_step,
  imageThumbPath: `/exercises/${exercise.exercise_id}.webp`,
  imageFullPath: `/media/${exercise.exercise_id}.webp`,
  updatedAt: '2026-07-15T00:00:00.000Z'
}))

export const exerciseGlyph = (exercise: Exercise) => iconByEquipment[exercise.equipment] ?? '•'
