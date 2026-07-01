import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import Screenshots from 'electron-screenshots'
import { messageStore } from '../shared/core/message.store.js'
import { uploadImage } from '../shared/services/index.js'
import { conversationStore } from '../shared/core/conversation.store.js'
import { createLogger } from '../shared/core/logger.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

const logger = createLogger('IPC:Message')

// 微信式截屏：electron-screenshots 单例，惰性初始化（须在 app ready 后）
let screenshots: Screenshots | null = null
function getScreenshots(): Screenshots {
    if (!screenshots) screenshots = new Screenshots()
    return screenshots
}

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

    // 发送本地图片：上传 CDN → 发 ctype=2 图片消息 → 入库（ctype=2 + extra）
    ipcMain.handle('message:sendImage', async (_e, { accountId, chatId, toUserId, filePath }) => {
        if (!accountId || !chatId || !toUserId || !filePath) {
            return { success: false, error: 'Missing accountId, chatId, toUserId or filePath' }
        }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: 'Account not connected' }
        const up = await uploadImage(accountId, filePath)
        if (!up) return { success: false, error: '图片上传失败' }
        const ok = client.sendImage(chatId, toUserId, up.url, up.width, up.height)
        if (!ok) return { success: false, error: '发送失败（WebSocket 未连接）' }
        conversationStore.addOutgoing(accountId, chatId, toUserId, '[图片]', {
            contentType: 2,
            extra: { url: up.url, width: up.width, height: up.height }
        })
        return { success: true }
    })

    // 截屏：electron-screenshots 框选区域 → 上传 → 发图片消息
    ipcMain.handle('message:captureScreen', async (_e, { accountId, chatId, toUserId }) => {
        if (!accountId || !chatId || !toUserId) {
            return { success: false, error: 'Missing accountId, chatId or toUserId' }
        }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: 'Account not connected' }
        const shot = getScreenshots()
        try {
            // 框选并等待用户确认；取消则 resolve(null)
            const buffer = await new Promise<Buffer | null>((resolve) => {
                const onOk = (_e: unknown, buf: Buffer) => {
                    shot.off('cancel', onCancel)
                    resolve(buf)
                }
                const onCancel = () => {
                    shot.off('ok', onOk)
                    resolve(null)
                }
                shot.once('ok', onOk)
                shot.once('cancel', onCancel)
                shot.startCapture()
            })
            if (!buffer) return { success: false, error: '已取消截屏' }
            const tmp = path.join(os.tmpdir(), `fishMate-shot-${Date.now()}.png`)
            fs.writeFileSync(tmp, buffer)
            const up = await uploadImage(accountId, tmp)
            fs.unlink(tmp, () => { /* ignore */ })
            if (!up) return { success: false, error: '截图上传失败' }
            const ok = client.sendImage(chatId, toUserId, up.url, up.width, up.height)
            if (!ok) return { success: false, error: '发送失败（WebSocket 未连接）' }
            conversationStore.addOutgoing(accountId, chatId, toUserId, '[截图]', {
                contentType: 2,
                extra: { url: up.url, width: up.width, height: up.height }
            })
            return { success: true }
        } catch (e: any) {
            logger.error(`截屏失败: ${e?.message || e}`)
            return { success: false, error: '截屏失败' }
        }
    })
}
