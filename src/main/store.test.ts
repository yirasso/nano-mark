import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

const { flushState, getState, loadState, patchState } = await import('./store')

const stateFile = (): string => path.join(userData, 'nanomark.json')

async function seed(contents: unknown): Promise<void> {
  await fs.writeFile(stateFile(), JSON.stringify(contents), 'utf8')
}

async function readBack(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(stateFile(), 'utf8'))
}

beforeEach(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-store-'))
})

afterEach(async () => {
  await fs.rm(userData, { recursive: true, force: true })
})

describe('loadState', () => {
  it('starts clean when there is no state file', async () => {
    const state = await loadState()
    expect(state.worktree).toBeNull()
    expect(state.lastFile).toBeNull()
    expect(state.expanded).toEqual([])
  })

  it('starts clean when the state file is corrupt', async () => {
    await fs.writeFile(stateFile(), '{ not json', 'utf8')
    const state = await loadState()
    expect(state.worktree).toBeNull()
  })

  it('reads back a saved worktree', async () => {
    await seed({ worktree: { path: 'C:\\vault', name: 'vault' }, lastFile: 'C:\\vault\\a.md' })
    const state = await loadState()
    expect(state.worktree).toEqual({ path: 'C:\\vault', name: 'vault' })
    expect(state.lastFile).toBe('C:\\vault\\a.md')
  })
})

describe('migrating from the multi-folder version', () => {
  it('adopts the first pinned folder as the worktree', async () => {
    await seed({
      roots: [
        { id: 'a', path: 'C:\\notes', name: 'notes' },
        { id: 'b', path: 'C:\\other', name: 'other' }
      ],
      lastFile: 'C:\\notes\\a.md',
      sidebarVisible: false
    })

    const state = await loadState()
    expect(state.worktree).toEqual({ path: 'C:\\notes', name: 'notes' })
    // The rest of the session survives the upgrade.
    expect(state.lastFile).toBe('C:\\notes\\a.md')
    expect(state.sidebarVisible).toBe(false)
  })

  it('falls back to the folder name when the old entry had none', async () => {
    await seed({ roots: [{ path: path.join('C:', 'vaults', 'work') }] })
    const state = await loadState()
    expect(state.worktree?.name).toBe('work')
  })

  it('handles an empty or malformed root list', async () => {
    await seed({ roots: [] })
    expect((await loadState()).worktree).toBeNull()

    await seed({ roots: 'nonsense' })
    expect((await loadState()).worktree).toBeNull()
  })

  it('does not write the legacy key back out', async () => {
    await seed({ roots: [{ id: 'a', path: 'C:\\notes', name: 'notes' }] })
    await loadState()
    await flushState()

    const written = await readBack()
    expect(written).not.toHaveProperty('roots')
    expect(written.worktree).toEqual({ path: 'C:\\notes', name: 'notes' })
  })
})

describe('patchState', () => {
  it('merges and persists', async () => {
    await loadState()
    patchState({ worktree: { path: 'C:\\vault', name: 'vault' } })
    patchState({ lastFile: 'C:\\vault\\note.md' })
    await flushState()

    expect(getState().worktree?.name).toBe('vault')
    const written = await readBack()
    expect(written.lastFile).toBe('C:\\vault\\note.md')
  })
})

describe('theme', () => {
  it('follows the system until someone chooses', async () => {
    expect((await loadState()).theme).toBe('system')
  })

  it('remembers an explicit choice', async () => {
    await seed({ theme: 'dark' })
    expect((await loadState()).theme).toBe('dark')

    await loadState()
    patchState({ theme: 'light' })
    await flushState()
    expect((await readBack()).theme).toBe('light')
  })

  it('ignores a value that is not a theme', async () => {
    await seed({ theme: 'neon' })
    expect((await loadState()).theme).toBe('system')
  })
})
