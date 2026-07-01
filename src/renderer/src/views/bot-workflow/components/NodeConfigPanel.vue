<script setup lang="ts">
import { computed } from 'vue'
import {
  NODE_TYPES,
  MATCH_MODES,
  DELAY_MODES,
  TIME_UNITS,
  CONDITION_TEMPLATES,
  type NodeConfigData
} from '../node-config.types'

const props = defineProps<{ config: NodeConfigData }>()
const emit = defineEmits<{
  (e: 'fieldChange', payload: { field: keyof NodeConfigData; value: any }): void
  (e: 'nodeTypeChange', value: string): void
  (e: 'configChange'): void
}>()

const color = computed(() => NODE_TYPES[props.config.nodeType as keyof typeof NODE_TYPES]?.color || '#6b7280')

function setField(field: keyof NodeConfigData, value: any) {
  emit('fieldChange', { field, value })
  emit('configChange')
}
function onTypeChange(v: string) {
  emit('nodeTypeChange', v)
}

// 延迟节点：单位换算
const factor = computed(() => (props.config.delayUnit === 's' ? 1000 : 1))
const unitLabel = computed(() => (props.config.delayUnit === 's' ? '秒' : '毫秒'))
const displayValue = computed(() => props.config.delayMs / factor.value)
const displayMin = computed(() => props.config.delayMinMs / factor.value)
const displayMax = computed(() => props.config.delayMaxMs / factor.value)

function onDelayMs(v: number) { setField('delayMs', v * factor.value) }
function onDelayMin(v: number) { setField('delayMinMs', v * factor.value) }
function onDelayMax(v: number) { setField('delayMaxMs', v * factor.value) }

function insertTemplate(tpl: typeof CONDITION_TEMPLATES[0]) {
  const expr = tpl.ops.length > 0 ? `${tpl.expr} ${tpl.ops[0]} ` : tpl.expr
  setField('expression', expr)
}
</script>

<template>
  <div class="config-panel">
    <div class="panel-header">
      <span class="dot" :style="{ background: color }"></span>
      节点配置
    </div>

    <div class="panel-body">
      <div class="field">
        <label>节点名称</label>
        <a-input
          :value="config.text"
          size="small"
          @update:value="(v: string) => setField('text', v)"
        />
      </div>

      <div class="field">
        <label>节点类型</label>
        <a-select
          :value="config.nodeType"
          size="small"
          style="width: 100%"
          @update:value="onTypeChange"
        >
          <a-select-option value="trigger">触发</a-select-option>
          <a-select-option value="condition">条件判断</a-select-option>
          <a-select-option value="delivery">发货</a-select-option>
          <a-select-option value="ship">标记发货</a-select-option>
          <a-select-option value="delay">延迟</a-select-option>
          <a-select-option value="autoreply">等待回复</a-select-option>
          <a-select-option value="notify">通知</a-select-option>
        </a-select>
      </div>

      <!-- 发货 -->
      <template v-if="config.nodeType === 'delivery'">
        <div class="hint-box">说明：发送发货内容给买家，内容由自动发货规则配置决定（固定文本/库存/API取货）</div>
      </template>

      <!-- 标记发货 -->
      <template v-else-if="config.nodeType === 'ship'">
        <div class="field">
          <label>发货方式</label>
          <a-select
            :value="config.deliveryMode"
            size="small"
            style="width: 100%"
            @update:value="(v: string) => setField('deliveryMode', v)"
          >
            <a-select-option value="virtual">虚拟发货</a-select-option>
            <a-select-option value="freeshipping">免拼发货</a-select-option>
          </a-select>
          <div class="hint">
            {{ config.deliveryMode === 'virtual' ? '确认发货，适用于虚拟商品/无需物流' : '免拼发货，适用于拼单商品直接发货' }}
          </div>
        </div>
      </template>

      <!-- 条件 -->
      <template v-else-if="config.nodeType === 'condition'">
        <div class="field">
          <label>条件表达式</label>
          <a-textarea
            :value="config.expression"
            :rows="2"
            :auto-size="{ minRows: 2 }"
            placeholder="例如: order.price > 100"
            @update:value="(v: string) => setField('expression', v)"
          />
          <div class="templates">
            <span class="hint">快速插入：</span>
            <a-button v-for="t in CONDITION_TEMPLATES" :key="t.label" size="small" type="link" @click="insertTemplate(t)">
              {{ t.label }}
            </a-button>
          </div>
        </div>
      </template>

      <!-- 延迟 -->
      <template v-else-if="config.nodeType === 'delay'">
        <div class="field">
          <label>延迟模式</label>
          <a-select :value="config.delayMode" size="small" style="width: 100%" @update:value="(v: string) => setField('delayMode', v)">
            <a-select-option v-for="m in DELAY_MODES" :key="m.value" :value="m.value">{{ m.label }}</a-select-option>
          </a-select>
        </div>
        <div class="field">
          <label>时间单位</label>
          <a-select :value="config.delayUnit" size="small" style="width: 100%" @update:value="(v: string) => setField('delayUnit', v)">
            <a-select-option v-for="u in TIME_UNITS" :key="u.value" :value="u.value">{{ u.label }}</a-select-option>
          </a-select>
        </div>
        <div v-if="config.delayMode === 'fixed'" class="field">
          <label>延迟时间（{{ unitLabel }}）</label>
          <a-input-number :value="displayValue" :min="0" size="small" style="width: 100%" @update:value="onDelayMs" />
        </div>
        <template v-else>
          <div class="field">
            <label>最短时间（{{ unitLabel }}）</label>
            <a-input-number :value="displayMin" :min="0" size="small" style="width: 100%" @update:value="onDelayMin" placeholder="默认0" />
          </div>
          <div class="field">
            <label>最长时间（{{ unitLabel }}）</label>
            <a-input-number :value="displayMax" :min="1" size="small" style="width: 100%" @update:value="onDelayMax" />
          </div>
          <div class="hint">将在 {{ displayMin || 0 }} ~ {{ displayMax }} {{ unitLabel }}之间随机延迟</div>
        </template>
      </template>

      <!-- 等待回复 -->
      <template v-else-if="config.nodeType === 'autoreply'">
        <div class="field">
          <label>发送消息</label>
          <a-textarea :value="config.promptMessage" :rows="2" @update:value="(v: string) => setField('promptMessage', v)" placeholder="如：请回复「确认」继续发货" />
        </div>
        <div class="field">
          <label>确认关键词（逗号分隔）</label>
          <a-input :value="config.keywords" size="small" @update:value="(v: string) => setField('keywords', v)" placeholder="确认,同意,好的,收到" />
        </div>
        <div class="field">
          <label>匹配模式</label>
          <a-select :value="config.matchMode" size="small" style="width: 100%" @update:value="(v: string) => setField('matchMode', v)">
            <a-select-option v-for="m in MATCH_MODES" :key="m.value" :value="m.value">{{ m.label }}</a-select-option>
          </a-select>
          <div class="hint">{{ config.matchMode === 'exact' ? '回复内容必须完全等于关键词' : '回复内容包含关键词即可' }}</div>
        </div>
      </template>

      <!-- 通知 -->
      <template v-else-if="config.nodeType === 'notify'">
        <div class="field">
          <label>通知消息</label>
          <a-textarea :value="config.message" :rows="3" @update:value="(v: string) => setField('message', v)" placeholder="输入通知内容" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 500;
  font-size: 13px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.panel-body {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}
.hint {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.hint-box {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  background: rgba(0, 0, 0, 0.04);
  padding: 8px;
  border-radius: 4px;
}
.templates {
  margin-top: 4px;
}
</style>
