export type SyncCursor = { changedAt: string; id: string }

export function parseSyncCursor(rawCursor: string): SyncCursor {
  if (!rawCursor) return { changedAt: '1970-01-01T00:00:00.000Z', id: '' }
  if (!rawCursor.includes('|')) return { changedAt: rawCursor, id: '' }
  const [changedAt, id] = rawCursor.split('|', 2)
  return { changedAt, id }
}

export function syncPage<T extends { id: string; changed_at: string }>(rows: T[], previousCursor: string, size = 500) {
  const page = rows.slice(0, size)
  const last = page.at(-1)
  return { page, cursor: last ? `${last.changed_at}|${last.id}` : previousCursor, hasMore: rows.length > size }
}
