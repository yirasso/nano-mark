import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTree, isIgnoredDir, sortNodes } from './fs-tree'
import type { FileNode } from '@shared/types'

let root = ''

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-tree-')))
  await fs.mkdir(path.join(root, 'projects', 'alpha'), { recursive: true })
  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
  await fs.mkdir(path.join(root, '.git'), { recursive: true })
  await fs.writeFile(path.join(root, 'welcome.md'), '# hi')
  await fs.writeFile(path.join(root, 'Archive.markdown'), 'old')
  await fs.writeFile(path.join(root, 'notes.txt'), 'not markdown')
  await fs.writeFile(path.join(root, 'projects', 'roadmap.md'), '# roadmap')
  await fs.writeFile(path.join(root, 'projects', 'alpha', 'spec.md'), '# spec')
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'readme.md'), 'noise')
  await fs.writeFile(path.join(root, '.git', 'COMMIT_EDITMSG.md'), 'noise')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const names = (nodes: FileNode[]): string[] => nodes.map((node) => node.name)

describe('isIgnoredDir', () => {
  it('skips dependency and version-control folders', () => {
    expect(isIgnoredDir('node_modules')).toBe(true)
    expect(isIgnoredDir('.git')).toBe(true)
    expect(isIgnoredDir('.obsidian')).toBe(true)
    expect(isIgnoredDir('projects')).toBe(false)
  })
})

describe('sortNodes', () => {
  it('puts directories first, then names case-insensitively', () => {
    const sorted = sortNodes([
      { path: 'b.md', name: 'b.md', kind: 'file' },
      { path: 'Zed', name: 'Zed', kind: 'dir', children: [] },
      { path: 'A.md', name: 'A.md', kind: 'file' },
      { path: 'alpha', name: 'alpha', kind: 'dir', children: [] }
    ])
    expect(names(sorted)).toEqual(['alpha', 'Zed', 'A.md', 'b.md'])
  })
})

describe('buildTree', () => {
  it('keeps only markdown files and walks into folders', async () => {
    const tree = await buildTree(root)
    expect(names(tree)).toEqual(['projects', 'Archive.markdown', 'welcome.md'])

    const projects = tree.find((node) => node.name === 'projects')
    expect(names(projects?.children ?? [])).toEqual(['alpha', 'roadmap.md'])

    const alpha = projects?.children?.find((node) => node.name === 'alpha')
    expect(names(alpha?.children ?? [])).toEqual(['spec.md'])
  })

  it('never descends into ignored folders', async () => {
    const tree = await buildTree(root)
    expect(names(tree)).not.toContain('node_modules')
    expect(names(tree)).not.toContain('.git')
  })

  it('returns absolute paths', async () => {
    const tree = await buildTree(root)
    for (const node of tree) {
      expect(path.isAbsolute(node.path)).toBe(true)
      expect(node.path.startsWith(root)).toBe(true)
    }
  })

  it('returns nothing for a folder that is not there', async () => {
    await expect(buildTree(path.join(root, 'missing'))).resolves.toEqual([])
  })
})
