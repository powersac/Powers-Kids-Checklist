export type KidId = 'alex' | 'sam'

export interface Task {
  id: string
  section: string
  label: string
  kids: KidId[]
  amt: number // cents
}

export type ChecksForKid = Record<string, 1>
export type ChecksForDate = Partial<Record<KidId, ChecksForKid>>
export type ChecksMap = Record<string, ChecksForDate> // dateISO -> per-kid checks

export type PaidMap = Record<string, true> // mondayISO -> paid

/** The shared, server-held data. No `pin` (the link is the credential) and no
 * `sound` (that's a local, per-device preference — see useLocalSound). */
export interface AppData {
  rate: number // default cents per task
  tasks: Task[]
  checks: ChecksMap
  paid: PaidMap
}

export type Role = 'alex' | 'sam' | 'admin'

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
