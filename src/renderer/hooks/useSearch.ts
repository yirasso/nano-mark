import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_SEARCH, type SearchMatch, type SearchResponse } from '@shared/types'
import { messageOf } from '../lib/errors'

const DEBOUNCE = 140

interface SearchApi {
  query: string
  setQuery: (next: string) => void
  clear: () => void
  results: SearchResponse
  /** Entries and content matches in one list, for keyboard navigation. */
  ordered: SearchMatch[]
  active: number
  setActive: (index: number) => void
  moveActive: (delta: number) => void
  searching: boolean
  /** Re-runs the current query, e.g. after the tree changed underneath it. */
  refresh: () => void
}

export function useSearch(onError: (message: string) => void): SearchApi {
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY_SEARCH)
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)

  // Only the newest request is allowed to land; slower earlier ones are dropped.
  const generation = useRef(0)

  const run = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      generation.current += 1
      const mine = generation.current

      if (!trimmed) {
        setResults(EMPTY_SEARCH)
        setSearching(false)
        return
      }

      setSearching(true)
      void window.nano.search
        .run(trimmed)
        .then((response) => {
          if (mine !== generation.current) return
          setResults(response)
          setActive(0)
        })
        .catch((error) => {
          if (mine !== generation.current) return
          setResults(EMPTY_SEARCH)
          onError(messageOf(error))
        })
        .finally(() => {
          if (mine === generation.current) setSearching(false)
        })
    },
    [onError]
  )

  useEffect(() => {
    const timer = setTimeout(() => run(query), DEBOUNCE)
    return () => clearTimeout(timer)
  }, [query, run])

  const ordered = useMemo(
    () => [...results.entries, ...results.content],
    [results]
  )

  const setQuery = useCallback((next: string) => {
    setQueryState(next)
    setActive(0)
  }, [])

  const clear = useCallback(() => {
    setQueryState('')
    setResults(EMPTY_SEARCH)
    setActive(0)
  }, [])

  const moveActive = useCallback(
    (delta: number) => {
      setActive((current) => {
        if (ordered.length === 0) return 0
        return (current + delta + ordered.length) % ordered.length
      })
    },
    [ordered.length]
  )

  return {
    query,
    setQuery,
    clear,
    results,
    ordered,
    active,
    setActive,
    moveActive,
    searching,
    refresh: useCallback(() => run(query), [query, run])
  }
}
