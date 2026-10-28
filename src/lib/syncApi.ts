import type { AppData, Op, Role } from './types'

export const TOKEN = location.pathname.replace(/^\//, '')

export interface StatePayload {
  rev: number
  role: Role
  data: AppData
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super((body as { error?: string })?.error || 'request_failed')
    this.status = status
    this.body = body
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...(init?.headers ?? {}), 'x-checklist-token': TOKEN },
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, body)
  return body
}

export function fetchState(): Promise<StatePayload> {
  return request('/api/state') as Promise<StatePayload>
}

export function mutate(rev: number, ops: Op[]): Promise<StatePayload> {
  return request('/api/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rev, ops }),
  }) as Promise<StatePayload>
}
