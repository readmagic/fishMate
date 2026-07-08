<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  SaveOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UserOutlined,
  QrcodeOutlined,
  PictureOutlined
} from '@ant-design/icons-vue'
import { accountService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { Account } from '@/core/types'

const pushStore = usePushStore()
const { modal } = App.useApp()
const loading = ref(false)
const submitting = ref(false)
const qrLoading = ref(false)
const refreshingId = ref<string | null>(null)
const startingId = ref<string | null>(null)
const avatarUploading = ref<string | null>(null)
const editingId = ref<string | null>(null)
const form = ref<{ remark: string }>({ remark: '' })

const accounts = computed(() => pushStore.accounts)
const selectedAccount = computed(() => accounts.value.find((a) => a.id === editingId.value) || null)
const hasSelection = computed(() => editingId.value !== null)

function isConnected(id: string) {
  return pushStore.clients.some((c) => c.accountId === id && c.connected)
}
function formatTime(t?: string) {
  return t ? new Date(t).toLocaleString() : '-'
}

async function loadData() {
  loading.value = true
  try {
    const [accountsRes, statusRes] = await Promise.all([
      accountService.getAccounts(),
      accountService.getStatus()
    ])
    pushStore.accounts = accountsRes.accounts
    pushStore.clients = statusRes.clients
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
}

function selectAccount(account: Account) {
  editingId.value = account.id
  form.value = { remark: account.remark || '' }
}

// 添加账号：直接弹出扫码登录窗口，扫码成功后自动入库
function onAdd() {
  onLoginQr()
}

async function onLoginQr() {
  qrLoading.value = true
  try {
    const res = await accountService.loginQr()
    if (res.success) {
      message.success('扫码登录成功')
      editingId.value = null
      form.value = { remark: '' }
      await loadData()
    } else if (res.error && res.error !== '已取消') {
      message.error(res.error)
    }
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : '扫码登录失败')
  } finally {
    qrLoading.value = false
  }
}

function cancelEdit() {
  editingId.value = null
  form.value = { remark: '' }
}

async function handleSubmit() {
  if (!editingId.value) return
  submitting.value = true
  try {
    const res = await accountService.addAccount({
      id: editingId.value,
      remark: form.value.remark.trim() || undefined
    })
    if (res.success) {
      message.success('保存成功')
      await loadData()
    } else {
      message.error(res.error || '操作失败')
    }
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

async function onRefreshInfo(id: string) {
  refreshingId.value = id
  try {
    const res = await accountService.refreshAccountInfo(id)
    if (res.success) await loadData()
    else message.error(res.error || '刷新失败')
  } finally {
    refreshingId.value = null
  }
}
async function onUpdateAvatar(id: string) {
  avatarUploading.value = id
  try {
    const res = await accountService.updateAvatar(id)
    if (res.success) {
      message.success('头像已更新')
      await loadData()
    } else if (res.error && res.error !== '已取消') {
      message.error(res.error)
    }
  } finally {
    avatarUploading.value = null
  }
}
async function onStart(id: string) {
  startingId.value = id
  try {
    const res = await accountService.startAccount(id)
    if (res.success) {
      await loadData()
      return
    }
    // 登录态过期：引导用户重新扫码登录，成功后自动上线
    if (res.expired) {
      modal.confirm({
        title: '账号登录已过期',
        content: '该账号的登录凭证已失效，需要重新扫码登录以获取新凭证。是否现在重新登录？',
        okText: '重新登录',
        cancelText: '稍后',
        onOk: async () => {
          const qr = await accountService.loginQr()
          if (qr.success) {
            message.success('重新登录成功，正在上线')
            await loadData()
            const r = await accountService.startAccount(id)
            if (!r.success) {
              message.error(r.error || '上线失败')
            }
            await loadData()
          } else if (qr.error && qr.error !== '已取消') {
            message.error(qr.error)
          }
        }
      })
    } else {
      message.error(res.error || '上线失败')
    }
    await loadData()
  } finally {
    startingId.value = null
  }
}
async function onStop(id: string) {
  await accountService.stopAccount(id)
  await loadData()
}
function onDelete(id: string) {
  modal.confirm({
    title: '删除账号',
    content: `确定删除账号 ${id}？`,
    okType: 'danger',
    onOk: async () => {
      await accountService.deleteAccount(id)
      await loadData()
      cancelEdit()
    }
  })
}

onMounted(() => {
  pushStore.subscribeAccounts()
  loadData()
})
onUnmounted(() => {
  pushStore.unsubscribeAccounts()
})
</script>

<template>
  <TwoPaneLayout :list-width="300">
    <template #list>
      <div class="list-header">
        <span class="list-title">账号列表</span>
        <a-button size="small" type="primary" :loading="qrLoading" @click="onAdd">
          <template #icon><QrcodeOutlined /></template>
          添加
        </a-button>
      </div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="accounts.length === 0" description="暂无账号" />
          <div v-else class="acc-list">
            <div
              v-for="item in accounts"
              :key="item.id"
              class="acc-item"
              :class="{ active: editingId === item.id }"
              @click="selectAccount(item)"
            >
              <a-avatar :src="item.avatar" v-if="item.avatar" />
              <a-avatar :icon="UserOutlined" v-else />
              <div class="acc-meta">
                <div class="acc-name">{{ item.nickname || '未知用户' }}</div>
                <div class="acc-sub">{{ item.remark || item.id }}</div>
                <div v-if="!isConnected(item.id) && item.status?.errorMessage" class="acc-err">
                  {{ item.status.errorMessage }}
                </div>
              </div>
              <a-tag color="green" v-if="isConnected(item.id)" class="acc-tag">在线</a-tag>
              <a-tag v-else :color="item.status?.errorMessage ? 'red' : undefined" class="acc-tag">离线</a-tag>
            </div>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="hasSelection" class="detail-wrap">
        <div class="detail-header">
          <EditOutlined />
          <span>编辑账号</span>
        </div>
        <div class="detail-body">
          <a-form layout="vertical" @submit.prevent="handleSubmit">
            <a-form-item label="账号 ID">
              <a-input :value="editingId" disabled />
            </a-form-item>
            <a-form-item label="备注">
              <a-input v-model:value="form.remark" placeholder="可选，方便识别" />
            </a-form-item>
            <a-space>
              <a-button type="primary" html-type="submit" :loading="submitting">
                <template #icon><SaveOutlined /></template>
                保存
              </a-button>
              <a-button @click="cancelEdit">取消</a-button>
            </a-space>
          </a-form>

          <div class="detail-actions">
            <a-divider>账号操作</a-divider>
            <a-space wrap>
              <a-button :loading="refreshingId === editingId" @click="onRefreshInfo(editingId)">
                <template #icon><ReloadOutlined /></template>
                刷新信息
              </a-button>
              <a-button :loading="avatarUploading === editingId" @click="onUpdateAvatar(editingId)">
                <template #icon><PictureOutlined /></template>
                修改头像
              </a-button>
              <a-button v-if="!isConnected(editingId)" type="primary" :loading="startingId === editingId" @click="onStart(editingId)">
                <template #icon><PlayCircleOutlined /></template>
                在线
              </a-button>
              <a-button v-else @click="onStop(editingId)">
                <template #icon><PauseCircleOutlined /></template>
                离线
              </a-button>
              <a-button danger @click="onDelete(editingId)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
            <p v-if="selectedAccount" class="acc-update">更新时间：{{ formatTime(selectedAccount.updatedAt) }}</p>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个账号查看详情，或点击添加扫码登录" />
      </div>
    </template>
  </TwoPaneLayout>
</template>

<style scoped>
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.list-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--wm-text);
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.acc-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.acc-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.acc-item:hover {
  background: var(--wm-list-hover);
}
.acc-item.active {
  background: var(--wm-list-active);
}
.acc-meta {
  flex: 1;
  min-width: 0;
}
.acc-name {
  font-weight: 600;
  color: var(--wm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acc-sub {
  font-size: 12px;
  color: var(--wm-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}
.acc-err {
  font-size: 12px;
  color: #f5222d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.acc-tag {
  margin: 0;
  flex-shrink: 0;
}

.detail-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wm-border);
  font-size: 14px;
  font-weight: 500;
  color: var(--wm-text);
  flex-shrink: 0;
}
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.detail-actions {
  margin-top: 16px;
}
.acc-update {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--wm-text-secondary);
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
