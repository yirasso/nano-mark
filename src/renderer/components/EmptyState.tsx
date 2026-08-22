interface EmptyStateProps {
  hasWorktree: boolean
  onChangeWorktree: () => void
}

export function EmptyState({
  hasWorktree,
  onChangeWorktree
}: EmptyStateProps): React.JSX.Element {
  if (!hasWorktree) {
    return (
      <div className="empty">
        <div className="empty__title">NanoMark</div>
        <button type="button" className="sidebar__add no-drag" onClick={onChangeWorktree}>
          <span>Choose a worktree to begin</span>
        </button>
      </div>
    )
  }

  return (
    <div className="empty">
      <p className="empty__hint">
        Pick a file from the sidebar
        <br />
        or press <kbd>Ctrl</kbd> <kbd>N</kbd> to write a new one
      </p>
    </div>
  )
}
