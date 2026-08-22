import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileNode, NodeKind, SearchMatch, Worktree } from '@shared/types'
import { ContextMenu, type MenuAnchor } from './components/ContextMenu'
import { Editor, type Reveal } from './components/Editor'
import { EmptyState } from './components/EmptyState'
import { Preview } from './components/Preview'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import type { Draft } from './components/Tree'
import { useDocument } from './hooks/useDocument'
import { useHotkeys } from './hooks/useHotkeys'
import { useSearch } from './hooks/useSearch'
import { useTheme } from './hooks/useTheme'
import { useWorktree } from './hooks/useWorktree'
import { messageOf } from './lib/errors'
import { ancestorsWithin, dirName, displayName, samePath, startsWithPath } from './lib/paths'

type Mode = 'edit' | 'preview'

export function App(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const onError = useCallback((message: string) => setError(message), [])

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
  const searchInput = useRef<HTMLInputElement>(null)
  const search = useSearch(onError)
  const theme = useTheme(onError)

  const doc = useDocument(selectedPath, onError)
  const restored = useRef(false)

  // Restore the previous session once the worktree is known, so the remembered
  // file is still guaranteed to live inside it.
  useEffect(() => {
    if (restored.current || !ready) return
    restored.current = true
    void (async () => {
      const ui = await window.nano.ui.read()
      setExpanded(new Set(ui.expanded))
      setSidebarVisible(ui.sidebarVisible)
      if (ui.lastFile) setSelectedPath(ui.lastFile)
    })()
  }, [ready])

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
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  const closeMenu = useCallback(() => {
    setMenu(null)
    setContextPath(null)
  }, [])

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action()
      } catch (err) {
        onError(messageOf(err))
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
      setMode('edit')
      clearSearch()
    })()
  }, [changeWorktree, clearSearch, worktree])

  /* ---------- tree interaction ---------- */

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const selectFile = useCallback((node: FileNode) => setSelectedPath(node.path), [])

  const startDraft = useCallback((parentPath: string, kind: NodeKind) => {
    setExpanded((prev) => new Set(prev).add(parentPath))
    setDraft({ parentPath, kind })
  }, [])

  const submitDraft = useCallback(
    (name: string) => {
      const pending = draft
      setDraft(null)
      if (!pending) return
      void guard(async () => {
        const created = await window.nano.entry.create(pending.parentPath, name, pending.kind)
        await refreshTree()
        if (pending.kind === 'file') setSelectedPath(created)
        else setExpanded((prev) => new Set(prev).add(created))
      })
    },
    [draft, guard, refreshTree]
  )

  const submitRename = useCallback(
    (path: string, name: string) => {
      setRenamingPath(null)
      void guard(async () => {
        const next = await window.nano.entry.rename(path, name)
        await refreshTree()
        if (samePath(selectedPath, path)) setSelectedPath(next)
        setExpanded((prev) => {
          if (!prev.has(path)) return prev
          const updated = new Set(prev)
          updated.delete(path)
          updated.add(next)
          return updated
        })
      })
    },
    [guard, refreshTree, selectedPath]
  )

  const trashEntry = useCallback(
    (path: string) => {
      void guard(async () => {
        await window.nano.entry.trash(path)
        await refreshTree()
        if (selectedPath && (samePath(selectedPath, path) || startsWithPath(selectedPath, path))) {
          setSelectedPath(null)
        }
      })
    },
    [guard, refreshTree, selectedPath]
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

  const openMatch = useCallback(
    (match: SearchMatch) => {
      if (match.kind === 'dir') {
        // Nothing to open: unfold it in the tree and step out of the search.
        expandTo(match.path, true)
        clearSearch()
        return
      }

      expandTo(match.path, false)
      setSelectedPath(match.path)
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
    [clearSearch, expandTo]
  )

  /* ---------- context menus ---------- */

  const openNodeMenu = useCallback(
    (event: React.MouseEvent, node: FileNode) => {
      event.preventDefault()
      event.stopPropagation()
      setContextPath(node.path)
      const parentDir = node.kind === 'dir' ? node.path : dirName(node.path)
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { label: 'New file', onSelect: () => startDraft(parentDir, 'file') },
          { label: 'New folder', onSelect: () => startDraft(parentDir, 'dir') },
          { label: 'Rename', separatorBefore: true, onSelect: () => setRenamingPath(node.path) },
          {
            label: 'Show in file manager',
            onSelect: () => void window.nano.entry.reveal(node.path)
          },
          {
            label: 'Move to trash',
            danger: true,
            separatorBefore: true,
            onSelect: () => trashEntry(node.path)
          }
        ]
      })
    },
    [startDraft, trashEntry]
  )

  const openWorktreeMenu = useCallback(
    (event: React.MouseEvent, current: Worktree) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { label: 'New file', onSelect: () => startDraft(current.path, 'file') },
          { label: 'New folder', onSelect: () => startDraft(current.path, 'dir') },
          {
            label: 'Show in file manager',
            separatorBefore: true,
            onSelect: () => void window.nano.entry.reveal(current.path)
          },
          { label: 'Change worktree', separatorBefore: true, onSelect: switchWorktree }
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
        items: [{ label: 'Follow system theme', onSelect: theme.followSystem }]
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

  /* ---------- shortcuts ---------- */

  const newFileHere = useCallback(() => {
    const parent = selectedPath ? dirName(selectedPath) : worktree?.path
    if (parent) startDraft(parent, 'file')
  }, [selectedPath, startDraft, worktree])

  useHotkeys([
    { key: 'b', mod: true, handler: () => setSidebarVisible((v) => !v) },
    {
      key: 'f',
      mod: true,
      handler: () => {
        if (!worktree) return
        setSidebarVisible(true)
        searchInput.current?.focus()
        searchInput.current?.select()
      }
    },
    {
      key: 'e',
      mod: true,
      handler: () => {
        if (selectedPath) setMode((m) => (m === 'edit' ? 'preview' : 'edit'))
      }
    },
    { key: 's', mod: true, handler: () => void doc.saveNow() },
    { key: 'o', mod: true, handler: switchWorktree },
    { key: 'n', mod: true, handler: newFileHere },
    {
      key: 'F2',
      skipInEditable: true,
      handler: () => {
        if (selectedPath) setRenamingPath(selectedPath)
      }
    },
    {
      key: 'Delete',
      skipInEditable: true,
      handler: () => {
        if (selectedPath) trashEntry(selectedPath)
      }
    }
  ])

  const title = useMemo(() => (selectedPath ? displayName(selectedPath) : ''), [selectedPath])

  const treeState = { expanded, selectedPath, renamingPath, contextPath, draft }

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
        onSelect={selectFile}
        onContext={openNodeMenu}
        onRenameSubmit={submitRename}
        onRenameCancel={() => setRenamingPath(null)}
        onDraftSubmit={submitDraft}
        onDraftCancel={() => setDraft(null)}
      />

      <main className="main">
        <Topbar
          title={title}
          dirty={doc.dirty || doc.saving}
          mode={mode}
          externalChange={doc.externalChange}
          hasDocument={selectedPath !== null}
          isDark={theme.isDark}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
          onToggleMode={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
          onToggleTheme={theme.toggle}
          onThemeContext={openThemeMenu}
          onReload={() => void doc.reload()}
        />

        <div className="content">
          {selectedPath ? (
            <>
              <div className="pane" data-inactive={mode === 'preview' ? 'true' : undefined}>
                <Editor
                  path={selectedPath}
                  value={doc.value}
                  loadedPath={doc.loadedPath}
                  reveal={reveal}
                  onChange={doc.setValue}
                />
              </div>
              <div className="pane" data-inactive={mode === 'edit' ? 'true' : undefined}>
                <Preview source={doc.value} active={mode === 'preview'} />
              </div>
            </>
          ) : (
            <EmptyState hasWorktree={worktree !== null} onChangeWorktree={switchWorktree} />
          )}
        </div>
      </main>

      {menu ? <ContextMenu anchor={menu} onClose={closeMenu} /> : null}
      {error ? <div className="toast">{error}</div> : null}
    </div>
  )
}
