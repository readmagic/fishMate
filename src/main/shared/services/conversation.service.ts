/**
 * 对话服务
 * 处理对话相关的业务逻辑
 */

import {
    getConversations,
    getConversation,
    upsertConversation,
    updateConversationAvatar,
    resetConversationUnread,
    markConversationRead,
    deleteConversation as deleteConversationDb,
    setConversationHidden as setConversationHiddenDb,
    setConversationPinned as setConversationPinnedDb,
    getConversationMessages,
    getConversationMessageCount,
    addConversationMessage,
    conversationMessageExistsByMsgId,
    markOutgoingReadUpTo,
    getConversationCount,
    getAccount
} from '../db/index.js'
import { normalizeImageUrl } from '../core/url.js'
import { emitConversationsUpdated } from '../core/event-emitter.js'
import type {
    ChatMessage,
    Conversation,
    ConversationMessage
} from '../types/index.js'

// 安全解析 extra JSON（损坏时返回 undefined，不抛异常）
function safeParseExtra(raw: string): Record<string, unknown> | undefined {
    try {
        const v = JSON.parse(raw)
        if (typeof v !== 'object' || !v) return undefined
        const o = v as Record<string, unknown>
        // extra 内的图片 URL 同样规范化（图片消息 url / 卡片 picUrl）
        if (typeof o.url === 'string') o.url = normalizeImageUrl(o.url as string)
        if (typeof o.picUrl === 'string') o.picUrl = normalizeImageUrl(o.picUrl as string)
        return o
    } catch {
        return undefined
    }
}

/**
 * 添加收到的消息
 */
export function addIncomingMessage(accountId: string, msg: ChatMessage) {
    // 同一消息可能被 sync/push 双投递，按 msg_id 去重：已入库则整体跳过（不插行、不累加未读）
    if (msg.msgId && conversationMessageExistsByMsgId(accountId, msg.chatId, msg.msgId)) return

    const timestamp = Date.now()

    // 先更新对话，不触发事件
    upsertConversation({
        accountId,
        chatId: msg.chatId,
        userId: msg.senderId,
        userName: msg.senderName,
        lastMessage: msg.content,
        lastTime: timestamp,
        unread: 1,
        itemId: msg.itemId
    }, false)

    // 添加消息，触发事件
    addConversationMessage({
        accountId,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        msgTime: msg.msgTime,
        msgId: msg.msgId,
        direction: 'in',
        contentType: msg.contentType ?? 1,
        extra: msg.extra
    })
}

/**
 * 添加发出的消息
 */
export function addOutgoingMessage(
    accountId: string,
    chatId: string,
    toUserId: string,
    content: string,
    opts?: { contentType?: number; extra?: Record<string, unknown> }
) {
    const timestamp = Date.now()
    const conv = getConversation(accountId, chatId)
    if (!conv) return

    const account = getAccount(accountId)
    const senderName = account?.nickname || '我'

    // 先更新对话，不触发事件
    upsertConversation({
        accountId,
        chatId,
        userId: conv.user_id,
        userName: conv.user_name,
        lastMessage: content,
        lastTime: timestamp,
        unread: 0
    }, false)
    // upsert 的 unread 是增量语义（+0 不变），发送时需绝对置零
    resetConversationUnread(accountId, chatId)

    // 添加消息，触发事件（自己发的消息不触发 NEW_MESSAGE，不闪烁不响铃）
    addConversationMessage({
        accountId,
        chatId,
        senderId: accountId,
        senderName,
        content,
        msgTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        direction: 'out',
        contentType: opts?.contentType ?? 1,
        extra: opts?.extra
    }, false)
}

/**
 * 记录自己在其它端（手机 App）发出的消息
 * 只追加到已存在的会话；不增未读、不触发 NEW_MESSAGE（不闪烁不响铃）
 */
export function addRemoteOutgoingMessage(accountId: string, msg: ChatMessage) {
    const existing = getConversation(accountId, msg.chatId)
    if (!existing) return // 会话不存在（对方未发起过对话），暂不创建，等对方消息来再建

    // 与 addIncomingMessage 一致的 msg_id 去重，避免其它端发出消息被双投递时重复入库
    if (msg.msgId && conversationMessageExistsByMsgId(accountId, msg.chatId, msg.msgId)) return

    const timestamp = Date.now()
    upsertConversation({
        accountId,
        chatId: msg.chatId,
        userId: existing.user_id,
        userName: existing.user_name,
        lastMessage: msg.content,
        lastTime: timestamp,
        unread: 0
    }, false)
    // upsert 的 unread 是增量语义（+0 不变），发送时需绝对置零
    resetConversationUnread(accountId, msg.chatId)

    addConversationMessage({
        accountId,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        msgTime: msg.msgTime,
        msgId: msg.msgId,
        direction: 'out',
        contentType: msg.contentType ?? 1,
        extra: msg.extra
    }, false)
}

/**
 * 更新用户头像
 */
export function updateUserAvatar(accountId: string, chatId: string, avatar: string) {
    updateConversationAvatar(accountId, chatId, avatar)
}

/**
 * 获取所有对话列表
 */
export function getAllConversations(
    limit = 20,
    offset = 0
): { conversations: Conversation[]; total: number } {
    const dbConvs = getConversations(limit, offset)
    const total = getConversationCount()

    const conversations = dbConvs.map(c => {
        const account = getAccount(c.account_id)
        return {
            accountId: c.account_id,
            accountNickname: account?.nickname || c.account_id,
            chatId: c.chat_id,
            userId: c.user_id,
            userName: c.user_name,
            userAvatar: normalizeImageUrl(c.user_avatar || undefined),
            lastMessage: c.last_message,
            lastTime: c.last_time,
            unread: c.unread,
            messageCount: getConversationMessageCount(c.account_id, c.chat_id),
            itemId: c.item_id || undefined,
            pinned: c.pinned ?? 0
        }
    })

    return { conversations, total }
}

/**
 * 获取单个对话详情
 */
export function getConversationDetail(
    accountId: string,
    chatId: string,
    messageLimit = 50,
    beforeId?: number
): Conversation | undefined {
    const conv = getConversation(accountId, chatId)
    if (!conv) return undefined

    const account = getAccount(accountId)
    const dbMsgs = getConversationMessages(accountId, chatId, messageLimit, beforeId)

    const messages: ConversationMessage[] = dbMsgs.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        content: m.content,
        msgTime: m.msg_time,
        msgId: m.msg_id || undefined,
        timestamp: m.created_at,
        direction: m.direction,
        contentType: m.content_type ?? 1,
        extra: m.extra ? safeParseExtra(m.extra) : undefined,
        readStatus: m.read_status ?? 0
    }))

    return {
        accountId: conv.account_id,
        accountNickname: account?.nickname || conv.account_id,
        chatId: conv.chat_id,
        userId: conv.user_id,
        userName: conv.user_name,
        userAvatar: normalizeImageUrl(conv.user_avatar || undefined),
        lastMessage: conv.last_message,
        lastTime: conv.last_time,
        unread: conv.unread,
        messageCount: getConversationMessageCount(accountId, chatId),
        itemId: conv.item_id || undefined,
        messages
    }
}

/**
 * 标记对话已读
 */
export function markAsRead(accountId: string, chatId: string) {
    markConversationRead(accountId, chatId)
}

/**
 * 标记我方发出消息为已读（对方已读回执到达）
 * upToTime = 被读消息的服务端 createTime(epoch ms)
 * 触发会话刷新事件，前端打开中的会话会重新拉取详情、实时刷新已读状态
 */
export function markOutgoingRead(accountId: string, chatId: string, upToTime: number) {
    const changed = markOutgoingReadUpTo(accountId, chatId, upToTime)
    if (changed > 0) emitConversationsUpdated()
}

/**
 * 删除对话及其全部消息
 */
export function deleteConversation(accountId: string, chatId: string) {
    deleteConversationDb(accountId, chatId)
}

/**
 * 设置会话隐藏/显示
 */
export function setConversationHidden(accountId: string, chatId: string, hidden: boolean) {
    setConversationHiddenDb(accountId, chatId, hidden)
}

/**
 * 设置会话置顶/取消置顶
 */
export function setConversationPinned(accountId: string, chatId: string, pinned: boolean) {
    setConversationPinnedDb(accountId, chatId, pinned)
}
