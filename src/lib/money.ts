export function fmtD(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export function fmtC(cents: number): string {
  return cents < 100 ? cents + '¢' : fmtD(cents)
}
