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
import type { Account } from '@/core/types'

const pushStore = usePushStore()
const loading = ref(false)
const submitting = ref(false)
const refreshingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const form = ref<{ cookies: string; remark: string }>({ cookies: '', remark: '' })

const accounts = computed(() => pushStore.accounts)

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
      form.value = { cookies: '', remark: '' }
      editingId.value = null
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

function onEdit(account: Account) {
  editingId.value = account.id
  form.value = { cookies: '', remark: account.remark || '' }
}
function cancelEdit() {
  editingId.value = null
  form.value = { cookies: '', remark: '' }
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
  <h2 class="page-title">账号管理</h2>
  <a-row :gutter="16">
    <!-- 左侧表单 -->
    <a-col :xs="24" :xl="8">
      <a-card :title="editingId ? '编辑账号' : '添加账号'">
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
            <a-button v-if="editingId" @click="cancelEdit">取消</a-button>
          </a-space>
        </a-form>
      </a-card>

      <a-card size="small" class="mt-16" :bordered="false">
        <p class="help-title">如何获取 Cookies？</p>
        <ol class="help-list">
          <li>登录闲鱼网页版 (goofish.com)</li>
          <li>按 F12 打开开发者工具</li>
          <li>切换到 Network 标签</li>
          <li>刷新页面，点击任意请求</li>
          <li>在 Headers 中找到 Cookie</li>
        </ol>
      </a-card>
    </a-col>

    <!-- 右侧列表 -->
    <a-col :xs="24" :xl="16">
      <a-card>
        <a-spin :spinning="loading">
          <a-empty v-if="accounts.length === 0" description="暂无账号，请在左侧添加" />
          <a-list v-else :data-source="accounts" item-layout="horizontal">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>
                    <span class="nickname">{{ item.nickname || '未知用户' }}</span>
                    <span class="uid">{{ item.id }}</span>
                  </template>
                  <template #description>
                    备注：{{ item.remark || '-' }} · 更新：{{ formatTime(item.updatedAt) }}
                  </template>
                  <template #avatar>
                    <a-avatar :src="item.avatar" v-if="item.avatar" />
                    <a-avatar :icon="UserOutlined" v-else />
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-tag color="green" v-if="isConnected(item.id)">在线</a-tag>
                  <a-tag v-else>离线</a-tag>
                  <a-space size="small">
                    <a-button size="small" :loading="refreshingId === item.id" @click="onRefreshInfo(item.id)">
                      <template #icon><ReloadOutlined /></template>
                      刷新
                    </a-button>
                    <a-button size="small" @click="onEdit(item)">
                      <template #icon><EditOutlined /></template>
                      编辑
                    </a-button>
                    <a-button
                      v-if="!isConnected(item.id)"
                      size="small"
                      type="primary"
                      @click="onStart(item.id)"
                    >
                      <template #icon><PlayCircleOutlined /></template>
                      启动
                    </a-button>
                    <a-button v-else size="small" @click="onStop(item.id)">
                      <template #icon><PauseCircleOutlined /></template>
                      停止
                    </a-button>
                    <a-button size="small" danger @click="onDelete(item.id)">
                      <template #icon><DeleteOutlined /></template>
                    </a-button>
                  </a-space>
                </template>
              </a-list-item>
            </template>
          </a-list>
        </a-spin>
      </a-card>
    </a-col>
  </a-row>
</template>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.mt-16 {
  margin-top: 16px;
}
.nickname {
  font-weight: 600;
  margin-right: 8px;
}
.uid {
  font-family: monospace;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.help-title {
  font-weight: 600;
  margin: 0 0 8px;
}
.help-list {
  padding-left: 20px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.8;
}
</style>
