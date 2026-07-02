import { invoke } from '@/core/utils/ipc'
import type { GoodsListResponse } from '@/core/types'

export const goodsService = {
  getGoods(accountId?: string, page = 1) {
    return invoke<GoodsListResponse>('goods:list', { accountId, page })
  },
  getAccountGoods(accountId: string, page = 1) {
    return invoke<GoodsListResponse>('goods:byAccount', { id: accountId, page })
  },
  injectCookies(accountId?: string) {
    return invoke<{ success: boolean }>('goods:injectCookies', { accountId })
  },
  delistGoods(accountId: string, itemId: string) {
    return invoke<{ success: boolean; error?: string }>('goods:delist', { accountId, itemId })
  }
}
