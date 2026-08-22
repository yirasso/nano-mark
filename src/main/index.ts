import path from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { registerIpcHandlers, restoreWorktree } from './ipc'
import { flushState, getState, loadState, patchState } from './store'
import { usePortableDataDir } from './portable'
import { stopWatching } from './watcher'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null

// Before the lock: it is keyed on userData, so a portable copy and an installed
// one are only allowed to run side by side once they point at different folders.
usePortableDataDir()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  void start()
}

async function start(): Promise<void> {
  await app.whenReady()
  app.setAppUserModelId('com.nanomark.app')

  const state = await loadState()
  // Applied before the window exists, so it opens in the right colours.
  nativeTheme.themeSource = state.theme
  registerIpcHandlers()
  await restoreWorktree()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

function createWindow(): void {
  const { bounds } = getState()

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 560,
    minHeight: 420,
    show: false,
    frame: false,
    // A transparent base is what lets the Windows backdrop material show through.
    backgroundColor: '#00000000',
    ...(isWindows
      ? {
          backgroundMaterial: 'mica' as const,
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#00000000', symbolColor: '#8a8a90', height: 40 }
        }
      : {}),
    ...(isMac
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 13 }
        }
      : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Nothing in this app should ever navigate away or open a second window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })

  const persistBounds = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    const next = mainWindow.getNormalBounds()
    patchState({ bounds: { x: next.x, y: next.y, width: next.width, height: next.height } })
  }
  mainWindow.on('resized', persistBounds)
  mainWindow.on('moved', persistBounds)
  // Give the renderer a moment to write out any pending edit before we tear down.
  let readyToClose = false
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  const finishClose = (): void => {
    if (readyToClose) return
    readyToClose = true
    if (closeTimer) clearTimeout(closeTimer)
    mainWindow?.close()
  }

  ipcMain.on(IPC.appFlushDone, finishClose)

  mainWindow.on('close', (event) => {
    if (readyToClose || !mainWindow || mainWindow.webContents.isDestroyed()) return
    event.preventDefault()
    mainWindow.webContents.send(IPC.appFlush)
    closeTimer = setTimeout(finishClose, 1500)
  })

  mainWindow.on('closed', () => {
    if (closeTimer) clearTimeout(closeTimer)
    ipcMain.off(IPC.appFlushDone, finishClose)
    mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('before-quit', () => {
  stopWatching()
  void flushState()
})
