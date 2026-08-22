import { useCallback, useEffect, useState } from 'react'
import type { FileNode, Worktree } from '@shared/types'
import { messageOf } from '../lib/errors'

interface WorktreeApi {
  worktree: Worktree | null
  tree: FileNode[]
  /** False until the first read has answered, so the UI does not flash empty. */
  ready: boolean
  changeWorktree: () => Promise<Worktree | null>
  refreshTree: () => Promise<void>
}

export function useWorktree(onError: (message: string) => void): WorktreeApi {
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])
  const [ready, setReady] = useState(false)

  const refreshTree = useCallback(async () => {
    try {
      setTree(await window.nano.tree.read())
    } catch (error) {
      onError(messageOf(error))
    }
  }, [onError])

  useEffect(() => {
    void (async () => {
      try {
        setWorktree(await window.nano.worktree.get())
        await refreshTree()
      } catch (error) {
        onError(messageOf(error))
      } finally {
        setReady(true)
      }
    })()
  }, [onError, refreshTree])

  // The main process pushes one event per burst of filesystem activity.
  useEffect(() => window.nano.onTreeChanged(() => void refreshTree()), [refreshTree])

  const changeWorktree = useCallback(async (): Promise<Worktree | null> => {
    try {
      const next = await window.nano.worktree.change()
      setWorktree(next)
      setTree(next ? await window.nano.tree.read() : [])
      return next
    } catch (error) {
      onError(messageOf(error))
      return null
    }
  }, [onError])

  return { worktree, tree, ready, changeWorktree, refreshTree }
}
