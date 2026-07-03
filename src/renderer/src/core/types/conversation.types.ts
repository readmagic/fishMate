/**
 * 对话相关类型定义
 */

export interface ConversationMessage {
    id: number;
    senderId: string;
    senderName: string;
    content: string;
    msgTime: string;
    msgId?: string;
    timestamp: number;
    direction: 'in' | 'out';
    contentType: number;
    extra?: Record<string, unknown>;
    // 已读状态：0=未读 1=已读（仅 direction='out' 有意义）
    readStatus?: number;
}

export interface Conversation {
    accountId: string;
    accountNickname?: string;
    chatId: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    lastMessage: string;
    lastTime: number;
    unread: number;
    messageCount?: number;
    messages?: ConversationMessage[];
    // 会话绑定的商品ID（从消息 reminderUrl 提取，可能为空）
    itemId?: string;
    // 置顶：0=普通 1=置顶
    pinned?: number;
}

export interface ConversationListResponse {
    conversations: Conversation[];
    total: number;
    limit: number;
    offset: number;
}
