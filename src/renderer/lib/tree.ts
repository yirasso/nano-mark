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

/**
 * Every row between two others, as they appear on screen. This is what a
 * shift-click means: the rows in between, not the entries in between, so a
 * folded folder keeps everything inside it out of the reckoning.
 *
 * An anchor that has since been folded away leaves only the row that was
 * clicked, which is the same thing an ordinary click would have done.
 */
export function rangeBetween(rows: VisibleRow[], from: string, to: string): string[] {
  const start = rows.findIndex((row) => samePath(row.node.path, from))
  const end = rows.findIndex((row) => samePath(row.node.path, to))
  if (end === -1) return []
  if (start === -1) return [rows[end].node.path]
  const [first, last] = start <= end ? [start, end] : [end, start]
  return rows.slice(first, last + 1).map((row) => row.node.path)
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
