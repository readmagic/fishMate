<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  PlusOutlined,
  SaveOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons-vue'
import { autoReplyService, settingsService } from '@/core/services'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { AutoReplyRule, MatchType } from '@/core/types'

const { modal } = App.useApp()
const rules = ref<AutoReplyRule[]>([])
const loading = ref(false)
const saving = ref(false)
const editingRule = ref<AutoReplyRule | null>(null)
const isAdding = ref(false)
const globalPrompt = ref('')

const formData = reactive({
  name: '',
  enabled: true,
  priority: 0,
  matchType: 'exact' as MatchType,
  matchPattern: '',
  replyContent: '',
  accountId: null as string | null,
  excludeMatch: false
})

const hasSelection = computed(() => editingRule.value !== null || isAdding.value)

const matchTypes = [
  { value: 'exact' as MatchType, label: '精确匹配' },
  { value: 'contains' as MatchType, label: '包含关键词' },
  { value: 'regex' as MatchType, label: '正则表达式' },
  { value: 'ai' as MatchType, label: 'AI 回复' }
]

function matchTypeName(t: string) {
  return matchTypes.find((m) => m.value === t)?.label || t
}

async function loadGlobalPrompt() {
  try {
    const s = await settingsService.getAISettings()
    globalPrompt.value = s.systemPrompt || ''
  } catch (e) {
    console.error('加载全局提示词失败', e)
  }
}

async function loadRules() {
  loading.value = true
  try {
    const res = await autoReplyService.getRules()
    rules.value = res.rules
  } catch (e) {
    console.error('加载规则失败', e)
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(formData, {
    name: '',
    enabled: true,
    priority: 0,
    matchType: 'exact',
    matchPattern: '',
    replyContent: '',
    accountId: null,
    excludeMatch: false
  })
}

function selectRule(rule: AutoReplyRule) {
  isAdding.value = false
  editingRule.value = rule
  Object.assign(formData, {
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    matchType: rule.matchType,
    matchPattern: rule.matchPattern,
    replyContent: rule.replyContent,
    accountId: rule.accountId,
    excludeMatch: rule.excludeMatch
  })
}

function startAdd() {
  editingRule.value = null
  isAdding.value = true
  resetForm()
}

function cancelEdit() {
  editingRule.value = null
  isAdding.value = false
  resetForm()
}

async function saveRule() {
  if (!formData.name) {
    message.warning('请填写规则名称')
    return
  }
  if (!formData.excludeMatch && formData.matchType !== 'ai' && (!formData.matchPattern || !formData.replyContent)) {
    message.warning('请填写匹配内容和回复内容')
    return
  }
  saving.value = true
  try {
    if (editingRule.value) {
      await autoReplyService.updateRule(editingRule.value.id, { ...formData })
    } else {
      await autoReplyService.createRule({ ...formData })
    }
    await loadRules()
    cancelEdit()
    message.success('保存成功')
  } catch (e) {
    console.error('保存规则失败', e)
  } finally {
    saving.value = false
  }
}

async function toggleRule(rule: AutoReplyRule) {
  await autoReplyService.toggleRule(rule.id)
  await loadRules()
}

function deleteRule(rule: AutoReplyRule) {
  modal.confirm({
    title: '删除规则',
    content: `确定删除规则 "${rule.name}" 吗？`,
    okType: 'danger',
    onOk: async () => {
      await autoReplyService.deleteRule(rule.id)
      if (editingRule.value?.id === rule.id) cancelEdit()
      await loadRules()
    }
  })
}

onMounted(() => {
  loadRules()
  loadGlobalPrompt()
})
</script>

<template>
  <TwoPaneLayout :list-width="320">
    <template #list>
      <div class="list-header">
        <span class="list-title">规则列表</span>
        <a-space size="small">
          <a-button size="small" type="primary" @click="startAdd">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <a-button size="small" :loading="loading" @click="loadRules">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </a-space>
      </div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="rules.length === 0" description="暂无规则" />
          <div v-else class="rule-list">
            <div
              v-for="rule in rules"
              :key="rule.id"
              class="rule-row"
              :class="{ active: editingRule?.id === rule.id }"
              @click="selectRule(rule)"
            >
              <div class="rule-main">
                <div class="rule-name">{{ rule.name }}</div>
                <div class="rule-sub">
                  <a-tag class="mt-tag">{{ matchTypeName(rule.matchType) }}</a-tag>
                  <span v-if="rule.excludeMatch" class="muted">(排除匹配)</span>
                  <span v-else-if="rule.matchType !== 'ai'" class="muted">{{ rule.matchPattern }}</span>
                </div>
              </div>
              <a-switch :checked="rule.enabled" size="small" @change="toggleRule(rule)" @click.stop />
              <a-button size="small" danger @click.stop="deleteRule(rule)">
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="hasSelection" class="detail-wrap">
        <div class="detail-header">
          <component :is="editingRule ? EditOutlined : PlusOutlined" />
          <span>{{ editingRule ? '编辑规则' : '添加规则' }}</span>
        </div>
        <div class="detail-body">
          <a-form layout="vertical" @submit.prevent="saveRule">
            <a-form-item label="规则名称" required>
              <a-input v-model:value="formData.name" placeholder="例如：问候语回复" />
            </a-form-item>
            <a-form-item label="匹配方式">
              <a-select v-model:value="formData.matchType">
                <a-select-option v-for="t in matchTypes" :key="t.value" :value="t.value">{{ t.label }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item>
              <a-checkbox v-model:checked="formData.excludeMatch">排除匹配（匹配其他规则未匹配的所有消息）</a-checkbox>
            </a-form-item>
            <a-form-item v-if="!formData.excludeMatch" label="匹配内容" :required="formData.matchType !== 'ai'">
              <a-input
                v-model:value="formData.matchPattern"
                :placeholder="formData.matchType === 'ai' ? '触发关键词（逗号分隔，留空匹配所有）' : '输入关键词或正则'"
              />
              <div class="hint">
                <span v-if="formData.matchType === 'exact'">消息内容必须完全等于此内容</span>
                <span v-else-if="formData.matchType === 'contains'">消息内容包含此关键词即可</span>
                <span v-else-if="formData.matchType === 'regex'">使用正则表达式匹配</span>
                <span v-else-if="formData.matchType === 'ai'">包含任一关键词时触发 AI 回复，留空或 * 匹配所有</span>
              </div>
            </a-form-item>
            <a-form-item :label="formData.matchType === 'ai' ? 'AI 提示词' : '回复内容'" :required="formData.matchType !== 'ai' && !formData.excludeMatch">
              <a-textarea
                v-model:value="formData.replyContent"
                :rows="3"
                :placeholder="formData.matchType === 'ai' ? '定义 AI 的角色和回复风格（可选）' : '输入自动回复的内容'"
              />
              <div v-if="formData.matchType === 'ai'" class="ai-hint">
                <span v-if="globalPrompt" class="global-prompt">
                  当前全局提示词：<pre>{{ globalPrompt }}</pre>
                </span>
                <span v-else class="warn">未设置全局提示词，请在系统设置中配置</span>
              </div>
            </a-form-item>
            <a-form-item label="优先级">
              <a-input-number v-model:value="formData.priority" :min="0" style="width: 120px" />
              <div class="hint">数字越大优先级越高</div>
            </a-form-item>
            <a-form-item>
              <a-checkbox v-model:checked="formData.enabled">启用此规则</a-checkbox>
            </a-form-item>
            <a-space>
              <a-button type="primary" html-type="submit" :loading="saving">
                <template #icon><component :is="editingRule ? SaveOutlined : PlusOutlined" /></template>
                {{ editingRule ? '保存' : '添加' }}
              </a-button>
              <a-button @click="cancelEdit">取消</a-button>
            </a-space>
          </a-form>

          <a-card size="small" :bordered="false" class="help-card">
            <p class="help-title">匹配方式说明</p>
            <ul class="help-list">
              <li><b>精确匹配：</b>消息内容必须完全等于匹配内容</li>
              <li><b>包含关键词：</b>消息中包含关键词即触发</li>
              <li><b>正则表达式：</b>使用正则匹配，如 <code>你好|hi|hello</code></li>
              <li><b>AI 回复：</b>使用 AI 生成智能回复，需先在系统设置配置 AI 服务</li>
              <li><b>排除匹配：</b>匹配其他规则都未匹配的消息，适合作为兜底规则</li>
            </ul>
          </a-card>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一条规则编辑，或点击新建" />
      </div>
    </template>
  </TwoPaneLayout>
</template>

<style scoped>
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.list-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--wm-text);
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.rule-row:hover {
  background: var(--wm-list-hover);
}
.rule-row.active {
  background: var(--wm-list-active);
}
.rule-main {
  flex: 1;
  min-width: 0;
}
.rule-name {
  font-weight: 500;
  color: var(--wm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rule-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 12px;
}
.mt-tag {
  margin: 0;
}
.muted {
  color: var(--wm-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wm-border);
  font-size: 14px;
  font-weight: 500;
  color: var(--wm-text);
  flex-shrink: 0;
}
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.hint {
  font-size: 12px;
  color: var(--wm-text-secondary);
  margin-top: 4px;
}
.ai-hint {
  margin-top: 8px;
}
.global-prompt {
  font-size: 12px;
}
.global-prompt pre {
  background: var(--wm-list-hover);
  padding: 8px;
  border-radius: 4px;
  max-height: 60px;
  overflow: hidden;
  white-space: pre-wrap;
  margin: 4px 0 0;
  color: var(--wm-text);
}
.warn {
  color: #faad14;
  font-size: 12px;
}
.help-card {
  margin-top: 24px;
  background: transparent;
}
.help-title {
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--wm-text);
}
.help-list {
  padding-left: 20px;
  font-size: 12px;
  color: var(--wm-text-secondary);
  line-height: 1.9;
}
.help-list code {
  background: var(--wm-list-hover);
  padding: 0 4px;
  border-radius: 3px;
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
