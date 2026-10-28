let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
    }
    return ctx
  } catch {
    return null
  }
}

export function beep(freq: number, dur = 0.12, delay = 0): void {
  const audio = getCtx()
  if (!audio) return
  try {
    const t0 = audio.currentTime + delay
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.type = 'triangle'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.12, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    o.connect(g)
    g.connect(audio.destination)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  } catch {
    // audio unsupported/blocked — silently no-op
  }
}

export function fanfare(): void {
  ;[523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, i * 0.09))
}
