import { invoke } from '@/core/utils/ipc'
import type { Order, OrderListResponse } from '@/core/types'

export const orderService = {
  getOrders(accountId?: string, status?: number, limit = 50, offset = 0) {
    return invoke<OrderListResponse>('order:list', { accountId, status, limit, offset })
  },
  getOrder(orderId: string) {
    return invoke<{ order: Order }>('order:get', { orderId })
  },
  refreshOrder(orderId: string) {
    return invoke<{ success: boolean; order?: Order; error?: string }>('order:refresh', { orderId })
  },
  fetchOrder(accountId: string, orderId: string) {
    return invoke<{ success: boolean; order?: Order; error?: string }>('order:fetch', { accountId, orderId })
  },
  shipOrder(orderId: string) {
    return invoke<{ success: boolean; order?: Order; error?: string }>('order:ship', { orderId })
  },
  freeShipOrder(orderId: string) {
    return invoke<{ success: boolean; order?: Order; error?: string }>('order:freeship', { orderId })
  },
  deleteOrder(orderId: string) {
    return invoke<{ success: boolean; message?: string; error?: string }>('order:delete', { orderId })
  }
}
