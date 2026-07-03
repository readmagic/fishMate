import { ipcMain } from 'electron'
import { conversationStore } from '../shared/core/conversation.store.js'
import { fetchUserHead } from '../shared/services/index.js'
import { getAccount } from '../shared/db/index.js'

export function registerConversationIPC() {
    ipcMain.handle('conversation:list', async (_e, { limit = 20, offset = 0 }) => {
        const { conversations, total } = conversationStore.getAll(limit, offset)
        return { conversations, total, limit, offset }
    })

    ipcMain.handle('conversation:detail', async (_e, { accountId, chatId, limit = 50, beforeId }) => {
        const conv = conversationStore.get(accountId, chatId, limit, beforeId)
        if (!conv) return { error: 'Conversation not found' }
        return conv
    })

    ipcMain.handle('conversation:markRead', async (_e, { accountId, chatId }) => {
        conversationStore.markRead(accountId, chatId)
        return { success: true }
    })

    ipcMain.handle('conversation:delete', async (_e, { accountId, chatId }) => {
        conversationStore.delete(accountId, chatId)
        return { success: true }
    })

    ipcMain.handle('conversation:setHidden', async (_e, { accountId, chatId, hidden }) => {
        conversationStore.setHidden(accountId, chatId, hidden)
        return { success: true }
    })

    ipcMain.handle('conversation:setPinned', async (_e, { accountId, chatId, pinned }) => {
        conversationStore.setPinned(accountId, chatId, pinned)
        return { success: true }
    })

    ipcMain.handle('conversation:userAvatar', async (_e, { userId, accountId }) => {
        const account = accountId ? getAccount(accountId) : null
        if (!account) return { error: 'No account available' }
        const { userHead } = await fetchUserHead(account.id, userId)
        if (userHead) return userHead
        return { error: 'Failed to fetch user info' }
    })
}
