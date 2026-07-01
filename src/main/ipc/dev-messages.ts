import { ipcMain } from 'electron'
import { getMessages, clearMessageBuffer } from '../shared/core/raw-message.buffer.js'

export function registerDevMessageIPC() {
    ipcMain.handle('dev:messages:list', async (_e, { accountId, limit = 100 } = {}) => {
        return getMessages(accountId, limit)
    })

    ipcMain.handle('dev:messages:byAccount', async (_e, { accountId, limit = 100 }) => {
        return getMessages(accountId, limit)
    })

    ipcMain.handle('dev:messages:clear', async () => {
        clearMessageBuffer()
        return { success: true }
    })
}
