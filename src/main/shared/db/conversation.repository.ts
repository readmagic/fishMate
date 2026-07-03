/**
 * 对话数据仓库
 */

import { db } from './connection.js'
import { emitConversationsUpdated, emitNewMessage } from '../core/event-emitter.js'
import type {
    DbConversation,
    DbConversationMessage,
    UpsertConversationParams,
    AddConversationMessageParams
} from '../types/index.js'

// 获取对话列表（分页，排除已隐藏）
export function getConversations(limit = 20, offset = 0): DbConversation[] {
    const stmt = db.prepare(`
        SELECT account_id, chat_id, user_id, user_name, user_avatar, last_message, last_time, unread, item_id
        FROM conversations WHERE hidden = 0
        ORDER BY last_time DESC LIMIT ? OFFSET ?
    `)
    return stmt.all(limit, offset) as DbConversation[]
}

// 获取对话总数（排除已隐藏）
export function getConversationCount(): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE hidden = 0')
    return (stmt.get() as { count: number }).count
}

// 获取单个对话
export function getConversation(accountId: string, chatId: string): DbConversation | undefined {
    const stmt = db.prepare('SELECT * FROM conversations WHERE account_id = ? AND chat_id = ?')
    return stmt.get(accountId, chatId) as DbConversation | undefined
}

// 创建或更新对话（不触发事件，由调用方统一触发）
export function upsertConversation(conv: UpsertConversationParams, emitEvent = true) {
    const existing = getConversation(conv.accountId, conv.chatId)
    if (existing) {
        const stmt = db.prepare(`
            UPDATE conversations SET
                user_name = ?, user_avatar = COALESCE(?, user_avatar),
                last_message = ?, last_time = ?, unread = unread + ?,
                item_id = COALESCE(?, item_id),
                hidden = 0, updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ? AND chat_id = ?
        `)
        stmt.run(conv.userName, conv.userAvatar, conv.lastMessage, conv.lastTime, conv.unread || 0, conv.itemId || null, conv.accountId, conv.chatId)
    } else {
        const stmt = db.prepare(`
            INSERT INTO conversations (account_id, chat_id, user_id, user_name, user_avatar, last_message, last_time, unread, item_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(conv.accountId, conv.chatId, conv.userId, conv.userName, conv.userAvatar || null, conv.lastMessage, conv.lastTime, conv.unread || 0, conv.itemId || null)
    }
    if (emitEvent) {
        emitConversationsUpdated()
    }
}

// 更新用户头像
export function updateConversationAvatar(accountId: string, chatId: string, avatar: string) {
    const stmt = db.prepare('UPDATE conversations SET user_avatar = ? WHERE account_id = ? AND chat_id = ?')
    stmt.run(avatar, accountId, chatId)
}

// 绝对置零未读（upsertConversation 的 unread 是增量语义，发送消息时需直接置零）
export function resetConversationUnread(accountId: string, chatId: string) {
    const stmt = db.prepare('UPDATE conversations SET unread = 0 WHERE account_id = ? AND chat_id = ?')
    stmt.run(accountId, chatId)
}

// 标记已读
export function markConversationRead(accountId: string, chatId: string) {
    const stmt = db.prepare('UPDATE conversations SET unread = 0 WHERE account_id = ? AND chat_id = ?')
    stmt.run(accountId, chatId)
    emitConversationsUpdated()
}

// 删除对话及其全部消息
export function deleteConversation(accountId: string, chatId: string) {
    const delMsgs = db.prepare('DELETE FROM conversation_messages WHERE account_id = ? AND chat_id = ?')
    delMsgs.run(accountId, chatId)
    const delConv = db.prepare('DELETE FROM conversations WHERE account_id = ? AND chat_id = ?')
    delConv.run(accountId, chatId)
    emitConversationsUpdated()
}

// 设置会话隐藏/显示（不删数据，仅列表不显示）
export function setConversationHidden(accountId: string, chatId: string, hidden: boolean) {
    const stmt = db.prepare('UPDATE conversations SET hidden = ? WHERE account_id = ? AND chat_id = ?')
    stmt.run(hidden ? 1 : 0, accountId, chatId)
    emitConversationsUpdated()
}

// 获取对话消息（分页）
export function getConversationMessages(accountId: string, chatId: string, limit = 50, beforeId?: number): DbConversationMessage[] {
    if (beforeId) {
        const stmt = db.prepare(`
            SELECT * FROM conversation_messages
            WHERE account_id = ? AND chat_id = ? AND id < ?
            ORDER BY created_at DESC LIMIT ?
        `)
        return (stmt.all(accountId, chatId, beforeId, limit) as DbConversationMessage[]).reverse()
    }
    const stmt = db.prepare(`
        SELECT * FROM conversation_messages
        WHERE account_id = ? AND chat_id = ?
        ORDER BY created_at DESC LIMIT ?
    `)
    return (stmt.all(accountId, chatId, limit) as DbConversationMessage[]).reverse()
}

// 获取对话消息总数
export function getConversationMessageCount(accountId: string, chatId: string): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM conversation_messages WHERE account_id = ? AND chat_id = ?')
    return (stmt.get(accountId, chatId) as { count: number }).count
}

// 获取全库对话消息总数（供主控制台统计）
export function getTotalConversationMessageCount(): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM conversation_messages').get() as { count: number }
    return row.count
}

// 按 msg_id 判断消息是否已入库（同一消息可能被 sync/push 双投递，去重用）
export function conversationMessageExistsByMsgId(accountId: string, chatId: string, msgId: string): boolean {
    const stmt = db.prepare(`
        SELECT 1 FROM conversation_messages
        WHERE account_id = ? AND chat_id = ? AND msg_id = ? LIMIT 1
    `)
    return !!stmt.get(accountId, chatId, msgId)
}

// 标记我方发出消息为已读（对方已读回执到达时调用）
// upToTime = 被读消息的 createTime(服务端 epoch ms)，把同会话内 created_at<=upToTime 的发出消息置为已读
// +3s 容差吸收本地 Date.now() 与服务端 createTime 的钟差/处理延迟
export function markOutgoingReadUpTo(accountId: string, chatId: string, upToTime: number): number {
    const stmt = db.prepare(`
        UPDATE conversation_messages SET read_status = 1
        WHERE account_id = ? AND chat_id = ? AND direction = 'out'
          AND read_status = 0 AND created_at <= ?
    `)
    const r = stmt.run(accountId, chatId, upToTime + 3000)
    return r.changes
}

// 添加消息
export function addConversationMessage(msg: AddConversationMessageParams, emitNew = true): number {
    const stmt = db.prepare(`
        INSERT INTO conversation_messages (account_id, chat_id, sender_id, sender_name, content, msg_time, msg_id, direction, created_at, content_type, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
        msg.accountId, msg.chatId, msg.senderId, msg.senderName, msg.content, msg.msgTime, msg.msgId || null,
        msg.direction, Date.now(), msg.contentType ?? 1, msg.extra ? JSON.stringify(msg.extra) : null
    )
    emitConversationsUpdated()
    // 自己发的消息（本端/远端）不触发 NEW_MESSAGE：不闪烁、不响铃
    if (emitNew) emitNewMessage()
    return result.lastInsertRowid as number
}
