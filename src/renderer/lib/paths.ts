import type { MovedEntry } from '@shared/types'

const CASE_INSENSITIVE = window.nano.platform === 'win32' || window.nano.platform === 'darwin'

const SEPARATORS = /[\\/]+$/

/** Path equality that matches how the underlying filesystem actually behaves. */
export function samePath(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return CASE_INSENSITIVE ? a.toLowerCase() === b.toLowerCase() : a === b
}

function lastSeparator(target: string): number {
  return Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))
}

export function baseName(target: string): string {
  const cleaned = target.replace(SEPARATORS, '')
  const index = lastSeparator(cleaned)
  return index === -1 ? cleaned : cleaned.slice(index + 1)
}

export function dirName(target: string): string {
  const cleaned = target.replace(SEPARATORS, '')
  const index = lastSeparator(cleaned)
  return index <= 0 ? cleaned : cleaned.slice(0, index)
}

/** Strips the markdown extension for display, so titles read like titles. */
export function displayName(target: string): string {
  return baseName(target).replace(/\.(md|markdown|mdown|mkd)$/i, '')
}

/**
 * Every directory between a root and an entry, so the tree can be unfolded all
 * the way down to something the user picked out of a search result.
 */
export function ancestorsWithin(target: string, rootPath: string): string[] {
  const chain: string[] = []
  let current = dirName(target)

  while (current.length > rootPath.length && startsWithPath(current, rootPath)) {
    chain.push(current)
    const next = dirName(current)
    if (next === current) break
    current = next
  }

  return chain
}

/**
 * The folders between the worktree and an entry, outermost first, so the header
 * can read like GitHub's breadcrumb instead of a bare filename.
 */
export function relativeSegments(
  target: string,
  rootPath: string
): { name: string; path: string }[] {
  return ancestorsWithin(target, rootPath)
    .reverse()
    .map((dir) => ({ name: baseName(dir), path: dir }))
}

/** Prefix test that respects the filesystem's case rules. */
export function startsWithPath(target: string, prefix: string): boolean {
  return CASE_INSENSITIVE
    ? target.toLowerCase().startsWith(prefix.toLowerCase())
    : target.startsWith(prefix)
}

/**
 * Whether `target` lives somewhere below `parent` — on a separator
 * boundary, so /notes-old is never read as something inside /notes.
 */
export function isUnder(target: string, parent: string): boolean {
  if (!startsWithPath(target, parent)) return false
  const rest = target.slice(parent.length)
  return rest.startsWith('/') || rest.startsWith('\\')
}

/**
 * The same entry as seen after `from` moved to `to`, or null when it was
 * neither `from` nor anything under it. A folder that moves takes every path
 * the session is holding — the open file, the unfolded folders — along with it.
 */
export function rebasePath(target: string, from: string, to: string): string | null {
  if (samePath(target, from)) return to
  if (!isUnder(target, from)) return null
  return to + target.slice(from.length)
}

/**
 * The same entry after a batch of moves, or null when none of them touched it.
 */
export function rebaseAcross(target: string, moves: MovedEntry[]): string | null {
  for (const move of moves) {
    const next = rebasePath(target, move.from, move.to)
    if (next !== null) return next
  }
  return null
}

/**
 * The entries in a selection that carry the others: anything already inside a
 * selected folder is dropped, because moving or deleting the folder takes it
 * along and acting on it separately would be acting on a path that is gone.
 */
export function topLevelPaths(paths: string[]): string[] {
  return paths.filter((target) => !paths.some((other) => isUnder(target, other)))
}

/**
 * Whether dropping `sources` into `dir` would mean anything: nothing may land
 * inside itself, and a batch already sitting in that folder is not a move.
 */
export function canDropInto(sources: string[], dir: string): boolean {
  if (sources.length === 0) return false
  if (sources.some((source) => samePath(source, dir) || isUnder(dir, source))) return false
  return sources.some((source) => !samePath(dirName(source), dir))
}
