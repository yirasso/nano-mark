// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// The module reads the platform off the bridge as it loads, and the case rules
// it picks are the whole point of these tests.
vi.stubGlobal('nano', { platform: 'linux' })
const { canDropInto, isUnder, rebaseAcross, rebasePath, topLevelPaths } = await import('./paths')

describe('isUnder', () => {
  it('accepts a real descendant', () => {
    expect(isUnder('/w/notes/a.md', '/w/notes')).toBe(true)
    expect(isUnder('/w/notes/deep/a.md', '/w')).toBe(true)
  })

  it('rejects the folder itself', () => {
    expect(isUnder('/w/notes', '/w/notes')).toBe(false)
  })

  it('rejects a sibling that merely starts with the same letters', () => {
    expect(isUnder('/w/notes-old/a.md', '/w/notes')).toBe(false)
  })

  it('reads a backslash as a separator too', () => {
    expect(isUnder('C:\\w\\notes\\a.md', 'C:\\w\\notes')).toBe(true)
    expect(isUnder('C:\\w\\notes-old', 'C:\\w\\notes')).toBe(false)
  })
})

describe('rebasePath', () => {
  it('follows the moved entry itself', () => {
    expect(rebasePath('/w/a.md', '/w/a.md', '/w/box/a.md')).toBe('/w/box/a.md')
  })

  it('follows everything under a moved folder', () => {
    expect(rebasePath('/w/src/deep/a.md', '/w/src', '/w/box/src')).toBe('/w/box/src/deep/a.md')
  })

  it('leaves anything else alone', () => {
    expect(rebasePath('/w/other.md', '/w/src', '/w/box/src')).toBeNull()
    expect(rebasePath('/w/src-old/a.md', '/w/src', '/w/box/src')).toBeNull()
  })
})

describe('rebaseAcross', () => {
  const moves = [
    { from: '/w/a.md', to: '/w/box/a.md' },
    { from: '/w/src', to: '/w/box/src' }
  ]

  it('follows whichever move touched the entry', () => {
    expect(rebaseAcross('/w/a.md', moves)).toBe('/w/box/a.md')
    expect(rebaseAcross('/w/src/deep/b.md', moves)).toBe('/w/box/src/deep/b.md')
  })

  it('leaves an entry no move touched alone', () => {
    expect(rebaseAcross('/w/other.md', moves)).toBeNull()
  })
})

describe('topLevelPaths', () => {
  it('drops anything already inside a selected folder', () => {
    const picked = ['/w/src', '/w/src/deep', '/w/src/deep/a.md', '/w/other.md']
    expect(topLevelPaths(picked)).toEqual(['/w/src', '/w/other.md'])
  })

  it('keeps siblings that only look nested', () => {
    expect(topLevelPaths(['/w/src', '/w/src-old'])).toEqual(['/w/src', '/w/src-old'])
  })
})

describe('canDropInto', () => {
  it('accepts a move to another folder', () => {
    expect(canDropInto(['/w/a.md'], '/w/box')).toBe(true)
  })

  it('refuses the folder they are already in', () => {
    expect(canDropInto(['/w/box/a.md'], '/w/box')).toBe(false)
    expect(canDropInto(['/w/a.md', '/w/b.md'], '/w')).toBe(false)
  })

  it('accepts a batch where at least one entry would actually move', () => {
    expect(canDropInto(['/w/box/a.md', '/w/b.md'], '/w/box')).toBe(true)
  })

  it('refuses a folder landing inside itself, and takes the batch with it', () => {
    expect(canDropInto(['/w/src'], '/w/src')).toBe(false)
    expect(canDropInto(['/w/src'], '/w/src/deep')).toBe(false)
    expect(canDropInto(['/w/a.md', '/w/src'], '/w/src/deep')).toBe(false)
  })

  it('refuses when nothing is being dragged', () => {
    expect(canDropInto([], '/w/box')).toBe(false)
  })
})
