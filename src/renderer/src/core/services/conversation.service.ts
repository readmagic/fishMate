import { invoke } from '@/core/utils/ipc'
import type { Conversation, ConversationListResponse } from '@/core/types'

export const conversationService = {
  getConversations(limit = 20, offset = 0) {
    return invoke<ConversationListResponse>('conversation:list', { limit, offset })
  },
  getConversation(accountId: string, chatId: string, limit = 50, beforeId?: number) {
    return invoke<Conversation>('conversation:detail', { accountId, chatId, limit, beforeId })
  },
  markAsRead(accountId: string, chatId: string) {
    return invoke<{ success: boolean }>('conversation:markRead', { accountId, chatId })
  },
  deleteConversation(accountId: string, chatId: string) {
    return invoke<{ success: boolean }>('conversation:delete', { accountId, chatId })
  },
  setHidden(accountId: string, chatId: string, hidden: boolean) {
    return invoke<{ success: boolean }>('conversation:setHidden', { accountId, chatId, hidden })
  },
  setPinned(accountId: string, chatId: string, pinned: boolean) {
    return invoke<{ success: boolean }>('conversation:setPinned', { accountId, chatId, pinned })
  },
  sendMessage(accountId: string, chatId: string, toUserId: string, text: string) {
    return invoke<{ success: boolean; error?: string }>('message:send', { accountId, chatId, toUserId, text })
  },
  sendImage(accountId: string, chatId: string, toUserId: string, filePath: string) {
    return invoke<{ success: boolean; error?: string }>('message:sendImage', { accountId, chatId, toUserId, filePath })
  },
  sendImageBuffer(accountId: string, chatId: string, toUserId: string, base64: string, ext: string) {
    return invoke<{ success: boolean; error?: string }>('message:sendImageBuffer', { accountId, chatId, toUserId, base64, ext })
  },
  sendFileUrl(accountId: string, chatId: string, toUserId: string, filePath: string) {
    return invoke<{ success: boolean; error?: string; url?: string; filename?: string }>('message:sendFile', { accountId, chatId, toUserId, filePath })
  },
  setInChat(inChat: boolean) {
    return invoke('message:setInChat', { inChat })
  }
}
