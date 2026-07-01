<script setup lang="ts">
import { ref, onMounted, onUnmounted, h, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
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

const pushStore = usePushStore()
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
  Modal.confirm({
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
  Modal.confirm({
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
      await loadOrders()
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
    loadOrders()
  }
}
function nextPage() {
  if (offset.value + limit < total.value) {
    offset.value += limit
    loadOrders()
  }
}

const columns = [
  { title: '商品', dataIndex: 'itemTitle', key: 'item' },
  { title: '订单号', dataIndex: 'orderId', key: 'orderId' },
  { title: '买家', key: 'buyer' },
  { title: '金额', key: 'price' },
  { title: '状态', key: 'status' },
  { title: '时间', key: 'time' },
  { title: '操作', key: 'action', width: 180 }
]

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
  <a-card class="filter-bar">
    <a-space wrap>
      <span class="filter-label">账号：</span>
      <a-select v-model:value="selectedAccountId" style="width: 180px" @change="onFilterChange">
        <a-select-option value="">全部账号</a-select-option>
        <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
          {{ a.nickname || a.id }}
        </a-select-option>
      </a-select>
      <span class="filter-label">状态：</span>
      <a-select
        v-model:value="selectedStatus"
        style="width: 140px"
        @change="onFilterChange"
      >
        <a-select-option v-for="opt in statusOptions" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </a-select-option>
      </a-select>
      <a-button :loading="loading" @click="loadOrders">
        <template #icon><ReloadOutlined /></template>
        刷新
      </a-button>
      <span class="total-text">共 {{ total }} 条订单</span>
    </a-space>
  </a-card>

  <a-card class="manual-bar">
    <a-space wrap align="end">
      <SearchOutlined />
      <span class="filter-label">手动获取订单</span>
      <a-select v-model:value="manualAccountId" style="width: 180px" placeholder="选择账号">
        <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
          {{ a.nickname || a.id }}
        </a-select-option>
      </a-select>
      <a-input
        v-model:value="manualOrderId"
        placeholder="输入订单号"
        style="width: 240px"
        @press-enter="fetchManualOrder"
      />
      <a-button
        type="primary"
        :loading="fetching"
        :disabled="!manualOrderId || !manualAccountId"
        @click="fetchManualOrder"
      >
        <template #icon><DownloadOutlined /></template>
        获取
      </a-button>
    </a-space>
  </a-card>

  <a-card>
    <a-table
      :columns="columns"
      :data-source="orders"
      :loading="loading"
      :pagination="false"
      row-key="orderId"
      size="middle"
      :scroll="{ x: 900 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'item'">
          <div class="goods-cell">
            <img v-if="record.itemPicUrl" :src="record.itemPicUrl" class="thumb" />
            <div class="goods-meta">
              <div class="goods-title">{{ record.itemTitle || '未知商品' }}</div>
              <div class="goods-account">{{ accountNickname(record.accountId) }}</div>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'orderId'">
          <span class="mono">{{ record.orderId }}</span>
        </template>
        <template v-else-if="column.key === 'buyer'">
          {{ record.buyerNickname || record.buyerUserId || '-' }}
        </template>
        <template v-else-if="column.key === 'price'">
          <span class="price">¥{{ record.price || '-' }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'time'">
          <div class="time-cell">
            <div>下单：{{ formatTime(record.orderTime) }}</div>
            <div v-if="record.payTime">付款：{{ formatTime(record.payTime) }}</div>
            <div v-if="record.shipTime">发货：{{ formatTime(record.shipTime) }}</div>
            <div v-if="record.completeTime">完成：{{ formatTime(record.completeTime) }}</div>
          </div>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space size="small">
            <a-dropdown v-if="record.status === OrderStatus.PENDING_SHIPMENT">
              <a-button type="primary" size="small" :loading="shipping === record.orderId">
                <template #icon><SendOutlined /></template>
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="confirmShip(record, false)">发货</a-menu-item>
                  <a-menu-item @click="confirmShip(record, true)">免拼发货</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
            <a-button
              v-if="record.status !== OrderStatus.CLOSED"
              size="small"
              :loading="refreshing === record.orderId"
              @click="refreshOrder(record)"
            >
              <template #icon><ReloadOutlined /></template>
            </a-button>
            <a-button
              size="small"
              danger
              :loading="deleting === record.orderId"
              @click="deleteOrder(record)"
            >
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </a-space>
        </template>
      </template>
      <template #emptyText>
        <a-empty description="暂无订单数据，订单会在收到交易消息时自动记录" />
      </template>
    </a-table>

    <div v-if="total > limit" class="pagination">
      <a-button size="small" :disabled="offset === 0" @click="prevPage">上一页</a-button>
      <span class="page-info">{{ offset / limit + 1 }} / {{ Math.ceil(total / limit) }}</span>
      <a-button size="small" :disabled="offset + limit >= total" @click="nextPage">下一页</a-button>
    </div>
  </a-card>
</template>

<style scoped>
.filter-bar,
.manual-bar {
  margin-bottom: 12px;
}
.filter-label {
  color: rgba(0, 0, 0, 0.55);
}
.total-text {
  margin-left: auto;
  color: rgba(0, 0, 0, 0.55);
}
.goods-cell {
  display: flex;
  gap: 8px;
  align-items: center;
}
.thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.goods-meta {
  min-width: 0;
}
.goods-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.goods-account {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
.price {
  color: #1677ff;
  font-weight: 600;
}
.time-cell {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.6;
}
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.page-info {
  color: rgba(0, 0, 0, 0.65);
}
</style>
