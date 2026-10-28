import { KIDS, type KidMeta } from './kids'
import { addDays, iso, mondayOf, parseISO, MON } from './dates'
import type { AppData, ChecksForKid, KidId } from './types'

export function checksFor(data: AppData, date: string, kid: KidId): ChecksForKid {
  return data.checks[date]?.[kid] ?? {}
}

export function kidTasks(data: AppData, kid: KidId) {
  return data.tasks.filter((t) => t.kids.includes(kid))
}

export function dayCents(data: AppData, date: string, kid: KidId): number {
  const ch = checksFor(data, date, kid)
  return kidTasks(data, kid).reduce((s, t) => s + (ch[t.id] ? t.amt : 0), 0)
}

export function dayPct(data: AppData, date: string, kid: KidId): number {
  const ts = kidTasks(data, kid)
  if (!ts.length) return 0
  const ch = checksFor(data, date, kid)
  return ts.filter((t) => ch[t.id]).length / ts.length
}

/** Consecutive days >= 75% complete; today is skipped if it's under 75% (not yet a broken streak). */
export function streak(data: AppData, kid: KidId): number {
  let d = iso(new Date())
  let n = 0
  if (dayPct(data, d, kid) < 0.75) d = addDays(d, -1)
  while (dayPct(data, d, kid) >= 0.75) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export interface WeekInfo {
  mon: string
  days: string[]
  rangeStr: string
  isCurrent: boolean
  paid: boolean
  perKid: { kid: KidMeta; cents: number; pcts: number[] }[]
}

/** All weeks appearing in checks, plus the current week, newest first. */
export function weekList(data: AppData): WeekInfo[] {
  const todayMon = mondayOf(iso(new Date()))
  const keys = new Set<string>([todayMon])
  Object.keys(data.checks).forEach((d) => keys.add(mondayOf(d)))
  return [...keys]
    .sort()
    .reverse()
    .map((mon) => {
      const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
      const start = parseISO(mon)
      const end = parseISO(days[6])
      const rangeStr =
        `${MON[start.getMonth()]} ${start.getDate()} – ` +
        (end.getMonth() !== start.getMonth() ? `${MON[end.getMonth()]} ` : '') +
        end.getDate()
      return {
        mon,
        days,
        rangeStr,
        isCurrent: mon === todayMon,
        paid: !!data.paid[mon],
        perKid: KIDS.map((k) => ({
          kid: k,
          cents: days.reduce((s, d) => s + dayCents(data, d, k.id), 0),
          pcts: days.map((d) => dayPct(data, d, k.id)),
        })),
      }
    })
}
