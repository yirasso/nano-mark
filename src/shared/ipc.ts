/** Channel names, shared so main and preload can never drift apart. */
export const IPC = {
  worktreeGet: 'worktree:get',
  worktreeChange: 'worktree:change',
  treeRead: 'tree:read',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  searchRun: 'search:run',
  entryCreate: 'entry:create',
  entryRename: 'entry:rename',
  entryTrash: 'entry:trash',
  entryReveal: 'entry:reveal',
  openExternal: 'shell:open-external',
  themeGet: 'theme:get',
  themeSet: 'theme:set',
  uiStateRead: 'ui:read',
  uiStatePatch: 'ui:patch',
  appFlush: 'app:flush',
  appFlushDone: 'app:flush-done',
  treeChanged: 'tree:changed',
  fileChanged: 'file:changed'
} as const

export interface UiState {
  expanded: string[]
  lastFile: string | null
  sidebarVisible: boolean
}
