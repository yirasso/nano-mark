import { useEffect, useRef } from 'react'
import type { SearchMatch, SearchResponse } from '@shared/types'
import { FileIcon, FolderIcon } from './Icons'

interface SearchResultsProps {
  results: SearchResponse
  ordered: SearchMatch[]
  active: number
  searching: boolean
  onHover: (index: number) => void
  onActivate: (match: SearchMatch) => void
  onContext: (event: React.MouseEvent, match: SearchMatch) => void
}

export function SearchResults({
  results,
  ordered,
  active,
  searching,
  onHover,
  onActivate,
  onContext
}: SearchResultsProps): React.JSX.Element {
  if (ordered.length === 0) {
    return (
      <div className="search-empty">{searching ? 'Searching' : 'No matches'}</div>
    )
  }

  const entryCount = results.entries.length

  return (
    <div className="search-results">
      {entryCount > 0 ? (
        <>
          <div className="search-group">Files and folders</div>
          {results.entries.map((match, index) => (
            <EntryRow
              key={`${match.path}-entry`}
              match={match}
              index={index}
              active={active === index}
              onHover={onHover}
              onActivate={onActivate}
              onContext={onContext}
            />
          ))}
        </>
      ) : null}

      {results.content.length > 0 ? (
        <>
          <div className="search-group">In files</div>
          {results.content.map((match, index) => (
            <ContentRow
              key={`${match.path}-${match.line}-${match.column}`}
              match={match}
              index={entryCount + index}
              active={active === entryCount + index}
              onHover={onHover}
              onActivate={onActivate}
              onContext={onContext}
            />
          ))}
        </>
      ) : null}

      {results.truncated ? (
        <div className="search-note">Showing the first matches only</div>
      ) : null}
    </div>
  )
}

interface RowProps {
  match: SearchMatch
  index: number
  active: boolean
  onHover: (index: number) => void
  onActivate: (match: SearchMatch) => void
  onContext: (event: React.MouseEvent, match: SearchMatch) => void
}

/** Keeps the keyboard-selected row inside the scroll viewport. */
function useScrollIntoView(active: boolean): React.RefObject<HTMLButtonElement | null> {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return ref
}

function EntryRow({
  match,
  index,
  active,
  onHover,
  onActivate,
  onContext
}: RowProps): React.JSX.Element {
  const ref = useScrollIntoView(active)

  return (
    <button
      type="button"
      ref={ref}
      className="search-row"
      data-active={active ? 'true' : undefined}
      onMouseEnter={() => onHover(index)}
      onClick={() => onActivate(match)}
      onContextMenu={(event) => onContext(event, match)}
      title={match.path}
    >
      <span className="search-row__icon">
        {match.kind === 'dir' ? <FolderIcon /> : <FileIcon />}
      </span>
      <span className="search-row__name">{match.name}</span>
      <span className="search-row__location">{match.location}</span>
    </button>
  )
}

function ContentRow({
  match,
  index,
  active,
  onHover,
  onActivate,
  onContext
}: RowProps): React.JSX.Element {
  const ref = useScrollIntoView(active)
  const snippet = match.snippet ?? ''
  const start = match.snippetStart ?? 0
  const end = match.snippetEnd ?? 0

  return (
    <button
      type="button"
      ref={ref}
      className="search-row search-row--content"
      data-active={active ? 'true' : undefined}
      onMouseEnter={() => onHover(index)}
      onClick={() => onActivate(match)}
      onContextMenu={(event) => onContext(event, match)}
      title={`${match.path}:${match.line}`}
    >
      <span className="search-row__snippet">
        {snippet.slice(0, start)}
        <mark>{snippet.slice(start, end)}</mark>
        {snippet.slice(end)}
      </span>
      <span className="search-row__source">{`${match.name}:${match.line}`}</span>
    </button>
  )
}
