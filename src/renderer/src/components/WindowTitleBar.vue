<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const isMaximized = ref(false)
let offMax: (() => void) | undefined

async function syncMaximized() {
  isMaximized.value = (await window.api.invoke('window:isMaximized')) as boolean
}

async function minimize() {
  await window.api.invoke('window:minimize')
}

async function toggleMaximize() {
  isMaximized.value = (await window.api.invoke('window:maximize')) as boolean
}

async function close() {
  await window.api.invoke('window:close')
}

// 双击标题栏空白区域切换最大化（复刻原生窗口行为）
function ondblclick() {
  toggleMaximize()
}

onMounted(() => {
  syncMaximized()
  offMax = window.api.onMaximizeChange((m) => (isMaximized.value = m))
})
onUnmounted(() => offMax?.())
</script>

<template>
  <div class="wm-titlebar" @dblclick="ondblclick">
    <div class="wm-titlebar-left">
    </div>
    <div class="wm-titlebar-btns">
      <button class="wm-tb-btn" title="最小化" @click="minimize">
        <svg viewBox="0 0 12 12" width="12" height="12"><path d="M1 6h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
      <button class="wm-tb-btn" :title="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
        <svg v-if="!isMaximized" viewBox="0 0 12 12" width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        <svg v-else viewBox="0 0 12 12" width="12" height="12">
          <rect x="3.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path d="M1.5 4.5v6h6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
        </svg>
      </button>
      <button class="wm-tb-btn wm-tb-close" title="关闭" @click="close">
        <svg viewBox="0 0 12 12" width="12" height="12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wm-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--wm-titlebar-height);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 16px;
  background: var(--wm-titlebar-bg);
  border-bottom: 1px solid var(--wm-border);
  -webkit-app-region: drag;
  user-select: none;
}
.wm-titlebar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--wm-text);
}

.wm-titlebar-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.wm-titlebar-btns {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}
.wm-tb-btn {
  width: 44px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--wm-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.wm-tb-btn:hover {
  background: var(--wm-titlebar-btn-hover);
  color: var(--wm-text);
}
.wm-tb-close:hover {
  background: var(--wm-titlebar-close-hover);
  color: #fff;
}
</style>
