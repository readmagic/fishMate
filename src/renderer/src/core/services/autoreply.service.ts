import { invoke } from '@/core/utils/ipc'
import type { AutoReplyRule } from '@/core/types'

export const autoReplyService = {
  getRules() {
    return invoke<{ rules: AutoReplyRule[] }>('autoreply:list')
  },
  createRule(rule: Partial<AutoReplyRule>) {
    return invoke<{ success: boolean; id?: number }>('autoreply:create', rule)
  },
  updateRule(id: number, rule: Partial<AutoReplyRule>) {
    return invoke<{ success: boolean }>('autoreply:update', { id, ...rule })
  },
  deleteRule(id: number) {
    return invoke<{ success: boolean }>('autoreply:delete', { id })
  },
  toggleRule(id: number) {
    return invoke<{ success: boolean }>('autoreply:toggle', { id })
  }
}
