import { useCallback, useEffect, useState } from 'react'
import type { ThemeSource } from '@shared/types'
import { messageOf } from '../lib/errors'

const query = '(prefers-color-scheme: dark)'

interface ThemeApi {
  /** What the window is actually showing right now. */
  isDark: boolean
  /** What the user chose; 'system' until they pick a side. */
  source: ThemeSource
  toggle: () => void
  followSystem: () => void
}

export function useTheme(onError: (message: string) => void): ThemeApi {
  const [isDark, setIsDark] = useState(() => window.matchMedia(query).matches)
  const [source, setSource] = useState<ThemeSource>('system')

  useEffect(() => {
    void window.nano.theme.get().then(setSource).catch(() => undefined)
  }, [])

  // The main process drives prefers-color-scheme, so the media query is the
  // single source of truth for what is on screen, chosen or inherited.
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent): void => setIsDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const apply = useCallback(
    (next: ThemeSource) => {
      setSource(next)
      void window.nano.theme.set(next).catch((error) => onError(messageOf(error)))
    },
    [onError]
  )

  return {
    isDark,
    source,
    toggle: useCallback(() => apply(isDark ? 'light' : 'dark'), [apply, isDark]),
    followSystem: useCallback(() => apply('system'), [apply])
  }
}
