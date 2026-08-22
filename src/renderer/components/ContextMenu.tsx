import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
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

  useEffect(() => {
    const dismiss = (): void => onClose()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {anchor.items.map((item, index) => (
        <div key={item.label}>
          {item.separatorBefore && index > 0 ? <div className="menu__sep" /> : null}
          <button
            type="button"
            role="menuitem"
            className="menu__item"
            data-danger={item.danger ? 'true' : undefined}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
