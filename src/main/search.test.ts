import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runSearch } from './search'
import type { Worktree } from '@shared/types'

let root = ''
let worktree: Worktree = { path: '', name: '' }

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-search-')))
  worktree = { path: root, name: 'vault' }

  await fs.mkdir(path.join(root, 'Projects', 'alpha'), { recursive: true })
  await fs.mkdir(path.join(root, 'node_modules'), { recursive: true })

  await fs.writeFile(
    path.join(root, 'welcome.md'),
    ['# Welcome', '', 'The quick brown fox jumps.', 'Nothing here.'].join('\n')
  )
  await fs.writeFile(path.join(root, 'Projects', 'roadmap.md'), '# Roadmap\n\nA quick note.\n')
  await fs.writeFile(path.join(root, 'Projects', 'alpha', 'spec.md'), '# Spec\n\nno match here\n')
  await fs.writeFile(path.join(root, 'notes.txt'), 'quick but not markdown')
  await fs.writeFile(path.join(root, 'node_modules', 'quick.md'), 'quick noise')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('runSearch', () => {
  it('returns nothing for an empty query', async () => {
    const result = await runSearch('   ', worktree)
    expect(result.entries).toEqual([])
    expect(result.content).toEqual([])
  })

  it('matches file names, case-insensitively', async () => {
    const result = await runSearch('ROADMAP', worktree)
    expect(result.entries.map((entry) => entry.name)).toEqual(['roadmap.md'])
    expect(result.entries[0].kind).toBe('file')
  })

  it('matches folder names', async () => {
    const result = await runSearch('alpha', worktree)
    expect(result.entries.map((entry) => entry.name)).toContain('alpha')
    expect(result.entries.find((entry) => entry.name === 'alpha')?.kind).toBe('dir')
  })

  it('shows where an entry lives', async () => {
    const result = await runSearch('spec', worktree)
    expect(result.entries[0].location).toBe('Projects / alpha')

    // A file sitting at the top of the worktree has nowhere to point at.
    const top = await runSearch('welcome', worktree)
    expect(top.entries[0].location).toBe('')
  })

  it('ranks a prefix match above a mid-word one', async () => {
    await fs.writeFile(path.join(root, 'zzz-quick.md'), 'x')
    await fs.writeFile(path.join(root, 'quick-start.md'), 'x')
    const result = await runSearch('quick', worktree)
    expect(result.entries[0].name).toBe('quick-start.md')
    await fs.rm(path.join(root, 'zzz-quick.md'))
    await fs.rm(path.join(root, 'quick-start.md'))
  })

  it('searches inside files and reports the line', async () => {
    const result = await runSearch('brown fox', worktree)
    const hit = result.content.find((match) => match.name === 'welcome.md')
    expect(hit).toBeDefined()
    expect(hit?.line).toBe(3)
    expect(hit?.column).toBe(10)
    expect(hit?.length).toBe(9)
  })

  it('highlights the match inside the snippet it returns', async () => {
    const result = await runSearch('brown fox', worktree)
    const hit = result.content.find((match) => match.name === 'welcome.md')
    const snippet = hit?.snippet ?? ''
    expect(snippet.slice(hit?.snippetStart ?? 0, hit?.snippetEnd ?? 0)).toBe('brown fox')
  })

  it('ignores non-markdown files and ignored folders', async () => {
    const result = await runSearch('quick', worktree)
    const names = [...result.entries, ...result.content].map((match) => match.name)
    expect(names).not.toContain('notes.txt')
    expect(names).not.toContain('quick.md')
  })

  it('holds off on content search until the query is two characters', async () => {
    const single = await runSearch('q', worktree)
    expect(single.content).toEqual([])

    const double = await runSearch('qu', worktree)
    expect(double.content.length).toBeGreaterThan(0)
  })

  it('returns nothing while no worktree is open', async () => {
    const result = await runSearch('quick', null)
    expect(result.entries).toEqual([])
    expect(result.content).toEqual([])
  })

  it('never looks outside the worktree', async () => {
    const other = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-other-')))
    await fs.writeFile(path.join(other, 'elsewhere.md'), 'a quick line')
    const result = await runSearch('quick', worktree)
    const names = [...result.entries, ...result.content].map((match) => match.name)
    expect(names).not.toContain('elsewhere.md')
    await fs.rm(other, { recursive: true, force: true })
  })

  it('caps how much it returns and says so', async () => {
    const many = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-many-')))
    for (let i = 0; i < 80; i += 1) {
      await fs.writeFile(path.join(many, `padding-${i}.md`), 'padding line\n')
    }
    const result = await runSearch('padding', { path: many, name: 'many' })
    expect(result.entries.length).toBe(40)
    expect(result.truncated).toBe(true)
    await fs.rm(many, { recursive: true, force: true })
  })

  it('finds the same line numbers the editor uses for CRLF files', async () => {
    const target = path.join(root, 'crlf.md')
    await fs.writeFile(target, 'one\r\ntwo\r\nneedle here\r\n')
    const result = await runSearch('needle', worktree)
    expect(result.content.find((match) => match.name === 'crlf.md')?.line).toBe(3)
    await fs.rm(target)
  })
})

describe('result ordering', () => {
  it('returns content matches in tree order, the same way every time', async () => {
    const first = await runSearch('quick', worktree)
    const second = await runSearch('quick', worktree)
    const shape = (r: Awaited<ReturnType<typeof runSearch>>): string[] =>
      r.content.map((match) => `${match.name}:${match.line}`)

    expect(shape(first)).toEqual(shape(second))
    // Folders are walked before files, so the nested hit comes before the top-level one.
    expect(shape(first)).toEqual(['roadmap.md:3', 'welcome.md:3'])
  })
})
