<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Modal, message } from 'ant-design-vue'
import {
  PlusOutlined,
  SaveOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons-vue'
import { autoReplyService, settingsService } from '@/core/services'
import type { AutoReplyRule, MatchType } from '@/core/types'

const rules = ref<AutoReplyRule[]>([])
const loading = ref(false)
const saving = ref(false)
const editingRule = ref<AutoReplyRule | null>(null)
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

function onEdit(rule: AutoReplyRule) {
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

function cancelEdit() {
  editingRule.value = null
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
    cancelEdit()
    await loadRules()
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
  Modal.confirm({
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

const columns = [
  { title: '启用', key: 'enabled', width: 60 },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '匹配方式', key: 'matchType', width: 110 },
  { title: '匹配内容', key: 'matchPattern' },
  { title: '回复内容', key: 'replyContent' },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70 },
  { title: '操作', key: 'action', width: 100 }
]

onMounted(() => {
  loadRules()
  loadGlobalPrompt()
})
</script>

<template>
  <h2 class="page-title">自动回复</h2>
  <a-row :gutter="16">
    <a-col :xs="24" :xl="8">
      <a-card :title="editingRule ? '编辑规则' : '添加规则'">
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
            <a-button v-if="editingRule" @click="cancelEdit">取消</a-button>
          </a-space>
        </a-form>
      </a-card>

      <a-card size="small" class="mt-16" :bordered="false">
        <p class="help-title">匹配方式说明</p>
        <ul class="help-list">
          <li><b>精确匹配：</b>消息内容必须完全等于匹配内容</li>
          <li><b>包含关键词：</b>消息中包含关键词即触发</li>
          <li><b>正则表达式：</b>使用正则匹配，如 <code>你好|hi|hello</code></li>
          <li><b>AI 回复：</b>使用 AI 生成智能回复，需先在系统设置配置 AI 服务</li>
          <li><b>排除匹配：</b>匹配其他规则都未匹配的消息，适合作为兜底规则</li>
        </ul>
      </a-card>
    </a-col>

    <a-col :xs="24" :xl="16">
      <a-card title="规则列表">
        <template #extra>
          <a-button :loading="loading" @click="loadRules">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </template>
        <a-table :columns="columns" :data-source="rules" :loading="loading" row-key="id" size="middle" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'enabled'">
              <a-switch :checked="record.enabled" size="small" @change="toggleRule(record)" />
            </template>
            <template v-else-if="column.key === 'matchType'">
              <a-tag>{{ matchTypeName(record.matchType) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'matchPattern'">
              <span v-if="record.excludeMatch" class="muted">(排除其他规则)</span>
              <span v-else>{{ record.matchPattern || '(所有消息)' }}</span>
            </template>
            <template v-else-if="column.key === 'replyContent'">
              <span v-if="record.matchType === 'ai'" class="info">{{ record.replyContent || '(使用全局提示词)' }}</span>
              <span v-else>{{ record.replyContent }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space size="small">
                <a-button size="small" @click="onEdit(record)">
                  <template #icon><EditOutlined /></template>
                </a-button>
                <a-button size="small" danger @click="deleteRule(record)">
                  <template #icon><DeleteOutlined /></template>
                </a-button>
              </a-space>
            </template>
          </template>
          <template #emptyText><a-empty description="暂无自动回复规则" /></template>
        </a-table>
      </a-card>
    </a-col>
  </a-row>
</template>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.mt-16 { margin-top: 16px; }
.hint { font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 4px; }
.ai-hint { margin-top: 8px; }
.global-prompt { font-size: 12px; }
.global-prompt pre { background: rgba(0,0,0,0.04); padding: 8px; border-radius: 4px; max-height: 60px; overflow: hidden; white-space: pre-wrap; margin: 4px 0 0; }
.warn { color: #faad14; font-size: 12px; }
.info { color: #1677ff; }
.muted { color: rgba(0,0,0,0.45); }
.help-title { font-weight: 600; margin: 0 0 8px; }
.help-list { padding-left: 20px; font-size: 12px; color: rgba(0,0,0,0.55); line-height: 1.9; }
.help-list code { background: rgba(0,0,0,0.06); padding: 0 4px; border-radius: 3px; }
</style>
