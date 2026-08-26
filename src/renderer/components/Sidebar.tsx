import type { FileNode, SearchMatch, SearchResponse, Worktree } from '@shared/types'
import { Tree, type TreeCallbacks, type TreeState } from './Tree'
import { SearchBar } from './SearchBar'
import { SearchResults } from './SearchResults'
import { canDropInto, samePath } from '../lib/paths'
import { MOD } from '../lib/platform'
import { SwapIcon } from './Icons'

export interface SidebarSearch {
  inputRef: React.RefObject<HTMLInputElement | null>
  query: string
  setQuery: (next: string) => void
  clear: () => void
  moveActive: (delta: number) => void
  setActive: (index: number) => void
  submit: () => void
  results: SearchResponse
  ordered: SearchMatch[]
  active: number
  searching: boolean
  onActivate: (match: SearchMatch) => void
  onContext: (event: React.MouseEvent, match: SearchMatch) => void
}

interface SidebarProps extends TreeCallbacks {
  hidden: boolean
  worktree: Worktree | null
  tree: FileNode[]
  state: TreeState
  search: SidebarSearch
  onChangeWorktree: () => void
  onWorktreeContext: (event: React.MouseEvent, worktree: Worktree) => void
}

export function Sidebar({
  hidden,
  worktree,
  tree,
  state,
  search,
  onChangeWorktree,
  onWorktreeContext,
  ...callbacks
}: SidebarProps): React.JSX.Element {
  const searching = search.query.trim().length > 0

  // A right-click that no row claimed belongs to the folder itself: rows and the
  // worktree button stop the event, so whatever reaches here is the empty space
  // around them, and the empty space is the root of the worktree.
  const onBackgroundContext = (event: React.MouseEvent): void => {
    if (!worktree) return
    // Except over a name field, where the menu would blur the caret and commit
    // a half-typed name.
    if ((event.target as HTMLElement).closest('input')) return
    onWorktreeContext(event, worktree)
  }

  // The same rule for a drag: whatever no row claimed lands in the worktree
  // itself, which is how a file or a folder gets back out to the top level.
  const rootIsTarget = worktree !== null && samePath(state.drag.dropDir, worktree.path)

  const onBackgroundDragOver = (event: React.DragEvent): void => {
    if (!worktree || state.drag.paths.length === 0) return
    const accepts = canDropInto(state.drag.paths, worktree.path)
    event.preventDefault()
    event.dataTransfer.dropEffect = accepts ? 'move' : 'none'
    callbacks.onDragOver(accepts ? worktree.path : null)
  }

  const onBackgroundDrop = (event: React.DragEvent): void => {
    if (!worktree || state.drag.paths.length === 0) return
    event.preventDefault()
    if (canDropInto(state.drag.paths, worktree.path)) callbacks.onDrop(worktree.path)
    callbacks.onDragEnd()
  }

  // Leaving the panel drops the highlight. Crossing between rows inside it is
  // also a dragleave, and that one has to be ignored or the target flickers.
  const onBackgroundDragLeave = (event: React.DragEvent): void => {
    if (state.drag.paths.length === 0) return
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    callbacks.onDragOver(null)
  }

  // Hiding uses `visibility`, not opacity: it takes the panel out of the
  // accessibility tree and blurs anything inside it, so a rename field can never
  // keep the caret in a panel nobody can see.
  return (
    <aside
      className="sidebar"
      data-hidden={hidden ? 'true' : undefined}
      onContextMenu={onBackgroundContext}
      onDragOver={onBackgroundDragOver}
      onDragLeave={onBackgroundDragLeave}
      onDrop={onBackgroundDrop}
    >
      <div className="sidebar__top drag" />

      {worktree ? (
        <>
          <div className="worktree">
            <button
              type="button"
              className="worktree__name"
              title={worktree.path}
              onContextMenu={(event) => onWorktreeContext(event, worktree)}
            >
              {worktree.name}
            </button>
            <button
              type="button"
              className="worktree__swap"
              onClick={onChangeWorktree}
              aria-label="Open another folder"
              title={`Open a different folder (${MOD}+O)`}
            >
              <SwapIcon size={13} />
            </button>
          </div>

          <div className="sidebar__search">
            <SearchBar
              ref={search.inputRef}
              value={search.query}
              onChange={search.setQuery}
              onClear={search.clear}
              onMove={search.moveActive}
              onSubmit={search.submit}
              activeId={
                searching && search.ordered.length > 0 ? `search-row-${search.active}` : undefined
              }
            />
          </div>

          <nav
            className="sidebar__scroll"
            aria-label="Files"
            data-drop={rootIsTarget ? 'true' : undefined}
          >
            {searching ? (
              <SearchResults
                query={search.query}
                results={search.results}
                ordered={search.ordered}
                active={search.active}
                searching={search.searching}
                onHover={search.setActive}
                onActivate={search.onActivate}
                onContext={search.onContext}
              />
            ) : (
              <Tree {...callbacks} nodes={tree} parentPath={worktree.path} depth={0} state={state} />
            )}
          </nav>
        </>
      ) : (
        <div className="sidebar__scroll" />
      )}
    </aside>
  )
}
