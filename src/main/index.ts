import { app, BrowserWindow, Tray, Menu, nativeImage, shell, session, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createLogger } from './shared/core/logger.js'
import { startBackend, shutdownBackend } from './backend.js'
import { registerAllIPC } from './ipc/index.js'
import { clearPushSubscription } from './ipc/push.js'
import { appEvents, Events } from './shared/core/event-emitter.js'

const logger = createLogger('Main')

// 关闭 Blink 自动化标记，使 webview 的 navigator.webdriver=false，规避闲鱼滑动验证检测
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

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
let inChatView = false // 渲染层当前是否在对话消息页（聚焦时新消息不闪烁）

ipcMain.handle('message:setInChat', (_e, { inChat }: { inChat: boolean }) => {
  inChatView = inChat
  return true
})

function resolveTrayIconPath() {
  // dev: dist/main → src/renderer/public/tray-logo.png
  // 打包后: app.asar/dist/main → ../renderer/tray-logo.png
  return app.isPackaged
    ? path.join(__dirname, '../renderer/tray-logo.png')
    : path.join(__dirname, '../../src/renderer/public/tray-logo.png')
}

function createTray() {
  if (tray) return
  trayIcon = nativeImage.createFromPath(resolveTrayIconPath()).resize({ width: 32, height: 32 })
  tray = new Tray(trayIcon)
  tray.setToolTip('fishMate')
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
  // 左键单击：有未读闪烁消息时直接显示窗口（showWindow 内部负责跳转对话页），否则弹出菜单
  tray.on('click', () => {
    if (flashTimer) showWindow()
    else tray?.popUpContextMenu(contextMenu)
  })

  // 收到新对话消息 → 托盘闪烁；窗口显示/聚焦后自动停止
  appEvents.on(Events.NEW_MESSAGE, startFlashing)
}

function startFlashing() {
  if (flashTimer || !tray || !trayIcon) return
  // 正在聊天界面且窗口可见聚焦时，用户已能实时看到新消息，不打扰
  if (inChatView && mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) return
  const emptyIcon = nativeImage.createEmpty()
  let on = false
  flashTimer = setInterval(() => {
    on = !on
    tray?.setImage(on ? emptyIcon : trayIcon)
  }, 500)
  // 通知渲染层播放提示音（与闪烁同触发条件，已排除用户正盯聊天页的情况）
  mainWindow?.webContents.send('message:playSound')
}

function stopFlashing() {
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
  if (tray && trayIcon) tray.setImage(trayIcon)
}

function showWindow() {
  // 在 show() 触发 stopFlashing 之前捕获未读状态，用于跳转对话页
  const wasFlashing = !!flashTimer
  if (!mainWindow) {
    createWindow()
    if (wasFlashing) {
      mainWindow?.webContents.once('dom-ready', () =>
        mainWindow?.webContents.send('navigate:route', '/conversations'))
    }
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (wasFlashing) mainWindow.webContents.send('navigate:route', '/conversations')
}

async function bootstrap() {
  // 用户数据目录（DB + 日志）落到系统 userData
  process.env.GOOFISH_DATA_DIR = app.getPath('userData')
  if (isDev) process.env.NODE_ENV = 'development'
  else process.env.NODE_ENV = 'production'
  process.env.ELECTRON_RUN = '1'

  const cm = await startBackend()
  registerAllIPC(cm)
  registerWindowControls()
  registerAppSettings()

  createWindow()
  createTray()
}

// 自定义标题栏窗口控制（frameless 窗口的最小化/最大化/关闭）
function registerWindowControls() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => !!mainWindow?.isMaximized())
}

// 开机自启：读写系统登录项
function registerAppSettings() {
  ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('autostart:set', (_e, { enabled }: { enabled: boolean }) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return app.getLoginItemSettings().openAtLogin
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'fishMate',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  // 自定义标题栏：窗口最大化状态变化时通知渲染层切换图标
  const emitMaxState = () => mainWindow?.webContents.send('window:maximizeChange', !!mainWindow?.isMaximized())
  mainWindow.on('maximize', emitMaxState)
  mainWindow.on('unmaximize', emitMaxState)

  // 打包后屏蔽 DevTools 快捷键（F12 / Ctrl+Shift+I,J,C / Cmd+Opt+I,J），控制台不可打开
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const k = input.key.toLowerCase()
      const devtools =
        k === 'f12' ||
        (input.control && input.shift && (k === 'i' || k === 'j' || k === 'c')) ||
        (input.meta && input.alt && (k === 'i' || k === 'j'))
      if (devtools) event.preventDefault()
    })
  }

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
