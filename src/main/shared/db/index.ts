/**
 * 数据库模块统一导出
 */

import { db, closeDatabase, getDbPath, openDatabase } from './connection.js'
import { runMigrations } from './migrations.js'
import { createLogger } from '../core/logger.js'

const logger = createLogger('Db')

// 初始化数据库（在 GOOFISH_DATA_DIR 设置后调用）
export function initDatabase() {
    openDatabase()
    runMigrations()
    logger.info('数据库初始化完成')
}

// 导出连接
export { db, closeDatabase }

// 导出仓库函数
export {
    getEnabledAccounts,
    getAllAccounts,
    getAccount,
    upsertAccount,
    updateAccountUserInfo,
    updateAccountCookies,
    updateAccountEnabled,
    deleteAccount,
    updateAccountStatus,
    getAccountStatus
} from './account.repository.js'

export {
    getConversations,
    getConversationCount,
    getConversation,
    upsertConversation,
    updateConversationAvatar,
    markConversationRead,
    deleteConversation,
    setConversationHidden,
    getConversationMessages,
    getConversationMessageCount,
    addConversationMessage
} from './conversation.repository.js'

export {
    getAutoReplyRules,
    getEnabledAutoReplyRules,
    getAutoReplyRule,
    createAutoReplyRule,
    updateAutoReplyRule,
    deleteAutoReplyRule,
    toggleAutoReplyRule
} from './autoreply.repository.js'

export {
    getUserAvatar,
    saveUserAvatar,
    hasUserAvatar
} from './user-avatar.repository.js'

export {
    getOrders,
    getOrderCount,
    getOrderById,
    upsertOrder,
    updateOrderStatus,
    deleteOrder
} from './order.repository.js'

export {
    getSetting,
    setSetting,
    deleteSetting,
    getSettings,
    getAISettings,
    saveAISettings,
    AI_SETTINGS_KEYS
} from './settings.repository.js'

export {
    getAutoSellRules,
    getEnabledAutoSellRules,
    getAutoSellRule,
    createAutoSellRule,
    updateAutoSellRule,
    deleteAutoSellRule,
    toggleAutoSellRule,
    getStockItems,
    getStockStats,
    addStockItems,
    consumeStock,
    clearStock,
    addDeliveryLog,
    getDeliveryLogs,
    hasDelivered
} from './autosell.repository.js'

export {
    getWorkflows,
    getWorkflowById,
    getDefaultWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    createWorkflowExecution,
    getWorkflowExecution,
    getWorkflowExecutionByOrderId,
    getWaitingExecutions,
    updateWorkflowExecution
} from './workflow.repository.js'
