export type NodeKind = 'file' | 'dir'

export interface FileNode {
  /** Absolute path on disk. Also the React key — unique by definition. */
  path: string
  name: string
  kind: NodeKind
  /** Only present on directories. */
  children?: FileNode[]
}

/**
 * The single folder the app is pointed at. Everything the app can see, search,
 * open or write lives inside it; changing it swaps the whole session.
 */
export interface Worktree {
  path: string
  name: string
}

/** Follows the OS until the user picks a side. */
export type ThemeSource = 'system' | 'light' | 'dark'

export interface DocumentPayload {
  path: string
  content: string
  mtimeMs: number
}

export interface WriteResult {
  mtimeMs: number
}

export interface FileChangedEvent {
  path: string
  mtimeMs: number
}

/** Extensions that show up in the tree. Everything else is invisible. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const

export function isMarkdownPath(p: string): boolean {
  const lower = p.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export type SearchKind = 'file' | 'dir' | 'content'

export interface SearchMatch {
  kind: SearchKind
  /** Absolute path of the file or folder the match belongs to. */
  path: string
  name: string
  /** Folder inside the worktree, formatted for display. Empty at the top level. */
  location: string
  /** Content matches only. */
  line?: number
  column?: number
  length?: number
  snippet?: string
  snippetStart?: number
  snippetEnd?: number
}

export interface SearchResponse {
  query: string
  entries: SearchMatch[]
  content: SearchMatch[]
  /** True when results were capped, so the UI can say so instead of lying. */
  truncated: boolean
}

export const EMPTY_SEARCH: SearchResponse = {
  query: '',
  entries: [],
  content: [],
  truncated: false
}
