/**
 * 图片 URL 规范化：协议相对(//)与 http: 统一转 https:。
 *
 * 打包后渲染层经 loadFile 以 file:// 加载，协议相对 URL(//img.alicdn.com/...)
 * 会被解析成 file://img.alicdn.com/... 导致图片加载失败；dev 下 origin 为
 * http://localhost 可正常解析。闲鱼/阿里系 CDN 头像与商品图普遍返回协议相对或
 * http URL，故在数据读边界统一转 https。
 */
export function normalizeImageUrl(url: string | null | undefined): string {
    if (!url) return ''
    const s = url.trim()
    if (!s) return ''
    if (s.startsWith('//')) return 'https:' + s
    if (s.startsWith('http://')) return 'https://' + s.slice(7)
    return s
}
