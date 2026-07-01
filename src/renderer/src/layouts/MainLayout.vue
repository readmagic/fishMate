<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'

const route = useRoute()
const router = useRouter()
const title = computed(() => (route.meta.title as string) || '')

// 主进程在托盘"跳转消息"场景下发送导航指令
let offNav: (() => void) | undefined
onMounted(() => {
  offNav = window.api.onNavigate((r) => router.push(r))
})
onUnmounted(() => offNav?.())
</script>

<template>
  <div class="wm-shell">
    <WindowTitleBar />
    <AppSidebar />
    <main class="wm-main">
      <header v-if="title" class="wm-page-header">
        <h1>{{ title }}</h1>
      </header>
      <div class="wm-content">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.wm-shell {
  display: flex;
  min-height: 100vh;
  background: var(--wm-window-bg);
}
.wm-main {
  flex: 1;
  min-width: 0;
  margin-left: var(--wm-rail-width);
  padding-top: var(--wm-titlebar-height);
  display: flex;
  flex-direction: column;
}
.wm-page-header {
  height: var(--wm-header-height);
  display: flex;
  align-items: center;
  padding: 0 32px;
  background: var(--wm-header-bg);
  border-bottom: 1px solid var(--wm-border);
  position: sticky;
  top: var(--wm-titlebar-height);
  z-index: 5;
}
.wm-page-header h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--wm-text);
}
.wm-content {
  flex: 1;
  min-height: 0;
  padding: 32px 48px;
  overflow: auto;
}
@media (max-width: 768px) {
  .wm-main {
    margin-left: 0;
  }
}
</style>
