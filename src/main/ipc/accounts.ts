import { ipcMain } from 'electron'
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
import { fetchUserInfo } from '../shared/services/index.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

const logger = createLogger('IPC:Account')

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

    ipcMain.handle('account:delete', async (_e, { id }) => {
        cm.stopClient(id)
        const success = deleteAccount(id)
        return { success }
    })

    ipcMain.handle('account:setEnabled', async (_e, { id, enabled }) => {
        const success = updateAccountEnabled(id, enabled)
        if (enabled) await cm.startClient(id)
        else cm.stopClient(id)
        return { success }
    })

    ipcMain.handle('account:start', async (_e, { id }) => {
        const account = getAccount(id)
        if (!account) return { success: false, error: 'Account not found' }
        const success = await cm.startClient(id)
        if (success) updateAccountEnabled(id, true)
        return { success }
    })

    ipcMain.handle('account:stop', async (_e, { id }) => {
        const success = cm.stopClient(id)
        if (success) updateAccountEnabled(id, false)
        return { success }
    })

    ipcMain.handle('account:restart', async (_e, { id }) => {
        const success = await cm.restartClient(id)
        return { success }
    })
}
