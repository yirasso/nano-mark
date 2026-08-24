import { MOD } from '../lib/platform'
import { FolderIcon } from './Icons'

interface EmptyStateProps {
  hasWorktree: boolean
  onChangeWorktree: () => void
  onNewFile: () => void
  onShowShortcuts: () => void
  onShowGuide: () => void
}

export function EmptyState({
  hasWorktree,
  onChangeWorktree,
  onNewFile,
  onShowShortcuts,
  onShowGuide
}: EmptyStateProps): React.JSX.Element {
  if (!hasWorktree) {
    return (
      <div className="empty empty--first">
        <h2 className="empty__title">NanoMark</h2>
        <p className="empty__lede">
          NanoMark works inside one folder at a time. Pick the folder your notes live in — it is the
          only place the app can read or write.
        </p>
        <button type="button" className="button button--primary no-drag" onClick={onChangeWorktree}>
          <FolderIcon size={15} />
          <span>Open a folder</span>
        </button>
        <p className="empty__aside">
          Nothing leaves your machine. There is no account, no sync, and no network.
        </p>
      </div>
    )
  }

  return (
    <div className="empty">
      <p className="empty__hint">Pick a file from the sidebar to start reading or writing.</p>
      <div className="empty__actions">
        <button type="button" className="button" onClick={onNewFile}>
          New file <kbd>{MOD}</kbd> <kbd>N</kbd>
        </button>
        <button type="button" className="button button--quiet" onClick={onShowGuide}>
          Markdown guide <kbd>⇧</kbd> <kbd>F1</kbd>
        </button>
        <button type="button" className="button button--quiet" onClick={onShowShortcuts}>
          All shortcuts <kbd>F1</kbd>
        </button>
      </div>
    </div>
  )
}
