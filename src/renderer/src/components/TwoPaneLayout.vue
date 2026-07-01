<script setup lang="ts">
withDefaults(
  defineProps<{
    listWidth?: number
  }>(),
  { listWidth: 300 }
)
</script>

<template>
  <div class="wm-twopane">
    <aside class="wm-twopane-list" :style="{ width: listWidth + 'px' }">
      <slot name="list" />
    </aside>
    <section class="wm-twopane-detail">
      <slot name="detail" />
    </section>
  </div>
</template>

<style scoped>
.wm-twopane {
  display: flex;
  /* 精确填满 .wm-content 内容区：扣 titlebar、page-header、content 上下 padding(32*2)。
     用显式 vh 高度保证子级 flex/百分比高度链可解析，避免内层滚动条失效或外层溢出 */
  height: calc(100vh - var(--wm-titlebar-height) - var(--wm-header-height) - 64px);
  min-height: 0;
  align-items: stretch;
}
.wm-twopane-list {
  background: var(--wm-card-bg);
  border-right: 1px solid var(--wm-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
.wm-twopane-detail {
  flex: 1;
  min-width: 0;
  background: var(--wm-card-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
@media (max-width: 768px) {
  .wm-twopane {
    flex-direction: column;
    height: auto;
  }
  .wm-twopane-list {
    width: 100% !important;
    height: 45vh;
    border-right: none;
    border-bottom: 1px solid var(--wm-border);
  }
}
</style>
