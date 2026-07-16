import { Hono, type Context } from 'hono'
import { verifyAccessToken, isSameOriginMutation, normalizeEmail, type AccessIdentity } from './auth'
import { isVersionConflict } from './sync-guards'
import { parseSyncCursor, syncPage } from './sync-pagination'
import { clientRecord, ownedEntities, ownsRow, parentReferences, serverOwnedRecord, type OwnedEntity } from './tenancy'
import { identityLinkDecision } from './user-access'

type Env = {
  DB: D1Database
  MEDIA: R2Bucket
  ASSETS: Fetcher
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  OWNER_EMAIL: string
}
type Variables = { identity: AccessIdentity }
type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type Change = { id: string; entity: EntityName; recordId: string; record: Record<string, unknown>; baseUpdatedAt?: string }
type EntityName = 'exercises' | OwnedEntity
type UserRole = 'owner' | 'member'
type UserStatus = 'invited' | 'active' | 'disabled'
type UserRow = {
  id: string
  email: string
  email_normalized: string
  display_name: string | null
  role: UserRole
  status: UserStatus
  access_sub: string | null
  last_login_method: string | null
  created_at: string
  first_login_at: string | null
  last_login_at: string | null
  updated_at: string
}

const columns: Record<EntityName, readonly string[]> = {
  exercises: ['id', 'name', 'equipment', 'family_id', 'family_name', 'movement_class', 'primary_muscles', 'secondary_muscles', 'default_step', 'image_path', 'image_thumb_path', 'image_full_path', 'updated_at'],
  workout_templates: ['id', 'user_id', 'name', 'notes', 'created_at', 'updated_at', 'deleted_at'],
  template_exercises: ['id', 'user_id', 'template_id', 'exercise_id', 'order_index', 'rest_seconds', 'notes', 'updated_at', 'deleted_at'],
  template_sets: ['id', 'user_id', 'template_exercise_id', 'set_index', 'target_load', 'target_reps', 'updated_at', 'deleted_at'],
  workout_sessions: ['id', 'user_id', 'template_id', 'name', 'status', 'started_at', 'ended_at', 'duration_seconds', 'notes', 'updated_at', 'deleted_at'],
  session_exercises: ['id', 'user_id', 'session_id', 'exercise_id', 'name_snapshot', 'order_index', 'rest_seconds', 'notes', 'updated_at', 'deleted_at'],
  session_sets: ['id', 'user_id', 'session_exercise_id', 'set_index', 'planned_load', 'planned_reps', 'previous_load', 'previous_reps', 'actual_load', 'actual_reps', 'is_completed', 'completed_at', 'updated_at', 'deleted_at'],
  session_runtime: ['id', 'user_id', 'session_id', 'rest_timer_ends_at', 'active_exercise_id', 'updated_at', 'deleted_at'],
  body_measurements: ['id', 'user_id', 'type', 'value', 'unit', 'measured_at', 'note', 'updated_at', 'deleted_at']
}

const camelToSnake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
const snakeToCamel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
const isEntity = (value: string): value is EntityName => value in columns
const isOwnedEntity = (value: EntityName): value is OwnedEntity => ownedEntities.includes(value as OwnedEntity)
const serverNow = () => new Date().toISOString()

function fromDatabase(row: Record<string, unknown>) {
  const converted = Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if ((key === 'primary_muscles' || key === 'secondary_muscles') && typeof value === 'string') {
      try { return [snakeToCamel(key), JSON.parse(value)] } catch { return [snakeToCamel(key), []] }
    }
    return [snakeToCamel(key), key === 'is_completed' ? Boolean(value) : value]
  }))
  return clientRecord(converted)
}

function databaseRecord(record: Record<string, unknown>, entity: EntityName, timestamp: string, userId?: string) {
  const source = isOwnedEntity(entity) && userId ? serverOwnedRecord(record, userId) : record
  const data: Record<string, unknown> = { ...source, updatedAt: timestamp }
  if (entity === 'session_sets') data.isCompleted = data.isCompleted ? 1 : 0
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [camelToSnake(key), Array.isArray(value) ? JSON.stringify(value) : value]))
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    role: row.role,
    status: row.status,
    loginMethod: row.last_login_method ?? 'Cloudflare Access',
    createdAt: row.created_at,
    firstLoginAt: row.first_login_at ?? undefined,
    lastLoginAt: row.last_login_at ?? undefined,
    identityLinked: Boolean(row.access_sub)
  }
}

async function claimLegacyData(db: D1Database, userId: string) {
  await db.batch([
    ...ownedEntities.map((entity) => db.prepare(`UPDATE ${entity} SET user_id = ? WHERE user_id IS NULL`).bind(userId)),
    db.prepare('UPDATE sync_changes SET user_id = ? WHERE user_id IS NULL').bind(userId)
  ])
}

type UserResolution = { user?: UserRow; code?: 'not_invited' | 'disabled' | 'identity_relink_required' }

async function resolveUser(context: AppContext, touch = false): Promise<UserResolution> {
  const identity = context.get('identity')
  let user = await context.env.DB.prepare('SELECT * FROM app_users WHERE access_sub = ?').bind(identity.sub).first<UserRow>()
  if (user) {
    const decision = identityLinkDecision(user, identity)
    if (decision === 'email_mismatch' || decision === 'identity_relink_required') return { user, code: 'identity_relink_required' }
    if (decision === 'disabled') return { user, code: 'disabled' }
    if (touch) {
      const timestamp = serverNow()
      await context.env.DB.prepare('UPDATE app_users SET email = ?, last_login_method = ?, last_login_at = ?, updated_at = ? WHERE id = ?')
        .bind(identity.email, identity.loginMethod, timestamp, timestamp, user.id).run()
      user = { ...user, email: identity.email, last_login_method: identity.loginMethod, last_login_at: timestamp, updated_at: timestamp }
    }
    return { user }
  }

  user = await context.env.DB.prepare('SELECT * FROM app_users WHERE email_normalized = ?').bind(identity.emailNormalized).first<UserRow>()
  if (user) {
    const decision = identityLinkDecision(user, identity)
    if (decision === 'disabled') return { user, code: 'disabled' }
    if (decision === 'identity_relink_required' || decision === 'email_mismatch') return { user, code: 'identity_relink_required' }
    const timestamp = serverNow()
    await context.env.DB.prepare(`UPDATE app_users
      SET access_sub = ?, status = 'active', email = ?, last_login_method = ?,
          first_login_at = COALESCE(first_login_at, ?), last_login_at = ?, updated_at = ?
      WHERE id = ?`)
      .bind(identity.sub, identity.email, identity.loginMethod, timestamp, timestamp, timestamp, user.id).run()
    return { user: { ...user, access_sub: identity.sub, status: 'active', email: identity.email, last_login_method: identity.loginMethod, first_login_at: user.first_login_at ?? timestamp, last_login_at: timestamp, updated_at: timestamp } }
  }

  const existing = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM app_users').first<{ count: number }>()
  if ((existing?.count ?? 0) === 0 && identity.emailNormalized === normalizeEmail(context.env.OWNER_EMAIL ?? '')) {
    const timestamp = serverNow()
    const id = crypto.randomUUID()
    await context.env.DB.prepare(`INSERT INTO app_users
      (id, email, email_normalized, display_name, role, status, access_sub, last_login_method, created_at, first_login_at, last_login_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?, ?, ?, ?, ?)`)
      .bind(id, identity.email, identity.emailNormalized, identity.email.split('@')[0], identity.sub, identity.loginMethod, timestamp, timestamp, timestamp, timestamp).run()
    await claimLegacyData(context.env.DB, id)
    return { user: {
      id, email: identity.email, email_normalized: identity.emailNormalized,
      display_name: identity.email.split('@')[0], role: 'owner', status: 'active', access_sub: identity.sub,
      last_login_method: identity.loginMethod, created_at: timestamp, first_login_at: timestamp,
      last_login_at: timestamp, updated_at: timestamp
    } }
  }
  return { code: 'not_invited' }
}

async function activeUser(context: AppContext) {
  const resolution = await resolveUser(context)
  if (!resolution.user || resolution.code) return { response: context.json({ code: resolution.code ?? 'not_invited', email: context.get('identity').email }, 403) }
  return { user: resolution.user }
}

async function ownerUser(context: AppContext) {
  const result = await activeUser(context)
  if ('response' in result) return result
  if (result.user.role !== 'owner') return { response: context.json({ code: 'owner_required' }, 403) }
  return result
}

async function validParent(db: D1Database, entity: OwnedEntity, record: Record<string, unknown>, userId: string) {
  const reference = parentReferences[entity]
  if (reference) {
    const parentId = record[reference.field]
    if (typeof parentId !== 'string') return false
    const parent = await db.prepare(`SELECT user_id FROM ${reference.table} WHERE id = ?`).bind(parentId).first<Record<string, unknown>>()
    if (!ownsRow(parent, userId)) return false
  }
  if (entity === 'workout_sessions' && typeof record.template_id === 'string') {
    const template = await db.prepare('SELECT user_id FROM workout_templates WHERE id = ?').bind(record.template_id).first<Record<string, unknown>>()
    if (!ownsRow(template, userId)) return false
  }
  return true
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('/api/*', async (context, next) => {
  if (!isSameOriginMutation(context.req.raw)) return context.json({ code: 'invalid_origin' }, 403)
  const token = context.req.header('cf-access-jwt-assertion')
  if (!token) {
    console.warn('Access JWT missing', { path: context.req.path })
    return context.json({ code: 'missing_access_token' }, 401)
  }
  try {
    const identity = await verifyAccessToken(token, { teamDomain: context.env.ACCESS_TEAM_DOMAIN, audience: context.env.ACCESS_AUD })
    context.set('identity', identity)
    await next()
  } catch (error) {
    console.warn('Access JWT rejected', {
      path: context.req.path,
      reason: error instanceof Error ? error.message : 'unknown'
    })
    return context.json({ code: 'invalid_access_token' }, 401)
  }
})

app.get('/api/health', (context) => context.json({ ok: true }))

app.get('/api/me', async (context) => {
  const resolution = await resolveUser(context, true)
  if (!resolution.user || resolution.code) return context.json({ code: resolution.code ?? 'not_invited', email: context.get('identity').email }, 403)
  return context.json({ user: publicUser(resolution.user) })
})

app.get('/api/admin/users', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const rows = await context.env.DB.prepare('SELECT * FROM app_users ORDER BY role ASC, created_at ASC').all<UserRow>()
  return context.json({ users: rows.results.map(publicUser) })
})

app.post('/api/admin/users', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const body = await context.req.json<{ email?: string; displayName?: string }>()
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const emailNormalized = normalizeEmail(email)
  if (!email.includes('@') || email.length > 254) return context.json({ code: 'invalid_email' }, 400)
  const existing = await context.env.DB.prepare('SELECT id FROM app_users WHERE email_normalized = ?').bind(emailNormalized).first()
  if (existing) return context.json({ code: 'email_exists' }, 409)
  const timestamp = serverNow()
  const id = crypto.randomUUID()
  await context.env.DB.prepare(`INSERT INTO app_users
    (id, email, email_normalized, display_name, role, status, invited_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'member', 'invited', ?, ?, ?)`)
    .bind(id, email, emailNormalized, typeof body.displayName === 'string' ? body.displayName.trim() || null : null, auth.user.id, timestamp, timestamp).run()
  const created = await context.env.DB.prepare('SELECT * FROM app_users WHERE id = ?').bind(id).first<UserRow>()
  return context.json({ user: publicUser(created!) }, 201)
})

app.patch('/api/admin/users/:id', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const target = await context.env.DB.prepare('SELECT * FROM app_users WHERE id = ?').bind(context.req.param('id')).first<UserRow>()
  if (!target) return context.json({ code: 'user_not_found' }, 404)
  const body = await context.req.json<{ displayName?: string; resetIdentity?: boolean; status?: 'active' | 'disabled' }>()
  if (target.role === 'owner' && body.status === 'disabled') return context.json({ code: 'owner_protected' }, 400)
  const timestamp = serverNow()
  const displayName = body.displayName === undefined
    ? target.display_name
    : typeof body.displayName === 'string' ? body.displayName.trim() || null : target.display_name
  const accessSub = body.resetIdentity ? null : target.access_sub
  let status: UserStatus = target.status
  if (body.resetIdentity && target.status !== 'disabled') status = 'invited'
  if (body.status === 'disabled') status = 'disabled'
  if (body.status === 'active') status = accessSub ? 'active' : 'invited'
  await context.env.DB.prepare('UPDATE app_users SET display_name = ?, access_sub = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(displayName, accessSub, status, timestamp, target.id).run()
  const updated = await context.env.DB.prepare('SELECT * FROM app_users WHERE id = ?').bind(target.id).first<UserRow>()
  return context.json({ user: publicUser(updated!) })
})

app.post('/api/admin/users/:id/disable', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const target = await context.env.DB.prepare('SELECT * FROM app_users WHERE id = ?').bind(context.req.param('id')).first<UserRow>()
  if (!target) return context.json({ code: 'user_not_found' }, 404)
  if (target.role === 'owner') return context.json({ code: 'owner_protected' }, 400)
  const timestamp = serverNow()
  await context.env.DB.prepare("UPDATE app_users SET status = 'disabled', updated_at = ? WHERE id = ?").bind(timestamp, target.id).run()
  return context.json({ user: publicUser({ ...target, status: 'disabled', updated_at: timestamp }) })
})

app.delete('/api/admin/users/:id', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const target = await context.env.DB.prepare('SELECT * FROM app_users WHERE id = ?').bind(context.req.param('id')).first<UserRow>()
  if (!target) return context.json({ code: 'user_not_found' }, 404)
  if (target.role === 'owner') return context.json({ code: 'owner_protected' }, 400)
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM session_sets WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM session_runtime WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM session_exercises WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM workout_sessions WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM template_sets WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM template_exercises WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM workout_templates WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM body_measurements WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM sync_changes WHERE user_id = ?').bind(target.id),
    context.env.DB.prepare('DELETE FROM app_users WHERE id = ?').bind(target.id)
  ])
  return context.json({ ok: true })
})

app.post('/api/bootstrap', async (context) => {
  const auth = await ownerUser(context); if ('response' in auth) return auth.response
  const body = await context.req.json<{ exercises?: Array<Record<string, unknown>> }>()
  const seededAt = serverNow()
  for (const exercise of body.exercises ?? []) {
    if (typeof exercise.id !== 'string' || typeof exercise.name !== 'string') continue
    const record = databaseRecord(exercise, 'exercises', seededAt)
    const names = columns.exercises
    const updates = names.filter((name) => name !== 'id').map((name) => `${name} = excluded.${name}`).join(', ')
    await context.env.DB.prepare(`INSERT INTO exercises (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`)
      .bind(...names.map((name) => record[name] ?? null)).run()
  }
  return context.json({ ok: true })
})

app.post('/api/sync/push', async (context) => {
  const auth = await activeUser(context); if ('response' in auth) return auth.response
  const body = await context.req.json<{ changes?: Change[] }>()
  const accepted: string[] = []
  const rejected: string[] = []
  const conflicts: Array<{ id: string; entity: OwnedEntity; record: Record<string, unknown> }> = []
  for (const change of body.changes ?? []) {
    if (!isEntity(change.entity) || change.entity === 'exercises' || !change.recordId || !change.record?.id) { rejected.push(change.id); continue }
    const entity = change.entity
    const previousAttempt = await context.env.DB.prepare('SELECT id FROM sync_changes WHERE id = ? AND user_id = ?').bind(change.id, auth.user.id).first()
    if (previousAttempt) { accepted.push(change.id); continue }
    const anyCurrent = await context.env.DB.prepare(`SELECT * FROM ${entity} WHERE id = ?`).bind(change.recordId).first<Record<string, unknown>>()
    if (anyCurrent && !ownsRow(anyCurrent, auth.user.id)) { rejected.push(change.id); continue }
    const changedAt = serverNow()
    const record = databaseRecord(change.record, entity, changedAt, auth.user.id)
    if (!await validParent(context.env.DB, entity, record, auth.user.id)) { rejected.push(change.id); continue }
    if (anyCurrent && isVersionConflict(anyCurrent.updated_at, change.baseUpdatedAt)) {
      conflicts.push({ id: change.id, entity, record: fromDatabase(anyCurrent) }); continue
    }
    const names = columns[entity]
    const placeholders = names.map(() => '?').join(', ')
    const updates = names.filter((name) => name !== 'id' && name !== 'user_id').map((name) => `${name} = excluded.${name}`).join(', ')
    await context.env.DB.prepare(`INSERT INTO ${entity} (${names.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`)
      .bind(...names.map((name) => record[name] ?? null)).run()
    const syncedRecord = fromDatabase(record)
    await context.env.DB.prepare('INSERT INTO sync_changes (id, user_id, table_name, record_id, record_json, changed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(change.id, auth.user.id, entity, change.recordId, JSON.stringify(syncedRecord), changedAt).run()
    accepted.push(change.id)
  }
  return context.json({ accepted, rejected, conflicts })
})

app.get('/api/sync/pull', async (context) => {
  const auth = await activeUser(context); if ('response' in auth) return auth.response
  const rawCursor = context.req.query('cursor') ?? ''
  const { changedAt: cursorAt, id: cursorId } = parseSyncCursor(rawCursor)
  const changes = await context.env.DB.prepare(`
    SELECT id, table_name, record_json, changed_at
    FROM sync_changes
    WHERE user_id = ? AND (changed_at > ? OR (changed_at = ? AND id > ?))
    ORDER BY changed_at ASC, id ASC
    LIMIT 501
  `).bind(auth.user.id, cursorAt, cursorAt, cursorId).all<{ id: string; table_name: OwnedEntity; record_json: string; changed_at: string }>()
  const result = syncPage(changes.results, rawCursor)
  const rows = result.page.map((change) => ({ entity: change.table_name, record: clientRecord(JSON.parse(change.record_json) as Record<string, unknown>), changedAt: change.changed_at }))
  return context.json({ changes: rows, cursor: result.cursor, hasMore: result.hasMore })
})

app.get('/api/export', async (context) => {
  const auth = await activeUser(context); if ('response' in auth) return auth.response
  const result: Record<string, unknown[]> = {}
  const exercises = await context.env.DB.prepare('SELECT * FROM exercises').all<Record<string, unknown>>()
  result.exercises = exercises.results.map(fromDatabase)
  for (const entity of ownedEntities) {
    const rows = await context.env.DB.prepare(`SELECT * FROM ${entity} WHERE user_id = ?`).bind(auth.user.id).all<Record<string, unknown>>()
    result[entity] = rows.results.map(fromDatabase)
  }
  return context.json({ exportedAt: serverNow(), user: publicUser(auth.user), ...result }, 200, { 'content-disposition': 'attachment; filename="punttis-export.json"' })
})

app.get('/media/:key', async (context) => {
  const object = await context.env.MEDIA.get(context.req.param('key'))
  if (!object) return context.notFound()
  return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'image/webp', 'cache-control': 'public, max-age=2592000, immutable' } })
})

app.all('*', (context) => context.env.ASSETS.fetch(context.req.raw))

export default app
