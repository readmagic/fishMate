// WebSocket 配置
export const WS_CONFIG = {
    URL: 'wss://wss-goofish.dingtalk.com/',
    HEARTBEAT_INTERVAL: 15,      // 心跳间隔（秒）
    HEARTBEAT_TIMEOUT: 30,       // 心跳超时（秒）
    TOKEN_REFRESH_INTERVAL: 3600,  // Token刷新间隔（秒）- 1小时
    TOKEN_RETRY_INTERVAL: 300,     // Token刷新失败重试间隔（秒）- 5分钟
    MAX_RECONNECT_ATTEMPTS: 5,   // 最大重连次数
    RECONNECT_DELAY: 5000,       // 重连延迟（毫秒）
    APP_KEY: '444e9908a51d1cb236a27862abc769c9',
    SIGN_APP_KEY: '34839810'
}

// API 配置
export const API_CONFIG = {
    BASE_URL: 'https://h5api.m.goofish.com/h5',
    VERSION: '1.0'
}

// API 方法
export const API_METHODS = {
    TOKEN: 'mtop.taobao.idlemessage.pc.login.token',
    USER_INFO: 'mtop.idle.web.user.page.nav',
    LOGIN_USER: 'mtop.taobao.idlemessage.pc.loginuser.get',
    ITEM_LIST: 'mtop.idle.web.xyh.item.list',
    USER_HEAD: 'mtop.idle.web.user.page.head',
    HAS_LOGIN: 'newlogin/hasLogin.do',
    ORDER_DETAIL: 'mtop.idle.web.trade.order.detail',
    CONFIRM_SHIPMENT: 'mtop.taobao.idle.logistic.consign.dummy',
    FREE_SHIPPING: 'mtop.idle.groupon.activity.seller.freeshipping',
    ITEM_DELETE: 'com.taobao.idle.item.delete',
    ITEM_PUBLISH: 'mtop.idle.pc.idleitem.publish',
    LOCATION_GET: 'mtop.taobao.idle.local.poi.get',
    CATEGORY_RECOMMEND: 'mtop.taobao.idle.kgraph.property.recommend'
}

// Passport API 配置
export const PASSPORT_CONFIG = {
    BASE_URL: 'https://passport.goofish.com'
}

// 构建完整 API URL
export function buildApiUrl(method: string, version = API_CONFIG.VERSION): string {
    return `${API_CONFIG.BASE_URL}/${method}/${version}/`
}

// API 端点（兼容旧代码）
export const API_ENDPOINTS = {
    TOKEN: buildApiUrl(API_METHODS.TOKEN),
    USER_INFO: buildApiUrl(API_METHODS.USER_INFO),
    LOGIN_USER: buildApiUrl(API_METHODS.LOGIN_USER),
    ITEM_LIST: buildApiUrl(API_METHODS.ITEM_LIST),
    USER_HEAD: buildApiUrl(API_METHODS.USER_HEAD),
    ORDER_DETAIL: buildApiUrl(API_METHODS.ORDER_DETAIL),
    CONFIRM_SHIPMENT: buildApiUrl(API_METHODS.CONFIRM_SHIPMENT),
    FREE_SHIPPING: buildApiUrl(API_METHODS.FREE_SHIPPING),
    // 下架接口版本为 1.1
    ITEM_DELETE: buildApiUrl(API_METHODS.ITEM_DELETE, '1.1'),
    // 发布商品版本为 1.0
    ITEM_PUBLISH: buildApiUrl(API_METHODS.ITEM_PUBLISH, '1.0'),
    // 获取默认地址版本为 1.0
    LOCATION_GET: buildApiUrl(API_METHODS.LOCATION_GET, '1.0'),
    // 类目识别接口版本为 2.0
    CATEGORY_RECOMMEND: buildApiUrl(API_METHODS.CATEGORY_RECOMMEND, '2.0')
}

// WebSocket 请求头
export const WS_HEADERS = {
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'Upgrade',
    'Host': 'wss-goofish.dingtalk.com',
    'Origin': 'https://www.goofish.com',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

// 日志配置
export const LOG_CONFIG = {
    LEVEL: 'INFO' as const,
    RETENTION_DAYS: 7
}

// 环境配置：以 app.isPackaged 为权威信号（原 NODE_ENV/ELECTRON_RUN 启发式在打包后误判为 dev）
import { app } from 'electron'
export const ENV = {
    IS_DEV: !app.isPackaged
}

// 数据库配置
export const DB_CONFIG = {
    PATH: 'data/fishMate.db'
}
