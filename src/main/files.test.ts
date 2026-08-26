import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const trashed: string[] = []
vi.mock('electron', () => ({
  shell: {
    trashItem: (target: string) => {
      trashed.push(target)
      return fs.rm(target, { recursive: true, force: true })
    },
    showItemInFolder: () => undefined
  }
}))

const {
  consumeSelfWrite,
  createEntry,
  moveEntries,
  moveEntry,
  readDocument,
  renameEntry,
  trashEntry,
  writeDocument
} = await import('./files')
const { registerWorktree } = await import('./paths')

let root = ''

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-files-')))
  await registerWorktree(root)
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('readDocument', () => {
  it('strips a byte order mark', async () => {
    const target = path.join(root, 'bom.md')
    await fs.writeFile(target, '﻿# heading', 'utf8')
    const doc = await readDocument(target)
    expect(doc.content).toBe('# heading')
    expect(doc.mtimeMs).toBeGreaterThan(0)
  })

  it('refuses to read outside the worktree', async () => {
    await expect(readDocument(path.join(os.tmpdir(), 'nope.md'))).rejects.toThrow(/outside/)
  })
})

describe('writeDocument', () => {
  it('round-trips content', async () => {
    const target = path.join(root, 'note.md')
    await fs.writeFile(target, 'first', 'utf8')
    await readDocument(target)
    await writeDocument(target, 'second')
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('second')
  })

  it('preserves the line endings the file already had', async () => {
    const target = path.join(root, 'crlf.md')
    await fs.writeFile(target, 'one\r\ntwo\r\n', 'utf8')

    const doc = await readDocument(target)
    expect(doc.content).toBe('one\r\ntwo\r\n')

    // CodeMirror hands back LF; the file should stay CRLF.
    await writeDocument(target, 'one\ntwo\nthree\n')
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('marks its own write so the watcher can ignore it', async () => {
    const target = path.join(root, 'self.md')
    await fs.writeFile(target, 'x', 'utf8')
    await readDocument(target)
    const result = await writeDocument(target, 'y')

    expect(consumeSelfWrite(target, result.mtimeMs)).toBe(true)
    // Only once, and never for a different modification time.
    expect(consumeSelfWrite(target, result.mtimeMs)).toBe(false)
    expect(consumeSelfWrite(target, result.mtimeMs + 1000)).toBe(false)
  })

  it('refuses to write outside the worktree', async () => {
    await expect(writeDocument(path.join(os.tmpdir(), 'nope.md'), 'x')).rejects.toThrow(/outside/)
  })
})

describe('createEntry', () => {
  it('adds the markdown extension when it is missing', async () => {
    const created = await createEntry(root, 'fresh', 'file')
    expect(path.basename(created)).toBe('fresh.md')
    await expect(fs.readFile(created, 'utf8')).resolves.toBe('')
  })

  it('leaves an explicit markdown extension alone', async () => {
    const created = await createEntry(root, 'explicit.markdown', 'file')
    expect(path.basename(created)).toBe('explicit.markdown')
  })

  it('creates folders', async () => {
    const created = await createEntry(root, 'sub', 'dir')
    await expect(fs.stat(created).then((s) => s.isDirectory())).resolves.toBe(true)
  })

  it('refuses to clobber an existing entry', async () => {
    await createEntry(root, 'once', 'file')
    await expect(createEntry(root, 'once', 'file')).rejects.toThrow(/already exists/)
  })

  it('rejects a name that would escape the parent', async () => {
    await expect(createEntry(root, '../escape.md', 'file')).rejects.toThrow(/not a valid name/)
  })
})

describe('renameEntry', () => {
  it('renames within the same folder', async () => {
    const created = await createEntry(root, 'before', 'file')
    const renamed = await renameEntry(created, 'after.md')
    expect(path.basename(renamed)).toBe('after.md')
    await expect(fs.access(created)).rejects.toThrow()
  })

  it('refuses to overwrite an existing name', async () => {
    const a = await createEntry(root, 'keep-a', 'file')
    await createEntry(root, 'keep-b', 'file')
    await expect(renameEntry(a, 'keep-b.md')).rejects.toThrow(/already exists/)
  })

  it('rejects a name containing a separator', async () => {
    const created = await createEntry(root, 'movable', 'file')
    await expect(renameEntry(created, 'sub/moved.md')).rejects.toThrow(/not a valid name/)
  })

  it('keeps a note in the tree when it is renamed to a bare stem', async () => {
    const created = await createEntry(root, 'notes', 'file')
    const renamed = await renameEntry(created, 'journal')
    expect(path.basename(renamed)).toBe('journal.md')
  })

  it('leaves folder names alone', async () => {
    const created = await createEntry(root, 'archive', 'dir')
    const renamed = await renameEntry(created, 'attic')
    expect(path.basename(renamed)).toBe('attic')
  })

  it('reports the collision under the name it would actually have used', async () => {
    await createEntry(root, 'taken', 'file')
    const other = await createEntry(root, 'other', 'file')
    await expect(renameEntry(other, 'taken')).rejects.toThrow(/"taken\.md" already exists/)
  })
})

describe('moveEntry', () => {
  it('moves a file into a folder, keeping its name', async () => {
    const folder = await createEntry(root, 'inbox', 'dir')
    const file = await createEntry(root, 'stray', 'file')
    const moved = await moveEntry(file, folder)
    expect(moved).toBe(path.join(folder, 'stray.md'))
    await expect(fs.access(file)).rejects.toThrow()
  })

  it('moves a folder, and everything under it', async () => {
    const outer = await createEntry(root, 'outer', 'dir')
    const inner = await createEntry(outer, 'inner', 'dir')
    await createEntry(inner, 'deep', 'file')
    const moved = await moveEntry(inner, root)
    await expect(fs.access(path.join(moved, 'deep.md'))).resolves.toBeUndefined()
    await expect(fs.access(inner)).rejects.toThrow()
  })

  it('takes a file back out to the top level', async () => {
    const folder = await createEntry(root, 'nested', 'dir')
    const file = await createEntry(folder, 'surfaced', 'file')
    const moved = await moveEntry(file, root)
    expect(moved).toBe(path.join(root, 'surfaced.md'))
  })

  it('refuses to put a folder inside itself', async () => {
    const outer = await createEntry(root, 'self', 'dir')
    const inner = await createEntry(outer, 'child', 'dir')
    await expect(moveEntry(outer, inner)).rejects.toThrow(/inside itself/)
    await expect(moveEntry(outer, outer)).rejects.toThrow(/inside itself/)
  })

  it('refuses to overwrite something already there', async () => {
    const folder = await createEntry(root, 'busy', 'dir')
    await createEntry(folder, 'twin', 'file')
    const other = await createEntry(root, 'twin', 'file')
    await expect(moveEntry(other, folder)).rejects.toThrow(/already in that folder/)
  })

  it('refuses a destination that is not a folder', async () => {
    const file = await createEntry(root, 'not-a-folder', 'file')
    const other = await createEntry(root, 'wanderer', 'file')
    await expect(moveEntry(other, file)).rejects.toThrow(/is not a folder/)
  })

  it('refuses to move outside the worktree', async () => {
    const file = await createEntry(root, 'homebound', 'file')
    await expect(moveEntry(file, os.tmpdir())).rejects.toThrow(/outside/)
  })

  it('keeps the line endings a file arrived with', async () => {
    const folder = await createEntry(root, 'crlf-home', 'dir')
    const file = path.join(root, 'crlf-mover.md')
    await fs.writeFile(file, 'one\r\ntwo\r\n', 'utf8')
    await readDocument(file)

    const moved = await moveEntry(file, folder)
    await writeDocument(moved, 'one\ntwo\n')
    await expect(fs.readFile(moved, 'utf8')).resolves.toBe('one\r\ntwo\r\n')
  })

  it('keeps them for a file that travelled inside a folder', async () => {
    const home = await createEntry(root, 'travellers', 'dir')
    const elsewhere = await createEntry(root, 'elsewhere', 'dir')
    const file = path.join(home, 'passenger.md')
    await fs.writeFile(file, 'a\r\nb\r\n', 'utf8')
    await readDocument(file)

    const movedHome = await moveEntry(home, elsewhere)
    const movedFile = path.join(movedHome, 'passenger.md')
    await writeDocument(movedFile, 'a\nb\n')
    await expect(fs.readFile(movedFile, 'utf8')).resolves.toBe('a\r\nb\r\n')
  })
})

describe('moveEntries', () => {
  it('moves every entry it is given', async () => {
    const home = await createEntry(root, 'batch-home', 'dir')
    const one = await createEntry(root, 'batch-one', 'file')
    const two = await createEntry(root, 'batch-two', 'file')

    const result = await moveEntries([one, two], home)
    expect(result.failed).toEqual([])
    expect(result.moved.map((entry) => entry.to)).toEqual([
      path.join(home, 'batch-one.md'),
      path.join(home, 'batch-two.md')
    ])
  })

  it('carries on past one that cannot move, and says which', async () => {
    const home = await createEntry(root, 'partial-home', 'dir')
    await createEntry(home, 'blocked', 'file')
    const blocked = await createEntry(root, 'blocked', 'file')
    const fine = await createEntry(root, 'unblocked', 'file')

    const result = await moveEntries([blocked, fine], home)
    expect(result.moved.map((entry) => entry.from)).toEqual([fine])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].path).toBe(blocked)
    expect(result.failed[0].message).toMatch(/already in that folder/)
  })

  it('does not report an entry that was already there as moved', async () => {
    const home = await createEntry(root, 'settled', 'dir')
    const resident = await createEntry(home, 'resident', 'file')
    const result = await moveEntries([resident], home)
    expect(result).toEqual({ moved: [], failed: [] })
  })

  it('refuses one outside the worktree without touching the rest', async () => {
    const home = await createEntry(root, 'guarded', 'dir')
    const inside = await createEntry(root, 'guarded-note', 'file')
    const result = await moveEntries([path.join(os.tmpdir(), 'nope.md'), inside], home)
    expect(result.moved).toHaveLength(1)
    expect(result.failed[0].message).toMatch(/outside/)
  })
})

describe('trashEntry', () => {
  it('goes through the shell, never through unlink', async () => {
    const created = await createEntry(root, 'doomed', 'file')
    await trashEntry(created)
    expect(trashed).toContain(created)
    await expect(fs.access(created)).rejects.toThrow()
  })

  it('refuses to trash outside the worktree', async () => {
    await expect(trashEntry(path.join(os.tmpdir(), 'nope.md'))).rejects.toThrow(/outside/)
  })
})
