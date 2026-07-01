import { app, BrowserWindow, Tray, Menu, nativeImage, shell, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createLogger } from './shared/core/logger.js'
import { startBackend, shutdownBackend } from './backend.js'
import { registerAllIPC } from './ipc/index.js'
import { clearPushSubscription } from './ipc/push.js'
import { appEvents, Events } from './shared/core/event-emitter.js'

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
let tray: Tray | null = null
let trayIcon: Electron.NativeImage | null = null
let isQuitting = false
let flashTimer: NodeJS.Timeout | null = null

function resolveTrayIconPath() {
  // dev: dist/main → src/renderer/public/tray-logo.png
  // 打包后: app.asar/dist/main → ../renderer/tray-logo.png
  return app.isPackaged
    ? path.join(__dirname, '../renderer/tray-logo.png')
    : path.join(__dirname, '../../src/renderer/public/tray-logo.png')
}

function createTray() {
  if (tray) return
  trayIcon = nativeImage.createFromPath(resolveTrayIconPath()).resize({ width: 22, height: 22 })
  tray = new Tray(trayIcon)
  tray.setToolTip('fishMate')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', showWindow)

  // 收到新对话消息 → 托盘闪烁；窗口显示/聚焦后自动停止
  appEvents.on(Events.NEW_MESSAGE, startFlashing)
}

function startFlashing() {
  if (flashTimer || !tray || !trayIcon) return
  const emptyIcon = nativeImage.createEmpty()
  let on = false
  flashTimer = setInterval(() => {
    on = !on
    tray?.setImage(on ? emptyIcon : trayIcon)
  }, 500)
}

function stopFlashing() {
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
  if (tray && trayIcon) tray.setImage(trayIcon)
}

function showWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function bootstrap() {
  // 用户数据目录（DB + 日志）落到系统 userData
  process.env.GOOFISH_DATA_DIR = app.getPath('userData')
  if (isDev) process.env.NODE_ENV = 'development'
  process.env.ELECTRON_RUN = '1'

  const cm = await startBackend()
  registerAllIPC(cm)

  createWindow()
  createTray()
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

  mainWindow.on('show', stopFlashing)
  mainWindow.on('focus', stopFlashing)

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

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
  // 托盘常驻：窗口隐藏而非退出，由托盘菜单"退出"或 Cmd+Q 退出
})

app.on('before-quit', async (e) => {
  isQuitting = true
  stopFlashing()
  e.preventDefault()
  await shutdownBackend()
  app.exit(0)
})
