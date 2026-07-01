<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { UserOutlined, WifiOutlined, MessageOutlined } from '@ant-design/icons-vue'
import StatsCard from '@/components/StatsCard.vue'
import { usePushStore } from '@/core/stores/usePushStore'
import { accountService } from '@/core/services'

const pushStore = usePushStore()
const loading = ref(false)
const messageCount = ref(0)

const activeCount = computed(() => pushStore.clients.filter((c) => c.connected).length)

async function loadData() {
  loading.value = true
  try {
    const [accountsRes, statusRes] = await Promise.all([
      accountService.getAccounts(),
      accountService.getStatus()
    ])
    if (pushStore.accounts.length === 0) pushStore.accounts = accountsRes.accounts
    if (pushStore.clients.length === 0) pushStore.clients = statusRes.clients
    messageCount.value = statusRes.messageCount
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
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
  <a-spin :spinning="loading">
    <h2 class="page-title">仪表盘</h2>
    <a-row :gutter="16" class="stats-row">
      <a-col :xs="24" :sm="8">
        <StatsCard title="总账号" :value="pushStore.accounts.length" :icon="UserOutlined" color="#1677ff" />
      </a-col>
      <a-col :xs="24" :sm="8">
        <StatsCard title="在线" :value="activeCount" :icon="WifiOutlined" color="#52c41a" />
      </a-col>
      <a-col :xs="24" :sm="8">
        <StatsCard title="消息" :value="messageCount" :icon="MessageOutlined" color="#722ed1" />
      </a-col>
    </a-row>

    <a-card title="账号在线状态" class="mt-16">
      <a-empty v-if="pushStore.accounts.length === 0" description="暂无账号" />
      <a-list v-else :data-source="pushStore.accounts" item-layout="horizontal">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta :description="item.id">
              <template #title>{{ item.nickname || '未知用户' }}</template>
              <template #avatar>
                <a-avatar :src="item.avatar" v-if="item.avatar" />
                <a-avatar :icon="UserOutlined" v-else />
              </template>
            </a-list-item-meta>
            <template #actions>
              <a-tag color="green" v-if="pushStore.clients.find((c) => c.accountId === item.id && c.connected)">
                在线
              </a-tag>
              <a-tag v-else>离线</a-tag>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </a-card>
  </a-spin>
</template>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.stats-row {
  margin-bottom: 16px;
}
.mt-16 {
  margin-top: 16px;
}
</style>
