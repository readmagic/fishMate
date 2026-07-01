<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { logService } from '@/core/services'
import type { LogFile, LogLevel, ParsedLog } from '@/core/types'

const mode = ref<'current' | 'history'>('current')
const levelFilter = ref<LogLevel>('ALL')
const levels: LogLevel[] = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR']

const currentLogs = ref<ParsedLog[]>([])
const currentFile = ref<string | null>(null)
const currentDate = ref<string | null>(null)

const dates = ref<string[]>([])
const selectedDate = ref<string | null>(null)
const files = ref<LogFile[]>([])
const selectedFile = ref<string | null>(null)
const historyLogs = ref<ParsedLog[]>([])

const loading = ref(false)
const autoRefresh = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const displayLogs = computed(() => (mode.value === 'current' ? currentLogs.value : historyLogs.value))

function parseLine(line: string): ParsedLog {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| (\w+)\s*\| (\S+)\s*\| (.*)$/)
  if (match) {
    return { time: match[1], level: match[2].trim() as LogLevel, module: match[3].trim(), message: match[4], raw: line }
  }
  return { time: '', level: 'INFO', module: '', message: line, raw: line }
}

async function loadCurrentLog(silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await logService.getCurrentLog(levelFilter.value === 'ALL' ? undefined : levelFilter.value, 200)
    currentLogs.value = res.lines.map(parseLine).reverse()
    currentFile.value = res.file || null
    currentDate.value = res.date || null
  } catch (e) {
    console.error('加载当前日志失败', e)
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadDates() {
  try {
    const res = await logService.getLogDates()
    dates.value = res.dates
  } catch (e) {
    console.error('加载日期列表失败', e)
  }
}

async function selectDate(date: string) {
  selectedDate.value = date
  selectedFile.value = null
  historyLogs.value = []
  loading.value = true
  try {
    const res = await logService.getLogFiles(date)
    files.value = res.files
  } finally {
    loading.value = false
  }
}

async function selectFile(file: string) {
  selectedFile.value = file
  await loadHistoryLog()
}

async function loadHistoryLog() {
  if (!selectedDate.value || !selectedFile.value) return
  loading.value = true
  try {
    const res = await logService.getLogContent(
      selectedDate.value,
      selectedFile.value,
      levelFilter.value === 'ALL' ? undefined : levelFilter.value,
      1000
    )
    historyLogs.value = res.lines.map(parseLine).reverse()
  } finally {
    loading.value = false
  }
}

function setMode(m: 'current' | 'history') {
  mode.value = m
  if (m === 'current') loadCurrentLog()
}

function onLevelChange() {
  if (mode.value === 'current') loadCurrentLog()
  else if (selectedFile.value) loadHistoryLog()
}

function refresh() {
  if (mode.value === 'current') loadCurrentLog()
  else if (selectedFile.value) loadHistoryLog()
}

function formatFileTime(filename: string) {
  const m = filename.match(/_(\d{2})(\d{2})(\d{2})\.log$/)
  return m ? `${m[1]}:${m[2]}:${m[3]}` : filename
}
function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
function levelColor(l: string) {
  switch (l) {
    case 'DEBUG': return 'rgba(0,0,0,0.45)'
    case 'INFO': return '#1677ff'
    case 'WARN': return '#faad14'
    case 'ERROR': return '#f5222d'
    default: return ''
  }
}

onMounted(() => {
  loadCurrentLog()
  loadDates()
  refreshTimer = setInterval(() => {
    if (autoRefresh.value && mode.value === 'current') loadCurrentLog(true)
  }, 3000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

const columns = [
  { title: '时间', dataIndex: 'time', key: 'time', width: 170 },
  { title: '等级', dataIndex: 'level', key: 'level', width: 70 },
  { title: '模块', dataIndex: 'module', key: 'module', width: 120 },
  { title: '消息', dataIndex: 'message', key: 'message' }
]
</script>

<template>
  <a-card class="toolbar">
    <a-space wrap>
      <a-radio-group v-model:value="mode" button-style="solid" @change="(e: any) => setMode(e.target.value)">
        <a-radio-button value="current">实时日志</a-radio-button>
        <a-radio-button value="history">历史日志</a-radio-button>
      </a-radio-group>
      <a-select v-model:value="levelFilter" style="width: 120px" @change="onLevelChange">
        <a-select-option v-for="l in levels" :key="l" :value="l">{{ l === 'ALL' ? '全部等级' : l }}</a-select-option>
      </a-select>

      <template v-if="mode === 'history'">
        <a-select
          v-model:value="selectedDate"
          placeholder="选择日期"
          style="width: 140px"
          @change="selectDate"
        >
          <a-select-option v-for="d in dates" :key="d" :value="d">{{ d }}</a-select-option>
        </a-select>
        <a-select
          v-if="files.length > 0"
          v-model:value="selectedFile"
          placeholder="选择日志文件"
          style="width: 200px"
          @change="selectFile"
        >
          <a-select-option v-for="f in files" :key="f.name" :value="f.name">
            {{ formatFileTime(f.name) }} ({{ formatFileSize(f.size) }})
          </a-select-option>
        </a-select>
      </template>

      <a-checkbox v-if="mode === 'current'" v-model:checked="autoRefresh">自动刷新</a-checkbox>
      <a-button :loading="loading" @click="refresh">
        <template #icon><ReloadOutlined /></template>
      </a-button>
    </a-space>

    <div v-if="mode === 'current' && currentFile" class="current-info">
      当前日志：{{ currentDate }}/{{ currentFile }} · {{ displayLogs.length }} 条记录
    </div>
  </a-card>

  <a-card>
    <a-table
      :columns="columns"
      :data-source="displayLogs"
      :loading="loading"
      row-key="raw"
      size="small"
      :pagination="false"
      :scroll="{ y: 480 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'level'">
          <span :style="{ color: levelColor(record.level), fontWeight: 500 }">{{ record.level }}</span>
        </template>
        <template v-else-if="column.key === 'message'">
          <span class="log-msg">{{ record.message }}</span>
        </template>
      </template>
      <template #emptyText>
        <a-empty :description="mode === 'history' && !selectedFile ? '请选择日期和日志文件' : '暂无日志记录'" />
      </template>
    </a-table>
  </a-card>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.current-info { font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 8px; }
.log-msg { white-space: pre-wrap; word-break: break-all; }
</style>
