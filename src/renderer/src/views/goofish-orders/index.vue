<script setup lang="ts">
import { ref, onMounted, onUnmounted, h, watch, computed } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  ReloadOutlined,
  DownloadOutlined,
  SendOutlined,
  DeleteOutlined,
  SearchOutlined
} from '@ant-design/icons-vue'
import { orderService, accountService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import { ORDER_STATUS_TEXT, OrderStatus } from '@/core/types'
import type { Order, Account } from '@/core/types'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'

const pushStore = usePushStore()
const { modal } = App.useApp()
const loading = ref(false)
const refreshing = ref<string | null>(null)
const shipping = ref<string | null>(null)
const deleting = ref<string | null>(null)

const accounts = ref<Account[]>([])
const selectedAccountId = ref('')
const selectedStatus = ref<number | ''>('')

const total = ref(0)
const offset = ref(0)
const limit = 20

const selectedOrderId = ref<string | null>(null)
const manualVisible = ref(false)
const manualOrderId = ref('')
const manualAccountId = ref('')
const fetching = ref(false)

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 0, label: '获取中' },
  { value: OrderStatus.PENDING_PAYMENT, label: '待付款' },
  { value: OrderStatus.PENDING_SHIPMENT, label: '待发货' },
  { value: OrderStatus.PENDING_RECEIPT, label: '待收货' },
  { value: OrderStatus.COMPLETED, label: '交易成功' },
  { value: OrderStatus.CLOSED, label: '已关闭' }
]

const orders = ref<Order[]>([])
const selectedOrder = computed(() => orders.value.find((o) => o.orderId === selectedOrderId.value) || null)

function statusText(s: number) {
  return ORDER_STATUS_TEXT[s] || '未知'
}
function statusColor(s: number): string {
  switch (s) {
    case OrderStatus.PENDING_PAYMENT: return 'orange'
    case OrderStatus.PENDING_SHIPMENT: return 'blue'
    case OrderStatus.PENDING_RECEIPT: return 'processing'
    case OrderStatus.COMPLETED: return 'green'
    case OrderStatus.CLOSED: return 'default'
    default: return 'default'
  }
}
function formatTime(t: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN') : '-'
}
function accountNickname(id: string) {
  return accounts.value.find((a) => a.id === id)?.nickname || id
}

async function loadAccounts() {
  try {
    const res = await accountService.getAccounts()
    accounts.value = res.accounts
  } catch (e) {
    console.error('加载账号列表失败', e)
  }
}
async function loadOrders() {
  loading.value = true
  try {
    const res = await orderService.getOrders(
      selectedAccountId.value || undefined,
      selectedStatus.value === '' ? undefined : (selectedStatus.value as number),
      limit,
      offset.value
    )
    orders.value = res.orders
    total.value = res.total
    if (selectedOrderId.value && !orders.value.some((o) => o.orderId === selectedOrderId.value)) {
      selectedOrderId.value = null
    }
  } catch (e) {
    console.error('加载订单列表失败', e)
  } finally {
    loading.value = false
  }
}

function subscribeWS() {
  const accountId = selectedAccountId.value || undefined
  const status = selectedStatus.value === '' ? undefined : (selectedStatus.value as number)
  pushStore.subscribeOrders(accountId, status)
}

// WS 推送到达后刷新订单列表
function onWsUpdate() {
  if (pushStore.orders.length > 0) {
    orders.value = pushStore.orders
    total.value = pushStore.ordersTotal
  }
}
watch(() => pushStore.orders, onWsUpdate, { deep: true })

function onFilterChange() {
  offset.value = 0
  selectedOrderId.value = null
  loadOrders()
  subscribeWS()
}

async function refreshOrder(order: Order) {
  refreshing.value = order.orderId
  try {
    const res = await orderService.refreshOrder(order.orderId)
    if (res.success && res.order) {
      orders.value = orders.value.map((o) => (o.orderId === order.orderId ? res.order! : o))
    }
  } finally {
    refreshing.value = null
  }
}

function confirmShip(order: Order, free: boolean) {
  modal.confirm({
    title: free ? '确认免拼发货' : '确认发货',
    content: h('div', [
      h('p', `订单号：${order.orderId}`),
      h('p', `商品：${order.itemTitle || '未知商品'}`),
      h('p', `买家：${order.buyerNickname || order.buyerUserId || '-'}`),
      h('p', `金额：¥${order.price || '-'}`),
      h('p', `下单时间：${formatTime(order.orderTime)}`),
      h('p', { style: 'margin-top:8px' }, `确定要${free ? '免拼' : ''}发货吗？`)
    ]),
    onOk: async () => {
      shipping.value = order.orderId
      try {
        const res = free
          ? await orderService.freeShipOrder(order.orderId)
          : await orderService.shipOrder(order.orderId)
        if (res.success && res.order) {
          orders.value = orders.value.map((o) => (o.orderId === order.orderId ? res.order! : o))
          message.success('操作成功')
        } else {
          message.error(res.error || '操作失败')
        }
      } finally {
        shipping.value = null
      }
    }
  })
}

function deleteOrder(order: Order) {
  modal.confirm({
    title: '删除订单',
    content: '确定要删除此订单记录吗？删除后无法找回。',
    okType: 'danger',
    onOk: async () => {
      deleting.value = order.orderId
      try {
        const res = await orderService.deleteOrder(order.orderId)
        if (res.success) {
          orders.value = orders.value.filter((o) => o.orderId !== order.orderId)
          total.value -= 1
          if (selectedOrderId.value === order.orderId) selectedOrderId.value = null
        } else {
          message.error(res.error || '删除失败')
        }
      } finally {
        deleting.value = null
      }
    }
  })
}

async function fetchManualOrder() {
  const orderId = manualOrderId.value.trim()
  if (!orderId || !manualAccountId.value) return
  fetching.value = true
  try {
    const res = await orderService.fetchOrder(manualAccountId.value, orderId)
    if (res.success) {
      message.success('获取成功')
      manualOrderId.value = ''
      manualVisible.value = false
      await loadOrders()
      selectedOrderId.value = orderId
    } else {
      message.error(res.error || '获取订单失败')
    }
  } finally {
    fetching.value = false
  }
}

function prevPage() {
  if (offset.value > 0) {
    offset.value = Math.max(0, offset.value - limit)
    selectedOrderId.value = null
    loadOrders()
  }
}
function nextPage() {
  if (offset.value + limit < total.value) {
    offset.value += limit
    selectedOrderId.value = null
    loadOrders()
  }
}

onMounted(() => {
  loadAccounts()
  loadOrders()
  subscribeWS()
})
onUnmounted(() => {
  pushStore.unsubscribeOrders()
})
</script>

<template>
  <TwoPaneLayout :list-width="340">
    <template #list>
      <div class="list-header">
        <a-select v-model:value="selectedAccountId" style="width: 110px" @change="onFilterChange">
          <a-select-option value="">全部账号</a-select-option>
          <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
            {{ a.nickname || a.id }}
          </a-select-option>
        </a-select>
        <a-select v-model:value="selectedStatus" style="width: 100px" @change="onFilterChange">
          <a-select-option v-for="opt in statusOptions" :key="String(opt.value)" :value="opt.value">
            {{ opt.label }}
          </a-select-option>
        </a-select>
        <a-button size="small" :loading="loading" @click="loadOrders">
          <template #icon><ReloadOutlined /></template>
        </a-button>
        <a-button size="small" @click="manualVisible = true">
          <template #icon><DownloadOutlined /></template>
          获取
        </a-button>
      </div>
      <div class="list-meta">共 {{ total }} 条订单</div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="orders.length === 0" description="暂无订单" />
          <div v-else class="order-list">
            <div
              v-for="order in orders"
              :key="order.orderId"
              class="order-row"
              :class="{ active: selectedOrderId === order.orderId }"
              @click="selectedOrderId = order.orderId"
            >
              <img v-if="order.itemPicUrl" :src="order.itemPicUrl" class="thumb" />
              <div v-else class="thumb thumb-empty" />
              <div class="row-meta">
                <div class="row-title">{{ order.itemTitle || '未知商品' }}</div>
                <div class="row-sub mono">{{ order.orderId }}</div>
                <div class="row-bottom">
                  <span class="buyer">{{ order.buyerNickname || order.buyerUserId || '-' }}</span>
                  <span class="price">¥{{ order.price || '-' }}</span>
                  <a-tag :color="statusColor(order.status)" class="status-tag">
                    {{ statusText(order.status) }}
                  </a-tag>
                </div>
              </div>
            </div>
          </div>
        </a-spin>
      </div>
      <div v-if="total > limit" class="pagination">
        <a-button size="small" :disabled="offset === 0" @click="prevPage">上一页</a-button>
        <span class="page-info">{{ offset / limit + 1 }} / {{ Math.ceil(total / limit) }}</span>
        <a-button size="small" :disabled="offset + limit >= total" @click="nextPage">下一页</a-button>
      </div>
    </template>

    <template #detail>
      <div v-if="selectedOrder" class="detail-wrap">
        <div class="detail-body">
          <div class="detail-top">
            <img v-if="selectedOrder.itemPicUrl" :src="selectedOrder.itemPicUrl" class="detail-thumb" />
            <div v-else class="detail-thumb thumb-empty" />
            <div class="detail-top-meta">
              <h2 class="detail-title">{{ selectedOrder.itemTitle || '未知商品' }}</h2>
              <a-tag :color="statusColor(selectedOrder.status)">
                {{ statusText(selectedOrder.status) }}
              </a-tag>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item"><span class="meta-label">订单号</span><span class="meta-val mono">{{ selectedOrder.orderId }}</span></div>
            <div class="meta-item"><span class="meta-label">买家</span><span class="meta-val">{{ selectedOrder.buyerNickname || selectedOrder.buyerUserId || '-' }}</span></div>
            <div class="meta-item"><span class="meta-label">金额</span><span class="meta-val price">¥{{ selectedOrder.price || '-' }}</span></div>
            <div class="meta-item"><span class="meta-label">账号</span><span class="meta-val">{{ accountNickname(selectedOrder.accountId) }}</span></div>
            <div class="meta-item"><span class="meta-label">下单时间</span><span class="meta-val">{{ formatTime(selectedOrder.orderTime) }}</span></div>
            <div v-if="selectedOrder.payTime" class="meta-item"><span class="meta-label">付款时间</span><span class="meta-val">{{ formatTime(selectedOrder.payTime) }}</span></div>
            <div v-if="selectedOrder.shipTime" class="meta-item"><span class="meta-label">发货时间</span><span class="meta-val">{{ formatTime(selectedOrder.shipTime) }}</span></div>
            <div v-if="selectedOrder.completeTime" class="meta-item"><span class="meta-label">完成时间</span><span class="meta-val">{{ formatTime(selectedOrder.completeTime) }}</span></div>
          </div>

          <div class="detail-actions">
            <a-space wrap>
              <a-dropdown v-if="selectedOrder.status === OrderStatus.PENDING_SHIPMENT">
                <a-button type="primary" :loading="shipping === selectedOrder.orderId">
                  <template #icon><SendOutlined /></template>
                  发货
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="confirmShip(selectedOrder, false)">发货</a-menu-item>
                    <a-menu-item @click="confirmShip(selectedOrder, true)">免拼发货</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-button
                v-if="selectedOrder.status !== OrderStatus.CLOSED"
                :loading="refreshing === selectedOrder.orderId"
                @click="refreshOrder(selectedOrder)"
              >
                <template #icon><ReloadOutlined /></template>
                刷新
              </a-button>
              <a-button
                danger
                :loading="deleting === selectedOrder.orderId"
                @click="deleteOrder(selectedOrder)"
              >
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个订单查看详情" />
      </div>
    </template>
  </TwoPaneLayout>

  <a-modal
    v-model:open="manualVisible"
    title="手动获取订单"
    :confirm-loading="fetching"
    @ok="fetchManualOrder"
  >
    <a-space direction="vertical" style="width: 100%">
      <a-select v-model:value="manualAccountId" style="width: 100%" placeholder="选择账号">
        <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
          {{ a.nickname || a.id }}
        </a-select-option>
      </a-select>
      <a-input
        v-model:value="manualOrderId"
        placeholder="输入订单号"
        @press-enter="fetchManualOrder"
      />
    </a-space>
  </a-modal>
</template>

<style scoped>
.list-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}
.list-meta {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--wm-text-secondary);
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  min-height: 0;
}
.order-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.order-row {
  display: flex;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 6px;
}
.order-row:hover {
  background: var(--wm-list-hover);
}
.order-row.active {
  background: var(--wm-list-active);
}
.thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.thumb-empty {
  background: var(--wm-content-bg);
}
.row-meta {
  flex: 1;
  min-width: 0;
}
.row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--wm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-sub {
  font-size: 11px;
  color: var(--wm-text-tertiary);
  margin: 2px 0;
}
.row-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
}
.buyer {
  font-size: 12px;
  color: var(--wm-text-secondary);
}
.price {
  color: #f5222d;
  font-weight: 600;
  font-size: 13px;
}
.status-tag {
  margin: 0 0 0 auto;
}
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.page-info {
  color: var(--wm-text-secondary);
  font-size: 12px;
}

.detail-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.detail-top {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.detail-thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}
.detail-top-meta {
  flex: 1;
  min-width: 0;
}
.detail-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--wm-text);
  line-height: 1.4;
}
.meta-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--wm-content-bg);
  border-radius: 6px;
  margin-bottom: 16px;
}
.meta-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.meta-label {
  color: var(--wm-text-secondary);
  font-size: 13px;
  flex-shrink: 0;
}
.meta-val {
  color: var(--wm-text);
  font-size: 13px;
  text-align: right;
  word-break: break-all;
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
.detail-actions {
  margin-top: 8px;
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
