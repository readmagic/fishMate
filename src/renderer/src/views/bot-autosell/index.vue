<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  PlusOutlined,
  SaveOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UploadOutlined,
  InboxOutlined
} from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import {
  autoSellService,
  accountService,
  goodsService,
  workflowService
} from '@/core/services'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type {
  AutoSellRule,
  DeliveryType,
  TriggerOn,
  ApiConfig,
  Account,
  GoodsItem,
  StockItem,
  StockStats,
  Workflow
} from '@/core/types'

const router = useRouter()
const service = autoSellService
const { modal } = App.useApp()

const rules = ref<AutoSellRule[]>([])
const workflows = ref<Workflow[]>([])
const loading = ref(false)
const saving = ref(false)
const editingRule = ref<AutoSellRule | null>(null)
const isAdding = ref(false)

// 库存 modal
const showStockModal = ref(false)
const stockRuleId = ref<number | null>(null)
const stockItems = ref<StockItem[]>([])
const stockStats = ref<StockStats | null>(null)
const loadingStock = ref(false)
const showUsedStock = ref(false)
const stockContent = ref('')

const accounts = ref<Account[]>([])
const allGoods = ref<GoodsItem[]>([])
const loadingGoods = ref(false)
const goodsSearch = ref('')
const showGoodsDropdown = ref(false)

const formData = reactive({
  name: '',
  enabled: true,
  itemId: null as string | null,
  accountId: null as string | null,
  deliveryType: 'fixed' as DeliveryType,
  deliveryContent: '',
  triggerOn: 'paid' as TriggerOn,
  workflowId: null as number | null,
  apiUrl: '',
  apiMethod: 'GET' as 'GET' | 'POST',
  apiHeaders: '',
  apiBody: '',
  apiResponseField: ''
})

const deliveryTypes = [
  { value: 'fixed' as DeliveryType, label: '固定文本' },
  { value: 'stock' as DeliveryType, label: '库存发货' },
  { value: 'api' as DeliveryType, label: 'API取货' }
]
const triggerOptions = [
  { value: 'paid' as TriggerOn, label: '待发货' },
  { value: 'confirmed' as TriggerOn, label: '待收货' }
]

const hasSelection = computed(() => editingRule.value !== null || isAdding.value)

const editingRuleStock = computed(() => {
  const r = editingRule.value
  if (!r) return { total: 0, available: 0 }
  return { total: r.stockCount || 0, available: (r.stockCount || 0) - (r.usedCount || 0) }
})
const stockContentCount = computed(() => {
  if (!stockContent.value.trim()) return 0
  return stockContent.value.split('\n').filter((l) => l.trim()).length
})

const filteredGoods = computed(() => {
  const s = goodsSearch.value.toLowerCase()
  let list = allGoods.value
  if (formData.accountId) list = list.filter((g) => g.accountId === formData.accountId)
  if (s) list = list.filter((g) => g.title.toLowerCase().includes(s) || g.id.includes(s))
  return list.slice(0, 20)
})
const selectedGoods = computed(() => {
  if (!formData.itemId) return null
  return allGoods.value.find((g) => g.id === formData.itemId) || null
})

async function loadWorkflows() {
  try {
    const res = await workflowService.getWorkflows()
    workflows.value = res.workflows
  } catch (e) {
    console.error('加载流程失败', e)
  }
}
async function loadAccounts() {
  try {
    const res = await accountService.getAccounts()
    accounts.value = res.accounts.filter((a) => a.enabled)
  } catch (e) {
    console.error('加载账号失败', e)
  }
}
async function loadAllGoods() {
  loadingGoods.value = true
  try {
    const res = await goodsService.getGoods()
    allGoods.value = res.items
  } catch (e) {
    console.error('加载商品失败', e)
  } finally {
    loadingGoods.value = false
  }
}
async function loadRules() {
  loading.value = true
  try {
    const res = await service.getRules()
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
    itemId: null,
    accountId: null,
    deliveryType: 'fixed',
    deliveryContent: '',
    triggerOn: 'paid',
    workflowId: null,
    apiUrl: '',
    apiMethod: 'GET',
    apiHeaders: '',
    apiBody: '',
    apiResponseField: ''
  })
  goodsSearch.value = ''
  stockContent.value = ''
}

function selectRule(rule: AutoSellRule) {
  isAdding.value = false
  editingRule.value = rule
  const api = rule.apiConfig
  Object.assign(formData, {
    name: rule.name,
    enabled: rule.enabled,
    itemId: rule.itemId,
    accountId: rule.accountId,
    deliveryType: rule.deliveryType,
    deliveryContent: rule.deliveryContent || '',
    triggerOn: rule.triggerOn,
    workflowId: rule.workflowId,
    apiUrl: api?.url || '',
    apiMethod: api?.method || 'GET',
    apiHeaders: api?.headers ? JSON.stringify(api.headers, null, 2) : '',
    apiBody: api?.body || '',
    apiResponseField: api?.responseField || ''
  })
  goodsSearch.value = ''
  stockContent.value = ''
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

function onAccountChange(v: string | null) {
  formData.accountId = v
  formData.itemId = null
  goodsSearch.value = ''
}
function selectGoods(g: GoodsItem) {
  formData.itemId = g.id
  formData.accountId = g.accountId || null
  goodsSearch.value = ''
  showGoodsDropdown.value = false
}
function clearGoods() {
  formData.itemId = null
  goodsSearch.value = ''
}
function onGoodsSearchFocus() {
  showGoodsDropdown.value = true
}
function onGoodsSearchBlur() {
  setTimeout(() => (showGoodsDropdown.value = false), 200)
}

function onStockFileSelect(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    const text = reader.result as string
    stockContent.value = stockContent.value.trim() ? stockContent.value + '\n' + text : text
  }
  reader.readAsText(file, 'utf-8')
  return false
}

function getGoodsTitle(id: string) {
  return allGoods.value.find((g) => g.id === id)?.title || id
}
function deliveryTypeLabel(t: DeliveryType) {
  return deliveryTypes.find((x) => x.value === t)?.label || t
}
function triggerLabel(t: TriggerOn) {
  return triggerOptions.find((x) => x.value === t)?.label || t
}
function workflowName(id: number | null) {
  if (!id) return '默认流程'
  return workflows.value.find((w) => w.id === id)?.name || '默认流程'
}

async function saveRule() {
  if (!formData.name) {
    message.warning('请输入规则名称')
    return
  }
  if (!formData.itemId) {
    message.warning('请选择商品')
    return
  }
  let apiConfig: ApiConfig | null = null
  if (formData.deliveryType === 'api') {
    if (!formData.apiUrl) {
      message.warning('请输入 API 地址')
      return
    }
    let headers: Record<string, string> | undefined
    if (formData.apiHeaders) {
      try {
        headers = JSON.parse(formData.apiHeaders)
      } catch {
        message.error('Headers 格式不正确，请使用 JSON 格式')
        return
      }
    }
    apiConfig = {
      url: formData.apiUrl,
      method: formData.apiMethod,
      headers,
      body: formData.apiBody || undefined,
      responseField: formData.apiResponseField || undefined
    }
  }
  if (formData.deliveryType === 'fixed' && !formData.deliveryContent) {
    message.warning('请输入发货内容')
    return
  }

  const payload: Partial<AutoSellRule> = {
    name: formData.name,
    enabled: formData.enabled,
    itemId: formData.itemId,
    accountId: formData.accountId,
    deliveryType: formData.deliveryType,
    deliveryContent: formData.deliveryType === 'fixed' ? formData.deliveryContent : null,
    apiConfig,
    triggerOn: formData.triggerOn,
    workflowId: formData.workflowId
  }

  saving.value = true
  try {
    const editing = editingRule.value
    let ruleId: number
    if (editing) {
      await service.updateRule(editing.id, payload)
      ruleId = editing.id
    } else {
      const res = await service.createRule(payload)
      ruleId = res.id!
    }
    if (formData.deliveryType === 'stock' && stockContent.value.trim()) {
      const contents = stockContent.value.split('\n').map((s) => s.trim()).filter(Boolean)
      if (contents.length > 0) await service.addStock(ruleId, contents)
    }
    await loadRules()
    cancelEdit()
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleRule(rule: AutoSellRule) {
  await service.toggleRule(rule.id)
  await loadRules()
}
function deleteRule(rule: AutoSellRule) {
  modal.confirm({
    title: '确认删除',
    content: `确定要删除规则 "${rule.name}" 吗？`,
    okType: 'danger',
    onOk: async () => {
      await service.deleteRule(rule.id)
      if (editingRule.value?.id === rule.id) cancelEdit()
      await loadRules()
    }
  })
}

// 库存
async function openStockModal(ruleId: number) {
  stockRuleId.value = ruleId
  showUsedStock.value = false
  showStockModal.value = true
  await loadStockItems()
}
function closeStockModal() {
  showStockModal.value = false
  stockRuleId.value = null
  stockItems.value = []
  stockStats.value = null
}
async function loadStockItems() {
  if (!stockRuleId.value) return
  loadingStock.value = true
  try {
    const res = await service.getStock(stockRuleId.value, showUsedStock.value)
    stockItems.value = res.items
    stockStats.value = res.stats
  } finally {
    loadingStock.value = false
  }
}
async function toggleShowUsed() {
  showUsedStock.value = !showUsedStock.value
  await loadStockItems()
}
function clearStock(ruleId: number, onlyUsed: boolean) {
  modal.confirm({
    title: '确认清空',
    content: onlyUsed ? '确定要清空已使用的库存吗？' : '确定要清空所有库存吗？',
    okType: 'danger',
    onOk: async () => {
      const res = await service.clearStock(ruleId, onlyUsed)
      await loadRules()
      if (showStockModal.value) await loadStockItems()
      message.success(`已清空 ${res.count} 条库存`)
    }
  })
}

onMounted(() => {
  loadRules()
  loadAccounts()
  loadAllGoods()
  loadWorkflows()
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
                  <a-tag class="sub-tag">{{ deliveryTypeLabel(rule.deliveryType) }}</a-tag>
                  <span class="muted">{{ getGoodsTitle(rule.itemId) }}</span>
                </div>
                <div v-if="rule.deliveryType === 'stock'" class="rule-stock">
                  库存：{{ (rule.stockCount || 0) - (rule.usedCount || 0) }}/{{ rule.stockCount || 0 }}
                </div>
              </div>
              <div class="rule-actions" @click.stop>
                <a-switch :checked="rule.enabled" size="small" @change="toggleRule(rule)" />
                <a-button v-if="rule.deliveryType === 'stock'" size="small" @click="openStockModal(rule.id)">
                  <template #icon><InboxOutlined /></template>
                </a-button>
                <a-button size="small" danger @click="deleteRule(rule)">
                  <template #icon><DeleteOutlined /></template>
                </a-button>
              </div>
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
              <a-input v-model:value="formData.name" placeholder="例如：王者荣耀自动发货" />
            </a-form-item>

            <a-form-item label="账号">
              <a-select
                v-model:value="formData.accountId"
                placeholder="选择账号（可留空，按商品自动）"
                allow-clear
                @change="onAccountChange"
              >
                <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
                  {{ a.nickname || a.id }}
                </a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="商品" required>
              <div v-if="selectedGoods" class="goods-selected">
                <img v-if="selectedGoods.picUrl" :src="selectedGoods.picUrl" class="thumb" />
                <span class="goods-title">{{ selectedGoods.title }}</span>
                <a-button size="small" type="link" danger @click="clearGoods">清除</a-button>
              </div>
              <div v-else class="goods-search-wrap">
                <a-input
                  v-model:value="goodsSearch"
                  placeholder="搜索商品名称或ID"
                  @focus="onGoodsSearchFocus"
                  @blur="onGoodsSearchBlur"
                />
                <div v-if="showGoodsDropdown && filteredGoods.length" class="goods-dropdown">
                  <div v-for="g in filteredGoods" :key="g.id" class="goods-option" @mousedown.prevent="selectGoods(g)">
                    <img v-if="g.picUrl" :src="g.picUrl" class="thumb" />
                    <span class="goods-title">{{ g.title }}</span>
                    <span class="goods-id">¥{{ g.price }}</span>
                  </div>
                </div>
                <a-empty v-else-if="showGoodsDropdown && !loadingGoods" description="无匹配商品" :image="false" />
              </div>
            </a-form-item>

            <a-form-item label="发货方式">
              <a-radio-group v-model:value="formData.deliveryType">
                <a-radio v-for="t in deliveryTypes" :key="t.value" :value="t.value">{{ t.label }}</a-radio>
              </a-radio-group>
            </a-form-item>

            <a-form-item v-if="formData.deliveryType === 'fixed'" label="发货内容" required>
              <a-textarea v-model:value="formData.deliveryContent" :rows="4" placeholder="买家付款后自动发送的内容" />
            </a-form-item>

            <template v-else-if="formData.deliveryType === 'stock'">
              <a-form-item label="库存内容（每行一条）">
                <a-textarea v-model:value="stockContent" :rows="6" placeholder="每行一条发货内容" />
                <div class="hint">{{ stockContentCount }} 条</div>
                <a-upload :show-upload-list="false" :before-upload="onStockFileSelect" accept=".txt">
                  <a-button size="small" type="link"><template #icon><UploadOutlined /></template>从文件导入</a-button>
                </a-upload>
              </a-form-item>
              <div v-if="editingRule" class="stock-summary">
                当前库存：{{ editingRuleStock.total }} 条，可用 {{ editingRuleStock.available }} 条
              </div>
            </template>

            <template v-else-if="formData.deliveryType === 'api'">
              <a-form-item label="API 地址" required>
                <a-input v-model:value="formData.apiUrl" placeholder="https://api.example.com/fetch" />
              </a-form-item>
              <a-form-item label="请求方法">
                <a-radio-group v-model:value="formData.apiMethod">
                  <a-radio value="GET">GET</a-radio>
                  <a-radio value="POST">POST</a-radio>
                </a-radio-group>
              </a-form-item>
              <a-form-item label="Headers（JSON）">
                <a-textarea v-model:value="formData.apiHeaders" :rows="4" class="mono" placeholder='{ "Authorization": "Bearer xxx" }' />
              </a-form-item>
              <a-form-item label="请求 Body">
                <a-textarea v-model:value="formData.apiBody" :rows="4" class="mono" placeholder="POST 请求体" />
              </a-form-item>
              <a-form-item label="响应字段">
                <a-input v-model:value="formData.apiResponseField" placeholder="如：data.code，留空返回完整响应" />
              </a-form-item>
            </template>

            <a-form-item label="触发时机">
              <a-radio-group v-model:value="formData.triggerOn">
                <a-radio v-for="t in triggerOptions" :key="t.value" :value="t.value">{{ t.label }}</a-radio>
              </a-radio-group>
            </a-form-item>

            <a-form-item label="发货流程">
              <a-select v-model:value="formData.workflowId" allow-clear placeholder="默认流程">
                <a-select-option v-for="w in workflows" :key="w.id" :value="w.id">{{ w.name }}</a-select-option>
              </a-select>
              <a-button size="small" type="link" @click="router.push('/workflow')">管理流程</a-button>
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
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一条规则编辑，或点击新建" />
      </div>
    </template>
  </TwoPaneLayout>

  <a-modal v-model:open="showStockModal" title="库存管理" :footer="null" width="640px" @cancel="closeStockModal">
    <a-spin :spinning="loadingStock">
      <div class="stock-stats" v-if="stockStats">
        <a-statistic title="总数" :value="stockStats.total" />
        <a-statistic title="可用" :value="stockStats.available" :value-style="{ color: '#52c41a' }" />
        <a-statistic title="已用" :value="stockStats.used" />
      </div>
      <a-space class="stock-actions">
        <a-button size="small" @click="toggleShowUsed">
          {{ showUsedStock ? '显示可用' : '显示已用' }}
        </a-button>
        <a-button v-if="stockRuleId" size="small" danger @click="clearStock(stockRuleId!, true)">清空已用</a-button>
        <a-button v-if="stockRuleId" size="small" danger @click="clearStock(stockRuleId!, false)">清空全部</a-button>
      </a-space>
      <a-list :data-source="stockItems" size="small" :bordered="false">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta :description="item.content">
              <template #title>
                <a-tag v-if="item.used" color="default">已用</a-tag>
                <a-tag v-else color="green">可用</a-tag>
              </template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </a-spin>
  </a-modal>
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
.sub-tag {
  margin: 0;
}
.muted {
  color: var(--wm-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rule-stock {
  font-size: 11px;
  color: var(--wm-text-tertiary);
  margin-top: 2px;
}
.rule-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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
.mono {
  font-family: monospace;
}
.goods-selected {
  display: flex;
  align-items: center;
  gap: 8px;
}
.goods-search-wrap {
  position: relative;
}
.goods-dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: var(--wm-card-bg);
  border: 1px solid var(--wm-border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.goods-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
.goods-option:hover {
  background: var(--wm-list-hover);
}
.thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.goods-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--wm-text);
}
.goods-id {
  font-size: 12px;
  color: #f5222d;
  flex-shrink: 0;
}
.stock-summary {
  font-size: 12px;
  color: var(--wm-text-secondary);
  margin-bottom: 12px;
}
.stock-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
}
.stock-actions {
  margin-bottom: 12px;
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
