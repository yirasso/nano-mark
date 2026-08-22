import { useCallback, useEffect, useRef, useState } from 'react'
import { samePath } from '../lib/paths'
import { messageOf } from '../lib/errors'

const AUTOSAVE_DELAY = 500

interface DocumentApi {
  value: string
  /** The file whose content is in `value` right now, or null while loading. */
  loadedPath: string | null
  dirty: boolean
  saving: boolean
  externalChange: boolean
  setValue: (next: string) => void
  saveNow: () => Promise<void>
  reload: () => Promise<void>
}

/**
 * Owns the open buffer: loads it, saves it on a debounce, and reconciles edits
 * made to the same file by other programs.
 */
export function useDocument(path: string | null, onError: (message: string) => void): DocumentApi {
  const [value, setValueState] = useState('')
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [externalChange, setExternalChange] = useState(false)

  // Held in refs so the flush can outlive the file it belongs to.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null

    setSaving(true)
    try {
      await window.nano.file.write(pending.path, pending.content)
      if (samePath(pending.path, currentPathRef.current) && !pendingRef.current) {
        dirtyRef.current = false
        setDirty(false)
      }
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }, [onError])

  const load = useCallback(
    async (target: string) => {
      try {
        const doc = await window.nano.file.read(target)
        // The user may have moved on while this read was in flight.
        if (!samePath(target, currentPathRef.current)) return
        setValueState(doc.content)
        setLoadedPath(target)
        dirtyRef.current = false
        setDirty(false)
        setExternalChange(false)
      } catch (error) {
        onError(messageOf(error))
      }
    },
    [onError]
  )

  // Switching files always saves the outgoing one first.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await flush()
      if (cancelled) return
      currentPathRef.current = path
      // Drop the outgoing buffer first, so the previous file never flashes up
      // under the new file's name.
      setLoadedPath(null)
      setValueState('')
      if (!path) {
        dirtyRef.current = false
        setDirty(false)
        setExternalChange(false)
        return
      }
      await load(path)
    })()
    return () => {
      cancelled = true
    }
  }, [path, flush, load])

  const setValue = useCallback(
    (next: string) => {
      const target = currentPathRef.current
      if (!target) return
      setValueState(next)
      dirtyRef.current = true
      setDirty(true)
      pendingRef.current = { path: target, content: next }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY)
    },
    [flush]
  )

  const reload = useCallback(async () => {
    const target = currentPathRef.current
    if (!target) return
    pendingRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await load(target)
  }, [load])

  // A change on disk either lands silently or waits behind unsaved work.
  useEffect(
    () =>
      window.nano.onFileChanged((event) => {
        if (!samePath(event.path, currentPathRef.current)) return
        if (dirtyRef.current || pendingRef.current) setExternalChange(true)
        else void load(event.path)
      }),
    [load]
  )

  // Losing focus is a good moment to commit; the app may be about to be closed.
  useEffect(() => {
    const onBlur = (): void => void flush()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [flush])

  // The main process holds the window open until this resolves.
  useEffect(() => window.nano.onFlushRequest(() => void flush().finally(window.nano.flushDone)), [flush])

  return { value, loadedPath, dirty, saving, externalChange, setValue, saveNow: flush, reload }
}
