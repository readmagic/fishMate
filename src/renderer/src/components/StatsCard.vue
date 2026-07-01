<script setup lang="ts">
import { computed } from 'vue'
import { Statistic, Card } from 'ant-design-vue'

const props = defineProps<{
  title: string
  value: number | string
  icon?: any
  color?: string
  suffix?: string
}>()

const valueDisplay = computed(() => props.value)
</script>

<template>
  <Card class="stats-card" :bordered="false">
    <div class="stats-inner">
      <div class="stats-icon" :style="{ background: (color ?? '#1677ff') + '1a', color: color ?? '#1677ff' }">
        <component :is="icon" v-if="icon" />
      </div>
      <Statistic :title="title" :value="valueDisplay" :suffix="suffix" />
    </div>
  </Card>
</template>

<style scoped>
.stats-card {
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.stats-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stats-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
</style>
