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
  entryMove: 'entry:move',
  entryTrash: 'entry:trash',
  entryReveal: 'entry:reveal',
  openExternal: 'shell:open-external',
  themeGet: 'theme:get',
  themeSet: 'theme:set',
  uiStateRead: 'ui:read',
  uiStatePatch: 'ui:patch',
  appFlush: 'app:flush',
  appFlushDone: 'app:flush-done',
  appCommand: 'app:command',
  treeChanged: 'tree:changed',
  fileChanged: 'file:changed'
} as const

/**
 * Everything the application menu can ask for. The menu lives in main and the
 * shortcuts live in the renderer, so both routes end at the same list.
 */
export const APP_COMMANDS = [
  'new-file',
  'new-folder',
  'change-worktree',
  'save',
  'rename',
  'trash',
  'search',
  'toggle-sidebar',
  'toggle-mode',
  'shortcuts',
  'markdown-guide'
] as const

export type AppCommand = (typeof APP_COMMANDS)[number]

export interface UiState {
  expanded: string[]
  lastFile: string | null
  sidebarVisible: boolean
}
