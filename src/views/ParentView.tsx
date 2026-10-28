import { ArrowCounterClockwise, Plus, Trash } from '@phosphor-icons/react'
import { useApp } from '../lib/AppContext'
import type { ParentTab } from '../lib/AppContext'
import { SECTIONS } from '../lib/kids'
import { weekList } from '../lib/derived'
import { iso, parseISO } from '../lib/dates'
import { fmtD } from '../lib/money'

export function ParentView() {
  const { data, role } = useApp()
  if (!data || role !== 'admin') return null
  return <UnlockedParent />
}

const TABS: { id: ParentTab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'weeks', label: 'Weeks & payouts' },
  { id: 'settings', label: 'Settings' },
]

function UnlockedParent() {
  const { ui, setUI } = useApp()

  return (
    <>
      <div className="seg" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
        {TABS.map((t) => {
          const active = ui.parentTab === t.id
          return (
            <button
              key={t.id}
              className="seg-opt"
              onClick={() => setUI({ parentTab: t.id })}
              style={{
                flex: 1,
                background: active ? 'var(--color-accent-600)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {ui.parentTab === 'tasks' && <TasksTab />}
      {ui.parentTab === 'weeks' && <WeeksTab />}
      {ui.parentTab === 'settings' && <SettingsTab />}
    </>
  )
}

function TasksTab() {
  const { data, mutate } = useApp()
  if (!data) return null

  return (
    <>
      <p style={{ fontSize: 13.5, fontStyle: 'italic', marginBottom: 'var(--space-4)' }}>
        Tap A / S to assign a task to each kid. Amounts are in cents.
      </p>
      {SECTIONS.map((sec) => {
        const tasks = data.tasks.filter((t) => t.section === sec.name)
        return (
          <section key={sec.name} style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <sec.Icon weight="duotone" size={22} color="var(--color-accent-600)" />
              <h3 style={{ margin: 0, fontSize: 20 }}>{sec.name}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {tasks.map((t) => {
                const alexOn = t.kids.includes('alex')
                const samOn = t.kids.includes('sam')
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      defaultValue={t.label}
                      onBlur={(e) => {
                        const val = e.target.value
                        if (val !== t.label) mutate([{ t: 'setTaskLabel', taskId: t.id, label: val }])
                      }}
                    />
                    <input
                      className="input"
                      type="number"
                      step={5}
                      defaultValue={t.amt}
                      style={{ width: 62, textAlign: 'right' }}
                      onBlur={(e) => {
                        const val = Math.max(0, +e.target.value || 0)
                        if (val !== t.amt) mutate([{ t: 'setTaskAmt', taskId: t.id, amt: val }])
                      }}
                    />
                    <KidToggle
                      label="A"
                      on={alexOn}
                      onColor="#1186ac"
                      offColor="#006786"
                      onClick={() => mutate([{ t: 'toggleTaskKid', taskId: t.id, kid: 'alex' }])}
                    />
                    <KidToggle
                      label="S"
                      on={samOn}
                      onColor="#d82071"
                      offColor="#aa0b56"
                      onClick={() => mutate([{ t: 'toggleTaskKid', taskId: t.id, kid: 'sam' }])}
                    />
                    <button
                      className="btn btn-ghost"
                      aria-label={`Delete ${t.label}`}
                      onClick={() => mutate([{ t: 'deleteTask', taskId: t.id }])}
                      style={{ padding: 6, color: 'var(--color-neutral-700)' }}
                    >
                      <Trash weight="duotone" size={18} />
                    </button>
                  </div>
                )
              })}
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 'var(--space-2)' }}
              onClick={() => mutate([{ t: 'addTask', section: sec.name }])}
            >
              <Plus weight="bold" size={14} /> Add task
            </button>
          </section>
        )
      })}
    </>
  )
}

function KidToggle({ label, on, onColor, offColor, onClick }: { label: string; on: boolean; onColor: string; offColor: string; onClick: () => void }) {
  return (
    <button
      aria-label={`Toggle ${label === 'A' ? 'Alex' : 'Sam'}`}
      aria-pressed={on}
      onClick={onClick}
      style={{
        width: 30, height: 30, flexShrink: 0, borderRadius: '50%', fontSize: 13, fontWeight: 600,
        border: `2px solid ${on ? onColor : 'var(--color-neutral-300)'}`,
        background: on ? onColor : 'var(--color-bg)',
        color: on ? '#fff' : offColor,
      }}
    >
      {label}
    </button>
  )
}

function WeeksTab() {
  const { data, mutate, setUI } = useApp()
  if (!data) return null
  const weeks = weekList(data)
  const todayStr = iso(new Date())

  return (
    <>
      <p style={{ fontSize: 13.5, fontStyle: 'italic', marginBottom: 'var(--space-4)' }}>
        Tap a day to edit its checkmarks. Mark a week paid when allowance is handed out.
      </p>
      {weeks.map((w) => {
        const rangeStr = w.rangeStr + (w.isCurrent ? ' (this week)' : '')
        const totalsStr = `Alex ${fmtD(w.perKid[0].cents)} · Sam ${fmtD(w.perKid[1].cents)}`
        return (
          <div key={w.mon} className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19 }}>{rangeStr}</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{totalsStr}</div>
              </div>
              <button
                className={`btn ${w.paid ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexShrink: 0, fontSize: 13, padding: '6px 12px' }}
                onClick={() => mutate([{ t: 'togglePaid', mon: w.mon }])}
              >
                {w.paid ? 'Paid ✓' : 'Mark paid'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 'var(--space-3)' }}>
              {w.days.map((d, i) => {
                const dd = parseISO(d)
                const isToday = d === todayStr
                const future = d > todayStr
                const bg = isToday ? 'var(--color-accent-200)' : future ? 'var(--color-neutral-100)' : 'var(--color-bg)'
                return (
                  <button
                    key={d}
                    disabled={future}
                    onClick={() => setUI({ dateOverride: d, view: 'today' })}
                    style={{
                      flex: 1, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)',
                      background: bg, color: future ? 'var(--color-neutral-500)' : 'var(--color-text)',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{'MTWTFSS'[i]}</span>
                    <span style={{ fontSize: 13 }}>{dd.getDate()}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

function SettingsTab() {
  const { data, mutate } = useApp()
  if (!data) return null

  function doReset() {
    if (confirm('Erase all tasks, history and payouts?')) mutate([{ t: 'reset' }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Pay rate</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 14 }}>
          <input
            className="input"
            type="number"
            step={5}
            defaultValue={data.rate || 10}
            style={{ width: 64, padding: 8, textAlign: 'right' }}
            onBlur={(e) => {
              const val = Math.max(0, +e.target.value || 0)
              if (val !== data.rate) mutate([{ t: 'setRate', rate: val }])
            }}
          />
          <span>&cent; per task</span>
          <button className="btn btn-secondary" onClick={() => mutate([{ t: 'applyRateAll' }])} style={{ padding: '6px 12px', fontSize: 13 }}>Apply to all tasks</button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Data</h3>
        <p style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--color-neutral-600)', marginBottom: 8 }}>
          Reset clears every task, check, and payout and starts fresh.
        </p>
        <button className="btn btn-secondary" onClick={doReset} style={{ padding: '7px 14px', fontSize: 13.5, color: 'var(--color-accent-2-700)' }}>
          <ArrowCounterClockwise weight="duotone" size={16} /> Reset all data
        </button>
      </div>
    </div>
  )
}
