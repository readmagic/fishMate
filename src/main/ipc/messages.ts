import { ipcMain } from 'electron'
import { messageStore } from '../shared/core/message.store.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

export function registerMessageIPC(cm: ClientManager) {
    ipcMain.handle('message:recent', async (_e, { limit = 20 }: { limit?: number }) => {
        return { messages: messageStore.getRecent(limit), total: messageStore.count() }
    })

    ipcMain.handle('message:send', async (_e, { accountId, chatId, toUserId, text }) => {
        if (!accountId || !chatId || !toUserId || !text) {
            return { success: false, error: 'Missing accountId, chatId, toUserId or text' }
        }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: 'Account not connected' }
        const success = await client.sendMessage(chatId, toUserId, text)
        return { success }
    })
}
