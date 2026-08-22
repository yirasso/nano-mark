import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { IPC, type UiState } from '@shared/ipc'
import type { FileNode, NodeKind, SearchResponse, ThemeSource, Worktree } from '@shared/types'
import { buildTree } from './fs-tree'
import { runSearch } from './search'
import {
  createEntry,
  readDocument,
  renameEntry,
  revealEntry,
  trashEntry,
  writeDocument
} from './files'
import { assertInsideWorktree, clearWorktree, registerWorktree } from './paths'
import { getState, patchState } from './store'
import { stopWatching, watchWorktree } from './watcher'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function attachWatcher(worktree: Worktree): void {
  watchWorktree(worktree.path, {
    onTreeChanged: () => broadcast(IPC.treeChanged),
    onFileChanged: (payload) => broadcast(IPC.fileChanged, payload)
  })
}

/**
 * Opens a folder as the worktree: resolves it, makes it the only place the app
 * can reach, and points the watcher at it. Passing null closes the worktree.
 */
async function openWorktree(chosen: string | null): Promise<Worktree | null> {
  stopWatching()

  if (!chosen) {
    clearWorktree()
    patchState({ worktree: null, lastFile: null, expanded: [] })
    return null
  }

  const real = await registerWorktree(chosen)
  const worktree: Worktree = { path: real, name: path.basename(real) || real }
  attachWatcher(worktree)
  return worktree
}

/** Re-opens the persisted worktree at startup, if it is still there. */
export async function restoreWorktree(): Promise<Worktree | null> {
  const saved = getState().worktree
  if (!saved) return null

  try {
    const worktree = await openWorktree(saved.path)
    patchState({ worktree })
    return worktree
  } catch {
    // The folder moved, or the drive is gone.
    await openWorktree(null)
    return null
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.worktreeGet, (): Worktree | null => getState().worktree)

  ipcMain.handle(IPC.worktreeChange, async (event): Promise<Worktree | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openDirectory' as const],
      title: 'Choose a worktree',
      buttonLabel: 'Open worktree'
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    // Cancelling keeps the current worktree; it never closes it by accident.
    if (result.canceled || result.filePaths.length === 0) return getState().worktree

    const worktree = await openWorktree(result.filePaths[0])
    // The remembered file and unfolded folders belong to the old worktree.
    patchState({ worktree, lastFile: null, expanded: [] })
    return worktree
  })

  ipcMain.handle(IPC.treeRead, async (): Promise<FileNode[]> => {
    const worktree = getState().worktree
    if (!worktree) return []
    return buildTree(worktree.path)
  })

  ipcMain.handle(IPC.fileRead, (_event, target: string) => readDocument(target))

  ipcMain.handle(IPC.fileWrite, (_event, target: string, content: string) => {
    if (typeof content !== 'string') throw new Error('Invalid content')
    return writeDocument(target, content)
  })

  ipcMain.handle(IPC.searchRun, (_event, query: string): Promise<SearchResponse> => {
    if (typeof query !== 'string') throw new Error('Invalid query')
    return runSearch(query, getState().worktree)
  })

  ipcMain.handle(IPC.entryCreate, (_event, parentDir: string, name: string, kind: NodeKind) =>
    createEntry(parentDir, name, kind)
  )

  ipcMain.handle(IPC.entryRename, (_event, target: string, newName: string) =>
    renameEntry(target, newName)
  )

  ipcMain.handle(IPC.entryTrash, (_event, target: string) => trashEntry(target))

  ipcMain.handle(IPC.entryReveal, (_event, target: string) => revealEntry(target))

  ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return
    await shell.openExternal(parsed.toString())
  })

  ipcMain.handle(IPC.themeGet, (): ThemeSource => getState().theme)

  ipcMain.handle(IPC.themeSet, (_event, source: ThemeSource) => {
    if (source !== 'system' && source !== 'light' && source !== 'dark') return
    // Drives prefers-color-scheme in the renderer and the window's own backdrop.
    nativeTheme.themeSource = source
    patchState({ theme: source })
  })

  ipcMain.handle(IPC.uiStateRead, async (): Promise<UiState> => {
    const state = getState()
    let lastFile: string | null = null
    if (state.lastFile) {
      try {
        lastFile = await assertInsideWorktree(state.lastFile)
      } catch {
        lastFile = null
      }
    }
    return {
      expanded: state.expanded,
      lastFile,
      sidebarVisible: state.sidebarVisible
    }
  })

  ipcMain.handle(IPC.uiStatePatch, async (_event, patch: Partial<UiState>) => {
    const next: Partial<UiState> = {}
    if (Array.isArray(patch.expanded)) next.expanded = patch.expanded
    if (typeof patch.sidebarVisible === 'boolean') next.sidebarVisible = patch.sidebarVisible
    if (patch.lastFile === null) {
      next.lastFile = null
    } else if (typeof patch.lastFile === 'string') {
      try {
        next.lastFile = await assertInsideWorktree(patch.lastFile)
      } catch {
        next.lastFile = null
      }
    }
    patchState(next)
  })
}
