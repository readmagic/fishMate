import { ipcMain } from 'electron'
import { getOrderList, getOrder, fetchAndUpdateOrderDetail } from '../shared/services/order.service.js'
import { updateOrderStatus, deleteOrder } from '../shared/db/order.repository.js'
import { OrderStatus, ORDER_STATUS_TEXT } from '../shared/types/order.types.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

export function registerOrderIPC(cm: ClientManager) {
    ipcMain.handle('order:list', async (_e, { accountId, status, limit = 50, offset = 0 }) => {
        return getOrderList({
            accountId: accountId || undefined,
            status: status !== undefined && status !== '' ? Number(status) : undefined,
            limit,
            offset
        })
    })

    ipcMain.handle('order:get', async (_e, { orderId }) => {
        const order = getOrder(orderId)
        if (!order) return { error: '订单不存在' }
        return { order }
    })

    ipcMain.handle('order:refresh', async (_e, { orderId }) => {
        const localOrder = getOrder(orderId)
        if (!localOrder) return { success: false, error: '订单不存在' }
        const client = cm.getClient(localOrder.accountId)
        if (!client) return { success: false, error: '账号未连接' }
        const detail = await fetchAndUpdateOrderDetail(client, orderId)
        if (!detail) return { success: false, error: '获取订单详情失败' }
        return { success: true, order: getOrder(orderId) }
    })

    ipcMain.handle('order:fetch', async (_e, { accountId, orderId }) => {
        if (!accountId || !orderId) return { success: false, error: '缺少 accountId 或 orderId' }
        const client = cm.getClient(accountId)
        if (!client) return { success: false, error: '账号未连接' }
        const detail = await fetchAndUpdateOrderDetail(client, orderId)
        if (!detail) return { success: false, error: '获取订单详情失败' }
        return { success: true, order: getOrder(orderId) }
    })

    ipcMain.handle('order:ship', async (_e, { orderId }) => {
        const localOrder = getOrder(orderId)
        if (!localOrder) return { success: false, error: '订单不存在' }
        if (localOrder.status !== OrderStatus.PENDING_SHIPMENT) {
            return { success: false, error: '只有待发货状态的订单才能执行发货' }
        }
        const client = cm.getClient(localOrder.accountId)
        if (!client) return { success: false, error: '账号未连接' }
        const result = await client.confirmShipment(orderId)
        if (result.success) {
            updateOrderStatus(orderId, OrderStatus.PENDING_RECEIPT, ORDER_STATUS_TEXT[OrderStatus.PENDING_RECEIPT], 'ship_time')
            return { success: true, order: getOrder(orderId) }
        }
        return { success: false, error: result.error }
    })

    ipcMain.handle('order:freeship', async (_e, { orderId }) => {
        const localOrder = getOrder(orderId)
        if (!localOrder) return { success: false, error: '订单不存在' }
        if (localOrder.status !== OrderStatus.PENDING_SHIPMENT) {
            return { success: false, error: '只有待发货状态的订单才能执行发货' }
        }
        if (!localOrder.itemId || !localOrder.buyerUserId) {
            return { success: false, error: '订单缺少商品ID或买家ID，请先刷新订单详情' }
        }
        const client = cm.getClient(localOrder.accountId)
        if (!client) return { success: false, error: '账号未连接' }
        const result = await client.freeShipping(orderId, localOrder.itemId, localOrder.buyerUserId)
        if (result.success) {
            updateOrderStatus(orderId, OrderStatus.PENDING_RECEIPT, ORDER_STATUS_TEXT[OrderStatus.PENDING_RECEIPT], 'ship_time')
            return { success: true, order: getOrder(orderId) }
        }
        return { success: false, error: result.error }
    })

    ipcMain.handle('order:delete', async (_e, { orderId }) => {
        const localOrder = getOrder(orderId)
        if (!localOrder) return { success: false, error: '订单不存在' }
        const success = deleteOrder(orderId)
        if (success) return { success: true, message: '订单记录已删除' }
        return { success: false, error: '删除失败' }
    })
}
