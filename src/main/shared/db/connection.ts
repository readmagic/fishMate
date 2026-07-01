/**
 * 数据库连接管理
 *
 * 惰性初始化：db 在 initDatabase()（GOOFISH_DATA_DIR 已设置后）才打开，
 * 避免模块加载时 env 未就绪导致落到 process.cwd()。
 */
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

import { DB_CONFIG } from '../core/constants.js'
import { getDataDir } from '../core/paths.js'
import { createLogger } from '../core/logger.js'

const logger = createLogger('Db')

export let db: DatabaseType
let dbPath = ''

export function openDatabase(): void {
    const dataDir = getDataDir()
    const dbDir = path.join(dataDir, 'data')
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
    }
    dbPath = path.join(dataDir, DB_CONFIG.PATH)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    logger.info(`初始化数据库: ${dbPath}`)
}

export function closeDatabase(): void {
    if (db) {
        db.close()
        logger.info('数据库连接已关闭')
    }
}

export function getDbPath(): string {
    return dbPath
}
