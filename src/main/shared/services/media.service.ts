/**
 * 媒体服务：上传图片到闲鱼 CDN
 * 移植自 goofish-cli commands/media/upload.py
 */

import fs from 'fs'
import { createLogger } from '../core/logger.js'
import { CookiesManager } from '../core/cookies.manager.js'

const logger = createLogger('Svc:Media')

const UPLOAD_URL = 'https://stream-upload.goofish.com/api/upload.api'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface UploadResult {
    url: string
    width: number
    height: number
    size: number
}

/**
 * 上传本地图片到闲鱼 CDN，返回 url + 尺寸
 */
export async function uploadImage(accountId: string, filePath: string): Promise<UploadResult | null> {
    const cookiesStr = CookiesManager.getCookies(accountId)
    if (!cookiesStr) {
        logger.error(`[${accountId}] 无法获取 cookies，无法上传图片`)
        return null
    }
    if (!fs.existsSync(filePath)) {
        logger.error(`图片不存在: ${filePath}`)
        return null
    }

    const fileName = filePath.split('/').pop() || 'image.png'
    const boundary = '----fishMate' + Math.floor(Date.now() * 1e6).toString(36)
    const fileBuf = fs.readFileSync(filePath)
    // 简单 MIME 推断
    const mime = fileName.toLowerCase().endsWith('.png') ? 'image/png'
        : fileName.toLowerCase().endsWith('.webp') ? 'image/webp'
        : 'image/jpeg'

    const body = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
            `Content-Type: ${mime}\r\n\r\n`
        ),
        fileBuf,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ])

    const url = `${UPLOAD_URL}?floderId=0&appkey=xy_chat&_input_charset=utf-8`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'origin': 'https://www.goofish.com',
                'referer': 'https://www.goofish.com/',
                'user-agent': UA,
                'cookie': cookiesStr,
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            body
        })
        CookiesManager.handleResponseCookies(accountId, res)
        const raw = await res.json() as any
        const obj = raw?.object || {}
        const pix = String(obj.pix || '0x0')
        let width = 0, height = 0
        const m = pix.match(/(\d+)x(\d+)/)
        if (m) { width = parseInt(m[1]); height = parseInt(m[2]) }
        if (!obj.url) {
            logger.error(`[${accountId}] 上传失败，响应: ${JSON.stringify(raw).substring(0, 200)}`)
            return null
        }
        logger.info(`[${accountId}] 图片上传成功: ${obj.url} (${width}x${height})`)
        return { url: obj.url, width, height, size: obj.size || 0 }
    } catch (e) {
        logger.error(`[${accountId}] 上传图片异常: ${e}`)
        return null
    }
}
