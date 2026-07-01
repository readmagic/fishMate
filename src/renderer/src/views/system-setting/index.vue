<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SettingOutlined, InfoCircleOutlined, CoffeeOutlined } from '@ant-design/icons-vue'
import { settingsService, type AISettings } from '@/core/services'
import alipayQr from '@/assets/about/alipay.png'
import wechatQr from '@/assets/about/wechat.png'
import pkg from '../../../../../package.json'

// 程序版本号（取自 package.json）
const appVersion = `v${pkg.version}`

// 当前选中的设置分类
type Tab = 'general' | 'about'
const activeTab = ref<Tab>('general')
const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'general', label: '常规设置', icon: SettingOutlined },
  { key: 'about', label: '关于我们', icon: InfoCircleOutlined }
]

const autoStart = ref(false)
const autoStartLoading = ref(false)

async function loadAutoStart() {
  try {
    autoStart.value = await settingsService.getAutoStart()
  } catch (e) {
    console.error('获取开机自启状态失败', e)
  }
}

async function onAutoStartChange(enabled: boolean) {
  autoStartLoading.value = true
  try {
    autoStart.value = await settingsService.setAutoStart(enabled)
    message.success(enabled ? '已开启开机自启' : '已关闭开机自启')
  } catch {
    autoStart.value = !enabled // 回滚开关状态
    message.error('设置开机自启失败')
  } finally {
    autoStartLoading.value = false
  }
}

// TODO: AI 服务配置模块暂不启用，待自动回复模块恢复后启用（下方 reactive 与函数保留以便恢复）
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

onMounted(() => {
  // TODO: AI 设置加载暂不启用，随 AI 服务配置模块一同恢复
  // loadAISettings()
  loadAutoStart()
})
</script>

<template>
  <div class="setting-shell">
    <!-- 左：分类导航 -->
    <nav class="setting-nav">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="nav-item"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        <component :is="t.icon" />
        <span>{{ t.label }}</span>
      </div>
    </nav>

    <!-- 右：内容区 -->
    <section class="setting-content">
      <!-- 常规设置 -->
      <div v-show="activeTab === 'general'" class="tab-pane">
        <a-card class="setting-card" title="常规设置">
          <div class="autostart-row">
            <div class="autostart-info">
              <div class="autostart-title">开机自启动</div>
              <div class="hint">系统开机后自动启动 fishMate 并在后台运行</div>
            </div>
            <a-switch
              :loading="autoStartLoading"
              :checked="autoStart"
              @change="onAutoStartChange"
            />
          </div>
        </a-card>

        <!-- TODO: AI 服务配置模块暂不启用，待自动回复模块恢复后启用
        <a-card class="setting-card" title="AI 服务配置"> ... </a-card>
        -->
      </div>

      <!-- 关于我们 -->
      <div v-show="activeTab === 'about'" class="tab-pane about-pane">
        <div class="about-card">
          <div class="about-brand">
            <h1 class="about-name">fishMate</h1>
            <p class="about-slogan">一款为副业而生的智能助手</p>
            <span class="about-version">{{ appVersion }}</span>
          </div>

          <div class="divider" />

          <div class="coffee-section">
            <div class="coffee-head">
              <CoffeeOutlined class="coffee-icon" />
              <span class="coffee-title">请作者喝杯咖啡</span>
            </div>
            <p class="coffee-desc">如果你觉得这款程序不错的话，欢迎请作者喝杯咖啡 ☕<br />你的支持是持续迭代的最大动力。</p>
            <div class="qr-row">
              <div class="qr-item">
                <img :src="alipayQr" alt="支付宝" class="qr-img" />
                <span class="qr-label">支付宝</span>
              </div>
              <div class="qr-item">
                <img :src="wechatQr" alt="微信" class="qr-img" />
                <span class="qr-label">微信</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.setting-shell {
  display: flex;
  gap: 16px;
  height: 100%;
  min-height: 0;
}
/* 左导航 */
.setting-nav {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: var(--wm-card-bg, #fff);
  border: 1px solid var(--wm-border);
  border-radius: 8px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--wm-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  background: var(--wm-list-hover, rgba(0,0,0,0.03));
  color: var(--wm-text);
}
.nav-item.active {
  background: var(--wm-rail-active-bg, #e6f4ff);
  color: var(--wm-rail-icon-active, #1677ff);
  font-weight: 600;
}
.nav-item :deep(.anticon) {
  font-size: 16px;
}
/* 右内容 */
.setting-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
.tab-pane {
  height: 100%;
}
.setting-card {
  margin-bottom: 16px;
}
.autostart-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.autostart-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.autostart-title {
  font-size: 14px;
  color: var(--wm-text);
}
.hint {
  font-size: 12px;
  color: var(--wm-text-tertiary);
  margin-top: 4px;
}

/* 关于我们 */
.about-pane {
  display: block;
}
.about-card {
  width: 100%;
  background: var(--wm-card-bg, #fff);
  border: 1px solid var(--wm-border);
  border-radius: 12px;
  padding: 40px 32px 32px;
}
.about-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.about-name {
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--wm-text);
  letter-spacing: 0.5px;
}
.about-slogan {
  margin: 0;
  font-size: 14px;
  color: var(--wm-text-secondary);
}
.about-version {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 12px;
  font-size: 12px;
  font-family: monospace;
  color: var(--wm-text-tertiary);
  background: var(--wm-content-bg, rgba(0,0,0,0.04));
  border-radius: 10px;
}
.divider {
  height: 1px;
  margin: 28px 0 24px;
  background: var(--wm-border);
}
/* 咖啡区 */
.coffee-section {
  text-align: center;
}
.coffee-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}
.coffee-icon {
  font-size: 20px;
  color: #d48806;
}
.coffee-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wm-text);
}
.coffee-desc {
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--wm-text-secondary);
}
.qr-row {
  display: flex;
  justify-content: center;
  gap: 40px;
}
.qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.qr-img {
  width: 160px;
  height: 160px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--wm-border);
  background: #fff;
}
.qr-label {
  font-size: 13px;
  color: var(--wm-text-secondary);
}
</style>
