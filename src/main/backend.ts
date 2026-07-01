/**
 * 后端启动入口（无 HTTP 服务器）
 *
 * 数据库 → WebSocket 客户端管理器 → 拉起所有启用账号。
 * Electron 主进程调用，IPC 取代了原 Hono HTTP 路由层。
 */
import { createLogger, cleanOldLogs, setLogLevel, type LogLevel } from './shared/core/logger.js'
import { LOG_CONFIG, ENV } from './shared/core/constants.js'
import { initDatabase, closeDatabase } from './shared/db/index.js'
import { messageStore, conversationStore } from './shared/core/index.js'
import { initRawMessageBuffer } from './shared/core/raw-message.buffer.js'
import { ClientManager } from './shared/websocket/index.js'
import { fetchUserHead, handleOrderMessage, fetchAndUpdateOrderDetail } from './shared/services/index.js'

const logger = createLogger('App')

let clientManager: ClientManager | null = null

export function getClientManager(): ClientManager | null {
    return clientManager
}

export async function startBackend(): Promise<ClientManager> {
    setLogLevel(LOG_CONFIG.LEVEL as LogLevel)
    cleanOldLogs(LOG_CONFIG.RETENTION_DAYS)
    if (ENV.IS_DEV) initRawMessageBuffer()

    logger.info('启动闲鱼多账号WebSocket客户端...')

    initDatabase()

    clientManager = new ClientManager(async (accountId, msg) => {
        logger.info(`收到新消息: ${msg.senderName}: ${msg.content}`)
        messageStore.add(msg)

        // 自己发的消息（senderId === 账号ID）：作为发出记录，不增未读、不触发通知
        if (msg.senderId === accountId && !msg.isOrderMessage) {
            conversationStore.addRemoteOutgoing(accountId, msg)
        } else {
            conversationStore.addIncoming(accountId, msg)
        }

        if (msg.isOrderMessage && msg.orderId) {
            logger.info(`订单消息: orderId=${msg.orderId}`)
            handleOrderMessage(accountId, msg.orderId, msg.chatId)
            fetchOrderDetailAsync(accountId, msg.orderId)
        }

        // 仅对方消息才拉取/更新会话用户头像；自己消息的 senderId===accountId 会把 user_avatar 误写成自己的
        if (msg.senderId !== accountId) {
            fetchUserAvatarAsync(accountId, msg.chatId, msg.senderId)
        }
    })

    await clientManager.startAll()

    logger.info('系统已启动，等待消息...')
    return clientManager
}

export async function shutdownBackend(): Promise<void> {
    try {
        clientManager?.stopAll()
        closeDatabase()
    } catch (e) {
        logger.error(`退出清理失败: ${e}`)
    }
}

async function fetchUserAvatarAsync(accountId: string, chatId: string, userId: string) {
    try {
        const { userHead } = await fetchUserHead(accountId, userId)
        if (userHead?.avatar) {
            conversationStore.updateUserAvatar(accountId, chatId, userHead.avatar)
        }
    } catch (e) {
        logger.debug(`获取用户头像失败: ${e}`)
    }
}

async function fetchOrderDetailAsync(accountId: string, orderId: string) {
    try {
        const client = clientManager?.getClient(accountId)
        if (!client) {
            logger.warn(`获取订单详情失败: 账号 ${accountId} 客户端不存在`)
            return
        }
        await fetchAndUpdateOrderDetail(client, orderId)
    } catch (e) {
        logger.debug(`获取订单详情失败: ${e}`)
    }
}
