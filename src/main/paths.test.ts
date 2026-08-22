import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertInsideWorktree, isInside, isValidFileName, resolveReal } from './paths'

let root = ''

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-paths-')))
  await fs.mkdir(path.join(root, 'notes'))
  await fs.writeFile(path.join(root, 'notes', 'a.md'), '# a')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('isInside', () => {
  it('accepts the root itself and its descendants', () => {
    expect(isInside(path.join('a', 'b'), path.join('a', 'b'))).toBe(true)
    expect(isInside(path.join('a', 'b'), path.join('a', 'b', 'c', 'd.md'))).toBe(true)
  })

  it('rejects siblings and ancestors', () => {
    expect(isInside(path.join('a', 'b'), path.join('a', 'bc'))).toBe(false)
    expect(isInside(path.join('a', 'b'), 'a')).toBe(false)
    expect(isInside(path.join('a', 'b'), path.join('a', 'c'))).toBe(false)
  })
})

describe('assertInsideWorktree', () => {
  it('resolves a path inside a root', async () => {
    const target = path.join(root, 'notes', 'a.md')
    await expect(assertInsideWorktree(target, root)).resolves.toBe(target)
  })

  it('resolves a path that does not exist yet', async () => {
    const target = path.join(root, 'notes', 'new.md')
    await expect(assertInsideWorktree(target, root)).resolves.toBe(target)
  })

  it('rejects a traversal out of the worktree', async () => {
    const escape = path.join(root, 'notes', '..', '..', 'elsewhere.md')
    await expect(assertInsideWorktree(escape, root)).rejects.toThrow(/outside/)
  })

  it('rejects an absolute path in another tree', async () => {
    await expect(assertInsideWorktree(path.join(os.tmpdir(), 'other.md'), root)).rejects.toThrow()
  })

  it('rejects empty input', async () => {
    await expect(assertInsideWorktree('', root)).rejects.toThrow(/Invalid path/)
  })

  it('rejects everything while no worktree is open', async () => {
    await expect(assertInsideWorktree(path.join(root, 'a.md'), null)).rejects.toThrow(
      /No worktree/
    )
  })

  it('follows symlinks before deciding', async () => {
    const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-out-')))
    const link = path.join(root, 'escape-link')
    try {
      await fs.symlink(outside, link, 'junction')
    } catch {
      // Creating links needs a privilege this machine may not grant; skip quietly.
      await fs.rm(outside, { recursive: true, force: true })
      return
    }
    await expect(assertInsideWorktree(path.join(link, 'x.md'), root)).rejects.toThrow(/outside/)
    await fs.rm(link, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  })
})

describe('resolveReal', () => {
  it('keeps the missing tail of a path', async () => {
    const target = path.join(root, 'nope', 'deep', 'x.md')
    await expect(resolveReal(target)).resolves.toBe(target)
  })
})

describe('isValidFileName', () => {
  it('accepts ordinary names', () => {
    expect(isValidFileName('notes.md')).toBe(true)
    expect(isValidFileName('a b - c.markdown')).toBe(true)
  })

  it('rejects separators and traversal', () => {
    expect(isValidFileName('a/b.md')).toBe(false)
    expect(isValidFileName('a\\b.md')).toBe(false)
    expect(isValidFileName('..')).toBe(false)
    expect(isValidFileName('')).toBe(false)
  })

  it('rejects characters Windows forbids', () => {
    for (const name of ['a:b', 'a?b', 'a*b', 'a|b', 'a"b', 'a<b', 'a>b']) {
      expect(isValidFileName(name)).toBe(false)
    }
    expect(isValidFileName('a\u0007b')).toBe(false)
  })

  it('rejects reserved device names and trailing dots', () => {
    expect(isValidFileName('CON')).toBe(false)
    expect(isValidFileName('lpt1.md')).toBe(false)
    expect(isValidFileName('name.')).toBe(false)
    expect(isValidFileName('name ')).toBe(false)
  })
})
