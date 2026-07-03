/**
 * 商品草稿数据仓库
 * 仅存储本地草稿（未发布到闲鱼），发布后由调用方删除
 */

import crypto from 'crypto'
import { db } from './connection.js'
import type {
    GoodsDraft,
    CreateGoodsDraftParams,
    UpdateGoodsDraftParams
} from '../types/index.js'

// 转换数据库行到业务对象
function toDraft(row: any): GoodsDraft {
    return {
        id: row.id,
        accountId: row.account_id ?? undefined,
        title: row.title,
        price: row.price,
        originalPrice: row.original_price ?? undefined,
        picUrl: row.pic_url ?? '',
        picWidth: row.pic_width ?? 0,
        picHeight: row.pic_height ?? 0,
        images: row.images ? JSON.parse(row.images) : [],
        categoryId: row.category_id ?? 0,
        description: row.description ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

// 生成草稿 ID：draft-<时间戳>-<随机>
function genId(): string {
    return `draft-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

// 列表查询：可选按账号筛选（空 accountId 返回全部）
export function getDrafts(accountId?: string): GoodsDraft[] {
    let sql = 'SELECT * FROM goods_drafts'
    const params: any[] = []
    if (accountId) {
        sql += ' WHERE account_id = ?'
        params.push(accountId)
    }
    sql += ' ORDER BY created_at DESC'
    const rows = db.prepare(sql).all(...params) as any[]
    return rows.map(toDraft)
}

export function getDraft(id: string): GoodsDraft | undefined {
    const row = db.prepare('SELECT * FROM goods_drafts WHERE id = ?').get(id) as any | undefined
    return row ? toDraft(row) : undefined
}

export function createDraft(params: CreateGoodsDraftParams): GoodsDraft {
    const id = genId()
    const images = params.images || []
    const cover = images[0]
    db.prepare(`
        INSERT INTO goods_drafts
            (id, account_id, title, price, original_price, pic_url, pic_width, pic_height, images, category_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        params.accountId || null,
        params.title,
        params.price,
        params.originalPrice || null,
        cover?.url || null,
        cover?.width || 0,
        cover?.height || 0,
        JSON.stringify(images),
        params.categoryId ?? 0,
        params.description || null
    )
    return getDraft(id)!
}

export function updateDraft(id: string, params: UpdateGoodsDraftParams): boolean {
    const existing = getDraft(id)
    if (!existing) return false

    const images = params.images !== undefined ? params.images : existing.images
    const cover = images[0]
    db.prepare(`
        UPDATE goods_drafts SET
            account_id = ?, title = ?, price = ?, original_price = ?,
            pic_url = ?, pic_width = ?, pic_height = ?, images = ?,
            category_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        params.accountId !== undefined ? (params.accountId || null) : (existing.accountId || null),
        params.title ?? existing.title,
        params.price ?? existing.price,
        params.originalPrice !== undefined ? (params.originalPrice || null) : (existing.originalPrice || null),
        cover?.url || null,
        cover?.width || 0,
        cover?.height || 0,
        JSON.stringify(images),
        params.categoryId !== undefined ? params.categoryId : existing.categoryId,
        params.description !== undefined ? (params.description || null) : (existing.description || null),
        id
    )
    return true
}

export function deleteDraft(id: string): boolean {
    const result = db.prepare('DELETE FROM goods_drafts WHERE id = ?').run(id)
    return result.changes > 0
}
