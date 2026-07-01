/**
 * 原始（解包前）消息缓冲区
 *
 * 供 message.receiver 写入、IPC dev-messages 模块读取（dev 模式调试用）。
 * 从原 src/api/routes/dev-messages.route.ts 抽出，去除 Hono 依赖。
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'

import { createLogger } from './logger.js'
import { decryptMessagePack } from '../utils/msgpack.js'
import { getDataDir } from './paths.js'

const logger = createLogger('DevMsg')

const rawLogDir = () => join(getDataDir(), 'logs', 'raw')
const RAW_RETENTION_DAYS = 3

export interface RawMessage {
    accountId: string
    timestamp: string
    lwp: string
    data: any
    decoded: any[] | null
}

const messageBuffer: RawMessage[] = []
const MAX_BUFFER_SIZE = 500

function decodeMessageData(msgData: any): any[] | null {
    try {
        const body = msgData.body || {}
        let dataList: any[] = []

        if (body.syncPushPackage?.data) {
            dataList = body.syncPushPackage.data
        } else if (Array.isArray(body.data)) {
            dataList = body.data
        } else if (Array.isArray(body)) {
            dataList = body
        }

        if (dataList.length === 0) return null

        const decoded: any[] = []
        for (const item of dataList) {
            const data = typeof item === 'object' ? (item.data || item) : item
            if (!data) continue

            try {
                const result = decryptMessagePack(data)
                if (result) decoded.push(result)
            } catch {
                try {
                    const str = Buffer.from(data, 'base64').toString('utf-8')
                    const parsed = JSON.parse(str)
                    decoded.push(parsed)
                } catch {
                    decoded.push({ raw: data })
                }
            }
        }

        return decoded.length > 0 ? decoded : null
    } catch {
        return null
    }
}

function saveRawToFile(accountId: string, data: any, decoded: any[] | null) {
    try {
        if (!existsSync(rawLogDir())) {
            mkdirSync(rawLogDir(), { recursive: true })
        }
        const now = new Date()
        const dateStr = now.toISOString().slice(0, 10)
        const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '')
        const ms = now.getMilliseconds().toString().padStart(3, '0')
        const filename = `${dateStr}_${timeStr}_${ms}_${accountId}.json`
        const filepath = join(rawLogDir(), filename)
        const content = { accountId, timestamp: now.toISOString(), raw: data, decoded }
        writeFileSync(filepath, JSON.stringify(content, null, 2), 'utf-8')
    } catch (e) {
        logger.debug(`保存原始消息到文件失败: ${e}`)
    }
}

export function addRawMessage(accountId: string, data: any) {
    const decoded = decodeMessageData(data)
    saveRawToFile(accountId, data, decoded)
    const msg: RawMessage = {
        accountId,
        timestamp: new Date().toISOString(),
        lwp: data.lwp || '',
        data,
        decoded
    }
    messageBuffer.unshift(msg)
    if (messageBuffer.length > MAX_BUFFER_SIZE) {
        messageBuffer.pop()
    }
}

export function clearMessageBuffer() {
    messageBuffer.length = 0
}

export function getMessages(accountId?: string, limit = 100): { total: number; messages: RawMessage[] } {
    const filtered = accountId ? messageBuffer.filter((m) => m.accountId === accountId) : messageBuffer
    return { total: filtered.length, messages: filtered.slice(0, limit) }
}

export function cleanOldRawMessages() {
    try {
        if (!existsSync(rawLogDir())) return
        const now = Date.now()
        const maxAge = RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000
        const files = readdirSync(rawLogDir())
        let cleanedCount = 0
        for (const file of files) {
            if (!file.endsWith('.json')) continue
            const filepath = join(rawLogDir(), file)
            try {
                const stat = statSync(filepath)
                if (now - stat.mtimeMs > maxAge) {
                    unlinkSync(filepath)
                    cleanedCount++
                }
            } catch {
                /* ignore */
            }
        }
        if (cleanedCount > 0) {
            logger.info(`清理了 ${cleanedCount} 个过期的原始消息文件`)
        }
    } catch (e) {
        logger.debug(`清理原始消息文件失败: ${e}`)
    }
}

// 启动时清理一次，之后每小时清理
export function initRawMessageBuffer() { cleanOldRawMessages(); setInterval(cleanOldRawMessages, 60 * 60 * 1000) }
