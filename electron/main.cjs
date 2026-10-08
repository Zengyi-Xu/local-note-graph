const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_SCHEME = 'kg'
const APP_HOST = 'desktop'

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function registerAppProtocol() {
  const distRoot = path.resolve(__dirname, '..', 'dist')

  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url)
    let relativePath = decodeURIComponent(requestUrl.pathname)

    if (requestUrl.host !== APP_HOST) {
      return new Response('Not found', { status: 404 })
    }

    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html'
    }

    const filePath = path.resolve(distRoot, `.${relativePath}`)
    const relativeToRoot = path.relative(distRoot, filePath)
    const isOutsideRoot =
      relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)

    if (isOutsideRoot) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    title: '本地笔记图谱',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = `${APP_SCHEME}://${APP_HOST}`
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url)
      }
    }
  })

  window.once('ready-to-show', () => window.show())
  void window.loadURL(`${APP_SCHEME}://${APP_HOST}/`)
}

function registerSyncHandlers() {
  ipcMain.handle('sync:choose-file', async () => {
    const result = await dialog.showSaveDialog({
      title: '选择笔记同步文件',
      defaultPath: 'notes.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['createDirectory'],
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('sync:write-file', async (_event, payload) => {
    if (!payload || typeof payload.filePath !== 'string' || typeof payload.contents !== 'string') {
      throw new Error('Invalid sync payload')
    }

    const targetPath = path.resolve(payload.filePath)
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(tempPath, payload.contents, 'utf8')
    await fs.rename(tempPath, targetPath)
    return { filePath: targetPath }
  })

  ipcMain.handle('sync:read-file', async (_event, payload) => {
    if (!payload || typeof payload.filePath !== 'string') {
      throw new Error('Invalid read payload')
    }
    const targetPath = path.resolve(payload.filePath)
    try {
      const content = await fs.readFile(targetPath, 'utf8')
      return { content }
    } catch (error) {
      if (error && error.code === 'ENOENT') return { content: null }
      throw error
    }
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.kaust.knowledgegraph')
    registerAppProtocol()
    registerSyncHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
