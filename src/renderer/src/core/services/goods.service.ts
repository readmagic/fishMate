import { invoke } from '@/core/utils/ipc'
import type { GoodsListResponse, GoodsDraft, GoodsDraftImage, CategoryInfo, CreateGoodsDraftParams, UpdateGoodsDraftParams } from '@/core/types'

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
  },
  publishDraft(draftId: string) {
    return invoke<{ success: boolean; itemId?: string; error?: string }>('goods:publish', { draftId })
  },
  createDraft(params: CreateGoodsDraftParams) {
    return invoke<GoodsDraft>('goods:createDraft', { params })
  },
  getDrafts(accountId?: string) {
    return invoke<GoodsDraft[]>('goods:listDrafts', { accountId })
  },
  updateDraft(params: UpdateGoodsDraftParams) {
    return invoke<{ success: boolean }>('goods:updateDraft', { params })
  },
  deleteDraft(id: string) {
    return invoke<{ success: boolean }>('goods:deleteDraft', { id })
  },
  uploadImages(accountId: string) {
    return invoke<{ success: boolean; error?: string; images: GoodsDraftImage[] }>('goods:uploadImages', { accountId })
  },
  recommendCategory(accountId: string, title: string, images: GoodsDraftImage[]) {
    return invoke<{ success: boolean; error?: string; category?: CategoryInfo | null }>('goods:recommendCategory', { accountId, title, images })
  }
}
