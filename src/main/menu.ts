import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC, type AppCommand } from '@shared/ipc'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const BIN_LABEL = isWindows ? 'Move to Recycle Bin' : 'Move to Trash'

function send(command: AppCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IPC.appCommand, command)
}

/**
 * The accelerator is shown but deliberately not registered: the renderer already
 * owns every one of these keys, and registering them here would run the handler
 * twice. The menu is a place to read the shortcut, not a second implementation.
 */
function item(label: string, accelerator: string, command: AppCommand): MenuItemConstructorOptions {
  return { label, accelerator, registerAccelerator: false, click: () => send(command) }
}

/**
 * Only built where a menu bar is actually visible. On Windows the frame is
 * hidden for the Mica titlebar, so the same commands live in the in-app
 * shortcut sheet instead of behind a bar nobody can see.
 */
export function installApplicationMenu(): void {
  if (isWindows) {
    Menu.setApplicationMenu(null)
    return
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '&File',
      submenu: [
        item('New File', 'CmdOrCtrl+N', 'new-file'),
        item('New Folder', 'CmdOrCtrl+Shift+N', 'new-folder'),
        { type: 'separator' },
        item('Open Folder…', 'CmdOrCtrl+O', 'change-worktree'),
        { type: 'separator' },
        item('Save Now', 'CmdOrCtrl+S', 'save'),
        { type: 'separator' },
        item('Rename', 'F2', 'rename'),
        item(BIN_LABEL, 'Delete', 'trash'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find in Folder', 'CmdOrCtrl+F', 'search')
      ]
    },
    {
      label: '&View',
      submenu: [
        item('Toggle Sidebar', 'CmdOrCtrl+B', 'toggle-sidebar'),
        item('Switch Code / Preview', 'CmdOrCtrl+E', 'toggle-mode'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '&Help',
      submenu: [item('Keyboard Shortcuts', 'F1', 'shortcuts')]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
