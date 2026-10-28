import { useRef, type CSSProperties, type MouseEvent } from 'react'
import { PencilSimple, Star, CheckFat, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useApp } from '../lib/AppContext'
import { KIDS, kidMeta, SECTIONS } from '../lib/kids'
import { addDays, iso, mondayOf, parseISO, DOW, MON } from '../lib/dates'
import { checksFor, dayCents, dayPct, kidTasks } from '../lib/derived'
import { streak as computeStreak } from '../lib/derived'
import { kidEditableFrom } from '../lib/weekWindow'
import { fmtC, fmtD } from '../lib/money'
import { beep, fanfare } from '../lib/audio'
import { burst, flyCoin } from '../lib/celebrate'
import type { KidId, Task } from '../lib/types'

function mouthStyle(pct: number): CSSProperties {
  const base: CSSProperties = { position: 'absolute', border: '3px solid var(--color-text)' }
  if (pct >= 0.7) {
    return { ...base, left: 8, bottom: 0, width: 28, height: 15, borderTop: 'none', borderRadius: '0 0 28px 28px', borderLeftColor: 'transparent', borderRightColor: 'transparent' }
  }
  if (pct > 0.2) {
    return { ...base, left: 11, bottom: 2, width: 22, height: 9, borderTop: 'none', borderRadius: '0 0 22px 22px', borderLeftColor: 'transparent', borderRightColor: 'transparent' }
  }
  return { position: 'absolute', left: 13, bottom: 6, width: 18, height: 3, background: 'var(--color-text)' }
}

export function TodayView({ sound }: { sound: boolean }) {
  const { data, role, mutate, ui, setUI } = useApp()
  const coinTargetRef = useRef<HTMLDivElement>(null)
  if (!data) return null

  const todayStr = iso(new Date())
  const date = ui.dateOverride || ui.kidDate || todayStr
  const kid = ui.kid
  const K = kidMeta(kid)
  const ch = checksFor(data, date, kid)
  const myTasks = kidTasks(data, kid)
  const dayC = dayCents(data, date, kid)
  const pct = dayPct(data, date, kid)
  const mon = mondayOf(date)
  let weekC = 0
  for (let i = 0; i < 7; i++) weekC += dayCents(data, addDays(mon, i), kid)
  const stk = computeStreak(data, kid)
  const canSwitchKid = role === 'admin'

  // Kids can page back to today + the prior week (no PIN); older days are parent-only.
  const earliest = kidEditableFrom()
  const canGoBack = !ui.dateOverride && addDays(date, -1) >= earliest
  const canGoForward = !ui.dateOverride && date < todayStr
  const isToday = date === todayStr
  const dateObj = parseISO(date)
  const dayLabel = isToday ? 'TODAY' : `${DOW[(dateObj.getDay() + 6) % 7]}, ${MON[dateObj.getMonth()]} ${dateObj.getDate()}`.toUpperCase()

  function pickKid(id: KidId) {
    setUI({ kid: id })
    if (sound) beep(id === 'alex' ? 660 : 880, 0.08)
  }

  function toggleTask(t: Task, ev: MouseEvent<HTMLButtonElement>) {
    const rect = ev.currentTarget.getBoundingClientRect()
    const nowDone = !ch[t.id]
    // Fire the mutation, then celebrate optimistically off this render's snapshot —
    // the server round-trip shouldn't delay the feedback a kid is tapping for.
    mutate([{ t: 'toggleCheck', date, kid, taskId: t.id }])
    const secDone = myTasks.filter((x) => x.section === t.section).every((x) => x.id === t.id || !!ch[x.id])
    const allDone = myTasks.every((x) => x.id === t.id || !!ch[x.id])
    if (nowDone && !ui.dateOverride) {
      if (sound) beep(700 + Math.random() * 200, 0.1)
      flyCoin(rect, coinTargetRef.current, t.amt)
      burst(rect.left + 19, rect.top + 19, 8)
      if (secDone) {
        if (sound) fanfare()
        burst(rect.left + 19, rect.top + 19, 22)
      }
      if (allDone) {
        if (sound) fanfare()
        burst(window.innerWidth / 2, 160, 40)
      }
    } else if (nowDone) {
      if (sound) beep(750, 0.1)
    }
  }

  const editDate = ui.dateOverride ? parseISO(ui.dateOverride) : null
  const editingDateStr = editDate ? `${DOW[(editDate.getDay() + 6) % 7]}, ${MON[editDate.getMonth()]} ${editDate.getDate()}` : ''

  return (
    <>
      {ui.dateOverride && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', fontSize: 14 }}>
          <PencilSimple weight="duotone" size={16} color="var(--color-accent-2-600)" />
          <span style={{ flex: 1, fontStyle: 'italic' }}>Editing {editingDateStr}</span>
          <button
            className="btn btn-secondary"
            onClick={() => setUI({ dateOverride: null, view: 'parent', parentTab: 'weeks' })}
            style={{ padding: '4px 12px', fontSize: 13 }}
          >
            Done
          </button>
        </div>
      )}

      {canSwitchKid && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {KIDS.map((k) => {
            const active = k.id === kid
            return (
              <button
                key={k.id}
                onClick={() => pickKid(k.id)}
                style={{
                  flex: 1, minHeight: 52, fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20,
                  borderRadius: 'var(--radius-lg)', border: `2px solid ${active ? k.color : 'var(--color-neutral-300)'}`,
                  background: active ? k.color : 'var(--color-bg)', color: active ? '#fff' : k.dark,
                }}
              >
                {k.name}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            width: 96, height: 96, flexShrink: 0, borderRadius: '50%',
            background: `conic-gradient(${K.color} ${pct * 360}deg, var(--color-neutral-200) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 44, height: 34, position: 'relative', animation: pct === 1 ? 'pkd-bounce 1s ease infinite' : 'none' }}>
              <span style={{ position: 'absolute', left: 6, top: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--color-text)' }} />
              <span style={{ position: 'absolute', right: 6, top: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--color-text)' }} />
              <span style={mouthStyle(pct)} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
            {!ui.dateOverride && (
              <button
                aria-label="Previous day"
                onClick={() => canGoBack && setUI({ kidDate: addDays(date, -1) })}
                disabled={!canGoBack}
                style={{ background: 'none', border: 'none', padding: 2, color: 'inherit', visibility: canGoBack ? 'visible' : 'hidden' }}
              >
                <CaretLeft weight="bold" size={11} />
              </button>
            )}
            <span>{dayLabel}</span>
            {!ui.dateOverride && (
              <button
                aria-label="Next day"
                onClick={() => canGoForward && setUI({ kidDate: addDays(date, 1) === todayStr ? null : addDays(date, 1) })}
                disabled={!canGoForward}
                style={{ background: 'none', border: 'none', padding: 2, color: 'inherit', visibility: canGoForward ? 'visible' : 'hidden' }}
              >
                <CaretRight weight="bold" size={11} />
              </button>
            )}
          </div>
          <div ref={coinTargetRef} style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 34, lineHeight: 1.05, color: K.dark }}>
            {fmtC(dayC)}
          </div>
          <div style={{ fontSize: 14.5, marginTop: 3 }}>
            Week so far <strong>{fmtD(weekC)}</strong>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 2, color: 'var(--color-neutral-700)' }}>
            <Star weight="duotone" size={14} color="var(--color-process-yellow)" /> {stk === 1 ? '1-day streak' : `${stk}-day streak`}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ fontSize: 12.5, fontStyle: 'italic', marginBottom: 6 }}>Sisters&rsquo; race &mdash; today</div>
        {KIDS.map((k) => {
          const p = dayPct(data, date, k.id)
          const label = k.id === 'alex' ? 'A' : 'S'
          return (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 5 }}>
              <span style={{ width: 34, fontSize: 13, fontWeight: 600, color: k.dark }}>{label}</span>
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(p * 100, 2)}%`, background: k.color, borderRadius: 6, transition: 'width .4s ease' }} />
              </div>
              <span style={{ width: 36, fontSize: 12, textAlign: 'right' }}>{Math.round(p * 100)}%</span>
            </div>
          )
        })}
      </div>

      {SECTIONS.map((sec) => {
        const tasks = myTasks.filter((t) => t.section === sec.name)
        if (!tasks.length) return null
        const done = tasks.filter((t) => ch[t.id]).length
        const complete = done === tasks.length
        return (
          <section key={sec.name} style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <sec.Icon weight="duotone" size={22} color={K.color} />
              <h3 style={{ margin: 0, fontSize: 20, flex: 1 }}>{sec.name}</h3>
              {complete && <Star weight="duotone" size={20} color="var(--color-process-yellow)" style={{ animation: 'pkd-pop .4s ease' }} />}
              <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>{done}/{tasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tasks.map((t) => {
                const isDone = !!ch[t.id]
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 50 }}>
                    <button
                      onClick={(ev) => toggleTask(t, ev)}
                      aria-label={`${t.label}, ${sec.name}${isDone ? ', done' : ''}`}
                      style={{
                        width: 38, height: 38, flexShrink: 0, borderRadius: '50%',
                        border: `2.5px solid ${isDone ? K.color : 'var(--color-neutral-400)'}`,
                        background: isDone ? K.color : 'var(--color-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      {isDone && <CheckFat weight="duotone" size={20} color="#fff" style={{ animation: 'pkd-pop .3s ease' }} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 16.5, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--color-neutral-500)' : 'inherit' }}>
                      {t.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isDone ? K.dark : 'var(--color-neutral-500)' }}>{fmtC(t.amt)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}
