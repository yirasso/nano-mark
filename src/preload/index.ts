import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppCommand, type UiState } from '@shared/ipc'
import type {
  DocumentPayload,
  FileChangedEvent,
  FileNode,
  NodeKind,
  SearchResponse,
  ThemeSource,
  Worktree,
  WriteResult
} from '@shared/types'

type Unsubscribe = () => void

function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api = {
  platform: process.platform,
  worktree: {
    get: (): Promise<Worktree | null> => ipcRenderer.invoke(IPC.worktreeGet),
    /** Opens a folder picker. Cancelling leaves the current worktree in place. */
    change: (): Promise<Worktree | null> => ipcRenderer.invoke(IPC.worktreeChange)
  },
  tree: {
    read: (): Promise<FileNode[]> => ipcRenderer.invoke(IPC.treeRead)
  },
  file: {
    read: (target: string): Promise<DocumentPayload> => ipcRenderer.invoke(IPC.fileRead, target),
    write: (target: string, content: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.fileWrite, target, content)
  },
  search: {
    run: (query: string): Promise<SearchResponse> => ipcRenderer.invoke(IPC.searchRun, query)
  },
  entry: {
    create: (parentDir: string, name: string, kind: NodeKind): Promise<string> =>
      ipcRenderer.invoke(IPC.entryCreate, parentDir, name, kind),
    rename: (target: string, newName: string): Promise<string> =>
      ipcRenderer.invoke(IPC.entryRename, target, newName),
    /** Asks the user first. Resolves false when they cancelled. */
    trash: (target: string): Promise<boolean> => ipcRenderer.invoke(IPC.entryTrash, target),
    reveal: (target: string): Promise<void> => ipcRenderer.invoke(IPC.entryReveal, target)
  },
  theme: {
    get: (): Promise<ThemeSource> => ipcRenderer.invoke(IPC.themeGet),
    set: (source: ThemeSource): Promise<void> => ipcRenderer.invoke(IPC.themeSet, source)
  },
  ui: {
    read: (): Promise<UiState> => ipcRenderer.invoke(IPC.uiStateRead),
    patch: (patch: Partial<UiState>): Promise<void> => ipcRenderer.invoke(IPC.uiStatePatch, patch)
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
  /** The main process asks for a final save before the window is allowed to close. */
  onFlushRequest: (handler: () => void): Unsubscribe => subscribe(IPC.appFlush, handler),
  flushDone: (): void => ipcRenderer.send(IPC.appFlushDone),
  /** The application menu asking the renderer to run one of its own commands. */
  onCommand: (handler: (command: AppCommand) => void): Unsubscribe =>
    subscribe(IPC.appCommand, handler),
  onTreeChanged: (handler: () => void): Unsubscribe => subscribe(IPC.treeChanged, handler),
  onFileChanged: (handler: (payload: FileChangedEvent) => void): Unsubscribe =>
    subscribe(IPC.fileChanged, handler)
}

export type NanoApi = typeof api

contextBridge.exposeInMainWorld('nano', api)

declare global {
  interface Window {
    nano: NanoApi
  }
}
