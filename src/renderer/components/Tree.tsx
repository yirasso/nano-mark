import { useEffect, useRef } from 'react'
import type { FileNode, NodeKind } from '@shared/types'
import { samePath } from '../lib/paths'
import { ChevronRight, FileIcon, FolderIcon } from './Icons'

export interface Draft {
  parentPath: string
  kind: NodeKind
}

export interface TreeCallbacks {
  onToggle: (path: string) => void
  onSelect: (node: FileNode) => void
  onContext: (event: React.MouseEvent, node: FileNode) => void
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

  return (
    <div className="tree-children">
      {showDraft && state.draft ? (
        <NameInput
          depth={depth}
          kind={state.draft.kind}
          initial=""
          onSubmit={props.onDraftSubmit}
          onCancel={props.onDraftCancel}
        />
      ) : null}

      {nodes.map((node) => (
        <TreeRow key={node.path} {...props} node={node} />
      ))}

      {nodes.length === 0 && !showDraft && depth === 0 ? (
        <div className="tree-empty">Empty</div>
      ) : null}
    </div>
  )
}

function TreeRow(props: TreeProps & { node: FileNode }): React.JSX.Element {
  const { node, depth, state } = props
  const isDir = node.kind === 'dir'
  const isOpen = isDir && state.expanded.has(node.path)
  const isSelected = samePath(state.selectedPath, node.path)

  if (samePath(state.renamingPath, node.path)) {
    return (
      <NameInput
        depth={depth}
        kind={node.kind}
        initial={node.name}
        onSubmit={(name) => props.onRenameSubmit(node.path, name)}
        onCancel={props.onRenameCancel}
      />
    )
  }

  return (
    <>
      <button
        type="button"
        className="tree-item"
        data-selected={isSelected ? 'true' : undefined}
        data-context={samePath(state.contextPath, node.path) ? 'true' : undefined}
        style={{ paddingLeft: BASE_PAD + depth * INDENT }}
        onClick={() => (isDir ? props.onToggle(node.path) : props.onSelect(node))}
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
  onSubmit: (name: string) => void
  onCancel: () => void
}

function NameInput({ depth, kind, initial, onSubmit, onCancel }: NameInputProps): React.JSX.Element {
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
