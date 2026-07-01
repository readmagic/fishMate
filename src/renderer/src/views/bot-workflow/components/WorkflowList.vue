<script setup lang="ts">
import { ApartmentOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined, ClockCircleOutlined } from '@ant-design/icons-vue'
import type { Workflow } from '@/core/types'
import dayjs from 'dayjs'

defineProps<{ workflows: Workflow[]; loading: boolean }>()
const emit = defineEmits<{ (e: 'edit', w: Workflow): void; (e: 'delete', w: Workflow): void }>()

function nodeCount(w: Workflow) {
  return w.definition?.nodes?.length || 0
}
function formatTime(t: string) {
  return dayjs(t).format('MM-DD HH:mm')
}
</script>

<template>
  <a-spin :spinning="loading">
    <a-empty v-if="workflows.length === 0" description="暂无发货流程，点击上方按钮创建第一个流程" class="empty-state" />
    <a-row v-else :gutter="[16, 16]">
      <a-col v-for="w in workflows" :key="w.id" :xs="24" :sm="12" :xl="8">
        <a-card hoverable>
          <template #title>
            <a-space>
              <ApartmentOutlined style="color: #1677ff" />
              <span class="wf-name">{{ w.name }}</span>
              <a-tag v-if="w.isDefault" color="blue">默认</a-tag>
            </a-space>
          </template>
          <p v-if="w.description" class="wf-desc">{{ w.description }}</p>
          <div class="wf-meta">
            <span><AppstoreOutlined /> {{ nodeCount(w) }} 节点</span>
            <span><ClockCircleOutlined /> {{ formatTime(w.updatedAt) }}</span>
          </div>
          <template #actions>
            <a-space>
              <a-button size="small" @click="emit('edit', w)">
                <template #icon><EditOutlined /></template>
                编辑
              </a-button>
              <a-button v-if="!w.isDefault" size="small" danger @click="emit('delete', w)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
          </template>
        </a-card>
      </a-col>
    </a-row>
  </a-spin>
</template>

<style scoped>
.empty-state { padding: 64px 0; }
.wf-name { font-weight: 600; }
.wf-desc {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wf-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.wf-meta span { display: inline-flex; align-items: center; gap: 4px; }
</style>
