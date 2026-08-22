import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'
import type { ThemeSource, Worktree } from '@shared/types'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface PersistedState {
  worktree: Worktree | null
  /** Paths of directories the user left expanded in the sidebar. */
  expanded: string[]
  lastFile: string | null
  sidebarVisible: boolean
  theme: ThemeSource
  bounds: WindowBounds
}

/** The shape written by versions that pinned several folders at once. */
interface LegacyState {
  roots?: Array<{ path?: unknown; name?: unknown }>
}

const DEFAULT_STATE: PersistedState = {
  worktree: null,
  expanded: [],
  lastFile: null,
  sidebarVisible: true,
  theme: 'system',
  bounds: { width: 1100, height: 760 }
}

let state: PersistedState = { ...DEFAULT_STATE }
let filePath = ''
let flushTimer: NodeJS.Timeout | null = null

export async function loadState(): Promise<PersistedState> {
  filePath = path.join(app.getPath('userData'), 'nanomark.json')
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState> & LegacyState
    // Built field by field rather than spread, so a legacy key such as `roots`
    // is not carried along and written back out forever.
    state = {
      worktree: readWorktree(parsed),
      expanded: Array.isArray(parsed.expanded) ? parsed.expanded : [],
      lastFile: typeof parsed.lastFile === 'string' ? parsed.lastFile : null,
      sidebarVisible:
        typeof parsed.sidebarVisible === 'boolean'
          ? parsed.sidebarVisible
          : DEFAULT_STATE.sidebarVisible,
      theme: isThemeSource(parsed.theme) ? parsed.theme : DEFAULT_STATE.theme,
      bounds: { ...DEFAULT_STATE.bounds, ...parsed.bounds }
    }
  } catch {
    // No state yet, or it got corrupted. Either way, start clean.
    state = { ...DEFAULT_STATE }
  }
  return state
}

function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** Falls back to the first pinned folder, so an upgrade keeps the user in place. */
function readWorktree(parsed: Partial<PersistedState> & LegacyState): Worktree | null {
  const current = parsed.worktree
  if (current && typeof current.path === 'string' && typeof current.name === 'string') {
    return { path: current.path, name: current.name }
  }

  const legacy = Array.isArray(parsed.roots) ? parsed.roots[0] : undefined
  if (legacy && typeof legacy.path === 'string') {
    const legacyPath = legacy.path
    const name = typeof legacy.name === 'string' ? legacy.name : path.basename(legacyPath)
    return { path: legacyPath, name }
  }

  return null
}

export function getState(): PersistedState {
  return state
}

export function patchState(patch: Partial<PersistedState>): void {
  state = { ...state, ...patch }
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushState()
  }, 300)
}

export async function flushState(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!filePath) return
  try {
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // Losing the layout is not worth crashing over.
  }
}
