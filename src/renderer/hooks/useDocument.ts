import { useCallback, useEffect, useRef, useState } from 'react'
import { samePath } from '../lib/paths'
import { messageOf } from '../lib/errors'

const AUTOSAVE_DELAY = 500
const RETRY_BASE = 1000
const RETRY_CEILING = 15000

/** What the topbar says out loud. `failed` is the only one that sticks. */
export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed'

interface DocumentApi {
  value: string
  /** The file whose content is in `value` right now, or null while loading. */
  loadedPath: string | null
  saveState: SaveState
  /** Why the last write failed, kept until one succeeds. */
  failure: string | null
  externalChange: boolean
  setValue: (next: string) => void
  saveNow: () => Promise<void>
  reload: () => Promise<void>
  /** Takes the buffer as the truth and stops asking about the disk. */
  keepMine: () => Promise<void>
  /** Throws the pending write away, for a file that is no longer there. */
  discard: () => void
}

/**
 * Owns the open buffer: loads it, saves it on a debounce, and reconciles edits
 * made to the same file by other programs.
 *
 * A write that fails is never dropped. The pending edit goes back where it came
 * from and is retried on a widening delay, because the app's whole promise is
 * that the user does not have to think about saving.
 */
export function useDocument(
  path: string | null,
  onError: (message: string) => void,
  onExternalReload: () => void
): DocumentApi {
  const [value, setValueState] = useState('')
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [failure, setFailure] = useState<string | null>(null)
  const [externalChange, setExternalChange] = useState(false)

  // Held in refs so the flush can outlive the file it belongs to.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)
  const currentPathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const reloadNoticeRef = useRef(onExternalReload)

  reloadNoticeRef.current = onExternalReload

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current)
      retryRef.current = null
    }
  }, [])

  const flush = useCallback(async () => {
    clearTimers()
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null

    setSaveState('saving')
    try {
      await window.nano.file.write(pending.path, pending.content)
      attemptsRef.current = 0
      setFailure(null)
      if (pendingRef.current) {
        setSaveState('dirty')
      } else if (samePath(pending.path, currentPathRef.current)) {
        dirtyRef.current = false
        setSaveState('clean')
      } else {
        setSaveState('clean')
      }
    } catch (error) {
      // Put the write back. Losing it here is the one failure the user cannot
      // see coming, because nothing in the interface ever asked them to save.
      if (!pendingRef.current) pendingRef.current = pending
      dirtyRef.current = true
      setFailure(messageOf(error))
      setSaveState('failed')

      attemptsRef.current += 1
      const delay = Math.min(RETRY_BASE * 2 ** (attemptsRef.current - 1), RETRY_CEILING)
      retryRef.current = setTimeout(() => void flushRef.current(), delay)
    }
  }, [clearTimers])

  flushRef.current = flush

  const load = useCallback(
    async (target: string) => {
      try {
        const doc = await window.nano.file.read(target)
        // The user may have moved on while this read was in flight.
        if (!samePath(target, currentPathRef.current)) return
        setValueState(doc.content)
        setLoadedPath(target)
        dirtyRef.current = false
        setSaveState('clean')
        setFailure(null)
        setExternalChange(false)
        return true
      } catch (error) {
        onError(messageOf(error))
        return false
      }
    },
    [onError]
  )

  const discard = useCallback(() => {
    clearTimers()
    pendingRef.current = null
    attemptsRef.current = 0
    dirtyRef.current = false
    setSaveState('clean')
    setFailure(null)
  }, [clearTimers])

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
        setSaveState('clean')
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
      pendingRef.current = { path: target, content: next }
      // A retry in flight is superseded by the newer content.
      attemptsRef.current = 0
      setSaveState((current) => (current === 'saving' ? current : 'dirty'))
      clearTimers()
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY)
    },
    [clearTimers, flush]
  )

  const reload = useCallback(async () => {
    const target = currentPathRef.current
    if (!target) return
    discard()
    await load(target)
  }, [discard, load])

  const keepMine = useCallback(async () => {
    const target = currentPathRef.current
    if (!target) return
    setExternalChange(false)
    pendingRef.current = { path: target, content: value }
    dirtyRef.current = true
    await flush()
  }, [flush, value])

  // A change on disk either lands quietly or waits behind unsaved work.
  useEffect(
    () =>
      window.nano.onFileChanged((event) => {
        if (!samePath(event.path, currentPathRef.current)) return
        if (dirtyRef.current || pendingRef.current) {
          setExternalChange(true)
          return
        }
        void load(event.path).then((ok) => {
          // Text changing under the reader is worth a word, even when nothing
          // was at risk.
          if (ok) reloadNoticeRef.current()
        })
      }),
    [load]
  )

  // Losing focus is a good moment to commit; the app may be about to be closed.
  useEffect(() => {
    const onBlur = (): void => void flush()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [flush])

  useEffect(() => clearTimers, [clearTimers])

  // The main process holds the window open until this resolves.
  useEffect(
    () => window.nano.onFlushRequest(() => void flush().finally(window.nano.flushDone)),
    [flush]
  )

  return {
    value,
    loadedPath,
    saveState,
    failure,
    externalChange,
    setValue,
    saveNow: flush,
    reload,
    keepMine,
    discard
  }
}
