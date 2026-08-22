import { forwardRef } from 'react'
import { CloseIcon, SearchIcon } from './Icons'

interface SearchBarProps {
  value: string
  onChange: (next: string) => void
  onClear: () => void
  onMove: (delta: number) => void
  onSubmit: () => void
  /** The result row the arrow keys are on, announced without moving focus. */
  activeId?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, onClear, onMove, onSubmit, activeId },
  ref
) {
  return (
    <div className="search no-drag" data-filled={value ? 'true' : undefined}>
      <span className="search__icon" aria-hidden="true">
        <SearchIcon />
      </span>

      <input
        ref={ref}
        className="search__input"
        type="text"
        role="combobox"
        aria-label="Search this folder"
        aria-expanded={Boolean(activeId)}
        aria-controls="search-results"
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        value={value}
        placeholder="Search this folder"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            if (value) onClear()
            else event.currentTarget.blur()
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onMove(1)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onMove(-1)
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit()
          }
          event.stopPropagation()
        }}
      />

      {value ? (
        <button
          type="button"
          className="search__clear"
          onClick={onClear}
          aria-label="Clear the search"
          title="Clear (Esc)"
        >
          <CloseIcon />
        </button>
      ) : null}
    </div>
  )
})
