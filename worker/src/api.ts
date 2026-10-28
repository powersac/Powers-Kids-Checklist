// The Worker's /api/* request handling, minus the Cloudflare bindings, so it
// can be tested against a plain in-memory store. Mirrors the shape of
// ../../../powers-grocery/src/api.js. Everything else (static assets, the
// token-gated index.html page, the 404 page) is routed in index.ts, which
// reuses tokenEq/roleFor from here so there is exactly one place that knows
// how to check a token.

import { apply, validate, type Op, type SyncedData } from './ops.ts'

export type Role = 'alex' | 'sam' | 'admin'

export interface Store {
  get(): Promise<{ rev: number; data: SyncedData }>
  // Resolves to false when expectedRev is stale — the caller lost the race
  // and must refetch rather than overwrite what it never saw.
  put(data: SyncedData, expectedRev: number): Promise<boolean>
}

export interface Env {
  ALEX_TOKEN?: string
  SAM_TOKEN?: string
  // Parent and Partner each get their own admin-level link (two parents, two
  // phones) rather than sharing one — same permission set either way.
  PARENT_TOKEN?: string
  PARTNER_TOKEN?: string
}

const MAX_BODY = 64 * 1024
const MAX_OPS = 50

function json(obj: unknown, status?: number): Response {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// Constant-time-ish compare so a token cannot be guessed a character at a time.
export function tokenEq(a: unknown, b: unknown): boolean {
  const x = String(a || ''),
    y = String(b || '')
  // An empty token must never match, or an unset secret would let everyone in.
  if (!x.length || x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return d === 0
}

export function roleFor(token: unknown, env: Env): Role | null {
  if (env.ALEX_TOKEN && tokenEq(token, env.ALEX_TOKEN)) return 'alex'
  if (env.SAM_TOKEN && tokenEq(token, env.SAM_TOKEN)) return 'sam'
  if (env.PARENT_TOKEN && tokenEq(token, env.PARENT_TOKEN)) return 'admin'
  if (env.PARTNER_TOKEN && tokenEq(token, env.PARTNER_TOKEN)) return 'admin'
  return null
}

const ADMIN_ONLY_OPS = new Set([
  'setTaskLabel',
  'setTaskAmt',
  'toggleTaskKid',
  'addTask',
  'deleteTask',
  'togglePaid',
  'setRate',
  'applyRateAll',
  'reset',
])

// toggleCheck needs per-payload scoping (a kid may only toggle their own
// checks), not a flat per-op-name allowlist like every other op here.
function isAllowed(role: Role, op: any): boolean {
  if (!op || typeof op !== 'object' || typeof op.t !== 'string') return false
  if (op.t === 'toggleCheck') {
    if (role === 'admin') return true
    if (role === 'alex') return op.kid === 'alex'
    if (role === 'sam') return op.kid === 'sam'
    return false
  }
  if (ADMIN_ONLY_OPS.has(op.t)) return role === 'admin'
  return false
}

async function handleState(role: Role, store: Store): Promise<Response> {
  const cur = await store.get()
  return json({ rev: cur.rev, role, data: cur.data })
}

async function handleMutate(req: Request, role: Role, store: Store, now: number): Promise<Response> {
  const raw = await req.text()
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 400)

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_json' }, 400)
  }
  if (!body || typeof body !== 'object' || typeof body.rev !== 'number') {
    return json({ error: 'bad_json' }, 400)
  }
  if (!Array.isArray(body.ops) || !body.ops.length) return json({ error: 'no_ops' }, 400)
  if (body.ops.length > MAX_OPS) return json({ error: 'too_many_ops' }, 400)

  const cur = await store.get()
  // Optimistic concurrency. If the other phone got there first, the caller
  // refetches rather than writing over what it never saw.
  if (body.rev !== cur.rev) {
    return json({ error: 'stale', rev: cur.rev, data: cur.data }, 409)
  }

  let state = cur.data
  for (const op of body.ops as Op[]) {
    if (!isAllowed(role, op)) return json({ error: 'not_allowed', op: (op as any) && (op as any).t }, 403)
    const r = apply(state, op, { now })
    if (r.error) return json({ error: 'invalid_op', op: (op as any).t, detail: r.error }, 400)
    state = r.state
  }
  const problems = validate(state)
  if (problems.length) return json({ error: 'would_corrupt', problems }, 500)

  const saved = await store.put(state, cur.rev)
  if (!saved) {
    const after = await store.get()
    return json({ error: 'stale', rev: after.rev, data: after.data }, 409)
  }
  const after = await store.get()
  return json({ rev: after.rev, role, data: after.data })
}

// Handles exactly GET /api/state and POST /api/mutate. Everything else
// (static assets, the token-gated page, the 404 page) is index.ts's job.
export async function handle(req: Request, env: Env, store: Store, now: number): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const token = req.headers.get('x-checklist-token')
  const role = roleFor(token, env)

  if (!role) return json({ error: 'not_authorised' }, 401)

  if (path === '/api/state') {
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
    return handleState(role, store)
  }

  if (path === '/api/mutate') {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    return handleMutate(req, role, store, now)
  }

  return json({ error: 'not_found' }, 404)
}
