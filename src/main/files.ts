import path from 'node:path'
import fs from 'node:fs/promises'
import { shell } from 'electron'
import {
  isMarkdownPath,
  type DocumentPayload,
  type MoveResult,
  type NodeKind,
  type WriteResult
} from '@shared/types'
import { messageOf } from './errors'
import { assertInsideWorktree, assertValidFileName, isInside } from './paths'

/**
 * Writes we made ourselves, so the watcher can tell them apart from an edit
 * made in another program. Without this the app reloads its own saves forever.
 */
const selfWrites = new Map<string, { mtimeMs: number; at: number }>()
const SELF_WRITE_TTL = 5000

/** Line endings as found on disk, so saving a CRLF file does not rewrite every line. */
const lineEndings = new Map<string, string>()

export function consumeSelfWrite(target: string, mtimeMs: number): boolean {
  const entry = selfWrites.get(target)
  if (!entry) return false
  if (Date.now() - entry.at > SELF_WRITE_TTL) {
    selfWrites.delete(target)
    return false
  }
  if (entry.mtimeMs !== mtimeMs) return false
  selfWrites.delete(target)
  return true
}

export async function readDocument(target: string): Promise<DocumentPayload> {
  const real = await assertInsideWorktree(target)
  const raw = await fs.readFile(real, 'utf8')
  const stat = await fs.stat(real)
  lineEndings.set(real, raw.includes('\r\n') ? '\r\n' : '\n')
  return {
    path: real,
    content: raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw,
    mtimeMs: stat.mtimeMs
  }
}

export async function writeDocument(target: string, content: string): Promise<WriteResult> {
  const real = await assertInsideWorktree(target)
  const eol = lineEndings.get(real) ?? '\n'
  const out = eol === '\n' ? content : content.replace(/\r?\n/g, eol)
  await fs.writeFile(real, out, 'utf8')
  const stat = await fs.stat(real)
  selfWrites.set(real, { mtimeMs: stat.mtimeMs, at: Date.now() })
  return { mtimeMs: stat.mtimeMs }
}

export async function createEntry(parentDir: string, name: string, kind: NodeKind): Promise<string> {
  assertValidFileName(name)
  const realParent = await assertInsideWorktree(parentDir)
  const finalName = kind === 'file' && !isMarkdownPath(name) ? `${name}.md` : name
  const target = path.join(realParent, finalName)

  if (await exists(target)) {
    throw new Error(`"${finalName}" already exists`)
  }

  if (kind === 'dir') {
    await fs.mkdir(target)
  } else {
    await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' })
  }
  return target
}

/** Whether an entry is a folder, so the caller can word a warning correctly. */
export async function entryKind(target: string): Promise<NodeKind> {
  const real = await assertInsideWorktree(target)
  const stat = await fs.stat(real)
  return stat.isDirectory() ? 'dir' : 'file'
}

export async function renameEntry(target: string, newName: string): Promise<string> {
  assertValidFileName(newName)
  const real = await assertInsideWorktree(target)
  const stat = await fs.stat(real)
  // Renaming a note to a bare stem used to drop it out of the tree while it was
  // still open in the editor. Creating one already appends the extension; this
  // is the same rule, applied at the other end.
  const finalName =
    !stat.isDirectory() && isMarkdownPath(real) && !isMarkdownPath(newName)
      ? `${newName}.md`
      : newName
  const next = path.join(path.dirname(real), finalName)
  if (next === real) return real
  if (await exists(next)) {
    throw new Error(`"${finalName}" already exists`)
  }
  await fs.rename(real, next)
  moveLineEndings(real, next)
  return next
}

/**
 * Moves an entry into another folder. The name never changes here — only the
 * parent does — which is the half of renaming that a drag can express.
 */
export async function moveEntry(target: string, destDir: string): Promise<string> {
  const real = await assertInsideWorktree(target)
  const realDest = await assertInsideWorktree(destDir)

  const stat = await fs.stat(realDest)
  if (!stat.isDirectory()) {
    throw new Error(`"${path.basename(realDest)}" is not a folder`)
  }
  // rename() would happily move a folder inside itself, and take the whole
  // subtree out of reach with it.
  if (isInside(real, realDest)) {
    throw new Error(`"${path.basename(real)}" cannot go inside itself`)
  }

  const next = path.join(realDest, path.basename(real))
  if (next === real) return real
  if (await exists(next)) {
    throw new Error(`"${path.basename(real)}" is already in that folder`)
  }

  await fs.rename(real, next)
  moveLineEndings(real, next)
  return next
}

/**
 * The same, for however many entries were dragged at once. Each one is its own
 * operation: a name already taken at the destination stops that entry and none
 * of the others, and the caller is told which is which.
 */
export async function moveEntries(targets: string[], destDir: string): Promise<MoveResult> {
  const result: MoveResult = { moved: [], failed: [] }
  for (const target of targets) {
    try {
      const to = await moveEntry(target, destDir)
      // Already there is not a move, and saying so would be a lie.
      if (to !== target) result.moved.push({ from: target, to })
    } catch (error) {
      result.failed.push({ path: target, message: messageOf(error) })
    }
  }
  return result
}

/**
 * Re-points remembered line endings after a path moved, the subtree with it, so
 * a CRLF file that travelled inside a folder is still written back as CRLF.
 */
function moveLineEndings(from: string, to: string): void {
  for (const [key, eol] of [...lineEndings]) {
    if (key === from) {
      lineEndings.delete(key)
      lineEndings.set(to, eol)
    } else if (isInside(from, key)) {
      lineEndings.delete(key)
      lineEndings.set(path.join(to, path.relative(from, key)), eol)
    }
  }
}

export async function trashEntry(target: string): Promise<void> {
  const real = await assertInsideWorktree(target)
  await shell.trashItem(real)
  lineEndings.delete(real)
}

export async function revealEntry(target: string): Promise<void> {
  const real = await assertInsideWorktree(target)
  shell.showItemInFolder(real)
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
