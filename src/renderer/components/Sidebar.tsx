import type { FileNode, SearchMatch, SearchResponse, Worktree } from '@shared/types'
import { Tree, type TreeCallbacks, type TreeState } from './Tree'
import { SearchBar } from './SearchBar'
import { SearchResults } from './SearchResults'
import { MOD } from '../lib/platform'
import { PlusIcon, SwapIcon } from './Icons'

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
  onNewFile: () => void
  onChangeWorktree: () => void
  onWorktreeContext: (event: React.MouseEvent, worktree: Worktree) => void
}

export function Sidebar({
  hidden,
  worktree,
  tree,
  state,
  search,
  onNewFile,
  onChangeWorktree,
  onWorktreeContext,
  ...callbacks
}: SidebarProps): React.JSX.Element {
  const searching = search.query.trim().length > 0

  // Hiding uses `visibility`, not opacity: it takes the panel out of the
  // accessibility tree and blurs anything inside it, so a rename field can never
  // keep the caret in a panel nobody can see.
  return (
    <aside className="sidebar" data-hidden={hidden ? 'true' : undefined}>
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
              className="worktree__add"
              onClick={onNewFile}
              aria-label="New file"
              title={`New file (${MOD}+N)`}
            >
              <PlusIcon size={13} />
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

          <nav className="sidebar__scroll" aria-label="Files">
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

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__add"
          onClick={onChangeWorktree}
          title={`Open a different folder (${MOD}+O)`}
        >
          <SwapIcon size={13} />
          <span>Open another folder</span>
        </button>
      </div>
    </aside>
  )
}
