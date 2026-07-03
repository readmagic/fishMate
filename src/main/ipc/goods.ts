import { ipcMain, session, dialog } from 'electron'
import { getAllAccounts, getAccount, getDrafts, getDraft, createDraft, updateDraft, deleteDraft } from '../shared/db/index.js'
import { fetchGoodsList, delistItem, uploadImage, recommendCategory } from '../shared/services/index.js'
import { CookiesManager } from '../shared/core/cookies.manager.js'
import { parseCookies } from '../shared/utils/cookies.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'
import type { CreateGoodsDraftParams, UpdateGoodsDraftParams, GoodsDraftImage, CategoryInfo } from '../shared/types/index.js'

export function registerGoodsIPC(cm: ClientManager) {
    ipcMain.handle('goods:delist', async (_e, { accountId, itemId }: { accountId: string; itemId: string }) => {
        if (!accountId || !itemId) return { success: false, error: 'Missing accountId or itemId' }
        const account = getAccount(accountId)
        if (!account) return { success: false, error: 'Account not found' }
        return delistItem(accountId, itemId)
    })
    ipcMain.handle('goods:list', async (_e, { accountId, page = 1 }: { accountId?: string; page?: number }) => {
        if (accountId) {
            const account = getAccount(accountId)
            if (!account) return { error: 'Account not found' }
            const result = await fetchGoodsList(accountId, accountId, page)
            return {
                items: result.items.map((item: any) => ({ ...item, accountId })),
                nextPage: result.nextPage,
                totalCount: result.totalCount
            }
        }

        const accounts = getAllAccounts()
        const allItems: any[] = []
        let totalCount = 0
        for (const account of accounts) {
            const client = cm.getClient(account.id)
            if (!client || !client.isConnected()) continue
            const result = await fetchGoodsList(account.id, account.id, page)
            const itemsWithAccount = result.items.map((item: any) => ({
                ...item,
                accountId: account.id,
                accountNickname: account.nickname
            }))
            allItems.push(...itemsWithAccount)
            totalCount += result.totalCount
        }
        return { items: allItems, totalCount }
    })

    ipcMain.handle('goods:byAccount', async (_e, { id, page = 1 }: { id: string; page?: number }) => {
        const account = getAccount(id)
        if (!account) return { error: 'Account not found' }
        const result = await fetchGoodsList(id, id, page)
        return { items: result.items, nextPage: result.nextPage, totalCount: result.totalCount }
    })

    // 将账号 cookie 注入 webview 专用 session，供商品详情 webview 以登录态加载 goofish 商品页
    // 同时伪装 UA + sec-ch-ua 为 Edge 149 一致，避免被闲鱼检测为 Electron 触发滑动验证
    let webviewSessionConfigured = false
    const EDGE_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'
    ipcMain.handle('goods:injectCookies', async (_e, { accountId }: { accountId?: string }) => {
        const ses = session.fromPartition('persist:goofish')
        if (!webviewSessionConfigured) {
            ses.setUserAgent(EDGE_UA)
            ses.webRequest.onBeforeSendHeaders((details, cb) => {
                const h = { ...details.requestHeaders }
                h['User-Agent'] = EDGE_UA
                h['sec-ch-ua'] = '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"'
                h['sec-ch-ua-mobile'] = '?0'
                h['sec-ch-ua-platform'] = '"Linux"'
                h['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6'
                cb({ requestHeaders: h })
            })
            webviewSessionConfigured = true
        }
        await ses.clearStorageData({ storages: ['cookies'] })
        if (!accountId) return { success: true }
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (cookiesStr) {
            const obj = parseCookies(cookiesStr)
            for (const [name, value] of Object.entries(obj)) {
                try {
                    await ses.cookies.set({
                        url: 'https://www.goofish.com',
                        name,
                        value: String(value),
                        domain: '.goofish.com',
                        path: '/',
                        secure: true,
                        httpOnly: false
                    })
                } catch {
                    /* 忽略单条 cookie 设置失败 */
                }
            }
        }
        return { success: true }
    })

    // ========== 商品草稿（本地，未发布） ==========
    ipcMain.handle('goods:createDraft', (_e, { params }: { params: CreateGoodsDraftParams }) => {
        try {
            return createDraft(params)
        } catch (e: any) {
            console.error('[goods:createDraft] error:', e)
            throw e
        }
    })
    ipcMain.handle('goods:listDrafts', (_e, { accountId }: { accountId?: string }) => {
        return getDrafts(accountId)
    })
    ipcMain.handle('goods:getDraft', (_e, { id }: { id: string }) => {
        return getDraft(id)
    })
    ipcMain.handle('goods:updateDraft', (_e, { params }: { params: UpdateGoodsDraftParams }) => {
        return { success: updateDraft(params.id, params) }
    })
    ipcMain.handle('goods:deleteDraft', (_e, { id }: { id: string }) => {
        return { success: deleteDraft(id) }
    })

    // AI 识别类目：标题 + 已上传图片 → catId/catName 映射
    ipcMain.handle('goods:recommendCategory', async (_e, { accountId, title, images }: { accountId: string; title: string; images: GoodsDraftImage[] }) => {
        if (!accountId) return { success: false, error: 'Missing accountId' }
        if (!title) return { success: false, error: '请先填写标题' }
        return recommendCategory(accountId, title, images)
    })

    // 草稿图片上传：弹文件选择框 → 逐张上传闲鱼 CDN → 返回 url+尺寸
    // 复用 media.service 的 uploadImage，与 message:sendImage 同源
    ipcMain.handle('goods:uploadImages', async (_e, { accountId }: { accountId: string }) => {
        if (!accountId) return { success: false, error: 'Missing accountId' }
        const account = getAccount(accountId)
        if (!account) return { success: false, error: 'Account not found' }
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
            return { success: true, images: [] }
        }
        const images: GoodsDraftImage[] = []
        for (const p of result.filePaths) {
            const up = await uploadImage(accountId, p)
            if (up) images.push({ url: up.url, width: up.width, height: up.height })
        }
        if (images.length === 0) return { success: false, error: '图片上传失败' }
        return { success: true, images }
    })
}
