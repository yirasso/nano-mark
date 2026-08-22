import path from 'node:path'
import fs from 'node:fs/promises'

/**
 * The security boundary of the app. The renderer sends arbitrary strings over IPC;
 * nothing touches the disk before passing through here.
 *
 * There is exactly one open worktree, resolved to its real (symlink-free)
 * location once, when it is opened.
 */
let worktree: string | null = null

export async function registerWorktree(rootPath: string): Promise<string> {
  worktree = await fs.realpath(path.resolve(rootPath))
  return worktree
}

export function clearWorktree(): void {
  worktree = null
}

export function currentWorktree(): string | null {
  return worktree
}

/** True when `child` is `parent` itself or lives somewhere beneath it. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  if (rel === '') return true
  if (path.isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith('..' + path.sep)
}

/**
 * Resolves the real path of the deepest existing ancestor and re-appends the
 * missing tail, so a path that does not exist yet (a file about to be created)
 * can still be checked against symlink escapes.
 */
export async function resolveReal(target: string): Promise<string> {
  let current = path.resolve(target)
  const tail: string[] = []
  for (;;) {
    try {
      const real = await fs.realpath(current)
      return tail.length ? path.join(real, ...tail) : real
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(target)
      tail.unshift(path.basename(current))
      current = parent
    }
  }
}

/**
 * Throws unless `target` resolves inside the open worktree. Returns the resolved
 * real path, which is what callers should actually use.
 */
export async function assertInsideWorktree(
  target: string,
  root: string | null = currentWorktree()
): Promise<string> {
  if (typeof target !== 'string' || target.length === 0) {
    throw new Error('Invalid path')
  }
  if (!root) {
    throw new Error('No worktree is open')
  }
  const resolved = await resolveReal(target)
  if (!isInside(root, resolved)) {
    throw new Error(`Path is outside the worktree: ${target}`)
  }
  return resolved
}

const INVALID_NAME_CHARS = /[<>:"/\\|?*]/
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

function hasControlChar(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    if (name.charCodeAt(i) < 32) return true
  }
  return false
}

/** Rejects names that are illegal on Windows, or that would escape their parent. */
export function isValidFileName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name === '.' || name === '..') return false
  if (INVALID_NAME_CHARS.test(name)) return false
  if (hasControlChar(name)) return false
  if (RESERVED_WINDOWS_NAMES.test(name)) return false
  if (name.endsWith('.') || name.endsWith(' ')) return false
  return true
}

export function assertValidFileName(name: string): void {
  if (!isValidFileName(name)) {
    throw new Error(`"${name}" is not a valid name`)
  }
}
