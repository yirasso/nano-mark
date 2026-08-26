// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { FileNode } from '@shared/types'

// `paths` reads the platform off the bridge at module load, so it has to exist
// before the module under test is pulled in.
vi.stubGlobal('nano', { platform: 'linux' })
const { findNode, flattenVisible, rangeBetween } = await import('./tree')

const file = (path: string): FileNode => ({ path, name: path.split('/').pop() ?? path, kind: 'file' })

const dir = (path: string, children: FileNode[]): FileNode => ({
  path,
  name: path.split('/').pop() ?? path,
  kind: 'dir',
  children
})

const tree: FileNode[] = [
  dir('/w/notes', [file('/w/notes/a.md'), dir('/w/notes/deep', [file('/w/notes/deep/b.md')])]),
  file('/w/top.md')
]

describe('flattenVisible', () => {
  it('lists only what is unfolded, in screen order', () => {
    const rows = flattenVisible(tree, new Set())
    expect(rows.map((row) => row.node.path)).toEqual(['/w/notes', '/w/top.md'])
  })

  it('walks into an expanded folder', () => {
    const rows = flattenVisible(tree, new Set(['/w/notes']))
    expect(rows.map((row) => row.node.path)).toEqual([
      '/w/notes',
      '/w/notes/a.md',
      '/w/notes/deep',
      '/w/top.md'
    ])
  })

  it('reports depth and parent, so arrow keys can step out', () => {
    const rows = flattenVisible(tree, new Set(['/w/notes', '/w/notes/deep']))
    const nested = rows.find((row) => row.node.path === '/w/notes/deep/b.md')
    expect(nested).toMatchObject({ depth: 2, parentPath: '/w/notes/deep' })
    expect(rows[0]).toMatchObject({ depth: 0, parentPath: null })
  })

  it('is empty for an empty worktree', () => {
    expect(flattenVisible([], new Set())).toEqual([])
  })
})

describe('findNode', () => {
  it('finds an entry nested at any depth', () => {
    expect(findNode(tree, '/w/notes/deep/b.md')?.name).toBe('b.md')
  })

  it('returns null once an entry is gone', () => {
    expect(findNode(tree, '/w/notes/vanished.md')).toBeNull()
  })

  it('does not care whether the folder is unfolded', () => {
    expect(findNode(tree, '/w/notes/a.md')).not.toBeNull()
  })
})

describe('rangeBetween', () => {
  const rows = flattenVisible(tree, new Set(['/w/notes', '/w/notes/deep']))

  it('takes the rows in between, in either direction', () => {
    const paths = ['/w/notes', '/w/notes/a.md', '/w/notes/deep']
    expect(rangeBetween(rows, '/w/notes', '/w/notes/deep')).toEqual(paths)
    expect(rangeBetween(rows, '/w/notes/deep', '/w/notes')).toEqual(paths)
  })

  it('counts rows on screen, not entries in the tree', () => {
    const shallow = flattenVisible(tree, new Set())
    expect(rangeBetween(shallow, shallow[0].node.path, shallow[1].node.path)).toHaveLength(2)
  })

  it('falls back to the clicked row when the anchor is folded away', () => {
    expect(rangeBetween(rows, '/w/gone.md', '/w/notes/a.md')).toEqual(['/w/notes/a.md'])
  })

  it('gives nothing when the row itself is not on screen', () => {
    expect(rangeBetween(rows, '/w/notes', '/w/gone.md')).toEqual([])
  })
})
