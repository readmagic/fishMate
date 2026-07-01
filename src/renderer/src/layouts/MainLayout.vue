<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'

const route = useRoute()
const title = (route.meta.title as string) || ''
</script>

<template>
  <div class="wm-shell">
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
  background: var(--wm-content-bg);
}
.wm-main {
  flex: 1;
  min-width: 0;
  margin-left: var(--wm-rail-width);
  display: flex;
  flex-direction: column;
}
.wm-page-header {
  height: var(--wm-header-height);
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--wm-card-bg);
  border-bottom: 1px solid var(--wm-border);
  position: sticky;
  top: 0;
  z-index: 5;
}
.wm-page-header h1 {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
  color: var(--wm-text);
}
.wm-content {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}
@media (max-width: 768px) {
  .wm-main {
    margin-left: 0;
  }
}
</style>
