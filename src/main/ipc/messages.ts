import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import https from 'https'
import { messageStore } from '../shared/core/message.store.js'
import { uploadImage } from '../shared/services/index.js'
import { conversationStore } from '../shared/core/conversation.store.js'
import { getStorageToken } from '../shared/db/index.js'
import { createLogger } from '../shared/core/logger.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

const logger = createLogger('IPC:Message')

// 手动构建 multipart form-data 并上传到 storage.to
function uploadToStorageTo(filePath: string, token: string): Promise<{ url: string; filename: string }> {
    return new Promise((resolve, reject) => {
        const filename = path.basename(filePath)
        const fileBuf = fs.readFileSync(filePath)
        const boundary = `----fishMate${Date.now()}`

        // 构建 multipart body
        const header = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
        )
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
        const body = Buffer.concat([header, fileBuf, footer])

        const headers: Record<string, string> = {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(body.length)
        }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const req = https.request('https://storage.to/api/sharex/upload', {
            method: 'POST',
            headers
        }, (res) => {
            const chunks: Buffer[] = []
            res.on('data', (chunk: Buffer) => chunks.push(chunk))
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString()
                try {
                    const data = JSON.parse(text)
                    if (data.success && data.url) {
                        resolve({ url: data.url, filename: data.filename || filename })
                    } else {
                        reject(new Error(data.error || `上传失败: ${text}`))
                    }
                } catch {
                    reject(new Error(`上传响应解析失败: ${text}`))
                }
            })
        })
        req.on('error', (err) => reject(new Error(`上传请求失败: ${err.message}`)))
        req.write(body)
        req.end()
    })
}

// 10MB base64 上限 (~7.5MB 实际图片)
const MAX_BASE64_LENGTH = 10 * 1024 * 1024

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

    // 发送剪贴板图片：base64 → 写临时文件 → 上传 CDN → 发图片消息 → 入库
    ipcMain.handle('message:sendImageBuffer', async (_e, { accountId, chatId, toUserId, base64, ext }) => {
        if (!accountId || !chatId || !toUserId || !base64) {
            return { success: false, error: 'Missing accountId, chatId, toUserId or base64' }
        }
        if (base64.length > MAX_BASE64_LENGTH) {
            return { success: false, error: '图片太大，请粘贴小于 7.5MB 的图片' }
        }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: 'Account not connected' }
        try {
            const suffix = ext === 'image/jpeg' ? '.jpg' : '.png'
            const tmp = path.join(os.tmpdir(), `fishMate-paste-${Date.now()}${suffix}`)
            fs.writeFileSync(tmp, Buffer.from(base64, 'base64'))
            const up = await uploadImage(accountId, tmp)
            fs.unlink(tmp, () => { /* ignore */ })
            if (!up) return { success: false, error: '图片上传失败' }
            const ok = client.sendImage(chatId, toUserId, up.url, up.width, up.height)
            if (!ok) return { success: false, error: '发送失败（WebSocket 未连接）' }
            conversationStore.addOutgoing(accountId, chatId, toUserId, '[图片]', {
                contentType: 2,
                extra: { url: up.url, width: up.width, height: up.height }
            })
            return { success: true }
        } catch (e: any) {
            logger.error(`粘贴图片发送失败: ${e?.message || e}`)
            return { success: false, error: '粘贴图片发送失败' }
        }
    })

    // 发送文件：上传到 storage.to → 获取临时链接 → 发文本消息 → 入库
    ipcMain.handle('message:sendFile', async (_e, { accountId, chatId, toUserId, filePath }) => {
        if (!accountId || !chatId || !toUserId || !filePath) {
            return { success: false, error: 'Missing accountId, chatId, toUserId or filePath' }
        }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: 'Account not connected' }

        try {
            const stat = fs.statSync(filePath)
            const MAX_FILE_SIZE = 25 * 1024 * 1024 // storage.to ShareX 上限 25MB
            if (stat.size > MAX_FILE_SIZE) {
                return { success: false, error: '文件超过 25MB，暂不支持大文件上传' }
            }
            const filename = path.basename(filePath)

            const token = getStorageToken()
            const up = await uploadToStorageTo(filePath, token)

            const text = `[文件] ${filename} ${up.url}`
            const ok = await client.sendMessage(chatId, toUserId, text)
            if (!ok) return { success: false, error: '发送失败（WebSocket 未连接）' }

            conversationStore.addOutgoing(accountId, chatId, toUserId, text, { contentType: 1 })
            return { success: true, url: up.url, filename }
        } catch (e: any) {
            logger.error(`发送文件失败: ${e?.message || e}`)
            return { success: false, error: `发送文件失败: ${e?.message || e}` }
        }
    })
}
