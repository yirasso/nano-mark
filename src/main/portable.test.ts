import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setPath = vi.fn()
vi.mock('electron', () => ({ app: { setPath: (...args: unknown[]) => setPath(...args) } }))

const { usePortableDataDir, PORTABLE_DATA_DIR } = await import('./portable')

const ENV = 'PORTABLE_EXECUTABLE_DIR'
let beside = ''

beforeEach(async () => {
  setPath.mockClear()
  beside = await fs.mkdtemp(path.join(os.tmpdir(), 'nanomark-portable-'))
})

afterEach(async () => {
  delete process.env[ENV]
  await fs.rm(beside, { recursive: true, force: true })
})

describe('usePortableDataDir', () => {
  it('keeps the normal location when the portable launcher did not start us', () => {
    expect(usePortableDataDir()).toBeNull()
    expect(setPath).not.toHaveBeenCalled()
  })

  it('puts the session beside the executable', async () => {
    process.env[ENV] = beside

    const taken = usePortableDataDir()
    expect(taken).toBe(path.join(beside, PORTABLE_DATA_DIR))
    expect(setPath).toHaveBeenCalledWith('userData', taken)

    // The folder is created eagerly, so the first run has somewhere to write.
    await expect(fs.stat(taken as string).then((s) => s.isDirectory())).resolves.toBe(true)
  })

  it('leaves no probe file behind', async () => {
    process.env[ENV] = beside
    const taken = usePortableDataDir() as string
    await expect(fs.readdir(taken)).resolves.toEqual([])
  })

  it('falls back rather than failing to start when the folder cannot be written', async () => {
    // A path whose parent is a file can never be made into a directory, which is
    // the same shape of failure as a read-only stick.
    const blocked = path.join(beside, 'not-a-folder')
    await fs.writeFile(blocked, 'x')
    process.env[ENV] = blocked

    expect(usePortableDataDir()).toBeNull()
    expect(setPath).not.toHaveBeenCalled()
  })
})
