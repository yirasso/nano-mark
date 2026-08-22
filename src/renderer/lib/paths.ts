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

/** Prefix test that respects the filesystem's case rules. */
export function startsWithPath(target: string, prefix: string): boolean {
  return CASE_INSENSITIVE
    ? target.toLowerCase().startsWith(prefix.toLowerCase())
    : target.startsWith(prefix)
}
