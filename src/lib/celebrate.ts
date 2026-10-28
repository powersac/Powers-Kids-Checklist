import { CONFETTI_INKS } from './kids'

/** Transient DOM-appended confetti; each piece removes itself when its animation finishes. */
export function burst(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div')
    const ink = CONFETTI_INKS[i % CONFETTI_INKS.length]
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:7px;height:11px;background:${ink};z-index:9999;pointer-events:none;border-radius:1px`
    document.body.appendChild(el)
    const a = Math.random() * Math.PI * 2
    const v = 40 + Math.random() * 90
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 70}px) rotate(${Math.random() * 540 - 270}deg)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).onfinish = () => el.remove()
  }
}

/** Flies a coin bearing `amt`¢ from `fromRect` to the center of `toEl`. */
export function flyCoin(fromRect: DOMRect, toEl: HTMLElement | null, amt: number): void {
  if (!toEl) return
  const tr = toEl.getBoundingClientRect()
  const el = document.createElement('div')
  el.textContent = amt + '¢'
  el.style.cssText =
    'position:fixed;width:34px;height:34px;border-radius:50%;background:#edbb00;border:2px solid #201e1d;' +
    'color:#201e1d;font:600 12px "Source Serif 4",serif;display:flex;align-items:center;justify-content:center;' +
    `z-index:9999;pointer-events:none;left:${fromRect.left}px;top:${fromRect.top}px`
  document.body.appendChild(el)
  el.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${tr.left - fromRect.left}px, ${tr.top - fromRect.top}px) scale(.5)`, opacity: 0.2 },
    ],
    { duration: 620, easing: 'cubic-bezier(.3,0,.6,1)' },
  ).onfinish = () => el.remove()
}
