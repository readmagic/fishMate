<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  BulbOutlined,
  BulbFilled,
  DesktopOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined
} from '@ant-design/icons-vue'
import { useThemeStore } from '@/core/stores/useThemeStore'
import type { ThemeMode } from '@/core/stores/useThemeStore'
import { settingsService, type AISettings } from '@/core/services'

const themeStore = useThemeStore()

const aiSettings = reactive<AISettings>({
  baseUrl: '',
  apiKey: '',
  hasApiKey: false,
  model: 'gpt-3.5-turbo',
  systemPrompt: ''
})
const savingAI = ref(false)
const testingAI = ref(false)

async function loadAISettings() {
  try {
    const s = await settingsService.getAISettings()
    Object.assign(aiSettings, s)
  } catch (e) {
    console.error('加载 AI 设置失败', e)
  }
}

async function saveAISettings() {
  savingAI.value = true
  try {
    await settingsService.saveAISettings({
      baseUrl: aiSettings.baseUrl,
      apiKey: aiSettings.apiKey,
      model: aiSettings.model,
      systemPrompt: aiSettings.systemPrompt
    })
    message.success('AI 设置已保存')
    await loadAISettings()
  } catch {
    message.error('保存 AI 设置失败')
  } finally {
    savingAI.value = false
  }
}

async function testAIConnection() {
  testingAI.value = true
  try {
    const r = await settingsService.testAIConnection()
    if (r.success) message.success('AI 服务连接正常')
    else message.error(r.error || '无法连接到 AI 服务')
  } catch {
    message.error('测试连接时发生错误')
  } finally {
    testingAI.value = false
  }
}

async function resetPrompt() {
  try {
    const r = await settingsService.getDefaultPrompt()
    aiSettings.systemPrompt = r.prompt
  } catch (e) {
    console.error('获取默认提示词失败', e)
  }
}

const themeOptions: { value: ThemeMode; label: string; icon: any }[] = [
  { value: 'light', label: '浅色', icon: BulbOutlined },
  { value: 'dark', label: '深色', icon: BulbFilled },
  { value: 'system', label: '跟随系统', icon: DesktopOutlined }
]

onMounted(loadAISettings)
</script>

<template>
  <h2 class="page-title">系统设置</h2>

  <a-card title="主题模式" class="mb-12">
    <a-space>
      <a-button
        v-for="opt in themeOptions"
        :key="opt.value"
        :type="themeStore.themeMode === opt.value ? 'primary' : 'default'"
        @click="themeStore.setTheme(opt.value)"
      >
        <template #icon><component :is="opt.icon" /></template>
        {{ opt.label }}
      </a-button>
    </a-space>
  </a-card>

  <a-card>
    <template #title>
      <a-space>
        <RobotOutlined />
        <span>AI 服务配置</span>
      </a-space>
    </template>
    <p class="section-desc">配置 OpenAI 兼容的 API 服务</p>

    <a-row :gutter="16">
      <a-col :md="12" :xs="24">
        <a-form-item label="API Base URL">
          <a-input
            v-model:value="aiSettings.baseUrl"
            placeholder="https://api.openai.com/v1（留空使用默认）"
          />
          <div class="hint">支持 OpenAI 兼容的第三方服务</div>
        </a-form-item>
      </a-col>
      <a-col :md="12" :xs="24">
        <a-form-item label="API Key">
          <a-input-password v-model:value="aiSettings.apiKey" placeholder="sk-..." />
          <div class="hint">
            <span v-if="aiSettings.hasApiKey" class="ok">已配置</span>
            <span v-else class="warn">未配置</span>
          </div>
        </a-form-item>
      </a-col>
      <a-col :md="12" :xs="24">
        <a-form-item label="模型">
          <a-input v-model:value="aiSettings.model" placeholder="gpt-3.5-turbo" />
        </a-form-item>
      </a-col>
    </a-row>

    <a-form-item label="全局提示词">
      <template #label>
        <a-space>
          <span>全局提示词</span>
          <a-button size="small" type="link" @click="resetPrompt">
            <template #icon><UndoOutlined /></template>
            重置为默认
          </a-button>
        </a-space>
      </template>
      <a-textarea
        v-model:value="aiSettings.systemPrompt"
        :rows="6"
        placeholder="定义 AI 的角色和回复风格，自动回复规则留空时将使用此提示词"
      />
      <div class="hint">自动回复规则的 AI 提示词留空时将自动填入此内容</div>
    </a-form-item>

    <a-space>
      <a-button type="primary" :loading="savingAI" @click="saveAISettings">
        <template #icon><SaveOutlined /></template>
        保存设置
      </a-button>
      <a-button :loading="testingAI" :disabled="!aiSettings.hasApiKey" @click="testAIConnection">
        <template #icon><ThunderboltOutlined /></template>
        测试连接
      </a-button>
    </a-space>
  </a-card>
</template>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.mb-12 { margin-bottom: 12px; }
.section-desc { color: rgba(0,0,0,0.55); margin: 0 0 16px; }
.hint { font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 4px; }
.ok { color: #52c41a; }
.warn { color: #faad14; }
</style>
