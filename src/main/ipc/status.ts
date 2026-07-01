import { ipcMain } from 'electron'
import { messageStore } from '../shared/core/message.store.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

export function registerStatusIPC(cm: ClientManager) {
    ipcMain.handle('status:health', async () => {
        return { status: 'ok', timestamp: Date.now() }
    })

    ipcMain.handle('status:all', async () => {
        return {
            clients: cm.getStatus(),
            activeCount: cm.getActiveCount(),
            messageCount: messageStore.count()
        }
    })
}
