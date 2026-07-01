import { app, BrowserWindow, shell, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createLogger } from './shared/core/logger.js'
import { startBackend, shutdownBackend } from './backend.js'
import { registerAllIPC } from './ipc/index.js'
import { clearPushSubscription } from './ipc/push.js'

const logger = createLogger('Main')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// dev 抑制 Electron 安全告警（Vite HMR 必需 unsafe-eval；生产已注入严格 CSP）
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// 生产环境注入严格 CSP（dev 保留宽松策略以兼容 Vite HMR）
if (app.isPackaged) {
  app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:"
          ]
        }
      })
    })
  })
}
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

async function bootstrap() {
  // 用户数据目录（DB + 日志）落到系统 userData
  process.env.GOOFISH_DATA_DIR = app.getPath('userData')
  if (isDev) process.env.NODE_ENV = 'development'
  process.env.ELECTRON_RUN = '1'

  const cm = await startBackend()
  registerAllIPC(cm)

  createWindow()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'fishMate',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    if (mainWindow) {
      clearPushSubscription(mainWindow.webContents.id)
    }
    mainWindow = null
  })
}

app.setName('fishMate')

app.whenReady().then(bootstrap).catch((e) => {
  logger.error(`启动失败: ${e}`)
  app.quit()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', async (e) => {
  e.preventDefault()
  await shutdownBackend()
  app.exit(0)
})
