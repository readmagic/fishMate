/**
 * 商品服务
 */

import { API_ENDPOINTS, API_METHODS, WS_CONFIG } from '../core/constants.js'
import { CookiesManager } from '../core/cookies.manager.js'
import { generateSign } from '../utils/crypto.js'
import { createLogger } from '../core/logger.js'
import { normalizeImageUrl } from '../core/url.js'
import type { GoodsItem, GoodsListResult, CategoryInfo, GoodsDraftImage } from '../types/index.js'

const logger = createLogger('Svc:Goods')

/**
 * 获取商品列表
 */
export async function fetchGoodsList(
    accountId: string,
    userId: string,
    page = 1,
    pageSize = 20
): Promise<GoodsListResult> {
    try {
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (!cookiesStr) {
            logger.error(`[${accountId}] 无法获取 cookies`)
            return { items: [], nextPage: false, totalCount: 0 }
        }

        const timestamp = Date.now().toString()
        const dataVal = JSON.stringify({ userId, pageNumber: page, pageSize })
        const h5Token = CookiesManager.getH5Token(accountId)
        const sign = generateSign(timestamp, h5Token, dataVal)

        const params = new URLSearchParams({
            jsv: '2.7.2',
            appKey: WS_CONFIG.SIGN_APP_KEY,
            t: timestamp,
            sign,
            v: '1.0',
            type: 'originaljson',
            accountSite: 'xianyu',
            dataType: 'json',
            timeout: '20000',
            api: 'mtop.idle.web.xyh.item.list'
        })

        const res = await fetch(`${API_ENDPOINTS.ITEM_LIST}?${params}`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://www.goofish.com',
                'referer': 'https://www.goofish.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'cookie': cookiesStr
            },
            body: `data=${encodeURIComponent(dataVal)}`
        })

        CookiesManager.handleResponseCookies(accountId, res)

        const resJson = await res.json()

        if (resJson?.ret?.some((r: string) => r.includes('SUCCESS'))) {
            const data = resJson.data || {}
            const cardList = data.cardList || []

            const items: GoodsItem[] = cardList.map((card: any) => {
                const cardData = card.cardData || {}
                const detailParams = cardData.detailParams || {}
                const picInfo = cardData.picInfo || {}
                const priceInfo = cardData.priceInfo || {}

                return {
                    id: cardData.id || detailParams.itemId || '',
                    title: cardData.title || detailParams.title || '',
                    price: priceInfo.price || detailParams.soldPrice || '',
                    picUrl: normalizeImageUrl(picInfo.picUrl || detailParams.picUrl || ''),
                    picWidth: picInfo.width || parseInt(detailParams.picWidth) || 0,
                    picHeight: picInfo.height || parseInt(detailParams.picHeight) || 0,
                    categoryId: cardData.categoryId || 0,
                    itemStatus: cardData.itemStatus ?? 0,
                    hasVideo: picInfo.hasVideo || false,
                    soldPrice: detailParams.soldPrice,
                    postInfo: detailParams.postInfo
                }
            })

            logger.info(`[${accountId}] 获取商品列表成功，共 ${items.length} 件商品`)
            return {
                items,
                nextPage: data.nextPage || false,
                totalCount: data.totalCount || items.length
            }
        }

        logger.warn(`[${accountId}] 获取商品列表失败: ${JSON.stringify(resJson?.ret)}`)
        return { items: [], nextPage: false, totalCount: 0 }
    } catch (e) {
        logger.error(`[${accountId}] 获取商品列表异常: ${e}`)
        return { items: [], nextPage: false, totalCount: 0 }
    }
}

/**
 * 下架商品（com.taobao.idle.item.delete v1.1，写操作）
 */
export async function delistItem(
    accountId: string,
    itemId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (!cookiesStr) {
            return { success: false, error: '无法获取 cookies' }
        }

        const h5Token = CookiesManager.getH5Token(accountId)
        if (!h5Token) {
            return { success: false, error: 'h5Token 为空' }
        }

        const timestamp = Date.now().toString()
        const dataVal = JSON.stringify({ itemId })
        const sign = generateSign(timestamp, h5Token, dataVal)

        const params = new URLSearchParams({
            jsv: '2.7.2',
            appKey: WS_CONFIG.SIGN_APP_KEY,
            t: timestamp,
            sign,
            v: '1.1',
            type: 'originaljson',
            accountSite: 'xianyu',
            dataType: 'json',
            timeout: '20000',
            api: API_METHODS.ITEM_DELETE,
            sessionOption: 'AutoLoginOnly',
            spm_cnt: 'a21ybx.item.0.0'
        })

        logger.info(`[${accountId}] 下架商品请求 - itemId: ${itemId}`)

        const res = await fetch(`${API_ENDPOINTS.ITEM_DELETE}?${params}`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://www.goofish.com',
                'referer': 'https://www.goofish.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'cookie': cookiesStr
            },
            body: `data=${encodeURIComponent(dataVal)}`
        })

        CookiesManager.handleResponseCookies(accountId, res)
        const resJson = await res.json()

        if (resJson?.ret?.some((r: string) => r.includes('SUCCESS'))) {
            logger.info(`[${accountId}] 下架商品成功: ${itemId}`)
            return { success: true }
        }

        const retMsg = resJson?.ret?.join(', ') || '未知错误'
        logger.warn(`[${accountId}] 下架商品失败: ${retMsg}`)
        return { success: false, error: retMsg }
    } catch (e) {
        logger.error(`[${accountId}] 下架商品异常: ${e}`)
        return { success: false, error: String(e) }
    }
}

/**
 * 获取默认发布地址（mtop.taobao.idle.local.poi.get v1.0）
 */
export async function getDefaultLocation(accountId: string): Promise<Record<string, any>> {
    try {
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (!cookiesStr) return {}
        const h5Token = CookiesManager.getH5Token(accountId)
        if (!h5Token) return {}

        const timestamp = Date.now().toString()
        const dataVal = JSON.stringify({ longitude: 121.4737, latitude: 31.2304 })
        const sign = generateSign(timestamp, h5Token, dataVal)
        const params = new URLSearchParams({
            jsv: '2.7.2', appKey: WS_CONFIG.SIGN_APP_KEY, t: timestamp, sign, v: '1.0',
            type: 'originaljson', accountSite: 'xianyu', dataType: 'json', timeout: '20000',
            api: API_METHODS.LOCATION_GET, sessionOption: 'AutoLoginOnly',
            spm_cnt: 'a21ybx.publish.0.0'
        })
        const res = await fetch(`${API_ENDPOINTS.LOCATION_GET}?${params}`, {
            method: 'POST',
            headers: { 'accept': 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'origin': 'https://www.goofish.com', 'referer': 'https://www.goofish.com/', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'cookie': cookiesStr },
            body: `data=${encodeURIComponent(dataVal)}`
        })
        CookiesManager.handleResponseCookies(accountId, res)
        const raw = await res.json()
        const data = raw?.data || {}
        const addrs = data?.commonAddresses || []
        const selected = data?.selectedPoi || addrs[0] || null
        if (!selected) return {}
        return { prov: selected.prov || '', city: selected.city || '', area: selected.area || '', divisionId: String(selected.divisionId || ''), gps: `${selected.longitude || ''},${selected.latitude || ''}`, poiId: selected.poiId || '', poiName: selected.poi || '' }
    } catch (e) {
        logger.warn(`[${accountId}] 获取默认地址失败: ${e}`)
        return {}
    }
}

/**
 * 发布商品（mtop.idle.pc.idleitem.publish v1.0）
 */
export async function publishItem(
    accountId: string,
    draft: { title: string; desc?: string; images: GoodsDraftImage[]; price: string; originalPrice?: string; categoryId: number }
): Promise<{ success: boolean; itemId?: string; error?: string }> {
    try {
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (!cookiesStr) return { success: false, error: '无法获取 cookies' }
        const h5Token = CookiesManager.getH5Token(accountId)
        if (!h5Token) return { success: false, error: 'h5Token 为空' }

        // 1. AI 类目（失败时不传，让闲鱼自动分配）
        const cat = await recommendCategory(accountId, draft.title, draft.images)
        const catInfo = cat?.category || null
        logger.info(`[${accountId}] 类目数据: ${JSON.stringify(catInfo)}`)

        // 2. 默认地址
        const loc = await getDefaultLocation(accountId)

        // 3. 构建发布数据
        const imageDoList = draft.images.map((img) => ({
            extraInfo: { isH: 'false', isT: 'false', raw: 'false' },
            isQrCode: false, url: img.url, heightSize: img.height, widthSize: img.width,
            major: true, type: 0, status: 'done'
        }))
        const priceNum = Number(draft.price) || 0
        const priceDto: Record<string, string> = {}
        if (priceNum > 0) priceDto.priceInCent = String(Math.round(priceNum * 100))
        if (draft.originalPrice && Number(draft.originalPrice) > 0) priceDto.origPriceInCent = String(Math.round(Number(draft.originalPrice) * 100))

        const data: Record<string, any> = {
            freebies: false, itemTypeStr: 'b', quantity: '1', simpleItem: 'true',
            imageInfoDOList: imageDoList,
            itemTextDTO: { desc: draft.desc || '', title: draft.title, titleDescSeparate: true },
            itemLabelExtList: [],
            itemPriceDTO: priceDto,
            userRightsProtocols: [{ enable: false, serviceCode: 'SKILL_PLAY_NO_MIND' }],
            itemPostFeeDTO: { canFreeShipping: false, supportFreight: false, onlyTakeSelf: false, templateId: '0' },
            itemAddrDTO: loc.divisionId ? loc : {},
            defaultPrice: priceNum <= 0,
            onlyTakeSelf: true,
            uniqueCode: String(Date.now()),
            sourceId: 'pcMainPublish', bizcode: 'pcMainPublish', publishScene: 'pcMainPublish'
        }
        // 类目识别成功时才传 itemCatDTO，否则让闲鱼自动分配
        if (catInfo?.catId) {
            data.itemCatDTO = { catId: catInfo.catId, catName: catInfo.catName || '', channelCatId: catInfo.channelCatId || '', tbCatId: catInfo.tbCatId || '' }
        }

        // 4. 调用发布接口
        logger.info(`[${accountId}] 发布商品 - title: ${draft.title}, hasCat: ${!!catInfo?.catId}, dataKeys: ${Object.keys(data).join(',')}`)
        const timestamp = Date.now().toString()
        const dataVal = JSON.stringify(data)
        const sign = generateSign(timestamp, h5Token, dataVal)
        const params = new URLSearchParams({
            jsv: '2.7.2', appKey: WS_CONFIG.SIGN_APP_KEY, t: timestamp, sign, v: '1.0',
            type: 'originaljson', accountSite: 'xianyu', dataType: 'json', timeout: '20000',
            api: API_METHODS.ITEM_PUBLISH, sessionOption: 'AutoLoginOnly',
            spm_cnt: 'a21ybx.publish.0.0'
        })

        logger.info(`[${accountId}] 发布商品请求 - title: ${draft.title}`)
        const res = await fetch(`${API_ENDPOINTS.ITEM_PUBLISH}?${params}`, {
            method: 'POST',
            headers: { 'accept': 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'origin': 'https://www.goofish.com', 'referer': 'https://www.goofish.com/', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'cookie': cookiesStr },
            body: `data=${encodeURIComponent(dataVal)}`
        })
        CookiesManager.handleResponseCookies(accountId, res)
        const resJson = await res.json()

        if (resJson?.ret?.some((r: string) => r.includes('SUCCESS'))) {
            const itemId = resJson?.data?.itemId || ''
            logger.info(`[${accountId}] 发布商品成功: ${itemId}`)
            return { success: true, itemId }
        }
        const retMsg = resJson?.ret?.join(', ') || '未知错误'
        logger.warn(`[${accountId}] 发布商品失败: ${retMsg}`)
        return { success: false, error: retMsg }
    } catch (e) {
        logger.error(`[${accountId}] 发布商品异常: ${e}`)
        return { success: false, error: String(e) }
    }
}

/**
 * AI 识别商品类目（mtop.taobao.idle.kgraph.property.recommend v2.0）
 * 输入标题 + 已上传图片，返回 catId/catName/channelCatId/tbCatId 映射
 */
export async function recommendCategory(
    accountId: string,
    title: string,
    images: GoodsDraftImage[]
): Promise<{ success: boolean; error?: string; category?: CategoryInfo | null }> {
    try {
        const cookiesStr = CookiesManager.getCookies(accountId)
        if (!cookiesStr) {
            return { success: false, error: '无法获取 cookies' }
        }
        const h5Token = CookiesManager.getH5Token(accountId)
        if (!h5Token) {
            return { success: false, error: 'h5Token 为空' }
        }

        const imageInfos = images.map((img) => ({
            extraInfo: { isH: 'false', isT: 'false', raw: 'false' },
            isQrCode: false,
            url: img.url,
            heightSize: img.height,
            widthSize: img.width,
            major: true,
            type: 0,
            status: 'done'
        }))

        const timestamp = Date.now().toString()
        const dataVal = JSON.stringify({
            title,
            lockCpv: false,
            multiSKU: false,
            publishScene: 'mainPublish',
            scene: 'newPublishChoice',
            description: title,
            imageInfos,
            uniqueCode: '1775905618164677'
        })
        const sign = generateSign(timestamp, h5Token, dataVal)

        const params = new URLSearchParams({
            jsv: '2.7.2',
            appKey: WS_CONFIG.SIGN_APP_KEY,
            t: timestamp,
            sign,
            v: '2.0',
            type: 'originaljson',
            accountSite: 'xianyu',
            dataType: 'json',
            timeout: '20000',
            api: API_METHODS.CATEGORY_RECOMMEND,
            spm_cnt: 'a21ybx.publish.0.0'
        })

        const res = await fetch(`${API_ENDPOINTS.CATEGORY_RECOMMEND}?${params}`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://www.goofish.com',
                'referer': 'https://www.goofish.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'cookie': cookiesStr
            },
            body: `data=${encodeURIComponent(dataVal)}`
        })
        CookiesManager.handleResponseCookies(accountId, res)
        const resJson = await res.json()

        if (!resJson?.ret?.some((r: string) => r.includes('SUCCESS'))) {
            const retMsg = resJson?.ret?.join(', ') || '未知错误'
            logger.warn(`[${accountId}] 类目识别失败: ${retMsg}, data=${JSON.stringify(resJson?.data || {}).substring(0, 500)}`)
            return { success: false, error: retMsg }
        }

        // 兼容两种返回结构：categoryPredictResult（旧）和 cardList（新）
        const predict = resJson?.data?.categoryPredictResult
        let category: CategoryInfo | null = null
        if (predict?.catId) {
            category = {
                catId: String(predict.catId),
                catName: predict.catName || '',
                channelCatId: String(predict.channelCatId || ''),
                tbCatId: String(predict.tbCatId || '')
            }
        } else {
            // 新结构：cardList[0].cardData.valuesList[0]
            const valuesList = resJson?.data?.cardList?.[0]?.cardData?.valuesList
            const top = Array.isArray(valuesList) ? valuesList[0] : null
            if (top?.catId) {
                category = {
                    catId: String(top.catId),
                    catName: top.catName || '',
                    channelCatId: String(top.channelCatId || ''),
                    tbCatId: String(top.tbCatId || '')
                }
            }
        }
        if (!category) {
            return { success: false, error: '未识别到类目' }
        }
        logger.info(`[${accountId}] 类目识别成功: ${category.catName}(${category.catId})`)
        return { success: true, category }
    } catch (e) {
        logger.error(`[${accountId}] 类目识别异常: ${e}`)
        return { success: false, error: String(e) }
    }
}
