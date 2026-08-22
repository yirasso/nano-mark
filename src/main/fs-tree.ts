import path from 'node:path'
import fs from 'node:fs/promises'
import { isMarkdownPath, type FileNode } from '@shared/types'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.obsidian',
  '$RECYCLE.BIN',
  'System Volume Information'
])

/** Guards against pathological trees and symlink loops. */
const MAX_DEPTH = 12

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name) || (name.startsWith('.') && name !== '.')
}

/** Directories first, then files, each A-Z and case-insensitive. */
export function sortNodes(nodes: FileNode[]): FileNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

export async function buildTree(dir: string, depth = 0): Promise<FileNode[]> {
  if (depth > MAX_DEPTH) return []

  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    // Permission denied, or the folder vanished mid-scan.
    return []
  }

  const nodes: FileNode[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue
      nodes.push({
        path: full,
        name: entry.name,
        kind: 'dir',
        children: await buildTree(full, depth + 1)
      })
    } else if (entry.isFile() && isMarkdownPath(entry.name)) {
      nodes.push({ path: full, name: entry.name, kind: 'file' })
    }
  }

  return sortNodes(nodes)
}
