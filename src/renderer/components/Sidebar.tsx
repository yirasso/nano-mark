import type { FileNode, SearchMatch, SearchResponse, Worktree } from '@shared/types'
import { Tree, type TreeCallbacks, type TreeState } from './Tree'
import { SearchBar } from './SearchBar'
import { SearchResults } from './SearchResults'
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

  return (
    <aside className="sidebar" data-hidden={hidden ? 'true' : undefined}>
      <div className="sidebar__top drag" />

      {worktree ? (
        <>
          <div
            className="worktree"
            title={worktree.path}
            onContextMenu={(event) => onWorktreeContext(event, worktree)}
          >
            {worktree.name}
          </div>

          <div className="sidebar__search">
            <SearchBar
              ref={search.inputRef}
              value={search.query}
              onChange={search.setQuery}
              onClear={search.clear}
              onMove={search.moveActive}
              onSubmit={search.submit}
            />
          </div>

          <div className="sidebar__scroll">
            {searching ? (
              <SearchResults
                results={search.results}
                ordered={search.ordered}
                active={search.active}
                searching={search.searching}
                onHover={search.setActive}
                onActivate={search.onActivate}
                onContext={search.onContext}
              />
            ) : (
              <Tree
                {...callbacks}
                nodes={tree}
                parentPath={worktree.path}
                depth={0}
                state={state}
              />
            )}
          </div>
        </>
      ) : (
        <div className="sidebar__scroll" />
      )}

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__add"
          onClick={onChangeWorktree}
          title="Change worktree (Ctrl+O)"
        >
          <SwapIcon size={13} />
          <span>Change worktree</span>
        </button>
      </div>
    </aside>
  )
}
