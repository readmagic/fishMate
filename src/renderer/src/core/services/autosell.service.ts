import { invoke } from '@/core/utils/ipc'
import type { AutoSellRule, StockItem, StockStats, DeliveryLog } from '@/core/types'

export const autoSellService = {
  getRules() {
    return invoke<{ rules: AutoSellRule[] }>('autosell:list')
  },
  getRule(id: number) {
    return invoke<AutoSellRule>('autosell:get', { id })
  },
  createRule(rule: Partial<AutoSellRule>) {
    return invoke<{ success: boolean; id?: number }>('autosell:create', rule)
  },
  updateRule(id: number, rule: Partial<AutoSellRule>) {
    return invoke<{ success: boolean }>('autosell:update', { id, ...rule })
  },
  deleteRule(id: number) {
    return invoke<{ success: boolean }>('autosell:delete', { id })
  },
  toggleRule(id: number) {
    return invoke<{ success: boolean }>('autosell:toggle', { id })
  },
  getStock(ruleId: number, includeUsed = false) {
    return invoke<{ items: StockItem[]; stats: StockStats }>('autosell:stock', { id: ruleId, includeUsed })
  },
  addStock(ruleId: number, contents: string[]) {
    return invoke<{ success: boolean; count: number }>('autosell:addStock', { id: ruleId, contents })
  },
  clearStock(ruleId: number, onlyUsed = false) {
    return invoke<{ success: boolean; count: number }>('autosell:clearStock', { id: ruleId, onlyUsed })
  },
  getLogs(params?: { ruleId?: number; orderId?: string; limit?: number; offset?: number }) {
    return invoke<{ logs: DeliveryLog[]; total: number }>('autosell:logs', params || {})
  }
}
