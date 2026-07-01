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
  /* 减去页头高度与 .wm-content 的上下 padding(16*2)，精确填满可用区避免溢出滚动 */
  height: calc(100vh - var(--wm-header-height) - 32px);
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
