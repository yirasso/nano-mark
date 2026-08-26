import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { IPC, type UiState } from '@shared/ipc'
import type {
  FileNode,
  MoveResult,
  NodeKind,
  SearchResponse,
  ThemeSource,
  TrashResult,
  Worktree
} from '@shared/types'
import { buildTree } from './fs-tree'
import { runSearch } from './search'
import {
  createEntry,
  entryKind,
  moveEntries,
  readDocument,
  renameEntry,
  revealEntry,
  trashEntry,
  writeDocument
} from './files'
import { messageOf } from './errors'
import { assertInsideWorktree, clearWorktree, registerWorktree } from './paths'
import { getState, patchState } from './store'
import { stopWatching, watchWorktree } from './watcher'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** How many names a confirmation spells out before it starts counting instead. */
const NAMES_IN_WARNING = 8

/** Rejects anything that is not a list of paths, before it reaches the disk. */
function assertPathList(targets: unknown): asserts targets is string[] {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Nothing to act on')
  }
  if (targets.some((target) => typeof target !== 'string' || target.length === 0)) {
    throw new Error('Invalid path')
  }
}

/** What the platform calls the place deleted files go, so warnings match it. */
export const BIN_NAME = process.platform === 'win32' ? 'Recycle Bin' : 'Trash'

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
      // "Worktree" is what the code calls it. The person picking a folder has
      // never read the code, and in git the word means something else.
      title: 'Choose the folder your notes live in',
      buttonLabel: 'Open folder'
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

  ipcMain.handle(
    IPC.entryMove,
    (_event, targets: string[], destDir: string): Promise<MoveResult> => {
      assertPathList(targets)
      return moveEntries(targets, destDir)
    }
  )

  // Deleting is the one thing here that reaches outside the app and cannot be
  // undone from inside it, so it is also the one thing that asks first.
  ipcMain.handle(IPC.entryTrash, async (event, targets: string[]): Promise<TrashResult> => {
    assertPathList(targets)
    const result: TrashResult = { trashed: [], failed: [] }

    // A kind that cannot be read is a path that is about to fail anyway; the
    // wording is the only thing riding on it here.
    const kinds = await Promise.all(
      targets.map((target) => entryKind(target).catch((): NodeKind => 'file'))
    )
    const names = targets.map((target) => path.basename(target))
    const folders = kinds.filter((kind) => kind === 'dir').length
    const unlisted = names.length - NAMES_IN_WARNING
    const listed =
      unlisted > 0
        ? `${names.slice(0, NAMES_IN_WARNING).join(', ')} and ${unlisted} more`
        : names.join(', ')

    const many = targets.length > 1
    const message = many
      ? `Move ${targets.length} items to the ${BIN_NAME}?`
      : folders === 1
        ? `Move "${names[0]}" and everything inside it to the ${BIN_NAME}?`
        : `Move "${names[0]}" to the ${BIN_NAME}?`
    const detail = [
      many ? listed : null,
      many && folders > 0 ? 'Folders go with everything inside them.' : null,
      `You can put ${many ? 'them' : 'it'} back from the ${BIN_NAME}.`
    ]
      .filter((line) => line !== null)
      .join('\n\n')

    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'warning' as const,
      buttons: [`Move to ${BIN_NAME}`, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: `Move to ${BIN_NAME}?`,
      message,
      detail,
      noLink: true
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    // Cancelling is not a failure, and comes back as nothing having happened.
    if (response !== 0) return result

    for (const target of targets) {
      try {
        await trashEntry(target)
        result.trashed.push(target)
      } catch (error) {
        result.failed.push({ path: target, message: messageOf(error) })
      }
    }
    return result
  })

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
