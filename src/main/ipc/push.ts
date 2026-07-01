/**
 * 实时推送 IPC（替代 /ws WebSocket）
 *
 * appEvents 监听器 → 遍历订阅的 webContents → webContents.send('push:event', ...)
 * 渲染层经 preload 的 onPush/subscribe/unsubscribe/updateParams 与本模块交互。
 */
import { ipcMain, BrowserWindow } from 'electron'
import { createLogger } from '../shared/core/logger.js'
import { appEvents, Events } from '../shared/core/event-emitter.js'
import { getOrders, getOrderCount } from '../shared/db/order.repository.js'
import { getAllAccounts } from '../shared/db/account.repository.js'
import { getAllConversations } from '../shared/services/conversation.service.js'
import { getTotalConversationMessageCount } from '../shared/db/index.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

const logger = createLogger('IPC:Push')

type Params = Record<string, string | number | undefined>
interface Subscription {
    events: Set<string>
    params: Params
}

// 按渲染进程 webContents 索引区分订阅（多窗口支持）
const subscriptions = new Map<number, Subscription>()

function getSubscription(wcId: number): Subscription {
    let sub = subscriptions.get(wcId)
    if (!sub) {
        sub = { events: new Set(), params: {} }
        subscriptions.set(wcId, sub)
    }
    return sub
}

function sendTo(wcId: number, event: string, data: unknown) {
    const win = BrowserWindow.fromId(wcId)
    if (win && !win.isDestroyed()) {
        win.webContents.send('push:event', { event, data })
    }
}

function broadcast(event: string, getData: (params: Params) => unknown) {
    for (const [wcId, sub] of subscriptions) {
        if (sub.events.has(event)) {
            try {
                sendTo(wcId, event, getData(sub.params))
            } catch (e) {
                logger.debug(`推送失败: ${e}`)
            }
        }
    }
}

function sendInitialData(wcId: number, event: string, params: Params, cm: ClientManager) {
    try {
        let data: unknown
        switch (event) {
            case 'orders': {
                const orders = getOrders({
                    accountId: params.accountId as string | undefined,
                    status: params.status as number | undefined,
                    limit: 50,
                    offset: 0
                })
                const total = getOrderCount({
                    accountId: params.accountId as string | undefined,
                    status: params.status as number | undefined
                })
                data = { orders, total }
                break
            }
            case 'accounts': {
                data = { accounts: getAllAccounts(), clients: cm.getStatus() }
                break
            }
            case 'conversations': {
                const limit = (params.limit as number) || 20
                const { conversations, total } = getAllConversations(limit, 0)
                data = { conversations, total }
                break
            }
            case 'status': {
                data = { messageCount: getTotalConversationMessageCount() }
                break
            }
            default:
                return
        }
        sendTo(wcId, event, data)
    } catch (e) {
        logger.debug(`发送初始数据失败: ${e}`)
    }
}

export function registerPushIPC(cm: ClientManager) {
    // 事件监听（只注册一次）
    appEvents.on(Events.ORDERS_UPDATED, () =>
        broadcast('orders', (p) => ({
            orders: getOrders({
                accountId: p.accountId as string | undefined,
                status: p.status as number | undefined,
                limit: 50,
                offset: 0
            }),
            total: getOrderCount({
                accountId: p.accountId as string | undefined,
                status: p.status as number | undefined
            })
        }))
    )
    appEvents.on(Events.ACCOUNTS_UPDATED, () =>
        broadcast('accounts', () => ({ accounts: getAllAccounts(), clients: cm.getStatus() }))
    )
    appEvents.on(Events.CONVERSATIONS_UPDATED, () => {
        broadcast('conversations', (p) => {
            const limit = (p.limit as number) || 20
            const { conversations, total } = getAllConversations(limit, 0)
            return { conversations, total }
        })
        // 同步推送消息总数，让主控制台「消息」统计随删除/新增即时更新
        broadcast('status', () => ({ messageCount: getTotalConversationMessageCount() }))
    })

    ipcMain.on('push:subscribe', (e, { events, params }: { events: string[]; params?: Params }) => {
        const wcId = e.sender.id
        const sub = getSubscription(wcId)
        for (const evt of events) sub.events.add(evt)
        if (params) Object.assign(sub.params, params)
        for (const evt of events) sendInitialData(wcId, evt, sub.params, cm)
    })

    ipcMain.on('push:unsubscribe', (e, { events }: { events: string[] }) => {
        const sub = subscriptions.get(e.sender.id)
        if (sub) for (const evt of events) sub.events.delete(evt)
    })

    ipcMain.on('push:updateParams', (e, { params }: { params: Params }) => {
        const wcId = e.sender.id
        const sub = subscriptions.get(wcId)
        if (!sub) return
        Object.assign(sub.params, params)
        for (const evt of sub.events) sendInitialData(wcId, evt, sub.params, cm)
    })

    logger.info('推送 IPC 已初始化')
}

/** 清理某窗口的订阅（窗口关闭时调用） */
export function clearPushSubscription(wcId: number) {
    subscriptions.delete(wcId)
}
