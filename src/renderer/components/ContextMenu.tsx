import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Shown right-aligned, so the menu is also where shortcuts are learned. */
  accelerator?: string
  danger?: boolean
  separatorBefore?: boolean
}

export interface MenuAnchor {
  x: number
  y: number
  items: MenuItem[]
}

interface ContextMenuProps {
  anchor: MenuAnchor
  onClose: () => void
}

export function ContextMenu({ anchor, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const returnFocus = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState({ x: anchor.x, y: anchor.y })

  // Keep the whole menu on screen, even when opened near an edge.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    setPos({
      x: Math.min(anchor.x, window.innerWidth - rect.width - margin),
      y: Math.min(anchor.y, window.innerHeight - rect.height - margin)
    })
  }, [anchor])

  // A menu that can be opened from the keyboard has to be usable from it too.
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null
    itemRefs.current[0]?.focus()
    return () => returnFocus.current?.focus?.()
  }, [anchor])

  useEffect(() => {
    const dismiss = (): void => onClose()
    const onKey = (event: KeyboardEvent): void => {
      const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
      if (items.length === 0) return
      const current = items.indexOf(document.activeElement as HTMLButtonElement)

      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = (current + delta + items.length) % items.length
        items[next]?.focus()
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        items[0]?.focus()
      }
      if (event.key === 'End') {
        event.preventDefault()
        items[items.length - 1]?.focus()
      }
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <div
      className="menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
      aria-orientation="vertical"
    >
      {anchor.items.map((item, index) => (
        <div key={item.label}>
          {item.separatorBefore && index > 0 ? (
            <div className="menu__sep" role="separator" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            tabIndex={index === 0 ? 0 : -1}
            ref={(el) => {
              itemRefs.current[index] = el
            }}
            className="menu__item"
            data-danger={item.danger ? 'true' : undefined}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="menu__label">{item.label}</span>
            {item.accelerator ? <span className="menu__accel">{item.accelerator}</span> : null}
          </button>
        </div>
      ))}
    </div>
  )
}
