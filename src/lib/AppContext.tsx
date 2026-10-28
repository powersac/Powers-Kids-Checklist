import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, fetchState, mutate as mutateApi } from './syncApi'
import type { AppData, KidId, Op, Role } from './types'

export type ViewId = 'today' | 'summary' | 'parent'
export type ParentTab = 'tasks' | 'weeks' | 'settings'

export interface UIState {
  view: ViewId
  kid: KidId
  parentTab: ParentTab
  /** ISO date a parent is editing checkmarks for, from Parent > Weeks. Only meaningful while view === 'today'. */
  dateOverride: string | null
  /** ISO date a kid has navigated back to via the Today view's own arrows (today + the prior week only). */
  kidDate: string | null
}

const defaultUI: UIState = {
  view: 'today',
  kid: 'alex',
  parentTab: 'tasks',
  dateOverride: null,
  kidDate: null,
}

const POLL_MS = 15000

interface AppContextValue {
  status: 'loading' | 'ready' | 'denied'
  data: AppData | null
  role: Role | null
  /** Non-null while a mutation or refresh most recently failed; cleared on the next success. */
  connectionError: string | null
  mutate: (ops: Op[]) => Promise<void>
  ui: UIState
  setUI: (patch: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [data, setData] = useState<AppData | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [ui, setUIState] = useState<UIState>(defaultUI)
  const revRef = useRef(0)
  const busyRef = useRef(false)

  const setUI = (patch: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) =>
    setUIState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))

  function adopt(payload: { rev: number; role: Role; data: AppData }) {
    revRef.current = payload.rev
    setRole(payload.role)
    setData(payload.data)
    setStatus('ready')
    setConnectionError(null)
    // Kid links are locked to their own kid — there's no switcher for them to override this with.
    if (payload.role === 'alex' || payload.role === 'sam') {
      setUI((prev) => (prev.kid === payload.role ? prev : { kid: payload.role as KidId }))
    }
  }

  async function refresh() {
    try {
      const payload = await fetchState()
      adopt(payload)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setStatus('denied'); return }
      setConnectionError('Cannot reach the checklist. Showing what was last loaded.')
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    const onVisible = () => { if (!document.hidden && !busyRef.current) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => {
      if (document.hidden || busyRef.current) return
      refresh()
    }, POLL_MS)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function runMutate(ops: Op[]): Promise<void> {
    busyRef.current = true
    try {
      const payload = await mutateApi(revRef.current, ops)
      adopt(payload)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body && typeof e.body === 'object' && 'data' in e.body) {
        // Someone else got there first — take their version, then retry once on top of it.
        const stale = e.body as { rev: number; data: AppData }
        revRef.current = stale.rev
        setData(stale.data)
        try {
          const payload = await mutateApi(revRef.current, ops)
          adopt(payload)
        } catch {
          setConnectionError('That change did not save. Try again.')
        }
      } else if (e instanceof ApiError && e.status === 401) {
        setStatus('denied')
      } else {
        setConnectionError('That change did not save. Try again.')
      }
    } finally {
      busyRef.current = false
    }
  }

  const value = useMemo<AppContextValue>(
    () => ({ status, data, role, connectionError, mutate: runMutate, ui, setUI }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, data, role, connectionError, ui],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
