/**
 * 商品缓存 store
 *
 * 账号上线时预拉商品列表到缓存，供「对话-商品匹配」即时查询，避免每次打开会话才请求。
 * 离线时清空该账号缓存，下次上线重新拉取，保证数据新鲜。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { goodsService } from '@/core/services'
import type { GoodsItem } from '@/core/types'

const MAX_PAGES = 5 // 最多拉 5 页（约 100 条），覆盖绝大多数在售商品

export const useGoodsStore = defineStore('goods', () => {
  const cache = ref<Record<string, GoodsItem[]>>({})
  // 进行中的拉取去重（非响应式，仅作互斥锁）
  const inflight = new Set<string>()

  /** 拉取并缓存指定账号的全部在售商品（最多 5 页） */
  async function ensureAccountGoods(accountId: string): Promise<GoodsItem[]> {
    if (cache.value[accountId]) return cache.value[accountId]
    if (inflight.has(accountId)) return cache.value[accountId] || []
    inflight.add(accountId)
    try {
      const all: GoodsItem[] = []
      let page = 1
      while (page <= MAX_PAGES) {
        const res = await goodsService.getGoods(accountId, page)
        const items = res?.items || []
        all.push(...items)
        if (!res?.nextPage) break
        page++
      }
      cache.value = { ...cache.value, [accountId]: all }
      return all
    } catch {
      return cache.value[accountId] || []
    } finally {
      inflight.delete(accountId)
    }
  }

  /** 取缓存（未缓存返回 undefined，不触发拉取） */
  function getAccountGoods(accountId: string): GoodsItem[] | undefined {
    return cache.value[accountId]
  }

  /** 清空指定账号缓存（离线时调用，下次上线重新拉） */
  function clear(accountId?: string) {
    if (accountId) {
      const next = { ...cache.value }
      delete next[accountId]
      cache.value = next
    } else {
      cache.value = {}
    }
  }

  return { cache, ensureAccountGoods, getAccountGoods, clear }
})
