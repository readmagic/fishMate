<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { Layout, LayoutSider, LayoutHeader, LayoutContent } from 'ant-design-vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { usePushStore } from '@/core/stores/usePushStore'
import { accountService } from '@/core/services'

const STORAGE_KEY = 'sidebar_collapsed'
const collapsed = ref(localStorage.getItem(STORAGE_KEY) === 'true')
watch(collapsed, (v) => localStorage.setItem(STORAGE_KEY, String(v)))
const pushStore = usePushStore()

const activeCount = computed(() => pushStore.clients.filter((c) => c.connected).length)

onMounted(() => {
  pushStore.subscribeAccounts()
  // 拉一次初始账号数据（WS 推送可能尚未到达）
  accountService.getAccounts().then((res) => {
    if (pushStore.accounts.length === 0) {
      pushStore.accounts = res.accounts
    }
  }).catch(() => {})
  accountService.getStatus().then((res) => {
    pushStore.clients = res.clients
  }).catch(() => {})
})

onUnmounted(() => {
  pushStore.unsubscribeAccounts()
})
</script>

<template>
  <Layout class="main-layout">
    <LayoutSider
      v-model:collapsed="collapsed"
      class="main-sider"
      :trigger="null"
      collapsible
      breakpoint="md"
      :collapsed-width="64"
      :width="220"
      theme="dark"
    >
      <AppSidebar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
      <div class="collapse-btn" @click="collapsed = !collapsed">
        <span v-if="collapsed">»</span>
        <span v-else>« 收起</span>
      </div>
    </LayoutSider>
    <Layout>
      <LayoutHeader class="main-header">
        <AppTopbar :collapsed="collapsed" />
      </LayoutHeader>
      <LayoutContent class="main-content" :class="{ collapsed }">
        <RouterView />
      </LayoutContent>
    </Layout>
  </Layout>
</template>

<style scoped>
.main-layout {
  min-height: 100vh;
}
.main-sider {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
}
.collapse-btn {
  margin-top: auto;
  padding: 12px 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  font-size: 13px;
}
.collapse-btn:hover {
  color: #fff;
}
.main-header {
  background: #fff;
  padding: 0;
  height: 56px;
  line-height: 56px;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}
.main-content {
  margin-left: 220px;
  transition: margin-left 0.2s;
  padding: 16px 24px;
  min-height: calc(100vh - 56px);
}
.main-content.collapsed {
  margin-left: 64px;
}
@media (max-width: 768px) {
  .main-content,
  .main-content.collapsed {
    margin-left: 0 !important;
  }
  .main-sider {
    position: fixed;
    z-index: 30;
  }
}
</style>
