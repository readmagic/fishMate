<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { WifiOutlined, MessageOutlined } from '@ant-design/icons-vue'
import { usePushStore } from '@/core/stores/usePushStore'

defineProps<{ collapsed?: boolean }>()

const route = useRoute()
const title = computed(() => (route.meta.title as string) || '')

const pushStore = usePushStore()
const activeCount = computed(() => pushStore.clients.filter((c) => c.connected).length)
const messageCount = computed(() => pushStore.accounts.reduce((s, a) => s, 0))
</script>

<template>
  <div class="topbar">
    <h1 class="topbar-title">{{ title }}</h1>
    <div class="topbar-status">
      <span class="status-item">
        <WifiOutlined class="status-icon online" />
        在线：<b class="online">{{ activeCount }}</b>
      </span>
      <span class="status-item">
        <MessageOutlined class="status-icon info" />
        账号：<b class="info">{{ pushStore.accounts.length }}</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  background: var(--component-background, #fff);
  border-bottom: 1px solid #f0f0f0;
}
.topbar-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.topbar-status {
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 14px;
}
.topbar-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
}
.status-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.status-icon {
  font-size: 16px;
}
.online {
  color: #52c41a;
}
.info {
  color: #1677ff;
}
</style>
