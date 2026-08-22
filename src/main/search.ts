import path from 'node:path'
import fs from 'node:fs/promises'
import {
  EMPTY_SEARCH,
  type FileNode,
  type SearchMatch,
  type SearchResponse,
  type Worktree
} from '@shared/types'
import { buildTree } from './fs-tree'

/**
 * Everything here is bounded on purpose. A search that scans a whole vault has
 * to stay cheap enough to run on every keystroke, so it caps how much it reads,
 * how much it returns, and how many files it opens at once.
 */
const MAX_ENTRY_RESULTS = 40
const MAX_CONTENT_RESULTS = 60
const MAX_MATCHES_PER_FILE = 3
const MAX_FILE_BYTES = 1_000_000
const SNIPPET_RADIUS = 44
const READ_CONCURRENCY = 8

/** One character matches half the vault, so content scanning waits for two. */
const MIN_CONTENT_QUERY = 2

interface Candidate {
  node: FileNode
  /** Folder inside the worktree, already formatted for display. */
  location: string
}

export async function runSearch(
  rawQuery: string,
  worktree: Worktree | null
): Promise<SearchResponse> {
  const query = rawQuery.trim()
  if (!query || !worktree) return EMPTY_SEARCH

  const needle = query.toLowerCase()
  const candidates: Candidate[] = []
  collect(await buildTree(worktree.path), worktree.path, candidates)

  const entries = matchNames(candidates, needle)
  const content =
    needle.length >= MIN_CONTENT_QUERY
      ? await matchContent(
          candidates.filter((candidate) => candidate.node.kind === 'file'),
          needle
        )
      : { matches: [], truncated: false }

  return {
    query,
    entries: entries.matches,
    content: content.matches,
    truncated: entries.truncated || content.truncated
  }
}

function collect(nodes: FileNode[], rootPath: string, out: Candidate[]): void {
  for (const node of nodes) {
    out.push({ node, location: locationOf(rootPath, node.path) })
    if (node.children) collect(node.children, rootPath, out)
  }
}

/** Where an entry lives, as a person would read it. Empty at the top level. */
function locationOf(rootPath: string, target: string): string {
  const relative = path.relative(rootPath, path.dirname(target))
  if (!relative || relative === '.') return ''
  return relative.split(path.sep).join(' / ')
}

/**
 * Lower is better: a name that starts with the query beats one that has it at a
 * word boundary, which beats one that merely contains it somewhere.
 */
function rank(name: string, needle: string): number {
  const index = name.toLowerCase().indexOf(needle)
  if (index === -1) return -1
  if (index === 0) return 0
  return /[^a-z0-9]/i.test(name[index - 1] ?? '') ? 1 : 2
}

function matchNames(
  candidates: Candidate[],
  needle: string
): { matches: SearchMatch[]; truncated: boolean } {
  const scored: Array<{ rank: number; match: SearchMatch }> = []

  for (const candidate of candidates) {
    const score = rank(candidate.node.name, needle)
    if (score === -1) continue
    scored.push({
      rank: score,
      match: {
        kind: candidate.node.kind,
        path: candidate.node.path,
        name: candidate.node.name,
        location: candidate.location
      }
    })
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.match.name.length !== b.match.name.length) {
      return a.match.name.length - b.match.name.length
    }
    return a.match.name.localeCompare(b.match.name, undefined, { sensitivity: 'base' })
  })

  return {
    matches: scored.slice(0, MAX_ENTRY_RESULTS).map((entry) => entry.match),
    truncated: scored.length > MAX_ENTRY_RESULTS
  }
}

async function matchContent(
  files: Candidate[],
  needle: string
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  // Files are read concurrently but parked in their own slot, so the same query
  // always comes back in the same order rather than in whatever order the disk
  // happened to answer.
  const slots: Array<SearchMatch[] | undefined> = new Array(files.length)
  let next = 0
  let harvested = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      if (harvested >= MAX_CONTENT_RESULTS) return
      const index = next
      next += 1
      if (index >= files.length) return

      const found = await scanFile(files[index], needle)
      if (found.length === 0) continue
      slots[index] = found
      harvested += found.length
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, files.length) }, () => worker())
  )

  const matches: SearchMatch[] = []
  let truncated = next < files.length

  for (const found of slots) {
    if (!found) continue
    for (const match of found) {
      if (matches.length >= MAX_CONTENT_RESULTS) {
        truncated = true
        return { matches, truncated }
      }
      matches.push(match)
    }
  }

  return { matches, truncated }
}

async function scanFile(candidate: Candidate, needle: string): Promise<SearchMatch[]> {
  let handle
  try {
    handle = await fs.open(candidate.node.path, 'r')
    const stat = await handle.stat()
    if (stat.size > MAX_FILE_BYTES) return []
    const raw = await handle.readFile('utf8')

    // Split the way CodeMirror does, so line numbers line up with the editor.
    const lines = raw.split(/\r?\n/)
    const found: SearchMatch[] = []

    for (let i = 0; i < lines.length && found.length < MAX_MATCHES_PER_FILE; i += 1) {
      const line = lines[i]
      const column = line.toLowerCase().indexOf(needle)
      if (column === -1) continue
      found.push({
        kind: 'content',
        path: candidate.node.path,
        name: candidate.node.name,
        location: candidate.location,
        line: i + 1,
        column,
        length: needle.length,
        ...snippetAround(line, column, needle.length)
      })
    }

    return found
  } catch {
    // Unreadable or gone; it simply does not match.
    return []
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** A trimmed window around the hit, with the match offsets kept in sync. */
function snippetAround(
  line: string,
  column: number,
  length: number
): { snippet: string; snippetStart: number; snippetEnd: number } {
  const start = Math.max(0, column - SNIPPET_RADIUS)
  const end = Math.min(line.length, column + length + SNIPPET_RADIUS)

  const slice = line.slice(start, end)
  const leading = slice.length - slice.trimStart().length
  const body = slice.trim()

  const prefix = start + leading > 0 ? '…' : ''
  const suffix = end < line.length ? '…' : ''
  const snippetStart = prefix.length + (column - start - leading)

  return {
    snippet: prefix + body + suffix,
    snippetStart,
    snippetEnd: snippetStart + length
  }
}
