import { invoke } from '@/core/utils/ipc'
import type { Account, StatusResponse } from '@/core/types'

export const accountService = {
  getStatus() {
    return invoke<StatusResponse>('status:all')
  },
  getAccounts() {
    return invoke<{ accounts: Account[] }>('account:list')
  },
  async addAccount(data: {
    id?: string
    cookies?: string
    remark?: string
  }): Promise<{ success: boolean; accountId?: string; error?: string }> {
    return invoke('account:create', data)
  },
  deleteAccount(id: string) {
    return invoke<{ success: boolean }>('account:delete', { id })
  },
  startAccount(id: string) {
    return invoke<{ success: boolean; expired?: boolean; error?: string }>('account:start', { id })
  },
  stopAccount(id: string) {
    return invoke<{ success: boolean }>('account:stop', { id })
  },
  async refreshAccountInfo(id: string): Promise<{ success: boolean; error?: string }> {
    return invoke('account:refreshInfo', { id })
  },
  loginQr(): Promise<{ success: boolean; accountId?: string; error?: string }> {
    return invoke('account:loginQr')
  }
}
