export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function iso(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export function parseISO(s: string): Date {
  const p = s.split('-')
  return new Date(+p[0], +p[1] - 1, +p[2])
}

export function mondayOf(dateStr: string): string {
  const d = parseISO(dateStr)
  const off = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - off)
  return iso(d)
}

export function addDays(dateStr: string, n: number): string {
  const d = parseISO(dateStr)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function today(): string {
  return iso(new Date())
}

export function datelineStr(): string {
  const now = new Date()
  return `${DOW[(now.getDay() + 6) % 7]}, ${MON[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
}

export function weekdayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  return DOW[(d.getDay() + 6) % 7]
}
