import { forwardRef } from 'react'
import { CloseIcon, SearchIcon } from './Icons'

interface SearchBarProps {
  value: string
  onChange: (next: string) => void
  onClear: () => void
  onMove: (delta: number) => void
  onSubmit: () => void
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, onClear, onMove, onSubmit },
  ref
) {
  return (
    <div className="search no-drag" data-filled={value ? 'true' : undefined}>
      <span className="search__icon">
        <SearchIcon />
      </span>

      <input
        ref={ref}
        className="search__input"
        value={value}
        placeholder="Search"
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
        <button type="button" className="search__clear" onClick={onClear} title="Clear (Esc)">
          <CloseIcon />
        </button>
      ) : null}
    </div>
  )
})
