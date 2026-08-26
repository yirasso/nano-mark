import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppCommand } from '@shared/ipc'
import type { FileNode, NodeKind, SearchMatch, Worktree } from '@shared/types'
import { ContextMenu, type MenuAnchor, type MenuItem } from './components/ContextMenu'
import { Editor, type Reveal } from './components/Editor'
import { EmptyState } from './components/EmptyState'
import { Preview } from './components/Preview'
import { ShortcutSheet } from './components/ShortcutSheet'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import type { Draft, RowMods } from './components/Tree'
import { useDocument } from './hooks/useDocument'
import { useHotkeys, type Hotkey } from './hooks/useHotkeys'
import { useSearch } from './hooks/useSearch'
import { useTheme } from './hooks/useTheme'
import { useWorktree } from './hooks/useWorktree'
import { messageOf } from './lib/errors'
import {
  ancestorsWithin,
  baseName,
  canDropInto,
  dirName,
  isUnder,
  rebaseAcross,
  rebasePath,
  relativeSegments,
  samePath,
  topLevelPaths
} from './lib/paths'
import { BIN, MOD } from './lib/platform'
import { findNode, flattenVisible, rangeBetween } from './lib/tree'
import MARKDOWN_GUIDE from './content/markdown-guide.md?raw'

type Mode = 'edit' | 'preview'

/**
 * The built-in markdown guide. It is compiled into the application rather than
 * written into the worktree, so it cannot be edited away or deleted, and opening
 * it never touches the folder the user is working in.
 *
 * The sentinel is what the editor swaps state on. Every real path arrives from
 * the main process resolved and absolute, so a scheme like this cannot collide
 * with one.
 */
const GUIDE_PATH = 'nanomark://markdown-guide'
const GUIDE_NAME = 'Markdown guide.md'

interface Notice {
  /** Distinct per notice, so the same message twice restarts the timer. */
  id: number
  tone: 'info' | 'error'
  text: string
}

const NOTICE_DWELL = { info: 4000, error: 9000 }

export function App(): React.JSX.Element {
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeSeq = useRef(0)

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    noticeSeq.current += 1
    setNotice({ id: noticeSeq.current, tone, text })
  }, [])
  const onError = useCallback((message: string) => notify(message, 'error'), [notify])

  const { worktree, tree, ready, changeWorktree, refreshTree } = useWorktree(onError)

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [contextPath, setContextPath] = useState<string | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  // Every row that is marked, and the row a shift-click measures from.
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  // The rows being dragged, and the folder they would land in right now.
  const [dragPaths, setDragPaths] = useState<string[]>([])
  const [dropDir, setDropDir] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  // Where the keyboard is in the tree, which is not always the open file.
  const [cursor, setCursor] = useState<{ path: string; token: number } | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const search = useSearch(onError)
  const theme = useTheme(onError)

  const onExternalReload = useCallback(
    () => notify('Reloaded — this file changed on disk'),
    [notify]
  )
  const doc = useDocument(selectedPath, onError, onExternalReload)
  const { discard: discardDoc, keepMine, reload: reloadDoc, saveNow } = doc
  const restored = useRef(false)

  const cursorPath = cursor?.path ?? null

  const moveCursor = useCallback((path: string) => {
    setCursor((prev) => ({ path, token: (prev?.token ?? 0) + 1 }))
  }, [])

  // Following a click or a search result must not yank focus back to the tree.
  const trackCursor = useCallback((path: string) => {
    setCursor((prev) =>
      prev && samePath(prev.path, path) ? prev : { path, token: prev?.token ?? 0 }
    )
  }, [])

  // Restore the previous session once the worktree is known, so the remembered
  // file is still guaranteed to live inside it.
  useEffect(() => {
    if (restored.current || !ready) return
    restored.current = true
    void (async () => {
      const ui = await window.nano.ui.read()
      setExpanded(new Set(ui.expanded))
      setSidebarVisible(ui.sidebarVisible)
      if (ui.lastFile) {
        setSelectedPath(ui.lastFile)
        trackCursor(ui.lastFile)
      }
    })()
  }, [ready, trackCursor])

  useEffect(() => {
    if (!restored.current) return
    void window.nano.ui.patch({
      expanded: [...expanded],
      lastFile: selectedPath,
      sidebarVisible
    })
  }, [expanded, selectedPath, sidebarVisible])

  const searchRefresh = search.refresh
  const hasQuery = search.query.trim().length > 0
  useEffect(() => {
    if (!hasQuery) return
    return window.nano.onTreeChanged(() => searchRefresh())
  }, [hasQuery, searchRefresh])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_DWELL[notice.tone])
    return () => clearTimeout(timer)
  }, [notice])

  // An inline name field belongs to the sidebar. If the sidebar goes away the
  // field goes with it, rather than keeping the caret somewhere invisible.
  useEffect(() => {
    if (sidebarVisible) return
    setDraft(null)
    setRenamingPath(null)
  }, [sidebarVisible])

  const closeMenu = useCallback(() => {
    setMenu(null)
    setContextPath(null)
  }, [])

  // Renaming and moving change a path before the tree has heard about it, which
  // is the same shape as a file disappearing. This counts the moments where the
  // two are indistinguishable, so the guard further down can sit them out.
  const settling = useRef(0)

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      settling.current += 1
      try {
        await action()
      } catch (err) {
        onError(messageOf(err))
      } finally {
        settling.current -= 1
      }
    },
    [onError]
  )

  const clearSearch = search.clear

  /* ---------- worktree ---------- */

  const switchWorktree = useCallback(() => {
    void (async () => {
      const previous = worktree
      const next = await changeWorktree()
      if (!next || (previous && samePath(previous.path, next.path))) return

      // Everything on screen belonged to the folder we just left.
      setSelectedPath(null)
      setExpanded(new Set())
      setRenamingPath(null)
      setDraft(null)
      setReveal(null)
      setCursor(null)
      setMarked(new Set())
      setAnchor(null)
      setMode('edit')
      setGuideOpen(false)
      clearSearch()
      notify(`Opened ${next.name}`)
    })()
  }, [changeWorktree, clearSearch, notify, worktree])

  /* ---------- tree interaction ---------- */

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const closeGuide = useCallback(() => setGuideOpen(false), [])

  const openGuide = useCallback(() => {
    setGuideOpen(true)
    setMode('edit')
    clearSearch()
  }, [clearSearch])

  /** One row marked and nothing else, which is what an ordinary click means. */
  const markOnly = useCallback((path: string) => {
    setMarked(new Set([path]))
    setAnchor(path)
  }, [])

  const selectFile = useCallback(
    (node: FileNode) => {
      setGuideOpen(false)
      setSelectedPath(node.path)
      trackCursor(node.path)
      markOnly(node.path)
    },
    [markOnly, trackCursor]
  )

  const expandTo = useCallback(
    (target: string, includeSelf: boolean) => {
      if (!worktree) return
      const chain = ancestorsWithin(target, worktree.path)
      if (includeSelf) chain.push(target)
      if (chain.length === 0) return
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const dir of chain) next.add(dir)
        return next
      })
    },
    [worktree]
  )

  // Both inline name fields live in the tree, so both need the tree on screen.
  const startDraft = useCallback(
    (parentPath: string, kind: NodeKind) => {
      setSidebarVisible(true)
      clearSearch()
      setExpanded((prev) => new Set(prev).add(parentPath))
      setDraft({ parentPath, kind })
    },
    [clearSearch]
  )

  const startRename = useCallback(
    (path: string) => {
      setSidebarVisible(true)
      clearSearch()
      expandTo(path, false)
      setRenamingPath(path)
    },
    [clearSearch, expandTo]
  )

  const submitDraft = useCallback(
    (name: string) => {
      const pending = draft
      setDraft(null)
      if (!pending) return
      void guard(async () => {
        const created = await window.nano.entry.create(pending.parentPath, name, pending.kind)
        // The tree is refreshed before the selection moves, so the new file is
        // never a path the tree has not heard of yet — which is the one thing
        // that makes the app let go of an open file.
        await refreshTree()
        if (pending.kind === 'file') {
          // A new file is empty, so there is nothing to preview: open it in the
          // editor, where the caret already goes.
          setMode('edit')
          setGuideOpen(false)
          setSelectedPath(created)
          trackCursor(created)
        } else {
          setExpanded((prev) => new Set(prev).add(created))
        }
        markOnly(created)
      })
    },
    [draft, guard, markOnly, refreshTree, trackCursor]
  )

  const submitRename = useCallback(
    (path: string, name: string) => {
      setRenamingPath(null)
      void guard(async () => {
        const next = await window.nano.entry.rename(path, name)
        if (samePath(selectedPath, path)) setSelectedPath(next)
        trackCursor(next)
        setMarked((prev) => new Set([...prev].map((p) => rebasePath(p, path, next) ?? p)))
        setExpanded((prev) => {
          if (!prev.has(path)) return prev
          const updated = new Set(prev)
          updated.delete(path)
          updated.add(next)
          return updated
        })
        await refreshTree()
        notify(`Renamed to ${baseName(next)}`)
      })
    },
    [guard, notify, refreshTree, selectedPath, trackCursor]
  )

  /**
   * The other half of renaming: same names, different parent. Everything an old
   * path named has to follow it — the open file, the unfolded folders under it,
   * the marking, and the row the keyboard is on — or the session ends up
   * pointing at paths that no longer exist.
   *
   * Each entry is its own move, so one name already taken at the destination
   * stops that entry and none of the others.
   */
  const moveEntries = useCallback(
    (sources: string[], destDir: string) => {
      // A folder carries what is inside it, so a selection holding both only
      // needs the folder: moving the child afterwards would chase a path that
      // no longer exists.
      const targets = topLevelPaths(sources)
      if (!canDropInto(targets, destDir)) return
      const destName =
        worktree && samePath(destDir, worktree.path) ? worktree.name : baseName(destDir)

      void guard(async () => {
        // A pending write still carries the old path. Sending it after the move
        // would write to a file that is not there any more.
        await saveNow()
        const { moved, failed } = await window.nano.entry.move(targets, destDir)

        if (moved.length > 0) {
          setSelectedPath((prev) => (prev === null ? null : (rebaseAcross(prev, moved) ?? prev)))
          setCursor((prev) => {
            if (!prev) return prev
            const next = rebaseAcross(prev.path, moved)
            return next ? { path: next, token: prev.token } : prev
          })
          setMarked((prev) => new Set([...prev].map((p) => rebaseAcross(p, moved) ?? p)))
          setExpanded((prev) => {
            const updated = new Set<string>()
            for (const dir of prev) updated.add(rebaseAcross(dir, moved) ?? dir)
            // Unfold where they landed, so the rows are visible in their new
            // home. The root is not a row, and is never folded in the first place.
            if (!worktree || !samePath(destDir, worktree.path)) updated.add(destDir)
            return updated
          })
        }

        await refreshTree()

        const what = moved.length === 1 ? `“${baseName(moved[0].to)}”` : `${moved.length} items`
        if (failed.length === 0) {
          if (moved.length > 0) notify(`Moved ${what} to ${destName}`)
        } else if (moved.length === 0) {
          onError(failed[0].message)
        } else {
          onError(`Moved ${what}, but ${failed.length} stayed — ${failed[0].message}`)
        }
      })
    },
    [guard, notify, onError, refreshTree, saveNow, worktree]
  )

  const startDrag = useCallback(
    (node: FileNode) => {
      // Dragging a marked row takes the whole marking. Dragging one that is not
      // marked moves the marking onto it first, the way a plain click would.
      const withinMarking = marked.has(node.path)
      if (!withinMarking) markOnly(node.path)
      setDragPaths(withinMarking ? topLevelPaths([...marked]) : [node.path])
      setDropDir(null)
      // A menu left open over the tree would sit on top of the drop targets.
      closeMenu()
    },
    [closeMenu, markOnly, marked]
  )

  const endDrag = useCallback(() => {
    setDragPaths([])
    setDropDir(null)
  }, [])

  const dropOn = useCallback(
    (dir: string) => {
      if (dragPaths.length > 0) moveEntries(dragPaths, dir)
    },
    [dragPaths, moveEntries]
  )

  const expandForDrag = useCallback((path: string) => {
    setExpanded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)))
  }, [])

  const trashEntries = useCallback(
    (paths: string[]) => {
      const targets = topLevelPaths(paths)
      if (targets.length === 0) return

      void guard(async () => {
        // The confirmation lives in the main process, so it is a real native
        // dialog rather than something the page draws over itself. It asks once
        // for the whole batch.
        const { trashed, failed } = await window.nano.entry.trash(targets)
        // Nothing gone and nothing refused means the dialog was cancelled.
        if (trashed.length === 0 && failed.length === 0) return

        const gone = (candidate: string): boolean =>
          trashed.some((removed) => samePath(candidate, removed) || isUnder(candidate, removed))

        if (selectedPath && gone(selectedPath)) {
          // Drop the pending write first: flushing it would put the file back.
          discardDoc()
          setSelectedPath(null)
        }
        setCursor((prev) => (prev && gone(prev.path) ? null : prev))
        setMarked((prev) => new Set([...prev].filter((path) => !gone(path))))
        await refreshTree()

        const one = trashed.length === 1
        const what = one ? `“${baseName(trashed[0])}”` : `${trashed.length} items`
        if (failed.length === 0) {
          notify(`Moved ${what} to the ${BIN}`)
        } else if (trashed.length === 0) {
          onError(failed[0].message)
        } else {
          onError(
            `Moved ${what} to the ${BIN}, but ${failed.length} stayed — ${failed[0].message}`
          )
        }
      })
    },
    [discardDoc, guard, notify, onError, refreshTree, selectedPath]
  )

  // A file deleted by another program must not be resurrected by the next
  // keystroke, so the buffer lets go of it as soon as the tree does.
  useEffect(() => {
    if (!ready || !worktree || !selectedPath || settling.current > 0) return
    if (findNode(tree, selectedPath)) return
    discardDoc()
    setSelectedPath(null)
  }, [discardDoc, ready, selectedPath, tree, worktree])

  // The marking is a set of paths, and paths go stale. Anything the tree no
  // longer knows about stops being marked, so a command can never reach for it.
  useEffect(() => {
    if (!ready || settling.current > 0 || marked.size === 0) return
    setMarked((prev) => {
      const kept = [...prev].filter((path) => findNode(tree, path))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [marked, ready, tree])

  const openMatch = useCallback(
    (match: SearchMatch) => {
      if (match.kind === 'dir') {
        // Nothing to open: unfold it in the tree and step out of the search.
        expandTo(match.path, true)
        clearSearch()
        trackCursor(match.path)
        markOnly(match.path)
        return
      }

      expandTo(match.path, false)
      setGuideOpen(false)
      setSelectedPath(match.path)
      trackCursor(match.path)
      markOnly(match.path)
      setMode('edit')

      if (match.kind === 'content') {
        setReveal((prev) => ({
          path: match.path,
          line: match.line ?? 1,
          column: match.column ?? 0,
          length: match.length ?? 0,
          token: (prev?.token ?? 0) + 1
        }))
      }
    },
    [clearSearch, expandTo, markOnly, trackCursor]
  )

  const revealCrumb = useCallback(
    (path: string) => {
      setSidebarVisible(true)
      clearSearch()
      expandTo(path, true)
      trackCursor(path)
      markOnly(path)
    },
    [clearSearch, expandTo, markOnly, trackCursor]
  )

  /* ---------- context menus ---------- */

  /**
   * What a row command acts on. A row inside the marking speaks for all of it;
   * a row outside it speaks only for itself, the way a click would.
   */
  const targetsFor = useCallback(
    (path: string): string[] =>
      marked.has(path) && marked.size > 1 ? topLevelPaths([...marked]) : [path],
    [marked]
  )

  const nodeMenuItems = useCallback(
    (node: FileNode): MenuItem[] => {
      const parentDir = node.kind === 'dir' ? node.path : dirName(node.path)
      const targets = targetsFor(node.path)
      const many = targets.length > 1
      return [
        {
          label: 'New file',
          accelerator: `${MOD} N`,
          onSelect: () => startDraft(parentDir, 'file')
        },
        {
          label: 'New folder',
          accelerator: `${MOD} ⇧ N`,
          onSelect: () => startDraft(parentDir, 'dir')
        },
        {
          label: 'Rename',
          accelerator: 'F2',
          separatorBefore: true,
          onSelect: () => startRename(node.path)
        },
        {
          label: 'Show in file manager',
          onSelect: () => void window.nano.entry.reveal(node.path)
        },
        {
          label: many ? `Move ${targets.length} items to ${BIN}` : `Move to ${BIN}`,
          accelerator: 'Del',
          danger: true,
          separatorBefore: true,
          onSelect: () => trashEntries(targets)
        }
      ]
    },
    [startDraft, startRename, targetsFor, trashEntries]
  )

  const openNodeMenu = useCallback(
    (event: React.MouseEvent, node: FileNode) => {
      event.preventDefault()
      event.stopPropagation()
      // A right-click outside the marking moves the marking onto that row, so
      // the menu can never act on rows the pointer is nowhere near.
      if (!marked.has(node.path)) markOnly(node.path)
      setContextPath(node.path)
      setMenu({ x: event.clientX, y: event.clientY, items: nodeMenuItems(node) })
    },
    [markOnly, marked, nodeMenuItems]
  )

  /** The keyboard route into the same menu, anchored under the focused row. */
  const openNodeMenuAt = useCallback(
    (node: FileNode, element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      setContextPath(node.path)
      setMenu({ x: rect.left + 10, y: rect.bottom - 2, items: nodeMenuItems(node) })
    },
    [nodeMenuItems]
  )

  const openWorktreeMenu = useCallback(
    (event: React.MouseEvent, current: Worktree) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: 'New file',
            accelerator: `${MOD} N`,
            onSelect: () => startDraft(current.path, 'file')
          },
          {
            label: 'New folder',
            accelerator: `${MOD} ⇧ N`,
            onSelect: () => startDraft(current.path, 'dir')
          },
          {
            label: 'Show in file manager',
            separatorBefore: true,
            onSelect: () => void window.nano.entry.reveal(current.path)
          },
          {
            label: 'Open another folder',
            accelerator: `${MOD} O`,
            separatorBefore: true,
            onSelect: switchWorktree
          }
        ]
      })
    },
    [startDraft, switchWorktree]
  )

  const openThemeMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [{ label: 'Follow the system theme', onSelect: theme.followSystem }]
      })
    },
    [theme.followSystem]
  )

  const openMatchMenu = useCallback(
    (event: React.MouseEvent, match: SearchMatch) => {
      openNodeMenu(event, {
        path: match.path,
        name: match.name,
        kind: match.kind === 'dir' ? 'dir' : 'file'
      })
    },
    [openNodeMenu]
  )

  /* ---------- tree keyboard model ---------- */

  const visibleRows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded])

  /**
   * What a click on a row means, once its modifiers are read. Shift marks the
   * rows between the anchor and this one; Ctrl (with or without Shift) marks or
   * unmarks this row alone; a plain click marks it and opens or unfolds it.
   *
   * Neither modifier opens anything: marking several files and having the last
   * one silently become the open document is not what the gesture asked for.
   */
  const activateRow = useCallback(
    (node: FileNode, mods: RowMods) => {
      if (mods.toggle) {
        setMarked((prev) => {
          const next = new Set(prev)
          if (next.has(node.path)) next.delete(node.path)
          else next.add(node.path)
          return next
        })
        setAnchor(node.path)
        return
      }

      // With nothing to measure from, a shift-click is just a click.
      const from = anchor ?? cursorPath
      if (mods.range && from) {
        setMarked(new Set(rangeBetween(visibleRows, from, node.path)))
        return
      }

      markOnly(node.path)
      if (node.kind === 'dir') toggleDir(node.path)
      else selectFile(node)
    },
    [anchor, cursorPath, markOnly, selectFile, toggleDir, visibleRows]
  )

  const onTreeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (visibleRows.length === 0) return
      const found = visibleRows.findIndex((row) => samePath(row.node.path, cursorPath))
      const index = found === -1 ? 0 : found
      const row = visibleRows[index]
      // Holding shift while walking marks everything the walk crossed, from
      // wherever the cursor last settled on its own.
      const go = (next: number, extend = false): void => {
        const clamped = Math.max(0, Math.min(visibleRows.length - 1, next))
        const path = visibleRows[clamped].node.path
        moveCursor(path)
        if (extend) setMarked(new Set(rangeBetween(visibleRows, anchor ?? row.node.path, path)))
        else setAnchor(path)
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          go(index + 1, event.shiftKey)
          return
        case 'ArrowUp':
          event.preventDefault()
          go(index - 1, event.shiftKey)
          return
        case 'Home':
          event.preventDefault()
          go(0, event.shiftKey)
          return
        case 'End':
          event.preventDefault()
          go(visibleRows.length - 1, event.shiftKey)
          return
        case 'ArrowRight':
          event.preventDefault()
          if (row.node.kind !== 'dir') return
          if (expanded.has(row.node.path)) go(index + 1)
          else toggleDir(row.node.path)
          return
        case 'ArrowLeft':
          event.preventDefault()
          if (row.node.kind === 'dir' && expanded.has(row.node.path)) toggleDir(row.node.path)
          else if (row.parentPath) moveCursor(row.parentPath)
          return
        case 'Enter':
        case ' ':
          event.preventDefault()
          activateRow(row.node, { range: false, toggle: false })
          return
        case 'ContextMenu':
          event.preventDefault()
          openNodeMenuAt(row.node, event.target as HTMLElement)
          return
        case 'F10':
          if (!event.shiftKey) return
          event.preventDefault()
          openNodeMenuAt(row.node, event.target as HTMLElement)
      }
    },
    [activateRow, anchor, cursorPath, expanded, moveCursor, openNodeMenuAt, toggleDir, visibleRows]
  )

  /* ---------- commands ---------- */

  const newFileHere = useCallback(() => {
    const nearest = cursorPath ?? selectedPath
    const parent = nearest
      ? findNode(tree, nearest)?.kind === 'dir'
        ? nearest
        : dirName(nearest)
      : worktree?.path
    if (parent) startDraft(parent, 'file')
  }, [cursorPath, selectedPath, startDraft, tree, worktree])

  const newFolderHere = useCallback(() => {
    const nearest = cursorPath ?? selectedPath
    const parent = nearest
      ? findNode(tree, nearest)?.kind === 'dir'
        ? nearest
        : dirName(nearest)
      : worktree?.path
    if (parent) startDraft(parent, 'dir')
  }, [cursorPath, selectedPath, startDraft, tree, worktree])

  const focusSearch = useCallback(() => {
    if (!worktree) return
    setSidebarVisible(true)
    searchInput.current?.focus()
    searchInput.current?.select()
  }, [worktree])

  const toggleMode = useCallback(() => {
    if (selectedPath || guideOpen) setMode((m) => (m === 'edit' ? 'preview' : 'edit'))
  }, [guideOpen, selectedPath])

  // Rename and delete follow the tree cursor when it has been moved, and the
  // open file otherwise, so neither is stranded behind a mouse click.
  const targetPath = cursorPath ?? selectedPath

  const runCommand = useCallback(
    (command: AppCommand) => {
      switch (command) {
        case 'new-file':
          newFileHere()
          return
        case 'new-folder':
          newFolderHere()
          return
        case 'change-worktree':
          switchWorktree()
          return
        case 'save':
          void saveNow()
          return
        case 'rename':
          if (targetPath) startRename(targetPath)
          return
        case 'trash':
          if (targetPath) trashEntries(targetsFor(targetPath))
          return
        case 'search':
          focusSearch()
          return
        case 'toggle-sidebar':
          setSidebarVisible((v) => !v)
          return
        case 'toggle-mode':
          toggleMode()
          return
        case 'shortcuts':
          setShortcutsOpen(true)
          return
        case 'markdown-guide':
          openGuide()
      }
    },
    [
      focusSearch,
      newFileHere,
      newFolderHere,
      openGuide,
      saveNow,
      startRename,
      switchWorktree,
      targetPath,
      targetsFor,
      toggleMode,
      trashEntries
    ]
  )

  useEffect(() => window.nano.onCommand(runCommand), [runCommand])

  const hotkeys: Hotkey[] = shortcutsOpen
    ? [{ key: 'F1', handler: () => setShortcutsOpen(false) }]
    : [
        { key: 'b', mod: true, handler: () => setSidebarVisible((v) => !v) },
        { key: 'f', mod: true, handler: focusSearch },
        { key: 'e', mod: true, handler: toggleMode },
        { key: 's', mod: true, handler: () => void saveNow() },
        { key: 'o', mod: true, handler: switchWorktree },
        { key: 'n', mod: true, handler: newFileHere },
        { key: 'n', mod: true, shift: true, handler: newFolderHere },
        { key: 'F1', handler: () => setShortcutsOpen(true) },
        { key: 'F1', shift: true, handler: openGuide },
        // Only while the guide is up, so Esc keeps belonging to the search box.
        ...(guideOpen ? [{ key: 'Escape', handler: closeGuide }] : []),
        {
          key: 'F2',
          skipInEditable: true,
          handler: () => {
            if (targetPath) startRename(targetPath)
          }
        },
        {
          key: 'Delete',
          skipInEditable: true,
          handler: () => {
            if (targetPath) trashEntries(targetsFor(targetPath))
          }
        }
      ]

  useHotkeys(hotkeys)

  /* ---------- header ---------- */

  // What the panes and the header show: the guide when it is open, the open
  // file otherwise. One route, so the view switch and the counts serve both.
  const shown = guideOpen
    ? { path: GUIDE_PATH, value: MARKDOWN_GUIDE, ready: true }
    : { path: selectedPath, value: doc.value, ready: doc.loadedPath !== null }

  const fileName = useMemo(
    () => (guideOpen ? GUIDE_NAME : selectedPath ? baseName(selectedPath) : ''),
    [guideOpen, selectedPath]
  )

  const crumbs = useMemo(
    () =>
      !guideOpen && selectedPath && worktree
        ? relativeSegments(selectedPath, worktree.path)
        : [],
    [guideOpen, selectedPath, worktree]
  )

  const meta = useMemo(() => {
    if (!shown.path || !shown.ready) return ''
    if (mode === 'preview') {
      const words = shown.value.trim() ? shown.value.trim().split(/\s+/).length : 0
      return `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`
    }
    const lines = shown.value.split('\n').length
    return `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`
  }, [mode, shown.path, shown.ready, shown.value])

  const treeState = {
    expanded,
    selectedPath,
    renamingPath,
    contextPath,
    cursorPath,
    cursorToken: cursor?.token ?? 0,
    marked,
    tabbablePath: cursorPath ?? visibleRows[0]?.node.path ?? null,
    draft,
    drag: { paths: dragPaths, dropDir }
  }

  return (
    <div className="app" data-platform={window.nano.platform}>
      <Sidebar
        hidden={!sidebarVisible}
        worktree={worktree}
        tree={tree}
        state={treeState}
        onChangeWorktree={switchWorktree}
        onWorktreeContext={openWorktreeMenu}
        search={{
          inputRef: searchInput,
          query: search.query,
          setQuery: search.setQuery,
          clear: search.clear,
          moveActive: search.moveActive,
          setActive: search.setActive,
          submit: () => {
            const match = search.ordered[search.active]
            if (match) openMatch(match)
          },
          results: search.results,
          ordered: search.ordered,
          active: search.active,
          searching: search.searching,
          onActivate: openMatch,
          onContext: openMatchMenu
        }}
        onToggle={toggleDir}
        onActivate={activateRow}
        onContext={openNodeMenu}
        onCursor={trackCursor}
        onTreeKeyDown={onTreeKeyDown}
        onRenameSubmit={submitRename}
        onRenameCancel={() => setRenamingPath(null)}
        onDraftSubmit={submitDraft}
        onDraftCancel={() => setDraft(null)}
        onDragStart={startDrag}
        onDragEnd={endDrag}
        onDragOver={setDropDir}
        onDrop={dropOn}
        onDragExpand={expandForDrag}
      />

      <main className="main">
        <Topbar
          crumbs={crumbs}
          fileName={fileName}
          meta={meta}
          saveState={doc.saveState}
          failure={doc.failure}
          mode={mode}
          externalChange={doc.externalChange}
          hasDocument={shown.path !== null}
          isReference={guideOpen}
          sidebarVisible={sidebarVisible}
          isDark={theme.isDark}
          onCrumb={revealCrumb}
          onCloseReference={closeGuide}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
          onSetMode={setMode}
          onToggleTheme={theme.toggle}
          onThemeContext={openThemeMenu}
          onShowShortcuts={() => setShortcutsOpen(true)}
          onRetrySave={() => void saveNow()}
          onReload={() => void reloadDoc()}
          onKeepMine={() => void keepMine()}
        />

        <div className="content">
          {shown.path ? (
            <>
              <div
                className="pane"
                id="viewpane-code"
                role="tabpanel"
                aria-labelledby="viewtab-code"
                data-inactive={mode === 'preview' ? 'true' : undefined}
                inert={mode === 'preview'}
              >
                <Editor
                  path={shown.path}
                  value={shown.value}
                  loadedPath={guideOpen ? GUIDE_PATH : doc.loadedPath}
                  reveal={guideOpen ? null : reveal}
                  onChange={doc.setValue}
                  readOnly={guideOpen}
                />
              </div>
              <div
                className="pane"
                id="viewpane-preview"
                role="tabpanel"
                aria-labelledby="viewtab-preview"
                data-inactive={mode === 'edit' ? 'true' : undefined}
                inert={mode === 'edit'}
              >
                <Preview source={shown.value} active={mode === 'preview'} />
              </div>
            </>
          ) : (
            <EmptyState
              hasWorktree={worktree !== null}
              onChangeWorktree={switchWorktree}
              onNewFile={newFileHere}
              onShowShortcuts={() => setShortcutsOpen(true)}
              onShowGuide={openGuide}
            />
          )}
        </div>
      </main>

      {menu ? <ContextMenu anchor={menu} onClose={closeMenu} /> : null}
      {shortcutsOpen ? <ShortcutSheet onClose={() => setShortcutsOpen(false)} /> : null}
      {notice ? (
        <div
          key={notice.id}
          className="toast"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  )
}
