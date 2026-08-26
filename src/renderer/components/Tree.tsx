import { useEffect, useRef } from 'react'
import type { FileNode, NodeKind } from '@shared/types'
import { canDropInto, dirName, samePath } from '../lib/paths'
import { MOD } from '../lib/platform'
import { ChevronRight, FileIcon, FolderIcon } from './Icons'

export interface Draft {
  parentPath: string
  kind: NodeKind
}

/** The rows in flight, and the folder they would land in if let go now. */
export interface DragState {
  paths: string[]
  dropDir: string | null
}

/** Which of the two selection gestures a click carried, if either. */
export interface RowMods {
  /** Shift: every row between the anchor and this one. */
  range: boolean
  /** Ctrl, or Cmd: this row alone, added to or taken out of the marking. */
  toggle: boolean
}

export interface TreeCallbacks {
  onToggle: (path: string) => void
  onActivate: (node: FileNode, mods: RowMods) => void
  onContext: (event: React.MouseEvent, node: FileNode) => void
  onCursor: (path: string) => void
  onTreeKeyDown: (event: React.KeyboardEvent) => void
  onRenameSubmit: (path: string, name: string) => void
  onRenameCancel: () => void
  onDraftSubmit: (name: string) => void
  onDraftCancel: () => void
  onDragStart: (node: FileNode) => void
  onDragEnd: () => void
  /** The folder a drop would land in, or null where a drop would do nothing. */
  onDragOver: (dir: string | null) => void
  onDrop: (dir: string) => void
  /** Resting over a shut folder opens it, so nested folders stay reachable. */
  onDragExpand: (path: string) => void
}

export interface TreeState {
  expanded: Set<string>
  selectedPath: string | null
  renamingPath: string | null
  contextPath: string | null
  /** The row the keyboard is on, which is not always the open file. */
  cursorPath: string | null
  /** Bumped only when the cursor moved by keyboard, so clicks never steal focus. */
  cursorToken: number
  /** Every row that is marked, which a command acts on all at once. */
  marked: Set<string>
  /** The single row that is reachable with Tab. */
  tabbablePath: string | null
  draft: Draft | null
  drag: DragState
}

interface TreeProps extends TreeCallbacks {
  nodes: FileNode[]
  parentPath: string
  depth: number
  state: TreeState
}

const INDENT = 13
const BASE_PAD = 6
/** Long enough that crossing a folder on the way elsewhere is not a command. */
const HOVER_EXPAND_DELAY = 600
/**
 * A drag has to carry something or the platform may refuse to start it, and it
 * must not carry text: dropped on the editor, text/plain would type an absolute
 * path into the note. Nothing ever reads this back — the path travels through
 * React state, which a dragover can see and the payload cannot.
 */
const DRAG_TYPE = 'application/x-nanomark-entry'

export function Tree(props: TreeProps): React.JSX.Element {
  const { nodes, parentPath, depth, state } = props
  const showDraft = state.draft !== null && samePath(state.draft.parentPath, parentPath)
  const isRoot = depth === 0

  const rows = (
    <>
      {showDraft && state.draft ? (
        <NameInput
          depth={depth}
          kind={state.draft.kind}
          initial=""
          label={state.draft.kind === 'dir' ? 'New folder name' : 'New file name'}
          onSubmit={props.onDraftSubmit}
          onCancel={props.onDraftCancel}
        />
      ) : null}

      {nodes.map((node) => (
        <TreeRow key={node.path} {...props} node={node} />
      ))}

      {nodes.length === 0 && !showDraft && isRoot ? (
        <p className="tree-empty">
          No markdown files here yet. Press <kbd>{MOD}</kbd> <kbd>N</kbd> to write the first one.
        </p>
      ) : null}
    </>
  )

  if (!isRoot) {
    return (
      <div className="tree-children" role="group">
        {rows}
      </div>
    )
  }

  return (
    <div
      className="tree-children"
      role="tree"
      aria-label="Files in this folder"
      aria-multiselectable="true"
      onKeyDown={props.onTreeKeyDown}
    >
      {rows}
    </div>
  )
}

function TreeRow(props: TreeProps & { node: FileNode }): React.JSX.Element {
  const { node, depth, state } = props
  const ref = useRef<HTMLButtonElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDir = node.kind === 'dir'
  const isOpen = isDir && state.expanded.has(node.path)
  const isSelected = samePath(state.selectedPath, node.path)
  const isCursor = samePath(state.cursorPath, node.path)
  const { cursorToken } = state

  // A file is not a destination. Dropping on one means the folder it sits in,
  // which is what makes a row at the top level the way back out of a folder.
  const dropDir = isDir ? node.path : dirName(node.path)
  const accepts = canDropInto(state.drag.paths, dropDir)
  const isDragging = state.drag.paths.some((inFlight) => samePath(inFlight, node.path))
  const isMarked = state.marked.has(node.path)
  // Only a folder lights up, so a drop aimed at a file still shows the folder
  // that is about to receive it.
  const isDropTarget = isDir && samePath(state.drag.dropDir, node.path)

  // Follows the keyboard, never the mouse: a click has already moved focus.
  useEffect(() => {
    if (isCursor && cursorToken > 0) ref.current?.focus()
  }, [isCursor, cursorToken])

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    []
  )

  const stopHoverExpand = (): void => {
    if (!hoverTimer.current) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }

  if (samePath(state.renamingPath, node.path)) {
    return (
      <NameInput
        depth={depth}
        kind={node.kind}
        initial={node.name}
        label={`Rename ${node.name}`}
        onSubmit={(name) => props.onRenameSubmit(node.path, name)}
        onCancel={props.onRenameCancel}
      />
    )
  }

  return (
    <>
      <button
        type="button"
        ref={ref}
        className="tree-item"
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isMarked}
        aria-expanded={isDir ? isOpen : undefined}
        tabIndex={samePath(state.tabbablePath, node.path) ? 0 : -1}
        data-marked={isMarked ? 'true' : undefined}
        data-selected={isSelected ? 'true' : undefined}
        data-context={samePath(state.contextPath, node.path) ? 'true' : undefined}
        data-dragging={isDragging ? 'true' : undefined}
        data-drop={isDropTarget ? 'true' : undefined}
        style={{ paddingLeft: BASE_PAD + depth * INDENT }}
        draggable
        onClick={(event) => {
          props.onCursor(node.path)
          props.onActivate(node, {
            range: event.shiftKey,
            toggle: event.ctrlKey || event.metaKey
          })
        }}
        onFocus={() => props.onCursor(node.path)}
        onContextMenu={(event) => props.onContext(event, node)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData(DRAG_TYPE, node.name)
          props.onDragStart(node)
        }}
        onDragEnd={() => {
          stopHoverExpand()
          props.onDragEnd()
        }}
        onDragOver={(event) => {
          // Nothing of ours is moving, so this came from outside the app. Leave
          // it to the sidebar, which turns the whole panel down at once.
          if (state.drag.paths.length === 0) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = accepts ? 'move' : 'none'
          props.onDragOver(accepts ? dropDir : null)
          if (isDir && !isOpen && !isDragging && !hoverTimer.current) {
            hoverTimer.current = setTimeout(() => {
              hoverTimer.current = null
              props.onDragExpand(node.path)
            }, HOVER_EXPAND_DELAY)
          }
        }}
        onDragLeave={stopHoverExpand}
        onDrop={(event) => {
          if (state.drag.paths.length === 0) return
          event.preventDefault()
          event.stopPropagation()
          stopHoverExpand()
          if (accepts) props.onDrop(dropDir)
          props.onDragEnd()
        }}
        title={node.name}
      >
        <span className="tree-item__chevron" data-open={isOpen ? 'true' : undefined}>
          {isDir ? <ChevronRight /> : null}
        </span>
        <span className="tree-item__icon">{isDir ? <FolderIcon /> : <FileIcon />}</span>
        <span className="tree-item__label">{node.name}</span>
      </button>

      {isDir && isOpen ? (
        <Tree {...props} nodes={node.children ?? []} parentPath={node.path} depth={depth + 1} />
      ) : null}
    </>
  )
}

interface NameInputProps {
  depth: number
  kind: NodeKind
  initial: string
  label: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

function NameInput({
  depth,
  kind,
  initial,
  label,
  onSubmit,
  onCancel
}: NameInputProps): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    // Preselect the stem so renaming does not fight with the extension.
    const dot = initial.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  const settle = (commit: boolean): void => {
    if (settled.current) return
    settled.current = true
    const value = ref.current?.value.trim() ?? ''
    if (commit && value && value !== initial) onSubmit(value)
    else onCancel()
  }

  return (
    <div className="tree-item" style={{ paddingLeft: BASE_PAD + depth * INDENT }}>
      <span className="tree-item__chevron" />
      <span className="tree-item__icon">{kind === 'dir' ? <FolderIcon /> : <FileIcon />}</span>
      <input
        className="tree-item__input"
        ref={ref}
        aria-label={label}
        defaultValue={initial}
        spellCheck={false}
        onBlur={() => settle(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') settle(true)
          if (event.key === 'Escape') settle(false)
          event.stopPropagation()
        }}
      />
    </div>
  )
}
