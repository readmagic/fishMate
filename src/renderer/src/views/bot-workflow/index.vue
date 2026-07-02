<script setup lang="ts">
import { ref, reactive, onBeforeUnmount, nextTick } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  PlusOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined
} from '@ant-design/icons-vue'
import { workflowService } from '@/core/services'
import type { Workflow } from '@/core/types'
import WorkflowList from './components/WorkflowList.vue'
import NodeConfigPanel from './components/NodeConfigPanel.vue'
import {
  NODE_TYPES,
  type NodeConfigData,
  type MindMapNode
} from './node-config.types'
import {
  definitionToMindMap,
  mindMapToDefinition,
  getDefaultWorkflowTemplate
} from './workflow-converter'

const workflows = ref<Workflow[]>([])
const { modal } = App.useApp()
const loading = ref(false)
const saving = ref(false)
const editingWorkflow = ref<Workflow | null>(null)
const selectedNode = ref<any>(null)

const workflowForm = reactive<{ name: string; description: string; isDefault: boolean; mindMapData: MindMapNode | null }>({
  name: '',
  description: '',
  isDefault: false,
  mindMapData: null
})

const nodeConfig = reactive<NodeConfigData>({
  text: '',
  nodeType: 'delivery',
  deliveryMode: 'virtual',
  deliveryContent: '',
  delayMs: 0,
  delayMode: 'fixed',
  delayMinMs: 0,
  delayMaxMs: 10000,
  delayUnit: 's',
  expression: '',
  keywords: '',
  matchMode: 'contains',
  promptMessage: '',
  message: ''
})

const mindMapContainer = ref<HTMLDivElement | null>(null)
let mindMap: any = null

const nodeMenuItems = [
  { type: 'delivery', color: '#f59e0b', label: '发货' },
  { type: 'ship', color: '#8b5cf6', label: '标记发货' },
  { type: 'delay', color: '#6b7280', label: '延迟' },
  { type: 'autoreply', color: '#3b82f6', label: '等待回复' },
  { type: 'notify', color: '#06b6d4', label: '通知' },
  { type: 'condition', color: '#ec4899', label: '条件判断' }
]

async function loadWorkflows() {
  loading.value = true
  try {
    const res = await workflowService.getWorkflows()
    workflows.value = res.workflows
  } catch (e) {
    console.error('加载流程失败', e)
  } finally {
    loading.value = false
  }
}

function createWorkflow() {
  editingWorkflow.value = { id: 0 } as Workflow
  Object.assign(workflowForm, {
    name: '',
    description: '',
    isDefault: false,
    mindMapData: getDefaultWorkflowTemplate()
  })
  selectedNode.value = null
  nextTick(() => setTimeout(() => initMindMap(), 100))
}

function editWorkflow(w: Workflow) {
  editingWorkflow.value = w
  Object.assign(workflowForm, {
    name: w.name,
    description: w.description || '',
    isDefault: w.isDefault,
    mindMapData: definitionToMindMap(w.definition)
  })
  selectedNode.value = null
  nextTick(() => setTimeout(() => initMindMap(), 100))
}

function cancelEdit() {
  destroyMindMap()
  editingWorkflow.value = null
  selectedNode.value = null
}

function updateFormField(field: keyof typeof workflowForm, value: any) {
  ;(workflowForm as any)[field] = value
}

// 节点配置更新
function updateConfigField(field: keyof NodeConfigData, value: any) {
  ;(nodeConfig as any)[field] = value
}
function onNodeTypeChange(value: string) {
  nodeConfig.nodeType = value
  updateNodeConfig()
}
function updateNodeConfig() {
  const node = selectedNode.value
  if (!node || !mindMap) return
  const typeConfig = (NODE_TYPES as any)[nodeConfig.nodeType]
  node.setData({
    text: nodeConfig.text,
    nodeType: nodeConfig.nodeType,
    fillColor: typeConfig?.color,
    borderColor: typeConfig?.color,
    fontColor: '#ffffff',
    config: {
      deliveryMode: nodeConfig.deliveryMode,
      deliveryContent: nodeConfig.deliveryContent,
      delayMs: nodeConfig.delayMs,
      delayMode: nodeConfig.delayMode,
      delayMinMs: nodeConfig.delayMinMs,
      delayMaxMs: nodeConfig.delayMaxMs,
      delayUnit: nodeConfig.delayUnit,
      expression: nodeConfig.expression,
      keywords: nodeConfig.keywords.split(',').filter(Boolean),
      matchMode: nodeConfig.matchMode,
      promptMessage: nodeConfig.promptMessage,
      message: nodeConfig.message
    }
  })
  mindMap.render()
}

// 思维导图
async function initMindMap() {
  if (!mindMapContainer.value) return
  destroyMindMap()

  const MindMap = (await import('simple-mind-map')).default
  const Drag = (await import('simple-mind-map/src/plugins/Drag.js')).default
  const TouchEvent = (await import('simple-mind-map/src/plugins/TouchEvent.js')).default
  const Export = (await import('simple-mind-map/src/plugins/Export.js')).default
  MindMap.usePlugin(Drag)
  MindMap.usePlugin(TouchEvent)
  MindMap.usePlugin(Export)

  mindMap = new MindMap({
    el: mindMapContainer.value,
    data: workflowForm.mindMapData || { data: { text: '根节点' }, children: [] },
    layout: 'logicalStructure',
    theme: 'default',
    themeConfig: { backgroundColor: 'transparent', lineColor: '#6366f1', lineWidth: 2 },
    scaleRatio: 0.1,
    maxZoomRatio: 300,
    minZoomRatio: 30,
    mousewheelAction: 'zoom',
    defaultInsertSecondLevelNodeText: '新节点',
    defaultInsertBelowSecondLevelNodeText: '新节点',
    autoMoveWhenMouseInEdgeOnDrag: true,
    dragPlaceholderRectFill: 'rgba(99, 102, 241, 0.3)',
    dragPlaceholderLineConfig: { color: '#6366f1', width: 2 },
    dragOpacityConfig: { cloneNodeOpacity: 0.5, beingDragNodeOpacity: 0.3 },
    enableTouchEvent: true,
    disableMouseWheelZoom: false
  } as any)

  mindMap.on('node_active', (_: any, activeNodeList: any[]) => {
    if (activeNodeList.length > 0) {
      selectedNode.value = activeNodeList[0]
      loadNodeConfig(activeNodeList[0])
    } else {
      selectedNode.value = null
    }
  })
  mindMap.on('data_change', (data: MindMapNode) => {
    workflowForm.mindMapData = data
  })
}

function destroyMindMap() {
  if (mindMap) {
    mindMap.destroy()
    mindMap = null
  }
}

function loadNodeConfig(node: any) {
  const data = node.getData()
  const delayMs = data.config?.delayMs ?? (data.config?.delaySeconds ?? 0) * 1000
  const delayMinMs = data.config?.delayMinMs ?? (data.config?.delayMin ?? 0) * 1000
  const delayMaxMs = data.config?.delayMaxMs ?? (data.config?.delayMax ?? 10) * 1000
  Object.assign(nodeConfig, {
    text: data.text || '',
    nodeType: data.nodeType || 'delivery',
    deliveryMode: data.config?.deliveryMode || 'virtual',
    deliveryContent: data.config?.deliveryContent || '',
    delayMs,
    delayMode: data.config?.delayMode || 'fixed',
    delayMinMs,
    delayMaxMs,
    delayUnit: data.config?.delayUnit || 's',
    expression: data.config?.expression || '',
    keywords: (data.config?.keywords || []).join(','),
    matchMode: data.config?.matchMode || 'contains',
    promptMessage: data.config?.promptMessage || '',
    message: data.config?.message || ''
  })
}

function requireSelection(): boolean {
  if (!mindMap || !selectedNode.value) {
    message.warning('请先选择一个节点')
    return false
  }
  return true
}

function addNode(type: string) {
  if (!requireSelection()) return
  const cfg = (NODE_TYPES as any)[type]
  if (!cfg) return
  mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
    text: cfg.label,
    uid: `${type}_${Date.now()}`,
    nodeType: type,
    fillColor: cfg.color,
    borderColor: cfg.color,
    fontColor: '#ffffff',
    config: {}
  })
}
function addSiblingNode(type: string) {
  const node = selectedNode.value
  if (!mindMap || !node) {
    message.warning('请先选择一个节点')
    return
  }
  if (node.isRoot) {
    message.warning('根节点不能添加兄弟节点')
    return
  }
  const cfg = (NODE_TYPES as any)[type]
  if (!cfg) return
  mindMap.execCommand('INSERT_NODE', false, [], {
    text: cfg.label,
    uid: `${type}_${Date.now()}`,
    nodeType: type,
    fillColor: cfg.color,
    borderColor: cfg.color,
    fontColor: '#ffffff',
    config: {}
  })
}
function addConditionBranch() {
  if (!requireSelection()) return
  const ts = Date.now()
  mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
    text: '条件判断',
    uid: `condition_${ts}`,
    nodeType: 'condition',
    fillColor: NODE_TYPES.condition.color,
    borderColor: NODE_TYPES.condition.color,
    fontColor: '#ffffff',
    config: { expression: '' }
  })
  setTimeout(() => {
    const condNode = mindMap.renderer.findNodeByUid(`condition_${ts}`)
    if (!condNode) return
    mindMap.execCommand('CLEAR_ACTIVE_NODE')
    condNode.active()
    setTimeout(() => {
      mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
        text: 'IF: 条件成立', uid: `if_${ts}`, nodeType: 'condition',
        fillColor: '#22c55e', borderColor: '#22c55e', fontColor: '#ffffff', config: { branch: 'if' }
      })
      setTimeout(() => {
        const ifNode = mindMap.renderer.findNodeByUid(`if_${ts}`)
        if (!ifNode) return
        mindMap.execCommand('CLEAR_ACTIVE_NODE')
        ifNode.active()
        setTimeout(() => {
          mindMap.execCommand('INSERT_NODE', false, [], {
            text: 'ELSE: 条件不成立', uid: `else_${ts}`, nodeType: 'condition',
            fillColor: '#ef4444', borderColor: '#ef4444', fontColor: '#ffffff', config: { branch: 'else' }
          })
        }, 50)
      }, 100)
    }, 100)
  }, 100)
}
function deleteSelectedNode() {
  const node = selectedNode.value
  if (!mindMap || !node) return
  if (node.getData().nodeType === 'trigger' && node.isRoot) {
    message.warning('不能删除触发节点')
    return
  }
  mindMap.execCommand('REMOVE_NODE')
  selectedNode.value = null
}
function zoomIn() { mindMap?.execCommand('ZOOM_IN') }
function zoomOut() { mindMap?.execCommand('ZOOM_OUT') }
function resetView() { mindMap?.execCommand('RESET') }

function exportWorkflow() {
  if (!workflowForm.mindMapData) {
    message.warning('没有可导出的数据')
    return
  }
  const exportData = {
    name: workflowForm.name || '未命名流程',
    description: workflowForm.description || '',
    mindMapData: workflowForm.mindMapData,
    exportTime: new Date().toISOString(),
    version: '1.0'
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${workflowForm.name || 'workflow'}_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function importWorkflow(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.mindMapData) {
      message.error('无效的工作流文件')
      return
    }
    Object.assign(workflowForm, {
      name: data.name || '',
      description: data.description || '',
      isDefault: false,
      mindMapData: data.mindMapData
    })
    if (editingWorkflow.value) {
      destroyMindMap()
      setTimeout(() => initMindMap(), 100)
    }
    message.success('工作流导入成功')
  } catch {
    message.error('导入失败，请检查文件格式')
  } finally {
    input.value = ''
  }
}

async function exportAsPng() {
  if (!mindMap) return
  try {
    const dataUrl = await mindMap.export('png', false, workflowForm.name || 'workflow')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${workflowForm.name || 'workflow'}_${Date.now()}.png`
    a.click()
  } catch {
    message.error('导出图片失败')
  }
}

async function saveWorkflow() {
  if (!workflowForm.name.trim()) {
    message.warning('请输入流程名称')
    return
  }
  saving.value = true
  try {
    const definition = mindMapToDefinition(workflowForm.mindMapData)
    const editing = editingWorkflow.value
    if (editing && editing.id > 0) {
      await workflowService.updateWorkflow(editing.id, {
        name: workflowForm.name,
        description: workflowForm.description || undefined,
        definition,
        isDefault: workflowForm.isDefault
      })
    } else {
      await workflowService.createWorkflow({
        name: workflowForm.name,
        description: workflowForm.description || undefined,
        definition,
        isDefault: workflowForm.isDefault
      })
    }
    await loadWorkflows()
    cancelEdit()
    message.success('保存成功')
  } catch {
    message.error('保存流程失败')
  } finally {
    saving.value = false
  }
}

function deleteWorkflow(w: Workflow) {
  if (w.isDefault) {
    message.warning('默认流程不能删除')
    return
  }
  modal.confirm({
    title: '确认删除',
    content: `确定要删除流程 "${w.name}" 吗？`,
    okType: 'danger',
    onOk: async () => {
      await workflowService.deleteWorkflow(w.id)
      await loadWorkflows()
    }
  })
}

function nodeTypeColor(type: string) {
  return (NODE_TYPES as any)[type]?.color || '#6b7280'
}

onBeforeUnmount(destroyMindMap)

loadWorkflows()
</script>

<template>
  <div class="workflow-page">
    <div class="page-header">
      <a-button v-if="!editingWorkflow" type="primary" @click="createWorkflow">
        <template #icon><PlusOutlined /></template>
        新建流程
      </a-button>
    </div>

    <!-- 编辑模式 -->
    <div v-if="editingWorkflow" class="editor">
      <div class="editor-header">
        <a-space>
          <a-button @click="cancelEdit">
            <template #icon><ArrowLeftOutlined /></template>
            返回
          </a-button>
        </a-space>
        <a-space class="form-row">
          <a-input v-model:value="workflowForm.name" placeholder="流程名称" style="width: 180px" />
          <a-input v-model:value="workflowForm.description" placeholder="描述（可选）" style="width: 280px" />
          <a-checkbox v-model:checked="workflowForm.isDefault">默认</a-checkbox>
          <a-button type="primary" :loading="saving" @click="saveWorkflow">
            <template #icon><SaveOutlined /></template>
            保存
          </a-button>
        </a-space>
      </div>

      <div class="canvas-wrap">
        <div ref="mindMapContainer" class="mindmap-container"></div>

        <!-- 添加节点工具栏 -->
        <div class="toolbar toolbar-left">
          <a-dropdown>
            <a-button size="small"><template #icon><PlusOutlined /></template>子节点</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item v-for="item in nodeMenuItems" :key="item.type" @click="addNode(item.type)">
                  <span class="dot" :style="{ background: item.color }"></span>{{ item.label }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-dropdown>
            <a-button size="small"><template #icon><ApartmentOutlined /></template>分支</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item v-for="item in nodeMenuItems" :key="item.type" @click="addSiblingNode(item.type)">
                  <span class="dot" :style="{ background: item.color }"></span>{{ item.label }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button size="small" @click="addConditionBranch">IF/ELSE</a-button>
          <a-button v-if="selectedNode" size="small" danger @click="deleteSelectedNode">
            <template #icon><DeleteOutlined /></template>
          </a-button>
        </div>

        <!-- 导入导出 -->
        <div class="toolbar toolbar-right-top">
          <a-dropdown>
            <a-button size="small"><template #icon><DownloadOutlined /></template>导出</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="exportWorkflow">导出 JSON</a-menu-item>
                <a-menu-item @click="exportAsPng">导出 PNG</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-upload :show-upload-list="false" accept=".json" :before-upload="(f: File) => { importWorkflow({ target: { files: [f] } } as any); return false }">
            <a-button size="small"><template #icon><UploadOutlined /></template>导入</a-button>
          </a-upload>
        </div>

        <!-- 缩放 -->
        <div class="toolbar toolbar-right-bottom">
          <a-button size="small" @click="zoomOut" title="缩小"><template #icon><ZoomOutOutlined /></template></a-button>
          <a-button size="small" @click="zoomIn" title="放大"><template #icon><ZoomInOutlined /></template></a-button>
          <a-button size="small" @click="resetView" title="重置"><template #icon><ReloadOutlined /></template></a-button>
        </div>

        <!-- 节点配置面板 -->
        <div v-if="selectedNode" class="config-panel-wrap">
          <NodeConfigPanel
            :config="nodeConfig"
            @field-change="(p: any) => updateConfigField(p.field, p.value)"
            @node-type-change="onNodeTypeChange"
            @config-change="updateNodeConfig"
          />
        </div>
      </div>
    </div>

    <!-- 列表模式 -->
    <div v-else>
      <WorkflowList :workflows="workflows" :loading="loading" @edit="editWorkflow" @delete="deleteWorkflow" />
    </div>
  </div>
</template>

<style scoped>
.workflow-page { display: flex; flex-direction: column; height: 100%; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.editor-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.form-row { flex-wrap: wrap; }
.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 480px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
}
.mindmap-container { position: absolute; inset: 0; }
.toolbar { position: absolute; z-index: 10; display: flex; gap: 6px; }
.toolbar-left { top: 12px; left: 12px; }
.toolbar-right-top { top: 12px; right: 12px; }
.toolbar-right-bottom { bottom: 12px; right: 12px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.config-panel-wrap {
  position: absolute;
  top: 48px;
  right: 12px;
  width: 260px;
  max-height: calc(100% - 100px);
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  z-index: 11;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
