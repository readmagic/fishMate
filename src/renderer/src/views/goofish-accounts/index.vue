<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Modal, message } from 'ant-design-vue'
import {
  PlusOutlined,
  SaveOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UserOutlined
} from '@ant-design/icons-vue'
import { accountService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { Account } from '@/core/types'

const pushStore = usePushStore()
const loading = ref(false)
const submitting = ref(false)
const refreshingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const isAdding = ref(false)
const form = ref<{ cookies: string; remark: string }>({ cookies: '', remark: '' })

const accounts = computed(() => pushStore.accounts)
const selectedAccount = computed(() => accounts.value.find((a) => a.id === editingId.value) || null)
const hasSelection = computed(() => editingId.value !== null || isAdding.value)

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
  isAdding.value = false
  editingId.value = account.id
  form.value = { cookies: '', remark: account.remark || '' }
}

function startAdd() {
  editingId.value = null
  isAdding.value = true
  form.value = { cookies: '', remark: '' }
}

function cancelEdit() {
  editingId.value = null
  isAdding.value = false
  form.value = { cookies: '', remark: '' }
}

async function handleSubmit() {
  if (!editingId.value && !form.value.cookies.trim()) {
    message.warning('请填写 Cookies')
    return
  }
  submitting.value = true
  try {
    const res = await accountService.addAccount({
      id: editingId.value || undefined,
      cookies: form.value.cookies.trim() || undefined,
      remark: form.value.remark.trim() || undefined
    })
    if (res.success) {
      message.success(editingId.value ? '保存成功' : '添加成功')
      const savedId = editingId.value
      form.value = { cookies: '', remark: '' }
      isAdding.value = false
      editingId.value = null
      await loadData()
      if (savedId) editingId.value = savedId
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
async function onStart(id: string) {
  await accountService.startAccount(id)
  await loadData()
}
async function onStop(id: string) {
  await accountService.stopAccount(id)
  await loadData()
}
function onDelete(id: string) {
  Modal.confirm({
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
        <a-button size="small" type="primary" @click="startAdd">
          <template #icon><PlusOutlined /></template>
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
              </div>
              <a-tag color="green" v-if="isConnected(item.id)" class="acc-tag">在线</a-tag>
              <a-tag v-else class="acc-tag">离线</a-tag>
            </div>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="hasSelection" class="detail-wrap">
        <div class="detail-header">
          <component :is="editingId ? EditOutlined : PlusOutlined" />
          <span>{{ editingId ? '编辑账号' : '添加账号' }}</span>
        </div>
        <div class="detail-body">
          <a-form layout="vertical" @submit.prevent="handleSubmit">
            <a-form-item v-if="editingId" label="账号 ID">
              <a-input :value="editingId" disabled />
            </a-form-item>
            <a-form-item label="Cookies" required>
              <a-textarea
                v-model:value="form.cookies"
                :rows="4"
                :placeholder="editingId ? '留空保持原有 Cookies，填写则更新' : '粘贴 Cookie 字符串，系统将自动获取用户信息'"
              />
            </a-form-item>
            <a-form-item label="备注">
              <a-input v-model:value="form.remark" placeholder="可选，方便识别" />
            </a-form-item>
            <a-space>
              <a-button type="primary" html-type="submit" :loading="submitting">
                <template #icon><component :is="editingId ? SaveOutlined : PlusOutlined" /></template>
                {{ editingId ? '保存' : '添加' }}
              </a-button>
              <a-button @click="cancelEdit">取消</a-button>
            </a-space>
          </a-form>

          <div v-if="editingId" class="detail-actions">
            <a-divider>账号操作</a-divider>
            <a-space wrap>
              <a-button :loading="refreshingId === editingId" @click="onRefreshInfo(editingId)">
                <template #icon><ReloadOutlined /></template>
                刷新信息
              </a-button>
              <a-button v-if="!isConnected(editingId)" type="primary" @click="onStart(editingId)">
                <template #icon><PlayCircleOutlined /></template>
                启动
              </a-button>
              <a-button v-else @click="onStop(editingId)">
                <template #icon><PauseCircleOutlined /></template>
                停止
              </a-button>
              <a-button danger @click="onDelete(editingId)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
            <p v-if="selectedAccount" class="acc-update">更新时间：{{ formatTime(selectedAccount.updatedAt) }}</p>
          </div>

          <a-card size="small" :bordered="false" class="help-card">
            <p class="help-title">如何获取 Cookies？</p>
            <ol class="help-list">
              <li>登录闲鱼网页版 (goofish.com)</li>
              <li>按 F12 打开开发者工具</li>
              <li>切换到 Network 标签</li>
              <li>刷新页面，点击任意请求</li>
              <li>在 Headers 中找到 Cookie</li>
            </ol>
          </a-card>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个账号查看详情，或点击添加" />
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
.help-card {
  margin-top: 24px;
  background: transparent;
}
.help-title {
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--wm-text);
}
.help-list {
  padding-left: 20px;
  font-size: 12px;
  color: var(--wm-text-secondary);
  line-height: 1.8;
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
