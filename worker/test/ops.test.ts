import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { apply, validate, defaultTasks, seedData, type SyncedData } from '../src/ops.ts'

function fresh(): SyncedData {
  return seedData()
}

describe('defaultTasks', () => {
  test('matches the default list exactly: count, sections, kid limits, amounts', () => {
    const tasks = defaultTasks()
    assert.equal(tasks.length, 24)
    assert.equal(tasks[0].section, 'Morning')
    assert.equal(tasks[0].label, 'Make bed')
    assert.deepEqual(tasks[0].kids, ['alex', 'sam'])
    assert.equal(tasks[0].amt, 10)

    const practice = tasks.find((t) => t.label === 'Practice an instrument 15 min')
    assert.ok(practice)
    assert.deepEqual(practice!.kids, ['alex'])
    assert.equal(practice!.amt, 10)

    const pet = tasks.find((t) => t.label === 'Feed the pet')
    assert.ok(pet)
    assert.deepEqual(pet!.kids, ['alex'])
    assert.equal(pet!.amt, 100)

    const trash = tasks.find((t) => t.label === 'Take out the trash')
    assert.ok(trash)
    assert.deepEqual(trash!.kids, ['sam'])
    assert.equal(trash!.amt, 200)

    // ids are a stable counter: T1..T24, in list order.
    tasks.forEach((t, i) => assert.equal(t.id, 'T' + (i + 1)))
  })

  test('seedData is the clean production seed: rate 10, no demo history', () => {
    const d = seedData()
    assert.equal(d.rate, 10)
    assert.deepEqual(d.checks, {})
    assert.deepEqual(d.paid, {})
    assert.equal(d.tasks.length, 24)
  })
})

describe('apply: toggleCheck', () => {
  test('toggles a check on then off', () => {
    const s = fresh()
    const r1 = apply(s, { t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }, { now: 0 })
    assert.equal(r1.error, undefined)
    assert.equal(r1.state.checks['2026-08-29']?.alex?.T1, 1)

    const r2 = apply(r1.state, { t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }, { now: 0 })
    assert.equal(r2.error, undefined)
    assert.equal(r2.state.checks['2026-08-29']?.alex?.T1, undefined)
  })

  test('rejects an unknown task id', () => {
    const s = fresh()
    const r = apply(s, { t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T999' }, { now: 0 })
    assert.ok(r.error)
  })

  test('rejects a bad kid or bad date', () => {
    const s = fresh()
    assert.ok(apply(s, { t: 'toggleCheck', date: '2026-08-29', kid: 'bob', taskId: 'T1' }, { now: 0 }).error)
    assert.ok(apply(s, { t: 'toggleCheck', date: 'not-a-date', kid: 'alex', taskId: 'T1' }, { now: 0 }).error)
  })
})

describe('apply: task editing', () => {
  test('setTaskLabel changes the label of an existing task', () => {
    const s = fresh()
    const r = apply(s, { t: 'setTaskLabel', taskId: 'T1', label: 'Make the bed nicely' }, { now: 0 })
    assert.equal(r.error, undefined)
    assert.equal(r.state.tasks.find((t) => t.id === 'T1')!.label, 'Make the bed nicely')
  })

  test('setTaskLabel rejects an empty label or unknown task', () => {
    const s = fresh()
    assert.ok(apply(s, { t: 'setTaskLabel', taskId: 'T1', label: '   ' }, { now: 0 }).error)
    assert.ok(apply(s, { t: 'setTaskLabel', taskId: 'T999', label: 'x' }, { now: 0 }).error)
  })

  test('setTaskAmt changes the amount in cents', () => {
    const s = fresh()
    const r = apply(s, { t: 'setTaskAmt', taskId: 'T1', amt: 50 }, { now: 0 })
    assert.equal(r.error, undefined)
    assert.equal(r.state.tasks.find((t) => t.id === 'T1')!.amt, 50)
  })

  test('setTaskAmt rejects negative, non-integer, or absurdly large amounts', () => {
    const s = fresh()
    assert.ok(apply(s, { t: 'setTaskAmt', taskId: 'T1', amt: -5 }, { now: 0 }).error)
    assert.ok(apply(s, { t: 'setTaskAmt', taskId: 'T1', amt: 1.5 }, { now: 0 }).error)
    assert.ok(apply(s, { t: 'setTaskAmt', taskId: 'T1', amt: 999999 }, { now: 0 }).error)
  })

  test('toggleTaskKid adds and removes a kid, but never empties the list', () => {
    const s = fresh()
    // T1 starts with both kids.
    const r1 = apply(s, { t: 'toggleTaskKid', taskId: 'T1', kid: 'sam' }, { now: 0 })
    assert.equal(r1.error, undefined)
    assert.deepEqual(r1.state.tasks.find((t) => t.id === 'T1')!.kids, ['alex'])

    // Removing the last kid is rejected.
    const r2 = apply(r1.state, { t: 'toggleTaskKid', taskId: 'T1', kid: 'alex' }, { now: 0 })
    assert.ok(r2.error)

    // Adding sam back works.
    const r3 = apply(r1.state, { t: 'toggleTaskKid', taskId: 'T1', kid: 'sam' }, { now: 0 })
    assert.equal(r3.error, undefined)
    assert.deepEqual(r3.state.tasks.find((t) => t.id === 'T1')!.kids.sort(), ['alex', 'sam'])
  })
})

describe('apply: addTask', () => {
  test('uses the CURRENT rate, not the default, for the new task amount', () => {
    let s = fresh()
    s = apply(s, { t: 'setRate', rate: 35 }, { now: 0 }).state
    const r = apply(s, { t: 'addTask', section: 'Morning' }, { now: 0 })
    assert.equal(r.error, undefined)
    const added = r.state.tasks[r.state.tasks.length - 1]
    assert.equal(added.amt, 35)
    assert.equal(added.label, 'New task')
    assert.deepEqual(added.kids.sort(), ['alex', 'sam'])
    assert.equal(added.section, 'Morning')
  })

  test('generates an id that never collides, even after deleting a task in the middle', () => {
    let s = fresh() // T1..T24
    s = apply(s, { t: 'deleteTask', taskId: 'T5' }, { now: 0 }).state
    const r = apply(s, { t: 'addTask', section: 'Morning' }, { now: 0 })
    assert.equal(r.error, undefined)
    const ids = r.state.tasks.map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids')
    // T24 (the highest surviving id) is still present, so the new task must
    // be T25, not a reused T5 that could collide with old client state.
    assert.ok(ids.includes('T25'))
    assert.ok(!ids.includes('T5'))
  })

  test('rejects a missing section', () => {
    const s = fresh()
    assert.ok(apply(s, { t: 'addTask', section: '' }, { now: 0 }).error)
  })
})

describe('apply: deleteTask', () => {
  test('removes exactly the named task', () => {
    const s = fresh()
    const r = apply(s, { t: 'deleteTask', taskId: 'T1' }, { now: 0 })
    assert.equal(r.error, undefined)
    assert.equal(r.state.tasks.length, 23)
    assert.ok(!r.state.tasks.some((t) => t.id === 'T1'))
  })

  test('rejects an unknown task', () => {
    const s = fresh()
    assert.ok(apply(s, { t: 'deleteTask', taskId: 'T999' }, { now: 0 }).error)
  })
})

describe('apply: togglePaid / setRate / applyRateAll', () => {
  test('togglePaid flips a Monday on and off', () => {
    const s = fresh()
    const r1 = apply(s, { t: 'togglePaid', mon: '2026-08-24' }, { now: 0 })
    assert.equal(r1.state.paid['2026-08-24'], true)
    const r2 = apply(r1.state, { t: 'togglePaid', mon: '2026-08-24' }, { now: 0 })
    assert.equal(r2.state.paid['2026-08-24'], undefined)
  })

  test('setRate then applyRateAll sets every task amount to the new rate', () => {
    let s = fresh()
    s = apply(s, { t: 'setRate', rate: 42 }, { now: 0 }).state
    assert.equal(s.rate, 42)
    // Tasks still have their original per-task amounts (e.g. the pet and
    // trash tasks at 100/200) until applyRateAll is called.
    assert.ok(s.tasks.some((t) => t.amt !== 42))

    const r = apply(s, { t: 'applyRateAll' }, { now: 0 })
    assert.equal(r.error, undefined)
    assert.ok(r.state.tasks.every((t) => t.amt === 42))
  })
})

describe('apply: reset', () => {
  test('wipes to the exact clean seed, not just a partial revert', () => {
    let s = fresh()
    s = apply(s, { t: 'toggleCheck', date: '2026-08-29', kid: 'alex', taskId: 'T1' }, { now: 0 }).state
    s = apply(s, { t: 'togglePaid', mon: '2026-08-24' }, { now: 0 }).state
    s = apply(s, { t: 'setRate', rate: 99 }, { now: 0 }).state
    s = apply(s, { t: 'deleteTask', taskId: 'T1' }, { now: 0 }).state
    s = apply(s, { t: 'addTask', section: 'Extra' }, { now: 0 }).state

    const r = apply(s, { t: 'reset' }, { now: 0 })
    assert.equal(r.error, undefined)
    assert.deepEqual(r.state, seedData())
  })
})

describe('apply: unknown op', () => {
  test('is rejected rather than silently ignored', () => {
    const s = fresh()
    const r = apply(s, { t: 'doTheDishes' }, { now: 0 })
    assert.ok(r.error)
  })
})

describe('validate', () => {
  test('a freshly seeded state has no problems', () => {
    assert.deepEqual(validate(seedData()), [])
  })

  test('flags a corrupt shape', () => {
    const problems = validate({ rate: -1, tasks: 'nope', checks: null, paid: {} })
    assert.ok(problems.length > 0)
  })
})
