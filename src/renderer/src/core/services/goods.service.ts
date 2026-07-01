import { invoke } from '@/core/utils/ipc'
import type { GoodsListResponse } from '@/core/types'

export const goodsService = {
  getGoods(accountId?: string, page = 1) {
    return invoke<GoodsListResponse>('goods:list', { accountId, page })
  },
  getAccountGoods(accountId: string, page = 1) {
    return invoke<GoodsListResponse>('goods:byAccount', { id: accountId, page })
  }
}
