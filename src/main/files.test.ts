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

const { consumeSelfWrite, createEntry, readDocument, renameEntry, trashEntry, writeDocument } =
  await import('./files')
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
