import type { AppUser } from '../types'
import { closeUserDatabase } from './db'

const ACTIVE_USER_KEY = 'punttis-active-user'
const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000

type CachedSession = { user: AppUser; verifiedAt: string }

export class AccountAccessError extends Error {
  constructor(public code: string, public email?: string) {
    super(code)
  }
}

function cachedSession(): CachedSession | undefined {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY)
    if (!raw) return undefined
    return JSON.parse(raw) as CachedSession
  } catch { return undefined }
}

export function cacheUser(user: AppUser) {
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify({ user, verifiedAt: new Date().toISOString() } satisfies CachedSession))
}

export async function currentUser() {
  const user: AppUser = {
    id: 'local-owner',
    email: 'local@punttis.dev',
    displayName: 'Paikallinen omistaja',
    role: 'owner',
    status: 'active',
    loginMethod: 'Kehitystila',
    createdAt: new Date().toISOString(),
    identityLinked: true,
  }

  cacheUser(user)

  return {
    user,
    offline: false,
  }
}

export function clearActiveUser() {
  localStorage.removeItem(ACTIVE_USER_KEY)
  closeUserDatabase()
}

export function logout() {
  clearActiveUser()
  window.location.reload()
}
}

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers }
  })
  const result = await response.json().catch(() => ({})) as T & { code?: string }
  if (!response.ok) throw new AccountAccessError(result.code ?? 'request_failed')
  return result
}

export async function listUsers() {
  return (await api<{ users: AppUser[] }>('/api/admin/users')).users
}

export async function inviteUser(email: string, displayName?: string) {
  return (await api<{ user: AppUser }>('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, displayName }) })).user
}

export async function updateUser(userId: string, changes: { displayName?: string; resetIdentity?: boolean; status?: 'active' | 'disabled' }) {
  return (await api<{ user: AppUser }>(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(changes) })).user
}

export async function disableUser(userId: string) {
  return (await api<{ user: AppUser }>(`/api/admin/users/${encodeURIComponent(userId)}/disable`, { method: 'POST' })).user
}

export async function deleteUser(userId: string) {
  await api<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}
