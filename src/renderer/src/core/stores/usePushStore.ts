/**
 * 实时推送 store（替代 Angular WSPushService，原 Vue 版用 WebSocket）
 *
 * 改造为 Electron IPC：经 preload 暴露的 window.api 订阅 + onPush 写响应式 ref。
 * 无连接/重连逻辑（IPC 由主进程维护）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Order, Account, Conversation } from '@/core/types'
import { useGoodsStore } from './useGoodsStore'

export interface OrdersUpdate {
  orders: Order[]
  total: number
}
export interface AccountsUpdate {
  accounts: Account[]
  clients: Array<{ accountId: string; connected: boolean; userId: string }>
}
export interface ConversationsUpdate {
  conversations: Conversation[]
  total: number
}

const api = (window as unknown as {
  api: {
    subscribe: (events: string[], params?: Record<string, unknown>) => void
    unsubscribe: (events: string[]) => void
    onPush: (cb: (p: { event: string; data: unknown }) => void) => () => void
  }
}).api

export const usePushStore = defineStore('push', () => {
  const orders = ref<Order[]>([])
  const ordersTotal = ref(0)
  const accounts = ref<Account[]>([])
  const clients = ref<AccountsUpdate['clients']>([])
  const conversations = ref<Conversation[]>([])
  const conversationsTotal = ref(0)

  // 记录上一轮各账号在线状态，用于检测"刚上线/刚离线"过渡
  const prevConnected = new Set<string>()

  let unsub: (() => void) | null = null
  const subscribed = new Set<string>()

  function ensureListener() {
    if (unsub) return
    unsub = api.onPush(({ event, data }) => {
      switch (event) {
        case 'orders': {
          const d = data as OrdersUpdate
          orders.value = d.orders
          ordersTotal.value = d.total
          break
        }
        case 'accounts': {
          const d = data as AccountsUpdate
          accounts.value = d.accounts
          clients.value = d.clients
          // 账号上线 → 预拉商品信息初始化缓存；离线 → 清空缓存下次重拉
          const goodsStore = useGoodsStore()
          const nowConnected = new Set<string>()
          for (const c of d.clients) {
            if (c.connected) nowConnected.add(c.accountId)
          }
          for (const id of nowConnected) {
            if (!prevConnected.has(id)) goodsStore.ensureAccountGoods(id)
          }
          for (const id of prevConnected) {
            if (!nowConnected.has(id)) goodsStore.clear(id)
          }
          prevConnected.clear()
          for (const id of nowConnected) prevConnected.add(id)
          break
        }
        case 'conversations': {
          const d = data as ConversationsUpdate
          conversations.value = d.conversations
          conversationsTotal.value = d.total
          break
        }
      }
    })
  }

  function subscribeOrders(accountId?: string, status?: number) {
    ensureListener()
    if (!subscribed.has('orders')) subscribed.add('orders')
    api.subscribe(['orders'], { accountId, status })
  }
  function unsubscribeOrders() {
    subscribed.delete('orders')
    api.unsubscribe(['orders'])
  }

  function subscribeAccounts() {
    ensureListener()
    if (!subscribed.has('accounts')) subscribed.add('accounts')
    api.subscribe(['accounts'])
  }
  function unsubscribeAccounts() {
    subscribed.delete('accounts')
    api.unsubscribe(['accounts'])
  }

  function subscribeConversations(limit = 20) {
    ensureListener()
    if (!subscribed.has('conversations')) subscribed.add('conversations')
    api.subscribe(['conversations'], { limit })
  }
  function unsubscribeConversations() {
    subscribed.delete('conversations')
    api.unsubscribe(['conversations'])
  }

  return {
    orders,
    ordersTotal,
    accounts,
    clients,
    conversations,
    conversationsTotal,
    subscribeOrders,
    unsubscribeOrders,
    subscribeAccounts,
    unsubscribeAccounts,
    subscribeConversations,
    unsubscribeConversations
  }
})
