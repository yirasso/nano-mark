import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** electron-builder's portable launcher sets this to the folder holding the exe. */
const PORTABLE_DIR = 'PORTABLE_EXECUTABLE_DIR'

/** The folder the session is kept in, created beside the executable. */
export const PORTABLE_DATA_DIR = 'NanoMark-data'

/**
 * electron-builder's portable target only means "one file, no installer" — the
 * app still writes its session to %APPDATA% and shares it with an installed
 * copy. That is not what people mean by portable: a stick moved to another
 * machine should carry its own state, and should leave nothing behind.
 *
 * So when the portable launcher is what started us, the session lives beside
 * the executable instead. Returns the directory taken, or null if the normal
 * location is being kept.
 *
 * Must run before `requestSingleInstanceLock`, which is keyed on userData —
 * otherwise a portable copy and an installed copy would refuse to run together.
 */
export function usePortableDataDir(): string | null {
  const beside = process.env[PORTABLE_DIR]
  if (!beside) return null

  const dir = path.join(beside, PORTABLE_DATA_DIR)
  if (!isWritable(dir)) {
    // A memory stick can be read-only, and so can Program Files. Falling back
    // to %APPDATA% is worse than portable, but it still starts.
    return null
  }

  app.setPath('userData', dir)
  return dir
}

/**
 * Probes with a real write. On Windows `fs.access(W_OK)` reports success for
 * directories an ACL will still refuse, so asking the filesystem is the only
 * answer worth having.
 */
function isWritable(dir: string): boolean {
  const probe = path.join(dir, '.write-probe')
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(probe, '')
    fs.rmSync(probe)
    return true
  } catch {
    return false
  }
}
