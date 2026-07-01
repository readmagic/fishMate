import WebSocket from 'ws'

import { createLogger } from '../core/logger.js'
import { generateMid, generateUuid } from '../utils/crypto.js'
import { conversationStore } from '../core/conversation.store.js'

const logger = createLogger('Ws:Sender')

export interface SendMessageOptions {
    accountId: string
    myId: string
    ws: WebSocket
    chatId: string
    toUserId: string
    text: string
}

/**
 * 发送自定义消息公共信封（移植 goofish-cli core/ws.py _send_custom）
 * ctype=1 文本，ctype=2 图片；payload 由调用方构造
 */
function sendCustom(
    ws: WebSocket,
    myId: string,
    chatId: string,
    toUserId: string,
    ctype: number,
    payload: Record<string, unknown>
): string {
    const mid = generateMid()
    const dataB64 = Buffer.from(JSON.stringify(payload)).toString('base64')
    const msg = {
        lwp: '/r/MessageSend/sendByReceiverScope',
        headers: { mid },
        body: [
            {
                uuid: generateUuid(),
                cid: `${chatId}@goofish`,
                conversationType: 1,
                content: { contentType: 101, custom: { type: ctype, data: dataB64 } },
                redPointPolicy: 0,
                extension: { extJson: '{}' },
                ctx: { appVersion: '1.0', platform: 'web' },
                mtags: {},
                msgReadStatusSetting: 1
            },
            { actualReceivers: [`${toUserId}@goofish`, `${myId}@goofish`] }
        ]
    }
    ws.send(JSON.stringify(msg))
    return mid
}

/** 发送文本消息（ctype=1） */
export function sendText(ws: WebSocket, myId: string, chatId: string, toUserId: string, text: string): string {
    return sendCustom(ws, myId, chatId, toUserId, 1, { contentType: 1, text: { text } })
}

/** 发送图片消息（ctype=2），url 须为闲鱼 CDN 图片地址 */
export function sendImage(
    ws: WebSocket,
    myId: string,
    chatId: string,
    toUserId: string,
    url: string,
    width: number,
    height: number
): string {
    return sendCustom(ws, myId, chatId, toUserId, 2, {
        contentType: 2,
        image: { pics: [{ type: 0, url, width, height }] }
    })
}

/**
 * 发送消息到指定用户（文本，兼容旧调用入口）
 */
export async function sendMessage(options: SendMessageOptions): Promise<boolean> {
    const { accountId, myId, ws, chatId, toUserId, text } = options

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        logger.error(`[${accountId}] WebSocket未连接，无法发送消息`)
        return false
    }

    try {
        sendText(ws, myId, chatId, toUserId, text)
        logger.info(`[${accountId}] 消息已发送到 ${toUserId}: ${text}`)
        // 记录发出的消息
        conversationStore.addOutgoing(accountId, chatId, toUserId, text)
        return true
    } catch (e) {
        logger.error(`[${accountId}] 发送消息失败: ${e}`)
        return false
    }
}
