import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env, type Role } from '../src/api.ts'
import { seedData } from '../src/ops.ts'
import { createFakeStore } from './fake-store.ts'

const ENV: Env = {
  ALEX_TOKEN: 'alex-token-xyz',
  SAM_TOKEN: 'sam-token-xyz',
  PARENT_TOKEN: 'parent-token-xyz',
  PARTNER_TOKEN: 'partner-token-xyz',
}
// Two parents, two links, same 'admin' role — tests use Parent's as the
// representative admin token; a dedicated test below confirms Partner's works too.
const TOKEN_FOR: Record<Role, string> = { alex: 'alex-token-xyz', sam: 'sam-token-xyz', admin: 'parent-token-xyz' }

function req(path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Request {
  const headers = new Headers()
  if (opts.token !== undefined) headers.set('x-checklist-token', opts.token)
  if (opts.body !== undefined) headers.set('content-type', 'application/json')
  return new Request('https://example.com' + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

async function mutateAs(role: Role, ops: unknown[], rev: number, store: ReturnType<typeof createFakeStore>) {
  return handle(req('/api/mutate', { token: TOKEN_FOR[role], body: { rev, ops } }), ENV, store, 0)
}

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

describe('permission matrix: toggleCheck is scoped per-payload, not just per-op-name', () => {
  test('alex can toggle their own checks', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('alex', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }], 0, store)
    assert.equal(res.status, 200)
  })

  test('alex gets 403 not_allowed toggling sam\'s checks', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('alex', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'sam', taskId: 'T1' }], 0, store)
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, 'not_allowed')
    assert.equal(body.op, 'toggleCheck')
  })

  test('sam can toggle their own checks', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('sam', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'sam', taskId: 'T1' }], 0, store)
    assert.equal(res.status, 200)
  })

  test('sam gets 403 not_allowed toggling alex\'s checks', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('sam', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }], 0, store)
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, 'not_allowed')
  })

  test('admin can toggle either kid\'s checks', async () => {
    const store1 = createFakeStore(seedData())
    const resAlex = await mutateAs('admin', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }], 0, store1)
    assert.equal(resAlex.status, 200)

    const store2 = createFakeStore(seedData())
    const resSam = await mutateAs('admin', [{ t: 'toggleCheck', date: '2026-08-29', kid: 'sam', taskId: 'T1' }], 0, store2)
    assert.equal(resSam.status, 200)
  })
})

const ADMIN_ONLY_OPS: Array<{ t: string; payload: Record<string, unknown> }> = [
  { t: 'setTaskLabel', payload: { taskId: 'T1', label: 'Renamed' } },
  { t: 'setTaskAmt', payload: { taskId: 'T1', amt: 20 } },
  { t: 'toggleTaskKid', payload: { taskId: 'T1', kid: 'sam' } },
  { t: 'addTask', payload: { section: 'Morning' } },
  { t: 'deleteTask', payload: { taskId: 'T1' } },
  { t: 'togglePaid', payload: { mon: '2026-08-24' } },
  { t: 'setRate', payload: { rate: 20 } },
  { t: 'applyRateAll', payload: {} },
  { t: 'reset', payload: {} },
]

describe('permission matrix: admin-only ops', () => {
  for (const op of ADMIN_ONLY_OPS) {
    test(`${op.t}: alex gets 403`, async () => {
      const store = createFakeStore(seedData())
      const res = await mutateAs('alex', [{ t: op.t, ...op.payload }], 0, store)
      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error, 'not_allowed')
      assert.equal(body.op, op.t)
    })

    test(`${op.t}: sam gets 403`, async () => {
      const store = createFakeStore(seedData())
      const res = await mutateAs('sam', [{ t: op.t, ...op.payload }], 0, store)
      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error, 'not_allowed')
    })

    test(`${op.t}: admin succeeds`, async () => {
      const store = createFakeStore(seedData())
      const res = await mutateAs('admin', [{ t: op.t, ...op.payload }], 0, store)
      assert.equal(res.status, 200)
    })
  }
})

describe('two parents, two links, one role', () => {
  test('PARENT_TOKEN and PARTNER_TOKEN both resolve to admin and can both do admin things', async () => {
    for (const token of ['parent-token-xyz', 'partner-token-xyz']) {
      const store = createFakeStore(seedData())
      const stateRes = await handle(req('/api/state', { token }), ENV, store, 0)
      assert.equal(stateRes.status, 200)
      assert.equal((await stateRes.json()).role, 'admin')

      const mutateRes = await handle(
        req('/api/mutate', { token, body: { rev: 0, ops: [{ t: 'setRate', rate: 25 }] } }),
        ENV,
        store,
        0,
      )
      assert.equal(mutateRes.status, 200)
    }
  })
})

describe('all-or-nothing batches', () => {
  test('a disallowed op anywhere in the batch rejects the whole thing, no partial apply', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs(
      'alex',
      [
        { t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }, // allowed
        { t: 'setRate', rate: 999 }, // not allowed for alex
      ],
      0,
      store,
    )
    assert.equal(res.status, 403)
    // Nothing was persisted — not even the first, allowed op.
    const after = store.peek()
    assert.equal(after.rev, 0)
    assert.deepEqual(after.data, seedData())
  })
})

// ---------------------------------------------------------------------------
// Optimistic concurrency
// ---------------------------------------------------------------------------

describe('optimistic concurrency', () => {
  test('happy path: sequential calls each bump rev by 1 and see the previous change', async () => {
    const store = createFakeStore(seedData())

    const r1 = await mutateAs('admin', [{ t: 'setRate', rate: 15 }], 0, store)
    assert.equal(r1.status, 200)
    const b1 = await r1.json()
    assert.equal(b1.rev, 1)
    assert.equal(b1.data.rate, 15)

    const r2 = await mutateAs('admin', [{ t: 'applyRateAll' }], 1, store)
    assert.equal(r2.status, 200)
    const b2 = await r2.json()
    assert.equal(b2.rev, 2)
    // Sees rate 15 from the previous call and applies it to every task.
    assert.ok(b2.data.tasks.every((t: { amt: number }) => t.amt === 15))
  })

  test('a stale rev is rejected up front with fresh rev/data, before any op runs', async () => {
    const store = createFakeStore(seedData())
    await mutateAs('admin', [{ t: 'setRate', rate: 15 }], 0, store) // rev now 1

    const stale = await mutateAs('admin', [{ t: 'setRate', rate: 999 }], 0, store)
    assert.equal(stale.status, 409)
    const body = await stale.json()
    assert.equal(body.error, 'stale')
    assert.equal(body.rev, 1)
    assert.equal(body.data.rate, 15) // the winning write, not 999

    // The store really does still hold 15, not 999.
    assert.equal(store.peek().data.rate, 15)
  })

  test('two genuinely concurrent mutate calls from the same rev: one wins, the other gets a clean 409', async () => {
    // delayMs forces both calls' initial store.get() to land before either
    // reaches store.put(), so this exercises the compare-and-swap inside
    // put() itself, not just the early rev check in handleMutate.
    const store = createFakeStore(seedData(), 0, 5)

    const [resA, resB] = await Promise.all([
      mutateAs('admin', [{ t: 'setRate', rate: 11 }], 0, store),
      mutateAs('admin', [{ t: 'setRate', rate: 22 }], 0, store),
    ])

    const statuses = [resA.status, resB.status].sort()
    assert.deepEqual(statuses, [200, 409])

    const winner = resA.status === 200 ? resA : resB
    const loser = resA.status === 200 ? resB : resA

    const winnerBody = await winner.json()
    const loserBody = await loser.json()

    assert.equal(winnerBody.rev, 1)
    assert.equal(loserBody.error, 'stale')
    // The loser is handed exactly the winner's rev/data to retry against.
    assert.equal(loserBody.rev, winnerBody.rev)
    assert.deepEqual(loserBody.data, winnerBody.data)

    // Final store state reflects exactly one write, never both, never neither.
    const final = store.peek()
    assert.equal(final.rev, 1)
    assert.ok(final.data.rate === 11 || final.data.rate === 22)
  })
})

// ---------------------------------------------------------------------------
// Bad input handling
// ---------------------------------------------------------------------------

describe('bad input handling', () => {
  test('oversized body -> 400 too_large', async () => {
    const store = createFakeStore(seedData())
    const hugeLabel = 'x'.repeat(70 * 1024)
    const res = await mutateAs('admin', [{ t: 'setTaskLabel', taskId: 'T1', label: hugeLabel }], 0, store)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'too_large')
  })

  test('malformed JSON -> 400 bad_json', async () => {
    const store = createFakeStore(seedData())
    const headers = new Headers({ 'x-checklist-token': TOKEN_FOR.admin, 'content-type': 'application/json' })
    const res = await handle(
      new Request('https://example.com/api/mutate', { method: 'POST', headers, body: '{not json' }),
      ENV,
      store,
      0,
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'bad_json')
  })

  test('empty ops array -> 400 no_ops', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('admin', [], 0, store)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'no_ops')
  })

  test('more than 50 ops -> 400 too_many_ops', async () => {
    const store = createFakeStore(seedData())
    const ops = Array.from({ length: 51 }, () => ({ t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }))
    const res = await mutateAs('alex', ops, 0, store)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'too_many_ops')
  })

  test('exactly 50 ops is allowed', async () => {
    const store = createFakeStore(seedData())
    const ops = Array.from({ length: 50 }, () => ({ t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }))
    const res = await mutateAs('alex', ops, 0, store)
    assert.equal(res.status, 200)
  })

  test('unknown token -> 401 not_authorised on both endpoints', async () => {
    const store = createFakeStore(seedData())
    const s1 = await handle(req('/api/state', { token: 'not-a-real-token' }), ENV, store, 0)
    assert.equal(s1.status, 401)
    assert.equal((await s1.json()).error, 'not_authorised')

    const bad = await handle(req('/api/mutate', { token: 'nope', body: { rev: 0, ops: [{ t: 'setRate', rate: 1 }] } }), ENV, store, 0)
    assert.equal(bad.status, 401)
    assert.equal((await bad.json()).error, 'not_authorised')
  })

  test('missing token -> 401 not_authorised', async () => {
    const store = createFakeStore(seedData())
    const res = await handle(req('/api/state'), ENV, store, 0)
    assert.equal(res.status, 401)
    assert.equal((await res.json()).error, 'not_authorised')
  })

  test('an unknown op name is rejected as not_allowed, not silently skipped', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('admin', [{ t: 'doTheDishes' }], 0, store)
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, 'not_allowed')
  })

  test('a structurally invalid but permitted op -> 400 invalid_op, not a crash', async () => {
    const store = createFakeStore(seedData())
    const res = await mutateAs('admin', [{ t: 'setTaskAmt', taskId: 'T1', amt: 'a lot' }], 0, store)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_op')
  })
})

// ---------------------------------------------------------------------------
// GET /api/state
// ---------------------------------------------------------------------------

describe('GET /api/state', () => {
  test('returns rev, role, and data for a valid token', async () => {
    const store = createFakeStore(seedData())
    const res = await handle(req('/api/state', { token: TOKEN_FOR.sam }), ENV, store, 0)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.rev, 0)
    assert.equal(body.role, 'sam')
    assert.deepEqual(body.data, seedData())
  })
})
