const { app, BrowserWindow, net, protocol, shell } = require('electron')
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
    app.setAppUserModelId('app.localnotegraph.desktop')
    registerAppProtocol()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
