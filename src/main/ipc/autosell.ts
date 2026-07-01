import { ipcMain } from 'electron'
import {
    getAutoSellRules,
    getAutoSellRule,
    createAutoSellRule,
    updateAutoSellRule,
    deleteAutoSellRule,
    toggleAutoSellRule,
    getStockItems,
    getStockStats,
    addStockItems,
    clearStock,
    getDeliveryLogs
} from '../shared/db/index.js'

export function registerAutoSellIPC() {
    ipcMain.handle('autosell:list', async () => {
        const rules = getAutoSellRules()
        const rulesWithStats = rules.map((r: any) => {
            if (r.deliveryType === 'stock') {
                const stats = getStockStats(r.id)
                return { ...r, stockCount: stats.total, usedCount: stats.used }
            }
            return r
        })
        return { rules: rulesWithStats }
    })

    ipcMain.handle('autosell:get', async (_e, { id }) => {
        const rule = getAutoSellRule(Number(id))
        if (!rule) return { error: '规则不存在' }
        if (rule.deliveryType === 'stock') {
            const stats = getStockStats(Number(id))
            return { ...rule, stockCount: stats.total, usedCount: stats.used }
        }
        return rule
    })

    ipcMain.handle('autosell:create', async (_e, body) => {
        const id = createAutoSellRule(body)
        return { success: true, id }
    })

    ipcMain.handle('autosell:update', async (_e, { id, ...body }) => {
        const success = updateAutoSellRule(Number(id), body)
        return { success }
    })

    ipcMain.handle('autosell:delete', async (_e, { id }) => {
        const success = deleteAutoSellRule(Number(id))
        return { success }
    })

    ipcMain.handle('autosell:toggle', async (_e, { id }) => {
        const success = toggleAutoSellRule(Number(id))
        return { success }
    })

    // ===== 库存 =====
    ipcMain.handle('autosell:stock', async (_e, { id, includeUsed = false }) => {
        const items = getStockItems(Number(id), includeUsed)
        const stats = getStockStats(Number(id))
        return { items, stats }
    })

    ipcMain.handle('autosell:addStock', async (_e, { id, contents }) => {
        if (!Array.isArray(contents) || contents.length === 0) {
            return { success: false, error: '请提供库存内容' }
        }
        const count = addStockItems(Number(id), contents)
        return { success: true, count }
    })

    ipcMain.handle('autosell:clearStock', async (_e, { id, onlyUsed = false }) => {
        const count = clearStock(Number(id), onlyUsed)
        return { success: true, count }
    })

    // ===== 发货记录 =====
    ipcMain.handle('autosell:logs', async (_e, params = {}) => {
        return getDeliveryLogs({
            ruleId: params.ruleId ? Number(params.ruleId) : undefined,
            orderId: params.orderId || undefined,
            accountId: params.accountId || undefined,
            limit: Number(params.limit) || 50,
            offset: Number(params.offset) || 0
        })
    })
}
