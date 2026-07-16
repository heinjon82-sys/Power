export type EntityName =
  | 'exercises' | 'workout_templates' | 'template_exercises' | 'template_sets'
  | 'workout_sessions' | 'session_exercises' | 'session_sets' | 'session_runtime'
  | 'body_measurements'

export type UserRole = 'owner' | 'member'
export type UserStatus = 'invited' | 'active' | 'disabled'

export type AppUser = {
  id: string
  email: string
  displayName?: string
  role: UserRole
  status: UserStatus
  loginMethod: string
  createdAt: string
  firstLoginAt?: string
  lastLoginAt?: string
  identityLinked: boolean
}

export type Exercise = {
  id: string
  name: string
  equipment: string
  familyId: string
  familyName: string
  movementClass: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  defaultStep: number
  imageThumbPath: string
  imageFullPath: string
  updatedAt: string
}

export type WorkoutTemplate = {
  id: string
  name: string
  notes?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export type TemplateExercise = {
  id: string
  templateId: string
  exerciseId: string
  orderIndex: number
  restSeconds: number
  notes?: string
  updatedAt: string
  deletedAt?: string
}

export type TemplateSet = {
  id: string
  templateExerciseId: string
  setIndex: number
  targetLoad?: number
  targetReps?: number
  updatedAt: string
  deletedAt?: string
}

export type WorkoutSession = {
  id: string
  templateId?: string
  name: string
  status: 'active' | 'completed' | 'abandoned'
  startedAt: string
  endedAt?: string
  durationSeconds?: number
  notes?: string
  updatedAt: string
  deletedAt?: string
}

export type SessionExercise = {
  id: string
  sessionId: string
  exerciseId: string
  nameSnapshot: string
  orderIndex: number
  restSeconds: number
  notes?: string
  updatedAt: string
  deletedAt?: string
}

export type SessionSet = {
  id: string
  sessionExerciseId: string
  setIndex: number
  plannedLoad?: number
  plannedReps?: number
  previousLoad?: number
  previousReps?: number
  actualLoad?: number
  actualReps?: number
  isCompleted: boolean
  completedAt?: string
  updatedAt: string
  deletedAt?: string
}

export type SessionRuntime = {
  id: string
  sessionId: string
  restTimerEndsAt?: string
  activeExerciseId?: string
  updatedAt: string
  deletedAt?: string
}

export type BodyMeasurementType =
  | 'weight' | 'chest' | 'waist' | 'hip'
  | 'thigh_right' | 'thigh_left' | 'arm_right' | 'arm_left'
  | 'bodyfat' | 'muscle' | 'fat_mass' | 'bmi'
  | 'arm'

export type BodyMeasurement = {
  id: string
  type: BodyMeasurementType
  value: number
  unit: 'kg' | 'cm' | '%' | 'BMI'
  measuredAt: string
  note?: string
  updatedAt: string
  deletedAt?: string
}

export type SyncChange = {
  id: string
  entity: EntityName
  recordId: string
  record: Record<string, unknown>
  baseUpdatedAt?: string
  createdAt: string
}
