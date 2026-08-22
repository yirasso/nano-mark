import { useEffect, useRef } from 'react'

export interface Hotkey {
  /** Compared case-insensitively against KeyboardEvent.key. */
  key: string
  mod?: boolean
  shift?: boolean
  handler: () => void
  /** Set for keys that should not fire while the caret is in a text field. */
  skipInEditable?: boolean
}

const isEditable = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true ||
    el.closest?.('.cm-editor') !== null
  )
}

export function useHotkeys(hotkeys: Hotkey[]): void {
  const ref = useRef(hotkeys)
  ref.current = hotkeys

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      for (const hotkey of ref.current) {
        if (event.key.toLowerCase() !== hotkey.key.toLowerCase()) continue
        if (Boolean(hotkey.mod) !== mod) continue
        if (Boolean(hotkey.shift) !== event.shiftKey) continue
        if (hotkey.skipInEditable && isEditable(event.target)) continue
        event.preventDefault()
        hotkey.handler()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
