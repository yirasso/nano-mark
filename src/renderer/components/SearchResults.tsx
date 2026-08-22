import { useEffect, useRef } from 'react'
import type { SearchMatch, SearchResponse } from '@shared/types'
import { FileIcon, FolderIcon } from './Icons'

interface SearchResultsProps {
  query: string
  results: SearchResponse
  ordered: SearchMatch[]
  active: number
  searching: boolean
  onHover: (index: number) => void
  onActivate: (match: SearchMatch) => void
  onContext: (event: React.MouseEvent, match: SearchMatch) => void
}

export function SearchResults({
  query,
  results,
  ordered,
  active,
  searching,
  onHover,
  onActivate,
  onContext
}: SearchResultsProps): React.JSX.Element {
  if (ordered.length === 0) {
    // "Searching" fades in on a delay, so a fast query never flashes a word the
    // user cannot finish reading.
    return searching ? (
      <p className="search-empty" data-pending="true">
        Searching…
      </p>
    ) : (
      <p className="search-empty">
        No matches for <span className="search-empty__term">{query.trim()}</span>
      </p>
    )
  }

  const entryCount = results.entries.length
  const total = ordered.length

  return (
    <div
      className="search-results"
      id="search-results"
      role="listbox"
      aria-label={`${total} ${total === 1 ? 'result' : 'results'} for ${query.trim()}`}
    >
      {entryCount > 0 ? (
        <>
          <GroupHeading label="Files and folders" count={entryCount} />
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
          <GroupHeading label="In files" count={results.content.length} />
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
        <p className="search-note">
          More matches exist. Narrow the search to see them.
        </p>
      ) : null}
    </div>
  )
}

function GroupHeading({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <div className="search-group" role="presentation">
      <span>{label}</span>
      <span className="search-group__count">{count}</span>
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
      id={`search-row-${index}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className="search-row"
      data-active={active ? 'true' : undefined}
      onMouseEnter={() => onHover(index)}
      onClick={() => onActivate(match)}
      onContextMenu={(event) => onContext(event, match)}
      title={match.path}
    >
      <span className="search-row__icon" aria-hidden="true">
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
      id={`search-row-${index}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
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
