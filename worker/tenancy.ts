export type OwnedEntity =
  | 'workout_templates' | 'template_exercises' | 'template_sets'
  | 'workout_sessions' | 'session_exercises' | 'session_sets'
  | 'session_runtime' | 'body_measurements'

export const ownedEntities: readonly OwnedEntity[] = [
  'workout_templates', 'template_exercises', 'template_sets', 'workout_sessions',
  'session_exercises', 'session_sets', 'session_runtime', 'body_measurements'
]

export const parentReferences: Partial<Record<OwnedEntity, { field: string; table: OwnedEntity }>> = {
  template_exercises: { field: 'template_id', table: 'workout_templates' },
  template_sets: { field: 'template_exercise_id', table: 'template_exercises' },
  session_exercises: { field: 'session_id', table: 'workout_sessions' },
  session_sets: { field: 'session_exercise_id', table: 'session_exercises' },
  session_runtime: { field: 'session_id', table: 'workout_sessions' }
}

export function ownsRow(row: Record<string, unknown> | null, userId: string) {
  return Boolean(row && row.user_id === userId)
}

export function serverOwnedRecord(record: Record<string, unknown>, userId: string) {
  const { userId: _camel, user_id: _snake, ...safe } = record
  return { ...safe, userId }
}

export function clientRecord(record: Record<string, unknown>) {
  const { userId: _camel, user_id: _snake, ...safe } = record
  return safe
}
