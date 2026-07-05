import { decryptMessagePack } from '../utils/msgpack.js'
import { createLogger } from '../core/logger.js'
import type { ChatMessage } from '../types/index.js'

const logger = createLogger('Ws:Parser')

// 纯系统提示消息（不需要处理的）
const SYSTEM_MESSAGES = [
    '[不想宝贝被砍价?设置不砍价回复  ]',
    'AI正在帮你回复消息，不错过每笔订单',
    '发来一条消息',
    '发来一条新消息',
    '快给ta一个评价吧~',
    '快给ta一个评价吧～',
    '卖家人不错？送Ta闲鱼小红花'
]

// 订单状态消息（需要捕获但不触发自动回复）
const ORDER_STATUS_MESSAGES = [
    '[我已拍下，待付款]',
    '[我已付款，等待你发货]',
    '[已付款，待发货]',
    '[你已发货]',
    '[你已发货，请等待买家确认收货]',
    '[买家确认收货，交易成功]',
    '[你已确认收货，交易成功]',
    '[你关闭了订单，钱款已原路退返]',
    '[未付款，买家关闭了订单]',
    '[记得及时确认收货]',
    '已发货',
    '有蚂蚁森林能量可领'
]

export function isSystemMessage(content: string): boolean {
    return SYSTEM_MESSAGES.includes(content)
}

export function isOrderStatusMessage(content: string): boolean {
    return ORDER_STATUS_MESSAGES.some(msg => content.includes(msg))
}

// 解码 sync 负载（msgpack 优先，回退 base64+JSON），返回原始对象
export function decodeSyncPayload(data: string): any | null {
    try {
        const result = decryptMessagePack(data)
        if (result && typeof result === 'object') return result
    } catch {
        // 落到 base64+JSON 回退
    }
    try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)
        if (typeof parsed === 'object') {
            if ('chatType' in parsed) return null // 系统消息
            return parsed
        }
    } catch {
        // 忽略 JSON 解析失败
    }
    return null
}

export function decryptSyncData(data: string): any | null {
    const result = decodeSyncPayload(data)
    if (!result || typeof result !== 'object') return null
    const msg1 = result['1'] || result[1]
    if (msg1 && typeof msg1 === 'object') {
        const msg10 = msg1['10'] || msg1[10]
        if (msg10 && typeof msg10 === 'object' && 'reminderContent' in msg10) {
            return result
        }
    }
    return null
}

// 已读回执结构：{1:"xxx.PNM", 2:chatId, 4:原消息发送者, 5:阅读时间, 7:原消息createTime, 8:{...}}
// field4 是被读消息的"发送者"；当发送者 === 自己时，表示对方已读我方消息
export interface ReadReceipt {
    chatId: string
    senderId: string
    msgTime: number
}

export function extractReadReceipt(message: any): ReadReceipt | null {
    if (!message || typeof message !== 'object') return null
    const pnm = message['1'] || message[1]
    if (typeof pnm !== 'string' || !pnm.endsWith('.PNM')) return null

    const chatIdRaw = String(message['2'] || message[2] || '')
    const chatId = chatIdRaw.includes('@') ? chatIdRaw.split('@')[0] : chatIdRaw
    const senderRaw = String(message['4'] || message[4] || '')
    const senderId = senderRaw.includes('@') ? senderRaw.split('@')[0] : senderRaw
    const msgTime = Number(message['7'] || message[7] || 0)
    if (!chatId || !senderId || !msgTime) return null
    return { chatId, senderId, msgTime }
}

export function extractChatMessage(message: any, myId: string): ChatMessage | null {
    try {
        // 检查消息结构
        if (!message || typeof message !== 'object') return null

        // 支持两种消息结构：数字键和字符串键
        const msg1 = message['1'] || message[1]
        if (!msg1 || typeof msg1 !== 'object') return null

        const msg10 = msg1['10'] || msg1[10]
        if (!msg10 || typeof msg10 !== 'object') return null

        const createTime = parseInt(msg1['5'] || msg1[5] || '0')
        const senderName = msg10.senderNick || msg10.reminderTitle || '未知用户'
        const senderId = msg10.senderUserId || 'unknown'
        let content = msg10.reminderContent || ''

        // 提取 chatId
        const chatIdRaw = msg1['2'] || msg1[2] || ''
        const chatId = String(chatIdRaw).includes('@') ? String(chatIdRaw).split('@')[0] : String(chatIdRaw)

        // 提取 API 消息 ID 和订单信息 (从 extJson 中)
        let msgId: string | undefined
        let orderId: string | undefined
        let orderStatus: string | undefined
        try {
            const extJson = msg10.extJson
            if (extJson) {
                const ext = JSON.parse(extJson)
                msgId = ext.messageId || ext.msg_id
                // updateKey 格式有两种:
                // 1. orderId:contentType:taskName:num (如 3142117850666220888:20:BUYER_CONFIRM:74)
                // 2. sessionId:orderId:contentType:taskName:num (如 56627074402:3142117850666220888:100:REMIND:26)
                if (ext.updateKey) {
                    const parts = ext.updateKey.split(':')
                    for (const part of parts) {
                        if (/^\d{15,}$/.test(part)) {
                            orderId = part
                            break
                        }
                    }
                }
            }
        } catch {
            // 忽略解析失败
        }

        // 从 bizTag 提取订单状态
        try {
            const bizTag = msg10.bizTag
            if (bizTag) {
                const tag = JSON.parse(bizTag)
                orderStatus = tag.taskName
            }
        } catch {
            // 忽略解析失败
        }

        // 从 reminderUrl 提取订单ID（备用方案）
        if (!orderId && msg10.reminderUrl) {
            const urlMatch = msg10.reminderUrl.match(/orderId=(\d+)/)
            if (urlMatch) {
                orderId = urlMatch[1]
            }
        }

        // 从 reminderUrl 提取会话绑定的商品ID
        // 深链形如 fleamarket://message_chat?itemId=xxx&peerUserId=yyy&sid=chatId
        let itemId: string | undefined
        if (msg10.reminderUrl) {
            const itemMatch = msg10.reminderUrl.match(/[?&]itemId=(\d+)/)
            if (itemMatch) itemId = itemMatch[1]
        }

        // 从消息内容的 dxCard/tip 中提取订单ID（备用方案）
        if (!orderId) {
            try {
                const msg6 = msg1['6'] || msg1[6]
                if (msg6) {
                    const msg63 = msg6['3'] || msg6[3]
                    if (msg63) {
                        const cardJson = msg63['5'] || msg63[5]
                        if (cardJson) {
                            const card = JSON.parse(cardJson)
                            // 从 tip.argInfo.args.orderId 提取（蚂蚁森林能量等消息）
                            const tipOrderId = card?.tip?.argInfo?.args?.orderId
                            if (tipOrderId && /^\d{15,}$/.test(tipOrderId)) {
                                orderId = tipOrderId
                            }
                            // 从 main.targetUrl 提取 (fleamarket://order_detail?id=xxx)
                            if (!orderId) {
                                const mainTargetUrl = card?.dxCard?.item?.main?.targetUrl
                                if (mainTargetUrl) {
                                    const match = mainTargetUrl.match(/[?&]id=(\d{15,})/)
                                    if (match) orderId = match[1]
                                }
                            }
                            // 从 button targetUrl 提取 (orderId=xxx)
                            if (!orderId) {
                                const btnUrl = card?.dxCard?.item?.main?.exContent?.button?.targetUrl
                                if (btnUrl) {
                                    const match = btnUrl.match(/orderId=(\d{15,})|bizOrderId=(\d{15,})/)
                                    if (match) orderId = match[1] || match[2]
                                }
                            }
                            // 从 dynamicOperation.changeContent.dxCard 提取（已付款待发货等消息）
                            if (!orderId) {
                                const changeTargetUrl = card?.dynamicOperation?.changeContent?.dxCard?.item?.main?.targetUrl
                                if (changeTargetUrl) {
                                    const match = changeTargetUrl.match(/[?&]id=(\d{15,})/)
                                    if (match) orderId = match[1]
                                }
                            }
                            // 从 dynamicOperation.changeContent.dxCard.button 提取
                            if (!orderId) {
                                const changeBtnUrl = card?.dynamicOperation?.changeContent?.dxCard?.item?.main?.exContent?.button?.targetUrl
                                if (changeBtnUrl) {
                                    const match = changeBtnUrl.match(/[?&]id=(\d{15,})|orderId=(\d{15,})/)
                                    if (match) orderId = match[1] || match[2]
                                }
                            }
                        }
                    }
                }
            } catch {
                // 忽略解析失败
            }
        }

        const msgTime = createTime
            ? new Date(createTime).toLocaleString('zh-CN', { hour12: false })
            : new Date().toLocaleString('zh-CN', { hour12: false })

        // 解析结构化消息体（msg1.6.3），回填 contentType / extra
        // payload 判别以字段为准：image→图片(2)，itemCard→卡片(3)，audio→语音(4)，
        // locationCard→定位(5)，file→文件(6)
        // 注意：payload 自身的 contentType 数字与本项目的 contentType 语义不一致
        // （卡片 payload.contentType=7，语音 payload.contentType=3，定位=30，文件=33），不可作为判别依据
        let contentType: number | undefined
        let extra: Record<string, unknown> | undefined
        try {
            const msg6 = msg1['6'] || msg1[6]
            const msg63 = msg6?.['3'] || msg6?.[3]
            const payloadStr = msg63?.['5'] || msg63?.[5]
            if (typeof payloadStr === 'string' && payloadStr.trim() !== '') {
                const payload = JSON.parse(payloadStr)
                // 临时调试：payload 含 file 字段时打印完整结构
                if (payload?.file || payload?.contentType === 33) {
                    logger.info('[DEBUG] 文件消息 payload:', JSON.stringify(payload, null, 2))
                }
                if (payload?.image?.pics?.[0]?.url) {
                    const pic = payload.image.pics[0]
                    contentType = 2
                    extra = { url: pic.url, width: pic.width, height: pic.height }
                } else if (payload?.itemCard?.item) {
                    const item = payload.itemCard.item
                    contentType = 3
                    // 渲染端 price 前已带 ¥，剥离冗余前缀避免重复
                    const rawPrice = typeof item.price === 'string' ? item.price : String(item.price ?? '')
                    const price = rawPrice.replace(/^[¥￥]/, '').trim()
                    extra = { itemId: item.itemId, picUrl: item.mainPic, title: item.title, price }
                } else if (payload?.audio?.url) {
                    // 语音（AMR）：渲染端用 BenzAMRRecorder 解码播放
                    contentType = 4
                    extra = { url: payload.audio.url, duration: payload.audio.duration }
                } else if (payload?.locationCard) {
                    // 定位：content=详细地址，title=位置名，latitude/longitude=经纬度
                    contentType = 5
                    const lc = payload.locationCard
                    extra = {
                        address: lc.content || '',
                        title: lc.title || '',
                        latitude: lc.latitude || '',
                        longitude: lc.longitude || ''
                    }
                } else if (payload?.file) {
                    // 文件：fileKey=OSS 对象键（需鉴权下载），displayName=文件名，fileSize=字节，fileType=扩展名
                    contentType = 6
                    const f = payload.file
                    extra = { fileKey: f.fileKey || '', fileName: f.displayName || '', fileSize: f.fileSize || 0, fileType: f.fileType || '' }
                }
            }
        } catch {
            // 忽略解析失败，按文本消息处理
        }

        // 结构化消息兜底文案：reminderContent 偶尔为空，避免被空消息过滤丢弃
        if ((!content || content.trim() === '') && contentType) {
            content = contentType === 2 ? '[图片]'
                : contentType === 3 ? ((extra?.title as string) || '[链接]')
                : contentType === 4 ? '[语音]'
                : contentType === 5 ? ((extra?.address as string) || '[定位]')
                : contentType === 6 ? ((extra?.fileName as string) || '[文件]')
                : content
        }

        // 检查是否是订单状态消息
        const isOrderMessage = isOrderStatusMessage(content)

        // 自己发出的消息（senderId === myId）不再丢弃：
        // 闲鱼同会话不会回声本端发出的消息，这类消息来自用户在其它端（手机 App）的发送，
        // 需要作为"发出"消息记录到对话，保证聊天记录完整。接收器/后端会按 senderId 区分处理。

        // 过滤纯系统消息（不包含有用信息的）
        if (isSystemMessage(content)) {
            logger.debug(`[${msgTime}] 系统消息不处理: ${content}`)
            return null
        }

        // 过滤空消息
        if (!content || content.trim() === '') {
            logger.debug(`[${msgTime}] 忽略空消息`)
            return null
        }

        // 订单状态消息特殊日志
        if (isOrderMessage && orderId) {
            logger.info(`[${msgTime}] 订单状态消息 - 订单ID: ${orderId}, 状态: ${orderStatus || content}`)
        }

        return {
            senderId,
            senderName,
            msgTime,
            content,
            chatId,
            msgId,
            raw: message,
            orderId,
            orderStatus,
            isOrderMessage,
            itemId,
            contentType,
            extra
        }
    } catch (e) {
        logger.error(`提取聊天消息失败: ${e}`)
        return null
    }
}
