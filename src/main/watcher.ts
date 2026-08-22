import path from 'node:path'
import fs from 'node:fs/promises'
import { watch, type FSWatcher } from 'chokidar'
import { isMarkdownPath } from '@shared/types'
import { isIgnoredDir } from './fs-tree'
import { consumeSelfWrite } from './files'

interface WatcherHandlers {
  onTreeChanged: () => void
  onFileChanged: (payload: { path: string; mtimeMs: number }) => void
}

/** Bursts of filesystem events collapse into one tree refresh. */
const TREE_DEBOUNCE = 150

let watcher: FSWatcher | null = null
let pendingTreeEvent: NodeJS.Timeout | null = null

export function watchWorktree(rootPath: string, handlers: WatcherHandlers): void {
  stopWatching()

  const next = watch(rootPath, {
    ignoreInitial: true,
    followSymlinks: false,
    depth: 12,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Never ignore the root itself, even if the worktree is a dot-folder.
    ignored: (target: string) => target !== rootPath && isIgnoredDir(path.basename(target))
  })

  const scheduleTreeEvent = (): void => {
    if (pendingTreeEvent) clearTimeout(pendingTreeEvent)
    pendingTreeEvent = setTimeout(() => {
      pendingTreeEvent = null
      handlers.onTreeChanged()
    }, TREE_DEBOUNCE)
  }

  next
    .on('add', (target) => {
      if (isMarkdownPath(target)) scheduleTreeEvent()
    })
    .on('unlink', (target) => {
      if (isMarkdownPath(target)) scheduleTreeEvent()
    })
    .on('addDir', scheduleTreeEvent)
    .on('unlinkDir', scheduleTreeEvent)
    .on('change', (target) => {
      if (!isMarkdownPath(target)) return
      void notifyFileChange(target, handlers)
    })
    .on('error', () => {
      // A folder went away or is unreadable. The tree refresh will show it.
    })

  watcher = next
}

async function notifyFileChange(target: string, handlers: WatcherHandlers): Promise<void> {
  try {
    const stat = await fs.stat(target)
    if (consumeSelfWrite(target, stat.mtimeMs)) return
    handlers.onFileChanged({ path: target, mtimeMs: stat.mtimeMs })
  } catch {
    // Gone between the event and the stat.
  }
}

export function stopWatching(): void {
  if (pendingTreeEvent) {
    clearTimeout(pendingTreeEvent)
    pendingTreeEvent = null
  }
  if (watcher) {
    void watcher.close()
    watcher = null
  }
}
