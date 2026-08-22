import { useEffect, useRef } from 'react'
import type { FileNode, NodeKind } from '@shared/types'
import { samePath } from '../lib/paths'
import { MOD } from '../lib/platform'
import { ChevronRight, FileIcon, FolderIcon } from './Icons'

export interface Draft {
  parentPath: string
  kind: NodeKind
}

export interface TreeCallbacks {
  onToggle: (path: string) => void
  onSelect: (node: FileNode) => void
  onContext: (event: React.MouseEvent, node: FileNode) => void
  onCursor: (path: string) => void
  onTreeKeyDown: (event: React.KeyboardEvent) => void
  onRenameSubmit: (path: string, name: string) => void
  onRenameCancel: () => void
  onDraftSubmit: (name: string) => void
  onDraftCancel: () => void
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
  /** The single row that is reachable with Tab. */
  tabbablePath: string | null
  draft: Draft | null
}

interface TreeProps extends TreeCallbacks {
  nodes: FileNode[]
  parentPath: string
  depth: number
  state: TreeState
}

const INDENT = 13
const BASE_PAD = 6

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
      onKeyDown={props.onTreeKeyDown}
    >
      {rows}
    </div>
  )
}

function TreeRow(props: TreeProps & { node: FileNode }): React.JSX.Element {
  const { node, depth, state } = props
  const ref = useRef<HTMLButtonElement>(null)
  const isDir = node.kind === 'dir'
  const isOpen = isDir && state.expanded.has(node.path)
  const isSelected = samePath(state.selectedPath, node.path)
  const isCursor = samePath(state.cursorPath, node.path)
  const { cursorToken } = state

  // Follows the keyboard, never the mouse: a click has already moved focus.
  useEffect(() => {
    if (isCursor && cursorToken > 0) ref.current?.focus()
  }, [isCursor, cursorToken])

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
        aria-selected={isSelected}
        aria-expanded={isDir ? isOpen : undefined}
        tabIndex={samePath(state.tabbablePath, node.path) ? 0 : -1}
        data-selected={isSelected ? 'true' : undefined}
        data-context={samePath(state.contextPath, node.path) ? 'true' : undefined}
        style={{ paddingLeft: BASE_PAD + depth * INDENT }}
        onClick={() => {
          props.onCursor(node.path)
          if (isDir) props.onToggle(node.path)
          else props.onSelect(node)
        }}
        onFocus={() => props.onCursor(node.path)}
        onContextMenu={(event) => props.onContext(event, node)}
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
