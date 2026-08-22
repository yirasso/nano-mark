import type { SaveState } from '../hooks/useDocument'
import { MOD } from '../lib/platform'
import { MoonIcon, SidebarIcon, SunIcon } from './Icons'

export interface Crumb {
  name: string
  path: string
}

interface TopbarProps {
  crumbs: Crumb[]
  fileName: string
  meta: string
  saveState: SaveState
  failure: string | null
  mode: 'edit' | 'preview'
  externalChange: boolean
  hasDocument: boolean
  sidebarVisible: boolean
  isDark: boolean
  onCrumb: (path: string) => void
  onToggleSidebar: () => void
  onSetMode: (mode: 'edit' | 'preview') => void
  onToggleTheme: () => void
  onThemeContext: (event: React.MouseEvent) => void
  onRetrySave: () => void
  onReload: () => void
  onKeepMine: () => void
}

/**
 * The blob header, not a titlebar. GitHub puts the path, the file's size and the
 * view switch across the top of a file; this is the same header, for the same
 * file, so the chrome says something instead of holding an empty strip.
 */
export function Topbar({
  crumbs,
  fileName,
  meta,
  saveState,
  failure,
  mode,
  externalChange,
  hasDocument,
  sidebarVisible,
  isDark,
  onCrumb,
  onToggleSidebar,
  onSetMode,
  onToggleTheme,
  onThemeContext,
  onRetrySave,
  onReload,
  onKeepMine
}: TopbarProps): React.JSX.Element {
  return (
    <header className="topbar drag">
      <button
        type="button"
        className="topbar__toggle no-drag"
        onClick={onToggleSidebar}
        aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        aria-pressed={sidebarVisible}
        title={`Toggle sidebar (${MOD}+B)`}
      >
        <SidebarIcon />
      </button>

      {hasDocument ? (
        <div className="blobhead no-drag">
          {crumbs.length > 0 ? (
            <nav className="crumbs" aria-label="File location">
              {crumbs.map((crumb) => (
                <span className="crumbs__step" key={crumb.path}>
                  <button
                    type="button"
                    className="crumbs__link"
                    onClick={() => onCrumb(crumb.path)}
                    title={`Show ${crumb.name} in the sidebar`}
                  >
                    {crumb.name}
                  </button>
                  <span className="crumbs__sep" aria-hidden="true">
                    /
                  </span>
                </span>
              ))}
            </nav>
          ) : null}

          <h1 className="blobhead__name" title={fileName}>
            {fileName}
          </h1>

          <SaveStatus state={saveState} failure={failure} onRetry={onRetrySave} />
        </div>
      ) : (
        <div className="blobhead" />
      )}

      <div className="topbar__right no-drag">
        {externalChange ? (
          <div className="pill">
            <span>Changed on disk</span>
            <button type="button" onClick={onReload} title="Load the version on disk">
              Reload
            </button>
            <button type="button" onClick={onKeepMine} title="Overwrite the version on disk">
              Keep mine
            </button>
          </div>
        ) : null}

        {hasDocument && meta ? <span className="blobmeta">{meta}</span> : null}

        {hasDocument ? (
          <div className="viewtabs" role="tablist" aria-label="File view">
            <ViewTab id="code" label="Code" active={mode === 'edit'} onPick={() => onSetMode('edit')} />
            <ViewTab
              id="preview"
              label="Preview"
              active={mode === 'preview'}
              onPick={() => onSetMode('preview')}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="topbar__toggle"
          onClick={onToggleTheme}
          onContextMenu={onThemeContext}
          aria-label={isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
          title={`${isDark ? 'Switch to light' : 'Switch to dark'} — right-click to follow the system`}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  )
}

function ViewTab({
  id,
  label,
  active,
  onPick
}: {
  id: string
  label: string
  active: boolean
  onPick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      id={`viewtab-${id}`}
      aria-controls={`viewpane-${id}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className="viewtabs__tab"
      onClick={onPick}
      title={`${label} (${MOD}+E)`}
    >
      {label}
    </button>
  )
}

/**
 * The app never asks the user to save, so this is the only place it can tell
 * them whether saving worked. A failure stays on screen until a write succeeds.
 */
function SaveStatus({
  state,
  failure,
  onRetry
}: {
  state: SaveState
  failure: string | null
  onRetry: () => void
}): React.JSX.Element {
  if (state === 'failed') {
    return (
      <span className="savestate" data-state="failed" role="alert">
        <span title={failure ?? undefined}>Not saved</span>
        <button type="button" onClick={onRetry} title={failure ?? 'Try writing the file again'}>
          Retry
        </button>
      </span>
    )
  }

  return (
    <span className="savestate" data-state={state === 'clean' ? 'clean' : 'saving'}>
      {state === 'clean' ? 'Saved' : 'Saving…'}
    </span>
  )
}
