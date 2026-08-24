import { useEffect, useRef } from 'react'
import { BIN, MOD } from '../lib/platform'
import { CloseIcon } from './Icons'

interface Group {
  title: string
  rows: { keys: string[]; label: string }[]
}

const GROUPS: Group[] = [
  {
    title: 'Files',
    rows: [
      { keys: [MOD, 'N'], label: 'New file' },
      { keys: [MOD, '⇧', 'N'], label: 'New folder' },
      { keys: [MOD, 'O'], label: 'Open a different folder' },
      { keys: [MOD, 'S'], label: 'Save now — otherwise it saves itself' }
    ]
  },
  {
    title: 'Views',
    rows: [
      { keys: [MOD, 'E'], label: 'Switch between Code and Preview' },
      { keys: [MOD, 'B'], label: 'Show or hide the sidebar' },
      { keys: ['F1'], label: 'This list' },
      { keys: ['⇧', 'F1'], label: 'The markdown guide, built into the app' }
    ]
  },
  {
    title: 'Search',
    rows: [
      { keys: [MOD, 'F'], label: 'Search filenames and file contents' },
      { keys: ['↑', '↓'], label: 'Move through the results' },
      { keys: ['Enter'], label: 'Open the result, cursor on the match' },
      { keys: ['Esc'], label: 'Clear the search' }
    ]
  },
  {
    title: 'In the file tree',
    rows: [
      { keys: ['↑', '↓'], label: 'Move between rows' },
      { keys: ['→'], label: 'Open a folder, then step into it' },
      { keys: ['←'], label: 'Close a folder, or step out to its parent' },
      { keys: ['Enter'], label: 'Open the file' },
      { keys: ['F2'], label: 'Rename the row' },
      { keys: ['Del'], label: `Move the row to the ${BIN}` },
      { keys: ['⇧', 'F10'], label: 'Open the row menu' }
    ]
  }
]

export function ShortcutSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      returnFocus.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="sheet-scrim" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="sheet__title" id="sheet-title">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            ref={closeRef}
            className="sheet__close"
            onClick={onClose}
            aria-label="Close the shortcut list"
            title="Close (Esc)"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="sheet__body">
          {GROUPS.map((group) => (
            <section className="sheet__group" key={group.title}>
              <h3 className="sheet__group-title">{group.title}</h3>
              <dl className="sheet__rows">
                {group.rows.map((row) => (
                  <div className="sheet__row" key={row.label}>
                    <dt className="sheet__keys">
                      {row.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dt>
                    <dd className="sheet__label">{row.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
