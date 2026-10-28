import { CheckSquareOffset, CalendarDots, LockKey, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { AppProvider, useApp, type ViewId } from './lib/AppContext'
import { datelineStr } from './lib/dates'
import { beep } from './lib/audio'
import { useLocalSound } from './lib/useLocalSound'
import { TodayView } from './views/TodayView'
import { SummaryView } from './views/SummaryView'
import { ParentView } from './views/ParentView'

const NAV: { id: ViewId; label: string; Icon: typeof CheckSquareOffset }[] = [
  { id: 'today', label: 'Today', Icon: CheckSquareOffset },
  { id: 'summary', label: 'Summary', Icon: CalendarDots },
  { id: 'parent', label: 'Parent', Icon: LockKey },
]

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const { status, role, connectionError, ui, setUI } = useApp()
  const [sound, setSound] = useLocalSound()
  const view = ui.view

  const pickTab = (id: ViewId) => {
    setUI((prev) => ({
      view: id,
      dateOverride: id === 'today' ? null : prev.dateOverride,
      kidDate: id === 'today' ? null : prev.kidDate,
    }))
  }

  const navItems = role === 'admin' ? NAV : NAV.filter((n) => n.id !== 'parent')

  return (
    <div
      style={{
        maxWidth: 440, margin: '0 auto', height: '100dvh',
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)', color: 'var(--color-text)',
      }}
    >
      <header style={{ padding: 'max(var(--space-3), env(safe-area-inset-top)) var(--space-4) 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img src="/logo.png" alt="Powers Kids Daily Checklist" className="halftone" style={{ height: 88, width: 'auto' }} />
        </div>
        <div
          style={{
            borderTop: '3px solid var(--color-text)', borderBottom: '1px solid var(--color-text)',
            marginTop: 'var(--space-2)', padding: '3px 0', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', fontSize: 12.5,
          }}
        >
          <span style={{ fontStyle: 'italic' }}>{datelineStr()}</span>
          <button
            aria-label="Toggle sound"
            onClick={() => {
              const turningOn = !sound
              setSound(turningOn)
              if (turningOn) beep(880, 0.1)
            }}
            style={{ background: 'none', border: 'none', padding: '2px 4px', color: 'var(--color-text)' }}
          >
            {sound ? <SpeakerHigh weight="duotone" size={17} /> : <SpeakerSlash weight="duotone" size={17} />}
          </button>
        </div>
        {connectionError && (
          <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--color-accent-2-700)', paddingTop: 6 }}>{connectionError}</div>
        )}
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4) var(--space-8)' }}>
        {status === 'loading' && <p className="text-muted" style={{ paddingTop: 'var(--space-6)', textAlign: 'center' }}>Loading&hellip;</p>}
        {status === 'denied' && (
          <div style={{ paddingTop: 'var(--space-6)', textAlign: 'center' }}>
            <p style={{ fontStyle: 'italic' }}>This link doesn&rsquo;t work.</p>
            <p className="text-muted" style={{ fontSize: 13.5 }}>It may have been cut short when it was copied. Ask for it again.</p>
          </div>
        )}
        {status === 'ready' && (
          <>
            {view === 'today' && <TodayView sound={sound} />}
            {view === 'summary' && <SummaryView />}
            {view === 'parent' && <ParentView />}
          </>
        )}
      </main>

      <nav style={{ flexShrink: 0, display: 'flex', borderTop: '3px double var(--color-text)', background: 'var(--color-bg)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => pickTab(id)}
            style={{
              flex: 1, background: 'none', border: 'none', padding: '9px 0 11px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              color: view === id ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
            }}
          >
            <Icon weight="duotone" size={24} />
            <span style={{ fontSize: 11.5, fontWeight: view === id ? 600 : 400 }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
