/**
 * 对话存储（兼容层）
 * 委托给 conversation.service 处理
 */

import {
    addIncomingMessage,
    addOutgoingMessage,
    addRemoteOutgoingMessage,
    updateUserAvatar as updateAvatar,
    getAllConversations,
    getConversationDetail,
    markAsRead,
    deleteConversation as deleteConv,
    setConversationHidden as setHiddenConv
} from '../services/index.js'
import type { ChatMessage, Conversation } from '../types/index.js'

class ConversationStore {
    addIncoming(accountId: string, msg: ChatMessage) {
        addIncomingMessage(accountId, msg)
    }

    addOutgoing(
        accountId: string,
        chatId: string,
        toUserId: string,
        content: string,
        opts?: { contentType?: number; extra?: Record<string, unknown> }
    ) {
        addOutgoingMessage(accountId, chatId, toUserId, content, opts)
    }

    // 自己在其它端发出的消息：作为发出记录，不增未读、不触发通知
    addRemoteOutgoing(accountId: string, msg: ChatMessage) {
        addRemoteOutgoingMessage(accountId, msg)
    }

    updateUserAvatar(accountId: string, chatId: string, avatar: string) {
        updateAvatar(accountId, chatId, avatar)
    }

    getAll(limit = 20, offset = 0): { conversations: Conversation[]; total: number } {
        return getAllConversations(limit, offset)
    }

    get(
        accountId: string,
        chatId: string,
        messageLimit = 50,
        beforeId?: number
    ): Conversation | undefined {
        return getConversationDetail(accountId, chatId, messageLimit, beforeId)
    }

    markRead(accountId: string, chatId: string) {
        markAsRead(accountId, chatId)
    }

    delete(accountId: string, chatId: string) {
        deleteConv(accountId, chatId)
    }

    setHidden(accountId: string, chatId: string, hidden: boolean) {
        setHiddenConv(accountId, chatId, hidden)
    }
}

export const conversationStore = new ConversationStore()
