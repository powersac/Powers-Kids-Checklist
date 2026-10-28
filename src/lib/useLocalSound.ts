import { useCallback, useState } from 'react'

const KEY = 'pkdc-sound'

/** Sound is a per-device preference, not synced — muting one phone shouldn't mute the other. */
export function useLocalSound(): [boolean, (next: boolean) => void] {
  const [sound, setSoundState] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'false' } catch { return true }
  })
  const setSound = useCallback((next: boolean) => {
    setSoundState(next)
    try { localStorage.setItem(KEY, String(next)) } catch { /* ignore */ }
  }, [])
  return [sound, setSound]
}
