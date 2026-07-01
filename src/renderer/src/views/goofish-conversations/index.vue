<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, SendOutlined } from '@ant-design/icons-vue'
import { conversationService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import { useGoodsStore } from '@/core/stores/useGoodsStore'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { Conversation, ConversationMessage, GoodsItem } from '@/core/types'

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
const draft = ref('')
const sending = ref(false)
let wsSubscribed = false

// 会话绑定商品的匹配展示：按 selected.itemId 在本账号商品列表里查标题/主图
const goodsStore = useGoodsStore()
const matchedItem = ref<GoodsItem | null>(null)
const itemLoading = ref(false)

async function loadMatchedItem() {
  const conv = selected.value
  const itemId = conv?.itemId
  if (!conv || !itemId) {
    matchedItem.value = null
    return
  }
  itemLoading.value = true
  try {
    // 复用全局商品缓存（账号上线时已预拉，命中则即时返回）
    const goods = await goodsStore.ensureAccountGoods(conv.accountId)
    matchedItem.value = goods.find((g) => g.id === itemId) || null
  } catch {
    matchedItem.value = null
  } finally {
    itemLoading.value = false
  }
}

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

function isActiveConv(conv: Conversation) {
  return selected.value?.accountId === conv.accountId && selected.value?.chatId === conv.chatId
}

// 选中会话或其 itemId 变化时，匹配对应商品
watch(() => selected.value?.itemId, () => loadMatchedItem())

function onContextMenu(key: string, conv: Conversation) {
  if (key === 'hide') hideConv(conv)
  else if (key === 'delete') confirmDelete(conv)
}

async function hideConv(conv: Conversation) {
  try {
    await conversationService.setHidden(conv.accountId, conv.chatId, true)
    conversations.value = conversations.value.filter(
      (c) => !(c.accountId === conv.accountId && c.chatId === conv.chatId)
    )
    if (selected.value?.accountId === conv.accountId && selected.value?.chatId === conv.chatId) {
      selected.value = null
    }
    total.value = Math.max(0, total.value - 1)
    message.success('已隐藏')
  } catch {
    message.error('操作失败')
  }
}

function confirmDelete(conv: Conversation) {
  Modal.confirm({
    title: '删除对话',
    content: `确定删除与 ${conv.userName} 的对话？所有消息将一并删除，且无法恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await conversationService.deleteConversation(conv.accountId, conv.chatId)
        conversations.value = conversations.value.filter(
          (c) => !(c.accountId === conv.accountId && c.chatId === conv.chatId)
        )
        if (selected.value?.accountId === conv.accountId && selected.value?.chatId === conv.chatId) {
          selected.value = null
        }
        total.value = Math.max(0, total.value - 1)
        message.success('已删除')
      } catch {
        message.error('删除失败')
      }
    }
  })
}

async function send() {
  const text = draft.value.trim()
  const conv = selected.value
  if (!text || !conv) return
  sending.value = true
  try {
    const res = await conversationService.sendMessage(conv.accountId, conv.chatId, conv.userId, text)
    if (res.success) {
      // 乐观追加到本地消息列表
      const now = new Date()
      const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      const outMsg: ConversationMessage = {
        id: Date.now(),
        senderId: 'me',
        senderName: '我',
        content: text,
        msgTime: ts,
        timestamp: Date.now(),
        direction: 'out'
      }
      conv.messages = [...(conv.messages || []), outMsg]
      conv.lastMessage = text
      conv.lastTime = Date.now()
      draft.value = ''
      await nextTick()
      scrollToBottom()
    } else {
      message.error(res.error || '发送失败')
    }
  } catch {
    message.error('发送失败')
  } finally {
    sending.value = false
  }
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

onMounted(() => {
  loadConversations()
  conversationService.setInChat(true)
})
onUnmounted(() => {
  // 不取消订阅：AppSidebar 全局常驻订阅供未读角标，此处仅重置本地 flag
  wsSubscribed = false
  conversationService.setInChat(false)
})
</script>

<template>
  <TwoPaneLayout :list-width="300">
    <template #list>
      <div class="list-header">
        <span class="list-title">对话消息 <span class="count">({{ total }})</span></span>
        <a-button size="small" :loading="loading" @click="loadConversations">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="conversations.length === 0" description="暂无对话消息" />
          <div v-else class="conv-list">
            <a-dropdown
              v-for="conv in conversations"
              :key="conv.accountId + conv.chatId"
              trigger="contextmenu"
            >
              <div
                class="conv-item"
                :class="{ active: isActiveConv(conv) }"
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
              <template #overlay>
                <a-menu @click="({ key }: { key: string }) => onContextMenu(key, conv)">
                  <a-menu-item key="hide">不显示</a-menu-item>
                  <a-menu-item key="delete" danger>删除消息</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>

          <div v-if="hasMore" class="load-more">
            <a-button :loading="loadingMore" @click="loadMoreConversations">加载更多</a-button>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="selected" class="detail-wrap">
        <div class="detail-header">
          <a-avatar v-if="selected.userAvatar" :src="selected.userAvatar" />
          <a-avatar v-else>{{ selected.userName.charAt(0) }}</a-avatar>
          <div class="detail-meta">
            <div class="detail-top">
              <span class="conv-name">{{ selected.userName }}</span>
              <a-tag color="default">{{ selected.accountNickname }}</a-tag>
              <span class="msg-count">({{ selected.messageCount }} 条消息)</span>
            </div>
            <div class="chat-id">chatId: {{ selected.chatId }}</div>
          </div>
          <div v-if="selected.itemId" class="detail-item">
            <template v-if="matchedItem">
              <img v-if="matchedItem.picUrl" :src="matchedItem.picUrl" class="item-pic" />
              <div v-else class="item-pic item-pic-empty" />
              <div class="item-info">
                <div class="item-title">{{ matchedItem.title }}</div>
                <div class="item-price">¥{{ matchedItem.price }}</div>
              </div>
            </template>
            <template v-else-if="!itemLoading">
              <span class="item-id" title="未在在售商品中匹配到，显示商品ID">商品ID：{{ selected.itemId }}</span>
            </template>
            <a-spin v-else size="small" />
          </div>
        </div>

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

        <div class="msg-input-bar">
          <a-input
            v-model:value="draft"
            placeholder="输入消息，回车发送"
            :disabled="sending"
            @press-enter="send"
          />
          <a-button type="primary" :loading="sending" @click="send">
            <template #icon><SendOutlined /></template>
          </a-button>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个对话查看消息" />
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
.count {
  font-size: 13px;
  color: var(--wm-text-secondary);
  font-weight: normal;
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.conv-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.conv-item:hover {
  background: var(--wm-list-hover);
}
.conv-item.active {
  background: var(--wm-list-active);
}
.conv-meta {
  flex: 1;
  min-width: 0;
}
.conv-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.conv-name {
  font-weight: 600;
  color: var(--wm-text);
}
.conv-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--wm-text-secondary);
}
.conv-last {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--wm-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.load-more {
  text-align: center;
  margin: 8px 0;
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
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.detail-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.msg-count {
  font-size: 12px;
  color: var(--wm-text-secondary);
}
.chat-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--wm-text-tertiary);
}
.detail-item {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--wm-content-bg, rgba(0,0,0,0.03));
  max-width: 240px;
}
.item-pic {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.item-pic-empty {
  background: var(--wm-content-bg, #ddd);
}
.item-info {
  min-width: 0;
}
.item-title {
  font-size: 12px;
  color: var(--wm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.item-price {
  font-size: 12px;
  color: #f5222d;
  font-weight: 600;
}
.item-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--wm-text-tertiary);
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}
.msg-row {
  display: flex;
  flex-direction: column;
}
.msg-in {
  align-items: flex-start;
}
.msg-out {
  align-items: flex-end;
}
.msg-header {
  font-size: 11px;
  color: var(--wm-text-secondary);
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}
.msg-sender {
  font-weight: 500;
}
.msg-id {
  font-family: monospace;
  opacity: 0.5;
  font-size: 10px;
}
.msg-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--wm-bubble-in);
  color: var(--wm-text);
  max-width: 70%;
  word-break: break-all;
}
.bubble-out {
  background: var(--wm-bubble-out);
  color: #fff;
}
.msg-input-bar {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--wm-border);
  flex-shrink: 0;
  background: var(--wm-card-bg);
}
</style>
