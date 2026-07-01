<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons-vue'
import { conversationService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import type { Conversation } from '@/core/types'

const pushStore = usePushStore()

const conversations = ref<Conversation[]>([])
const selected = ref<Conversation | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const total = ref(0)
const offset = ref(0)
const hasMore = ref(true)

const loadingMoreMessages = ref(false)
const hasMoreMessages = ref(true)

const messagesContainer = ref<HTMLDivElement | null>(null)
let wsSubscribed = false

function scrollToBottom() {
  const el = messagesContainer.value
  if (el) el.scrollTop = el.scrollHeight
}

function subscribeWS() {
  if (wsSubscribed) return
  wsSubscribed = true
  pushStore.subscribeConversations(20)
}

// WS 推送到达后更新对话列表与当前会话消息
watch(
  () => pushStore.conversations,
  async (data) => {
    if (data.length === 0) return
    if (conversations.value.length <= 20) {
      conversations.value = data
    } else {
      conversations.value = [...data, ...conversations.value.slice(20)]
    }
    total.value = pushStore.conversationsTotal
    hasMore.value = data.length < pushStore.conversationsTotal

    if (selected.value) {
      try {
        const detail = await conversationService.getConversation(selected.value.accountId, selected.value.chatId, 50)
        selected.value = detail
        await nextTick()
        scrollToBottom()
      } catch {
        /* ignore */
      }
    }
  }
)

async function loadConversations() {
  loading.value = true
  offset.value = 0
  try {
    const res = await conversationService.getConversations(20, 0)
    conversations.value = res.conversations
    total.value = res.total
    hasMore.value = res.conversations.length < res.total
    subscribeWS()
  } catch (e) {
    console.error('加载对话列表失败', e)
  } finally {
    loading.value = false
  }
}

async function loadMoreConversations() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const newOffset = offset.value + 20
    const res = await conversationService.getConversations(20, newOffset)
    conversations.value = [...conversations.value, ...res.conversations]
    offset.value = newOffset
    hasMore.value = conversations.value.length < res.total
  } finally {
    loadingMore.value = false
  }
}

async function openConversation(conv: Conversation) {
  try {
    const detail = await conversationService.getConversation(conv.accountId, conv.chatId, 50)
    selected.value = detail
    hasMoreMessages.value = (detail.messageCount || 0) > (detail.messages?.length || 0)
    await nextTick()
    scrollToBottom()
    await conversationService.markAsRead(conv.accountId, conv.chatId)
    conv.unread = 0
  } catch (e) {
    console.error('加载对话详情失败', e)
  }
}

async function loadMoreMessages() {
  const conv = selected.value
  if (!conv || loadingMoreMessages.value || !hasMoreMessages.value) return
  const messages = conv.messages || []
  if (messages.length === 0) return
  loadingMoreMessages.value = true
  try {
    const firstId = messages[0].id
    const detail = await conversationService.getConversation(conv.accountId, conv.chatId, 50, firstId)
    if (detail.messages && detail.messages.length > 0) {
      conv.messages = [...detail.messages, ...(conv.messages || [])]
      hasMoreMessages.value = detail.messages.length === 50
    } else {
      hasMoreMessages.value = false
    }
  } finally {
    loadingMoreMessages.value = false
  }
}

function closeConversation() {
  selected.value = null
  hasMoreMessages.value = true
}

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

onMounted(loadConversations)
onUnmounted(() => {
  pushStore.unsubscribeConversations()
  wsSubscribed = false
})
</script>

<template>
  <!-- 对话列表 -->
  <a-card v-if="!selected">
    <template #title>
      对话消息 <span class="count">({{ total }})</span>
    </template>
    <template #extra>
      <a-button :loading="loading" @click="loadConversations">
        <template #icon><ReloadOutlined /></template>
      </a-button>
    </template>

    <a-spin :spinning="loading">
      <a-empty v-if="conversations.length === 0" description="暂无对话消息" />
      <div v-else class="conv-list">
        <div
          v-for="conv in conversations"
          :key="conv.accountId + conv.chatId"
          class="conv-item"
          @click="openConversation(conv)"
        >
          <a-avatar v-if="conv.userAvatar" :src="conv.userAvatar" />
          <a-avatar v-else>{{ conv.userName.charAt(0) }}</a-avatar>
          <div class="conv-meta">
            <div class="conv-top">
              <span class="conv-name">{{ conv.userName }}</span>
              <a-tag color="default">{{ conv.accountNickname }}</a-tag>
              <span class="conv-time">{{ formatTime(conv.lastTime) }}</span>
            </div>
            <p class="conv-last">{{ conv.lastMessage }}</p>
          </div>
          <a-badge v-if="conv.unread > 0" :count="conv.unread" />
        </div>
      </div>

      <div v-if="hasMore" class="load-more">
        <a-button :loading="loadingMore" @click="loadMoreConversations">加载更多</a-button>
      </div>
    </a-spin>
  </a-card>

  <!-- 对话详情 -->
  <a-card v-else>
    <template #title>
      <a-space>
        <a-button shape="circle" size="small" @click="closeConversation">
          <template #icon><ArrowLeftOutlined /></template>
        </a-button>
        <a-avatar v-if="selected.userAvatar" :src="selected.userAvatar" />
        <a-avatar v-else>{{ selected.userName.charAt(0) }}</a-avatar>
        <div>
          <a-space align="center">
            <span class="conv-name">{{ selected.userName }}</span>
            <a-tag color="default">{{ selected.accountNickname }}</a-tag>
            <span class="msg-count">({{ selected.messageCount }} 条消息)</span>
          </a-space>
          <div class="chat-id">chatId: {{ selected.chatId }}</div>
        </div>
      </a-space>
    </template>

    <div v-if="hasMoreMessages" class="load-more">
      <a-button size="small" :loading="loadingMoreMessages" @click="loadMoreMessages">加载更早消息</a-button>
    </div>

    <div ref="messagesContainer" class="msg-list">
      <div
        v-for="msg in selected.messages"
        :key="msg.id"
        class="msg-row"
        :class="msg.direction === 'in' ? 'msg-in' : 'msg-out'"
      >
        <div class="msg-header">
          <span class="msg-sender">{{ msg.senderName }}</span>
          <time class="msg-time">{{ msg.msgTime }}</time>
          <span v-if="msg.msgId" class="msg-id">{{ msg.msgId.substring(0, 8) }}</span>
        </div>
        <div class="msg-bubble" :class="msg.direction === 'out' ? 'bubble-out' : ''">{{ msg.content }}</div>
      </div>
    </div>
  </a-card>
</template>

<style scoped>
.count { font-size: 13px; color: rgba(0,0,0,0.45); font-weight: normal; }
.conv-list { display: flex; flex-direction: column; gap: 4px; }
.conv-item { display: flex; align-items: center; gap: 12px; padding: 12px 8px; cursor: pointer; border-radius: 6px; }
.conv-item:hover { background: rgba(0,0,0,0.03); }
.conv-meta { flex: 1; min-width: 0; }
.conv-top { display: flex; align-items: center; gap: 8px; }
.conv-name { font-weight: 600; }
.conv-time { margin-left: auto; font-size: 12px; color: rgba(0,0,0,0.45); }
.conv-last { margin: 2px 0 0; font-size: 13px; color: rgba(0,0,0,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.load-more { text-align: center; margin: 12px 0; }
.msg-count { font-size: 12px; color: rgba(0,0,0,0.45); }
.chat-id { font-family: monospace; font-size: 11px; color: rgba(0,0,0,0.35); }
.msg-list { display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow-y: auto; padding: 8px; }
.msg-row { display: flex; flex-direction: column; }
.msg-in { align-items: flex-start; }
.msg-out { align-items: flex-end; }
.msg-header { font-size: 11px; color: rgba(0,0,0,0.45); display: flex; gap: 6px; margin-bottom: 2px; }
.msg-sender { font-weight: 500; }
.msg-id { font-family: monospace; opacity: 0.5; font-size: 10px; }
.msg-bubble { padding: 8px 12px; border-radius: 8px; background: #f5f5f5; max-width: 70%; word-break: break-all; }
.bubble-out { background: #1677ff; color: #fff; }
</style>
