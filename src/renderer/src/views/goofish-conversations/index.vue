<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { App, message } from 'ant-design-vue'
import {
  ReloadOutlined,
  SendOutlined,
  SmileOutlined,
  PictureOutlined,
  ScissorOutlined,
  SoundOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PushpinFilled
} from '@ant-design/icons-vue'
import BenzAMRRecorder from 'benz-amr-recorder'
import { conversationService, goodsService } from '@/core/services'
import { usePushStore } from '@/core/stores/usePushStore'
import { useGoodsStore } from '@/core/stores/useGoodsStore'
import { STICKERS } from '@/core/data/stickers'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { Conversation, ConversationMessage, GoodsItem } from '@/core/types'

// 贴纸名 → url 映射，用于把消息文本里的 [表情名] 实时渲染成图
const STICKER_MAP = new Map<string, string>(STICKERS.map((s) => [s.name, s.url]))

// 把含 [表情名] 的文本渲染成 HTML：文本转义，命中的 token 替换为 <img>
function renderContent(text: string | undefined): string {
  if (!text) return ''
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/(\[[^\]]+\])/g)
    .map((p) => {
      if (/^\[[^\]]+\]$/.test(p) && STICKER_MAP.has(p)) {
        return `<img src="${STICKER_MAP.get(p)}" class="inline-sticker" alt="${escape(p)}" title="${escape(p)}" />`
      }
      return escape(p)
    })
    .join('')
}

const pushStore = usePushStore()
const { modal } = App.useApp()

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
const inputRef = ref<HTMLElement | null>(null)
const sending = ref(false)
let wsSubscribed = false

// contenteditable 输入框：读出文本时把 <img alt="[表情名]"> 还原回 token，保证表情不丢
function readInputText(el: HTMLElement): string {
  let s = ''
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      s += n.textContent || ''
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as HTMLElement
      s += e.tagName === 'IMG' ? (e.getAttribute('alt') || '') : (e.innerText || '')
    }
  })
  return s
}

// 外部变更（选表情 / 清空 / 发送后）才重渲 innerHTML；用户键入时不重渲，避免光标跳到开头
watch(draft, (v) => {
  const el = inputRef.value
  if (!el) return
  if (readInputText(el) !== v) {
    el.innerHTML = renderContent(v)
    placeCursorEnd(el)
  }
})

function placeCursorEnd(el: HTMLElement) {
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
}

function onInputChange() {
  const el = inputRef.value
  if (el) draft.value = readInputText(el)
}

// Enter 发送；IME 选词回车（isComposing / keyCode 229）不触发
function onInputKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

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
  if (key === 'pin') pinConv(conv)
  else if (key === 'hide') hideConv(conv)
  else if (key === 'delete') confirmDelete(conv)
}

// 置顶/取消置顶：乐观更新本地状态并重排，WS 推送到达后兜底校正
async function pinConv(conv: Conversation) {
  const next = !conv.pinned
  conv.pinned = next ? 1 : 0
  resortConversations()
  try {
    await conversationService.setPinned(conv.accountId, conv.chatId, next)
    message.success(next ? '已置顶' : '已取消置顶')
  } catch {
    conv.pinned = next ? 0 : 1
    resortConversations()
    message.error('操作失败')
  }
}

// 列表本地排序：置顶在前，再按最后消息时间倒序
function resortConversations() {
  conversations.value = [...conversations.value].sort((a, b) =>
    (b.pinned ?? 0) - (a.pinned ?? 0) || b.lastTime - a.lastTime
  )
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
  modal.confirm({
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
        direction: 'out',
        contentType: 1
      }
      conv.messages = [...(conv.messages || []), outMsg]
      conv.lastMessage = text
      conv.lastTime = Date.now()
      draft.value = ''
      clearCurrentUnread()
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

// ============ 富消息发送 ============
const stickerVisible = ref(false)
const previewUrl = ref('')
// 宝贝详情/定位地图 webview 预览：点遮罩或 Esc 关闭
const webviewUrl = ref('')
const webviewTitle = ref('')
const wvRef = ref<any>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const loadingAction = ref<'image' | 'screen' | null>(null)

// 反检测脚本：伪造 navigator 全套属性 + window.chrome + WebGL 指纹，规避闲鱼滑动验证
// （从 goofish-goods 详情 webview 同步，保持商品页登录态加载一致）
const STEALTH_JS = `(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en'], configurable: true });
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const a = [
          { name:'PDF Viewer', filename:'internal-pdf-viewer', description:'Portable Document Format' },
          { name:'Chrome PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'Chromium PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'Microsoft Edge PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'WebKit built-in PDF', filename:'internal-pdf-viewer', description:'' }
        ];
        a.item = (i) => a[i] || null;
        a.namedItem = (n) => a.find(p => p.name === n) || null;
        a.refresh = () => {};
        return a;
      },
      configurable: true
    });
    window.chrome = window.chrome || {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.app) window.chrome.app = { isInstalled:false, getDetails:()=>null, getIsInstalled:()=>false };
    if (!window.chrome.csi) window.chrome.csi = () => ({});
    if (!window.chrome.loadTimes) window.chrome.loadTimes = () => ({});
    const GP = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p){
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
      return GP.call(this, p);
    };
    if (window.WebGL2RenderingContext) {
      const GP2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(p){
        if (p === 37445) return 'Intel Inc.';
        if (p === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
        return GP2.call(this, p);
      };
    }
    if (window.navigator.permissions) {
      const oq = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : oq(params);
    }
  } catch (e) {}
})();`
const CLEANUP_JS = `(() => {
  const SEL = '[class*="surveyWrap"], [class*="sidebar-container"]';
  const sweep = () => document.querySelectorAll(SEL).forEach(el => el.remove());
  sweep();
  try {
    const mo = new MutationObserver(() => sweep());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();`
function onWebviewDomReady() {
  try { wvRef.value?.executeJavaScript(`${STEALTH_JS}\n${CLEANUP_JS}`, true) } catch { /* ignore */ }
}

function nowTs() {
  const n = new Date()
  return `${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}:${n.getSeconds().toString().padStart(2, '0')}`
}

// 图片气泡展示尺寸：长边限 200px，贴纸限 96px，保持比例
function imageStyle(extra: any) {
  const max = extra?.sticker ? 96 : 200
  const w = Number(extra?.width) || 0
  const h = Number(extra?.height) || 0
  if (!w || !h) return {}
  if (w >= h) return { width: Math.min(max, w) + 'px', height: 'auto' }
  return { height: Math.min(max, h) + 'px', width: 'auto' }
}

// ============ 语音播放（AMR，Chromium 原生不支持，用 BenzAMRRecorder 解码） ============
let amrPlayer: BenzAMRRecorder | null = null
const voicePlayingId = ref<number | null>(null)
const voiceLoadingId = ref<number | null>(null)

function formatDuration(extra: any): string {
  const d = Number(extra?.duration)
  if (!d || d <= 0) return ''
  return Math.round(d) + '"'
}

function stopVoice() {
  if (amrPlayer) {
    try { amrPlayer.stop() } catch { /* ignore */ }
    try { amrPlayer.destroy() } catch { /* ignore */ }
    amrPlayer = null
  }
  voicePlayingId.value = null
  voiceLoadingId.value = null
}

async function playVoice(msg: ConversationMessage) {
  const url = (msg.extra as any)?.url
  if (!url) return
  // 切换到另一条语音：先停掉当前
  if (voicePlayingId.value === msg.id) {
    stopVoice()
    return
  }
  stopVoice()
  voiceLoadingId.value = msg.id
  try {
    const amr = new BenzAMRRecorder()
    amr.onEnded(() => {
      stopVoice()
    })
    await amr.initWithUrl(url)
    amrPlayer = amr
    voiceLoadingId.value = null
    voicePlayingId.value = msg.id
    amr.play()
  } catch (e) {
    console.error('语音播放失败', e)
    message.error('语音播放失败')
    stopVoice()
  }
}

// 乐观追加一条富消息到当前会话
function pushOutMsg(content: string, contentType: number, extra?: Record<string, unknown>) {
  const conv = selected.value
  if (!conv) return
  const outMsg: ConversationMessage = {
    id: Date.now(),
    senderId: 'me',
    senderName: '我',
    content,
    msgTime: nowTs(),
    timestamp: Date.now(),
    direction: 'out',
    contentType,
    extra
  }
  conv.messages = [...(conv.messages || []), outMsg]
  conv.lastMessage = content
  conv.lastTime = Date.now()
  nextTick(() => scrollToBottom())
}

// 发送成功后清掉当前会话未读红数字（后端 addOutgoing 已清 DB，但列表项是旧数据）
function clearCurrentUnread() {
  const conv = selected.value
  if (!conv) return
  conv.unread = 0
  const li = conversations.value.find(
    (c) => c.accountId === conv.accountId && c.chatId === conv.chatId
  )
  if (li) li.unread = 0
}

// 选表情：把 [表情名] 插入输入框，随文本一起发（ctype=1），收方 IM 实时渲染成图
function onPickSticker(s: { name: string }) {
  draft.value += s.name
  stickerVisible.value = false
}

function triggerPickImage() {
  fileInputRef.value?.click()
}

async function onPickImage(e: Event) {
  const conv = selected.value
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!conv || !file) return
  ;(e.target as HTMLInputElement).value = ''
  loadingAction.value = 'image'
  try {
    const filePath = window.api.getPathForFile(file)
    if (!filePath) { message.error('无法获取文件路径'); return }
    const res = await conversationService.sendImage(conv.accountId, conv.chatId, conv.userId, filePath)
    if (res.success) { pushOutMsg('[图片]', 2); clearCurrentUnread() }
    else message.error(res.error || '发送失败')
  } catch {
    message.error('发送图片失败')
  } finally {
    loadingAction.value = null
  }
}

async function onCaptureScreen() {
  const conv = selected.value
  if (!conv) return
  loadingAction.value = 'screen'
  try {
    const res = await conversationService.captureScreen(conv.accountId, conv.chatId, conv.userId)
    if (res.success) { pushOutMsg('[截图]', 2); clearCurrentUnread() }
    else message.error(res.error || '截图失败')
  } finally {
    loadingAction.value = null
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

// 消息流：按分钟插入居中时间分割条（独立于气泡）
type MsgItem =
  | { kind: 'time'; value: string; key: string }
  | { kind: 'msg'; msg: ConversationMessage; key: string }
const messageItems = computed<MsgItem[]>(() => {
  const msgs = selected.value?.messages || []
  const items: MsgItem[] = []
  let last = ''
  for (const m of msgs) {
    const hm = m.timestamp
      ? new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      : (m.msgTime || '').slice(0, 5)
    if (hm && hm !== last) {
      items.push({ kind: 'time', value: hm, key: 't-' + m.id })
      last = hm
    }
    items.push({ kind: 'msg', msg: m, key: 'm-' + m.id })
  }
  return items
})

// 头像：对方取会话 userAvatar，自己取账号 avatar；无图则回落首字
function avatarSrc(msg: ConversationMessage): string | undefined {
  const conv = selected.value
  if (msg.direction === 'in') return conv?.userAvatar || undefined
  const acc = pushStore.accounts.find((a) => a.id === conv?.accountId)
  return acc?.avatar || undefined
}
function avatarText(msg: ConversationMessage): string {
  const conv = selected.value
  if (msg.direction === 'in') return conv?.userName?.charAt(0) || '?'
  const acc = pushStore.accounts.find((a) => a.id === conv?.accountId)
  return acc?.nickname?.charAt(0) || conv?.accountNickname?.charAt(0) || '我'
}
// 昵称：对方取消息 senderName，自己取账号昵称
function nicknameOf(msg: ConversationMessage): string {
  if (msg.direction === 'in') return msg.senderName || ''
  const conv = selected.value
  const acc = pushStore.accounts.find((a) => a.id === conv?.accountId)
  return acc?.nickname || conv?.accountNickname || '我'
}

onMounted(() => {
  loadConversations()
  conversationService.setInChat(true)
  // 初始化输入框内容（如有回填）
  if (inputRef.value) inputRef.value.innerHTML = renderContent(draft.value)
})
onUnmounted(() => {
  // 不取消订阅：AppSidebar 全局常驻订阅供未读角标，此处仅重置本地 flag
  wsSubscribed = false
  conversationService.setInChat(false)
  window.removeEventListener('keydown', onPreviewEsc)
  stopVoice()
})

// 图片预览期间监听 Esc 关闭；开/关随 previewUrl 绑定
function onPreviewEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') previewUrl.value = ''
}
watch(previewUrl, (v) => {
  if (v) window.addEventListener('keydown', onPreviewEsc)
  else window.removeEventListener('keydown', onPreviewEsc)
})

// webview 预览（宝贝详情/定位地图）期间监听 Esc 关闭
function onWebviewEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') { webviewUrl.value = ''; webviewTitle.value = '' }
}
watch(webviewUrl, (v) => {
  if (v) window.addEventListener('keydown', onWebviewEsc)
  else window.removeEventListener('keydown', onWebviewEsc)
})

// 打开宝贝详情 webview：先注入当前账号 cookie 到 persist:goofish session，再加载
async function openItemDetail(itemId: any) {
  if (!itemId) return
  const accountId = selected.value?.accountId
  if (accountId) {
    try { await goodsService.injectCookies(accountId) } catch { /* ignore */ }
  }
  webviewTitle.value = '宝贝详情'
  webviewUrl.value = `https://www.goofish.com/item?id=${itemId}`
}
// 打开定位地图 webview（地图页无需 goofish 登录态）
function openLocationMap(url: any) {
  if (!url) return
  webviewTitle.value = '位置'
  webviewUrl.value = String(url)
}
// 文件大小格式化
function formatFileSize(bytes: any): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
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
                    <PushpinFilled v-if="conv.pinned" class="conv-pin" />
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
                  <a-menu-item key="pin">{{ conv.pinned ? '取消置顶' : '置顶' }}</a-menu-item>
                  <a-menu-item key="hide">不显示</a-menu-item>
                  <a-menu-divider />
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
          <template v-for="item in messageItems" :key="item.key">
            <!-- 时间分割条：独立居中，不绑定气泡 -->
            <div v-if="item.kind === 'time'" class="msg-time-divider">{{ item.value }}</div>
            <!-- 消息行 -->
            <div
              v-else
              class="msg-row"
              :class="item.msg.direction === 'in' ? 'msg-in' : 'msg-out'"
              :title="item.msg.msgId"
            >
              <!-- 对方头像（左）/ 我的头像（右，靠 row-reverse） -->
              <a-avatar
                v-if="avatarSrc(item.msg)"
                class="msg-avatar"
                :size="36"
                :src="avatarSrc(item.msg)"
              />
              <a-avatar v-else class="msg-avatar" :size="36">{{ avatarText(item.msg) }}</a-avatar>

              <div class="msg-main">
                <!-- 昵称（双方都显示，位于头像旁/气泡上方） -->
                <div class="msg-nickname">{{ nicknameOf(item.msg) }}</div>

                <!-- 文本（含 [表情名] 实时渲染为贴纸） -->
                <div
                  v-if="!item.msg.contentType || item.msg.contentType === 1"
                  class="msg-bubble"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                  v-html="renderContent(item.msg.content)"
                ></div>
                <!-- 图片/表情贴纸 -->
                <div
                  v-else-if="item.msg.contentType === 2"
                  class="msg-bubble bubble-image-wrap"
                  :class="item.msg.direction === 'out' ? 'bubble-out-img' : ''"
                >
                  <img
                    v-if="(item.msg.extra as any)?.url"
                    :src="(item.msg.extra as any).url"
                    class="bubble-image"
                    :style="imageStyle(item.msg.extra as any)"
                    @click="previewUrl = (item.msg.extra as any).url"
                  />
                  <span v-else>{{ item.msg.content || '[图片]' }}</span>
                </div>
                <!-- 宝贝卡片：点击打开详情 webview -->
                <div
                  v-else-if="item.msg.contentType === 3"
                  class="msg-bubble bubble-card"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                  @click="openItemDetail((item.msg.extra as any)?.itemId)"
                >
                  <img v-if="(item.msg.extra as any)?.picUrl" :src="(item.msg.extra as any).picUrl" class="card-pic" />
                  <div v-else class="card-pic card-pic-empty" />
                  <div class="card-meta">
                    <div class="card-title">{{ (item.msg.extra as any)?.title || item.msg.content }}</div>
                    <div class="card-price">¥{{ (item.msg.extra as any)?.price || '-' }}</div>
                  </div>
                </div>
                <!-- 定位卡片：点击打开地图 webview -->
                <div
                  v-else-if="item.msg.contentType === 5"
                  class="msg-bubble bubble-loc"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                  @click="openLocationMap((item.msg.extra as any)?.url)"
                >
                  <EnvironmentOutlined class="loc-icon" />
                  <span class="loc-text">{{ (item.msg.extra as any)?.address || item.msg.content || '[定位]' }}</span>
                </div>
                <!-- 文件卡片 -->
                <div
                  v-else-if="item.msg.contentType === 6"
                  class="msg-bubble bubble-file"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                >
                  <FileTextOutlined class="file-icon" />
                  <div class="file-meta">
                    <div class="file-name">{{ (item.msg.extra as any)?.fileName || item.msg.content || '[文件]' }}</div>
                    <div v-if="(item.msg.extra as any)?.fileSize" class="file-size">{{ formatFileSize((item.msg.extra as any).fileSize) }}</div>
                  </div>
                </div>
                <!-- 语音 -->
                <div
                  v-else-if="item.msg.contentType === 4"
                  class="msg-bubble bubble-voice"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                  @click="playVoice(item.msg)"
                >
                  <SoundOutlined class="voice-icon" :class="{ 'voice-icon-playing': voicePlayingId === item.msg.id }" :spin="voicePlayingId === item.msg.id" />
                  <a-spin v-if="voiceLoadingId === item.msg.id" size="small" class="voice-spin" />
                  <span class="voice-duration">{{ formatDuration(item.msg.extra) || (voicePlayingId === item.msg.id ? '播放中' : '语音') }}</span>
                </div>
                <!-- 未知类型回退文本 -->
                <div
                  v-else
                  class="msg-bubble"
                  :class="item.msg.direction === 'out' ? 'bubble-out' : 'bubble-in'"
                >{{ item.msg.content }}</div>

                <!-- 已读状态（仅自己消息）：默认未读，对方看到回执后才置已读 -->
                <div v-if="item.msg.direction === 'out'" class="msg-read" :class="{ 'msg-unread': !item.msg.readStatus }">{{ item.msg.readStatus ? '已读' : '未读' }}</div>
              </div>
            </div>
          </template>
        </div>

        <div class="chat-input-bar">
          <input ref="fileInputRef" type="file" accept="image/*" style="display:none" @change="onPickImage" />
          <div class="chat-input-card">
            <div class="chat-input-toolbar">
              <a-popover v-model:open="stickerVisible" trigger="click" placement="topLeft">
                <template #content>
                  <div class="sticker-grid">
                    <img
                      v-for="s in STICKERS"
                      :key="s.name"
                      :src="s.url"
                      :alt="s.name"
                      :title="s.name"
                      class="sticker-item"
                      @click="onPickSticker(s)"
                    />
                  </div>
                </template>
                <a-button class="ci-icon-btn" shape="circle" type="text" :disabled="!selected" title="表情">
                  <template #icon><SmileOutlined /></template>
                </a-button>
              </a-popover>
              <a-button class="ci-icon-btn" shape="circle" type="text" :loading="loadingAction === 'image'" :disabled="!selected" title="图片" @click="triggerPickImage">
                <template #icon><PictureOutlined /></template>
              </a-button>
              <a-button class="ci-icon-btn" shape="circle" type="text" :loading="loadingAction === 'screen'" :disabled="!selected" title="截屏" @click="onCaptureScreen">
                <template #icon><ScissorOutlined /></template>
              </a-button>
            </div>
            <div
              ref="inputRef"
              class="chat-input-field"
              :class="{ disabled: sending }"
              contenteditable="true"
              data-placeholder="请输入消息，按Enter键发送或点击发送按钮发送"
              :contenteditable="!sending"
              @input="onInputChange"
              @keydown="onInputKeyDown"
            ></div>
          </div>
          <button class="ci-send-btn" :disabled="sending || !selected" @click="send">
            <span v-if="sending" class="ci-spin"></span>
            <SendOutlined v-else />
            <span>发送</span>
          </button>
        </div>

      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个对话查看消息" />
      </div>
    </template>
  </TwoPaneLayout>
  <!-- 图片放大预览：点遮罩或 Esc 关闭 -->
  <Teleport to="body">
    <div v-if="previewUrl" class="img-preview-mask" @click="previewUrl = ''">
      <img :src="previewUrl" class="img-preview-full" />
    </div>
  </Teleport>
  <!-- 宝贝详情/定位地图 webview 预览：点遮罩或 Esc 关闭 -->
  <Teleport to="body">
    <div v-if="webviewUrl" class="wv-preview-mask" @click.self="webviewUrl = ''">
      <div class="wv-preview-box">
        <div class="wv-preview-header">
          <span class="wv-preview-title">{{ webviewTitle }}</span>
          <a-button size="small" @click="webviewUrl = ''">X</a-button>
        </div>
        <webview
          ref="wvRef"
          :src="webviewUrl"
          :key="webviewUrl"
          partition="persist:goofish"
          useragent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
          style="flex: 1; height: 0"
          @dom-ready="onWebviewDomReady"
        />
      </div>
    </div>
  </Teleport>
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
.conv-pin {
  color: var(--wm-primary);
  font-size: 13px;
  flex-shrink: 0;
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
  gap: 14px;
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 24px;
  min-height: 0;
  background: #F7F7F7;
}
/* 时间分割条：独立居中 */
.msg-time-divider {
  align-self: center;
  margin: 12px 0;
  padding: 2px 10px;
  font-size: 11px;
  color: #B0B0B0;
  text-align: center;
}
/* 消息行 */
.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.msg-in {
  flex-direction: row;
}
.msg-out {
  flex-direction: row-reverse;
}
.msg-avatar {
  flex-shrink: 0;
  background: #E6E8EB;
  color: #8C8C8C;
  font-size: 14px;
}
.msg-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 72%;
}
.msg-in .msg-main {
  align-items: flex-start;
}
.msg-out .msg-main {
  align-items: flex-end;
}
.msg-nickname {
  font-size: 12px;
  color: #666;
  margin: 0 4px 4px;
}
/* 右侧自己昵称略下移，与气泡顶部留出呼吸 */
.msg-out .msg-nickname {
  margin-top: 3px;
}
.msg-bubble {
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-all;
  color: #222;
}
.bubble-in {
  background: #F1F1F1;
  border-top-left-radius: 4px;
}
.bubble-out {
  background: #FFD84D;
  color: #222;
  border-top-right-radius: 4px;
}
.msg-read {
  margin: 3px 4px 0;
  font-size: 10px;
  color: #C0C0C0;
}
.msg-read.msg-unread {
  color: #F5222D;
}
/* 文本内联贴纸：v-html 注入的 <img> 无 scoped 属性，须用 :deep() 穿透 */
:deep(.inline-sticker) {
  width: 20px;
  height: 20px;
  vertical-align: middle;
  margin: 0 1px;
  object-fit: contain;
  display: inline-block;
}
/* 图片/贴纸气泡 */
.bubble-image-wrap {
  padding: 0;
  background: transparent !important;
}
.bubble-image {
  display: block;
  border-radius: 8px;
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
  cursor: pointer;
}
.bubble-out-img .bubble-image {
  /* 发出的图片不强制背景 */
}
/* 图片放大预览 */
.img-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.img-preview-full {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 4px;
}
/* 宝贝卡片气泡：白底独立卡片，不沿用气泡黄/灰底 */
.bubble-card {
  display: flex;
  gap: 8px;
  padding: 8px;
  max-width: 240px;
  background: #fff;
  border: 1px solid #ECECEC;
  border-radius: 10px;
  cursor: pointer;
}
.card-pic {
  width: 56px;
  height: 56px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}
.card-pic-empty {
  background: var(--wm-content-bg, #ddd);
}
.card-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.card-title {
  font-size: 13px;
  color: var(--wm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.card-price {
  font-size: 13px;
  color: #f5222d;
  font-weight: 600;
}
/* 定位卡片气泡 */
.bubble-loc {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  max-width: 260px;
  cursor: pointer;
  user-select: none;
}
.bubble-loc .loc-icon {
  color: #1E90FF;
  font-size: 16px;
  flex-shrink: 0;
}
.bubble-loc .loc-text {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 文件卡片气泡 */
.bubble-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  max-width: 260px;
  user-select: none;
}
.bubble-file .file-icon {
  color: #FA8C16;
  font-size: 22px;
  flex-shrink: 0;
}
.bubble-file .file-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bubble-file .file-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.bubble-file .file-size {
  font-size: 11px;
  color: var(--wm-text-secondary, #999);
}
/* webview 预览弹层（宝贝详情/定位地图） */
.wv-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wv-preview-box {
  width: 80vw;
  height: 85vh;
  background: #fff;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.wv-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--wm-border, #eee);
  flex-shrink: 0;
}
.wv-preview-title {
  font-size: 14px;
  font-weight: 600;
}
/* 语音气泡 */
.bubble-voice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  min-width: 72px;
  cursor: pointer;
  user-select: none;
}
.bubble-voice .voice-icon {
  font-size: 18px;
  color: var(--wm-text-secondary, #666);
}
.bubble-voice .voice-icon-playing {
  color: #1677ff;
}
.bubble-voice .voice-spin {
  margin-left: -2px;
}
.bubble-voice .voice-duration {
  font-size: 13px;
  color: var(--wm-text, #333);
}
/* ===== 聊天输入面板 ===== */
.chat-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 16px 14px;
  flex-shrink: 0;
  background: #F5F6F8;
  border-top: 1px solid #E6E8EB;
  font-family: 'Inter', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
}
.chat-input-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  padding: 8px 10px;
  background: #FFFFFF;
  border: 1px solid #E6E8EB;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-input-card:focus-within {
  border-color: #FFD666;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06), 0 0 0 3px rgba(255, 214, 102, 0.18);
}
.chat-input-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
}
/* 圆形图标按钮 */
.ci-icon-btn {
  width: 30px !important;
  height: 30px !important;
  min-width: 30px !important;
  color: #8C8C8C !important;
  font-size: 16px;
  transition: background 0.15s, color 0.15s;
}
.ci-icon-btn:hover:not(:disabled) {
  background: #F0F0F0 !important;
  color: #595959 !important;
}
.ci-icon-btn:disabled {
  opacity: 0.5;
}
/* 多行输入域（contenteditable） */
.chat-input-field {
  flex: 1;
  min-height: 28px;
  max-height: 140px;
  overflow-y: auto;
  padding: 2px 4px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: #262626;
  white-space: pre-wrap;
  word-break: break-all;
}
.chat-input-field.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.chat-input-field:empty::before {
  content: attr(data-placeholder);
  color: #BFBFBF;
  pointer-events: none;
}
/* 发送按钮（暖黄胶囊） */
.ci-send-btn {
  align-self: flex-end;
  height: 38px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: #FFD666;
  color: #614700;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(255, 214, 102, 0.4);
  transition: background 0.15s, transform 0.08s;
}
.ci-send-btn:hover:not(:disabled) {
  background: #FFC53D;
}
.ci-send-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.ci-send-btn:disabled {
  background: #FFF0B3;
  color: #BFB98A;
  cursor: not-allowed;
  box-shadow: none;
}
.ci-spin {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(97, 71, 0, 0.3);
  border-top-color: #614700;
  border-radius: 50%;
  animation: ci-spin 0.6s linear infinite;
  display: inline-block;
}
@keyframes ci-spin {
  to { transform: rotate(360deg); }
}
/* 表情面板 */
.sticker-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 360px;
  max-height: 280px;
  overflow-y: auto;
}
.sticker-item {
  width: 32px;
  height: 32px;
  object-fit: contain;
  cursor: pointer;
  border-radius: 4px;
}
.sticker-item:hover {
  background: var(--wm-list-hover, rgba(0,0,0,0.05));
}
</style>
