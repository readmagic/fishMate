import { ipcMain, BrowserWindow, session, dialog } from 'electron'
import { createLogger } from '../shared/core/logger.js'
import { parseCookies } from '../shared/utils/cookies.js'
import {
    getAllAccounts,
    getAccount,
    upsertAccount,
    deleteAccount,
    updateAccountEnabled,
    getAccountStatus,
    updateAccountUserInfo
} from '../shared/db/index.js'
import { fetchUserInfo, updateAccountAvatar } from '../shared/services/index.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

const logger = createLogger('IPC:Account')

// 扫码登录：独立 session 分区，避免与主窗口登录态串味；每次清空 cookie 确保显示二维码而非"快速进入"
const QR_PARTITION = 'goofish-qr'
const QR_TIMEOUT_MS = 120000
// 扫码 + 手机确认后 passport 下发的完整 session 必含这三项
const QR_REQUIRED_COOKIES = ['_m_h5_tk', 'unb', 'cookie2']
// 伪装 Edge UA，规避闲鱼对 Electron 的滑动验证
const QR_EDGE_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'

// 反检测脚本：伪造 navigator 指纹 + window.chrome，规避闲鱼滑动验证
const QR_STEALTH_JS = `
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en'], configurable: true });
  window.chrome = window.chrome || {};
  if (!window.chrome.runtime) window.chrome.runtime = {};
  if (!window.chrome.app) window.chrome.app = { isInstalled: false };
} catch (e) {}
`

export function registerAccountIPC(cm: ClientManager) {
    ipcMain.handle('account:list', async () => {
        const accounts = getAllAccounts().map((a) => ({
            ...a,
            cookies: a.cookies.substring(0, 50) + '...',
            status: getAccountStatus(a.id)
        }))
        return { accounts }
    })

    ipcMain.handle('account:get', async (_e, { id }) => {
        const account = getAccount(id)
        if (!account) return { error: 'Account not found' }
        return {
            ...account,
            cookies: account.cookies.substring(0, 50) + '...',
            status: getAccountStatus(id)
        }
    })

    ipcMain.handle('account:create', async (_e, body) => {
        const { id, cookies, remark, enabled } = body || {}

        if (cookies) {
            const cookiesObj = parseCookies(cookies)
            const tempAccountId = cookiesObj['unb']
            if (!tempAccountId) {
                return { success: false, error: 'Cookie中缺少必需的unb字段' }
            }
            upsertAccount({ id: tempAccountId, cookies, remark, enabled })
            const userInfo = await fetchUserInfo(tempAccountId)
            if (!userInfo) {
                deleteAccount(tempAccountId)
                return { success: false, error: 'Cookie无效或已过期，无法获取用户信息' }
            }
            logger.info(`获取用户信息: ${userInfo.displayName} (${tempAccountId})`)
            updateAccountUserInfo(tempAccountId, userInfo.displayName, userInfo.avatar)
            return { success: true, accountId: tempAccountId }
        }

        if (!id) return { success: false, error: 'Missing id' }
        const existing = getAccount(id)
        if (!existing) return { success: false, error: 'Account not found' }
        const success = upsertAccount({
            id,
            cookies: existing.cookies,
            nickname: existing.nickname,
            avatar: existing.avatar,
            remark,
            enabled
        })
        return { success }
    })

    ipcMain.handle('account:refreshInfo', async (_e, { id }) => {
        const account = getAccount(id)
        if (!account) return { success: false, error: 'Account not found' }
        const userInfo = await fetchUserInfo(id)
        if (userInfo) {
            updateAccountUserInfo(id, userInfo.displayName, userInfo.avatar)
            return { success: true, userInfo }
        }
        return { success: false, error: 'Failed to fetch user info' }
    })

    // 修改账号头像：弹文件框选图 → 上传到闲鱼 CDN(fleamarket) → 调 mtop.idle.wx.user.profile.update 提交 → 同步本地
    ipcMain.handle('account:updateAvatar', async (_e, { id }) => {
        const account = getAccount(id)
        if (!account) return { success: false, error: 'Account not found' }

        const result = await dialog.showOpenDialog({
            title: '选择头像图片',
            properties: ['openFile'],
            filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
        if (result.canceled || !result.filePaths.length) {
            return { success: false, error: '已取消' }
        }

        const r = await updateAccountAvatar(id, result.filePaths[0])
        if (r.success) {
            // 提交成功后重新拉取用户信息，同步规范的展示头像 URL
            const userInfo = await fetchUserInfo(id)
            if (userInfo) {
                updateAccountUserInfo(id, userInfo.displayName, userInfo.avatar)
            }
        }
        return r
    })

    ipcMain.handle('account:delete', async (_e, { id }) => {
        cm.stopClient(id)
        const success = deleteAccount(id)
        return { success }
    })

    ipcMain.handle('account:setEnabled', async (_e, { id, enabled }) => {
        if (enabled) {
            const r = await cm.startClient(id)
            if (r.success) updateAccountEnabled(id, true)
            return { success: r.success, expired: r.expired, error: r.error }
        }
        const success = cm.stopClient(id)
        if (success) updateAccountEnabled(id, false)
        return { success }
    })

    ipcMain.handle('account:start', async (_e, { id }) => {
        const account = getAccount(id)
        if (!account) return { success: false, expired: false, error: 'Account not found' }
        const r = await cm.startClient(id)
        if (r.success) updateAccountEnabled(id, true)
        return { success: r.success, expired: r.expired, error: r.error }
    })

    ipcMain.handle('account:stop', async (_e, { id }) => {
        const success = cm.stopClient(id)
        if (success) updateAccountEnabled(id, false)
        return { success }
    })

    ipcMain.handle('account:restart', async (_e, { id }) => {
        const r = await cm.restartClient(id)
        return { success: r.success, expired: r.expired, error: r.error }
    })

    // 扫码登录：弹出独立窗口显示闲鱼登录二维码，扫码成功后自动入库
    ipcMain.handle('account:loginQr', async () => {
        const ses = session.fromPartition(QR_PARTITION)
        ses.setUserAgent(QR_EDGE_UA)
        // 伪装 sec-ch-ua / accept-language 头，与 Edge UA 一致，规避闲鱼 Electron 检测
        ses.webRequest.onBeforeSendHeaders((details, cb) => {
            const h = { ...details.requestHeaders }
            h['User-Agent'] = QR_EDGE_UA
            h['sec-ch-ua'] = '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"'
            h['sec-ch-ua-mobile'] = '?0'
            h['sec-ch-ua-platform'] = '"Linux"'
            h['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8'
            cb({ requestHeaders: h })
        })
        await ses.clearStorageData({ storages: ['cookies'] })

        return new Promise<{ success: boolean; accountId?: string; error?: string }>((resolve) => {
            const win = new BrowserWindow({
                width: 720,
                height: 760,
                title: '闲鱼扫码登录',
                autoHideMenuBar: true,
                backgroundColor: '#fff',
                webPreferences: { partition: QR_PARTITION, contextIsolation: true, nodeIntegration: false }
            })

            let settled = false
            let timer: NodeJS.Timeout | null = null
            const finish = (r: { success: boolean; accountId?: string; error?: string }) => {
                if (settled) return
                settled = true
                if (timer) clearInterval(timer)
                try { win.destroy() } catch { /* ignore */ }
                resolve(r)
            }

            // 用户手动关窗视为取消
            win.on('closed', () => finish({ success: false, error: '已取消' }))

            // 页面就绪后注入反检测脚本，规避闲鱼滑动验证
            win.webContents.on('did-finish-load', () => {
                win.webContents.executeJavaScript(QR_STEALTH_JS).catch(() => { /* ignore */ })
            })

            // 加载闲鱼登录页（整页显示，用户自行扫码）
            win.loadURL('https://www.goofish.com/login').catch(() => finish({ success: false, error: '页面加载失败' }))

            // 轮询 session cookies：三项必含 cookie 齐全即扫码+确认完成
            timer = setInterval(async () => {
                try {
                    const cookies = await ses.cookies.get({})
                    const names = new Set(cookies.map((c) => c.name))
                    if (!QR_REQUIRED_COOKIES.every((n) => names.has(n))) return

                    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
                    const accountId = parseCookies(cookieStr)['unb']
                    if (!accountId) {
                        finish({ success: false, error: '登录态缺少 unb 字段' })
                        return
                    }
                    upsertAccount({ id: accountId, cookies: cookieStr })
                    const userInfo = await fetchUserInfo(accountId)
                    if (!userInfo) {
                        deleteAccount(accountId)
                        finish({ success: false, error: 'Cookie无效或已过期，无法获取用户信息' })
                        return
                    }
                    logger.info(`扫码登录成功: ${userInfo.displayName} (${accountId})`)
                    updateAccountUserInfo(accountId, userInfo.displayName, userInfo.avatar)
                    finish({ success: true, accountId })
                } catch (e) {
                    logger.warn(`扫码轮询异常: ${e}`)
                }
            }, 1000)

            setTimeout(() => finish({ success: false, error: '扫码超时，请重试' }), QR_TIMEOUT_MS)
        })
    })
}
