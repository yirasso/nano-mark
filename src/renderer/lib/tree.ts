import type { FileNode } from '@shared/types'
import { samePath } from './paths'

/** One row as the keyboard sees it: flat, in the order they appear on screen. */
export interface VisibleRow {
  node: FileNode
  depth: number
  parentPath: string | null
}

/**
 * Every row currently on screen, so arrow keys can walk the tree without the
 * caller having to re-derive the recursion.
 */
export function flattenVisible(
  nodes: FileNode[],
  expanded: Set<string>,
  depth = 0,
  parentPath: string | null = null
): VisibleRow[] {
  const rows: VisibleRow[] = []
  for (const node of nodes) {
    rows.push({ node, depth, parentPath })
    if (node.kind === 'dir' && expanded.has(node.path)) {
      rows.push(...flattenVisible(node.children ?? [], expanded, depth + 1, node.path))
    }
  }
  return rows
}

/** Whether a path is still in the tree, so an open file can notice it is gone. */
export function findNode(nodes: FileNode[], target: string): FileNode | null {
  for (const node of nodes) {
    if (samePath(node.path, target)) return node
    if (node.children) {
      const hit = findNode(node.children, target)
      if (hit) return hit
    }
  }
  return null
}
