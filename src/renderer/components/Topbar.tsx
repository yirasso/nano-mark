import { EditIcon, MoonIcon, PreviewIcon, SidebarIcon, SunIcon } from './Icons'

interface TopbarProps {
  title: string
  dirty: boolean
  mode: 'edit' | 'preview'
  externalChange: boolean
  hasDocument: boolean
  isDark: boolean
  onToggleSidebar: () => void
  onToggleMode: () => void
  onToggleTheme: () => void
  onThemeContext: (event: React.MouseEvent) => void
  onReload: () => void
}

export function Topbar({
  title,
  dirty,
  mode,
  externalChange,
  hasDocument,
  isDark,
  onToggleSidebar,
  onToggleMode,
  onToggleTheme,
  onThemeContext,
  onReload
}: TopbarProps): React.JSX.Element {
  return (
    <header className="topbar drag">
      <button
        type="button"
        className="topbar__toggle no-drag"
        onClick={onToggleSidebar}
        title="Toggle sidebar (Ctrl+B)"
      >
        <SidebarIcon />
      </button>

      <span className="topbar__title">{title}</span>
      <span className="topbar__dot" data-visible={dirty ? 'true' : undefined} />

      {externalChange ? (
        <div className="pill no-drag">
          <span>Changed on disk</span>
          <button type="button" onClick={onReload}>
            Reload
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="topbar__toggle no-drag"
        onClick={onToggleTheme}
        onContextMenu={onThemeContext}
        title={isDark ? 'Switch to light' : 'Switch to dark'}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      {hasDocument ? (
        <button
          type="button"
          className="topbar__toggle no-drag"
          onClick={onToggleMode}
          title={mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)'}
        >
          {mode === 'edit' ? <PreviewIcon /> : <EditIcon />}
        </button>
      ) : null}
    </header>
  )
}
