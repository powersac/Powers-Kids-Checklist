// Pure checklist logic, shared by the Worker and the tests. No Cloudflare
// APIs here — just plain (state, op) -> state, so it runs under plain Node.
// Mirrors the shape of ../../../powers-grocery/src/ops.js.

export type KidId = 'alex' | 'sam'

export interface Task {
  id: string
  section: string
  label: string
  kids: KidId[]
  amt: number // cents
}

export type ChecksForKid = Record<string, 1> // taskId -> 1
export type ChecksForDate = Partial<Record<KidId, ChecksForKid>>
export type ChecksMap = Record<string, ChecksForDate> // dateISO -> kid -> checks
export type PaidMap = Record<string, true> // mondayISO -> paid

export interface SyncedData {
  rate: number
  tasks: Task[]
  checks: ChecksMap
  paid: PaidMap
}

const KID_IDS: KidId[] = ['alex', 'sam']
function isKidId(x: unknown): x is KidId {
  return x === 'alex' || x === 'sam'
}
function isIsoDate(x: unknown): x is string {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0
}
function isCents(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100_000
}

// The default chore list a fresh install starts with. Edit it to match your
// household; parents can also change everything later from the Parent view.
export function defaultTasks(): Task[] {
  let n = 0
  const t = (section: string, label: string, kids?: KidId[], amt?: number): Task => ({
    id: 'T' + ++n,
    section,
    label,
    kids: kids ?? ['alex', 'sam'],
    amt: amt ?? 10,
  })
  return [
    t('Morning', 'Make bed'),
    t('Morning', 'Pajamas in laundry basket'),
    t('Morning', 'Get dressed'),
    t('Morning', 'Brush teeth'),
    t('Morning', 'Brush hair'),
    t('Morning', 'Pack school bag'),
    t('After School', 'Hang up coat & backpack'),
    t('After School', 'Unpack lunch containers'),
    t('After School', 'Papers from folder to parents'),
    t('After School', '5-minute toy clean-up'),
    t('Homework Time', 'Finish homework'),
    t('Homework Time', 'Work back in backpack'),
    t('Homework Time', 'Read 15 minutes'),
    t('Evening', 'Set or clear the table'),
    t('Evening', 'Bath or shower'),
    t('Evening', 'Brush teeth'),
    t('Evening', "Pick tomorrow's outfit"),
    t('Evening', 'Gather sleep comforts'),
    t('Evening', 'Bedtime routine'),
    t('Activities', 'Dress for activity'),
    t('Activities', 'Pack bag: water & snacks'),
    t('Activities', 'Practice an instrument 15 min', ['alex']),
    t('Activities', 'Feed the pet', ['alex'], 100),
    t('Activities', 'Take out the trash', ['sam'], 200),
  ]
}

// Clean production seed: default tasks, no fake demo history.
export function seedData(): SyncedData {
  return { rate: 10, tasks: defaultTasks(), checks: {}, paid: {} }
}

function findTask(tasks: Task[], taskId: unknown): Task | undefined {
  return typeof taskId === 'string' ? tasks.find((t) => t.id === taskId) : undefined
}

// Ids look like T1, T2, ... A plain length+1 counter would collide with an
// old id after a delete; scanning for the current max does not.
function nextTaskId(tasks: Task[]): string {
  let max = 0
  for (const t of tasks) {
    const m = /^T(\d+)$/.exec(t.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return 'T' + (max + 1)
}

export type Op =
  | { t: 'toggleCheck'; date: string; kid: KidId; taskId: string }
  | { t: 'setTaskLabel'; taskId: string; label: string }
  | { t: 'setTaskAmt'; taskId: string; amt: number }
  | { t: 'toggleTaskKid'; taskId: string; kid: KidId }
  | { t: 'addTask'; section: string }
  | { t: 'deleteTask'; taskId: string }
  | { t: 'togglePaid'; mon: string }
  | { t: 'setRate'; rate: number }
  | { t: 'applyRateAll' }
  | { t: 'reset' }

export interface ApplyContext {
  now: number
}

export interface ApplyResult {
  state: SyncedData
  error?: string
}

// Ops arrive as untyped JSON from the wire, so every field is re-checked at
// runtime here even though Op looks fully typed above — the type only
// documents the well-formed shape, it does not enforce it.
export function apply(state: SyncedData, op: any, _ctx: ApplyContext): ApplyResult {
  const s: SyncedData = JSON.parse(JSON.stringify(state))

  if (!op || typeof op !== 'object' || typeof op.t !== 'string') {
    return { state: s, error: 'op is not a valid object' }
  }

  switch (op.t) {
    case 'toggleCheck': {
      const date: unknown = op.date
      const kid: unknown = op.kid
      const taskId: unknown = op.taskId
      if (!isIsoDate(date)) return { state: s, error: 'toggleCheck needs a real date' }
      if (!isKidId(kid)) return { state: s, error: 'toggleCheck needs a real kid' }
      if (!findTask(s.tasks, taskId)) return { state: s, error: 'no such task: ' + taskId }
      const forDate: ChecksForDate = s.checks[date] ?? (s.checks[date] = {})
      const forKid: ChecksForKid = forDate[kid] ?? (forDate[kid] = {})
      if (forKid[taskId as string] === 1) delete forKid[taskId as string]
      else forKid[taskId as string] = 1
      break
    }
    case 'setTaskLabel': {
      const task = findTask(s.tasks, op.taskId)
      if (!task) return { state: s, error: 'no such task: ' + op.taskId }
      if (!isNonEmptyString(op.label) || op.label.length > 120)
        return { state: s, error: 'a task needs a short label' }
      task.label = op.label.trim()
      break
    }
    case 'setTaskAmt': {
      const task = findTask(s.tasks, op.taskId)
      if (!task) return { state: s, error: 'no such task: ' + op.taskId }
      if (!isCents(op.amt)) return { state: s, error: 'amt must be a whole number of cents, 0 to 100000' }
      task.amt = op.amt
      break
    }
    case 'toggleTaskKid': {
      const task = findTask(s.tasks, op.taskId)
      if (!task) return { state: s, error: 'no such task: ' + op.taskId }
      if (!isKidId(op.kid)) return { state: s, error: 'toggleTaskKid needs a real kid' }
      if (task.kids.includes(op.kid)) {
        if (task.kids.length <= 1) return { state: s, error: 'a task needs at least one kid' }
        task.kids = task.kids.filter((k) => k !== op.kid)
      } else {
        task.kids = [...task.kids, op.kid]
      }
      break
    }
    case 'addTask': {
      if (!isNonEmptyString(op.section) || op.section.length > 60)
        return { state: s, error: 'a task needs a section' }
      s.tasks.push({
        id: nextTaskId(s.tasks),
        section: op.section.trim(),
        label: 'New task',
        kids: [...KID_IDS],
        amt: s.rate,
      })
      break
    }
    case 'deleteTask': {
      const idx = s.tasks.findIndex((t) => t.id === op.taskId)
      if (idx < 0) return { state: s, error: 'no such task: ' + op.taskId }
      s.tasks.splice(idx, 1)
      break
    }
    case 'togglePaid': {
      if (!isIsoDate(op.mon)) return { state: s, error: 'togglePaid needs a real date' }
      if (s.paid[op.mon]) delete s.paid[op.mon]
      else s.paid[op.mon] = true
      break
    }
    case 'setRate': {
      if (!isCents(op.rate)) return { state: s, error: 'rate must be a whole number of cents, 0 to 100000' }
      s.rate = op.rate
      break
    }
    case 'applyRateAll': {
      s.tasks.forEach((t) => {
        t.amt = s.rate
      })
      break
    }
    case 'reset': {
      return { state: seedData() }
    }
    default:
      return { state: s, error: 'unknown op: ' + String(op.t) }
  }
  return { state: s }
}

// Defends against a corrupt/hand-crafted blob reaching the client in a shape
// the page cannot render. Not required by the contract, but cheap insurance
// mirroring grocery's validate().
export function validate(d: unknown): string[] {
  const p: string[] = []
  if (!d || typeof d !== 'object') return ['state is not an object']
  const data = d as Partial<SyncedData>
  if (!isCents(data.rate)) p.push('rate must be a whole number of cents')
  if (!Array.isArray(data.tasks)) p.push('tasks must be an array')
  else {
    const seen = new Set<string>()
    data.tasks.forEach((t, i) => {
      const at = 'tasks[' + i + ']'
      if (!t || typeof t !== 'object') {
        p.push(at + ' is not an object')
        return
      }
      if (typeof t.id !== 'string' || !t.id) p.push(at + ' has no id')
      else {
        if (seen.has(t.id)) p.push('duplicate task id: ' + t.id)
        seen.add(t.id)
      }
      if (typeof t.section !== 'string' || !t.section) p.push(at + ' has no section')
      if (typeof t.label !== 'string' || !t.label) p.push(at + ' has no label')
      if (!Array.isArray(t.kids) || !t.kids.length || !t.kids.every(isKidId))
        p.push(at + ' kids must be a non-empty list of alex/sam')
      if (!isCents(t.amt)) p.push(at + ' amt must be a whole number of cents')
    })
  }
  if (!data.checks || typeof data.checks !== 'object') p.push('checks must be an object')
  if (!data.paid || typeof data.paid !== 'object') p.push('paid must be an object')
  return p
}
