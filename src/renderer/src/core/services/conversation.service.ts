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
  sendMessage(accountId: string, chatId: string, toUserId: string, text: string) {
    return invoke<{ success: boolean; error?: string }>('message:send', { accountId, chatId, toUserId, text })
  },
  sendImage(accountId: string, chatId: string, toUserId: string, filePath: string) {
    return invoke<{ success: boolean; error?: string }>('message:sendImage', { accountId, chatId, toUserId, filePath })
  },
  captureScreen(accountId: string, chatId: string, toUserId: string) {
    return invoke<{ success: boolean; error?: string }>('message:captureScreen', { accountId, chatId, toUserId })
  },
  setInChat(inChat: boolean) {
    return invoke('message:setInChat', { inChat })
  }
}
