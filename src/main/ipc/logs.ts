import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDataDir } from '../shared/core/paths.js'

// 延迟计算：模块加载早于 bootstrap 设置 GOOFISH_DATA_DIR，必须函数式取值
const logsDir = () => path.join(getDataDir(), 'logs')

export function registerLogIPC() {
    ipcMain.handle('logs:dates', async () => {
        try {
            const dir = logsDir()
            if (!fs.existsSync(dir)) return { dates: [] }
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            const dates = entries
                .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
                .map((e) => e.name)
                .sort((a, b) => b.localeCompare(a))
            return { dates }
        } catch {
            return { error: '获取日志日期失败' }
        }
    })

    ipcMain.handle('logs:files', async (_e, { date }) => {
        try {
            const dayDir = path.join(logsDir(), date)
            if (!fs.existsSync(dayDir)) return { files: [] }
            const files = fs
                .readdirSync(dayDir)
                .filter((f) => f.endsWith('.log'))
                .map((f) => {
                    const stat = fs.statSync(path.join(dayDir, f))
                    return { name: f, size: stat.size, mtime: stat.mtimeMs }
                })
                .sort((a, b) => b.mtime - a.mtime)
            return { files }
        } catch {
            return { error: '获取日志文件列表失败' }
        }
    })

    ipcMain.handle('logs:content', async (_e, { date, file, level, limit = 500 }) => {
        try {
            const filePath = path.join(logsDir(), date, file)
            if (!fs.existsSync(filePath)) return { error: '日志文件不存在' }
            const content = fs.readFileSync(filePath, 'utf-8')
            let lines = content.split('\n').filter((l) => l.trim())
            if (level && level !== 'ALL') {
                lines = lines.filter((l) => l.includes(`| ${level} `))
            }
            const maxLines = Number(limit) || 500
            const total = lines.length
            lines = lines.slice(-maxLines)
            return { lines, total, filtered: total > maxLines }
        } catch {
            return { error: '读取日志文件失败' }
        }
    })

    ipcMain.handle('logs:current', async (_e, { level, limit = 100 } = {}) => {
        try {
            const root = logsDir()
            if (!fs.existsSync(root)) return { lines: [], total: 0, file: null }
            // 日期目录按新→旧排序，取第一个含 .log 文件的（兼容跨午夜：今天还没日志则回退到昨天）
            const dateDirs = fs.readdirSync(root, { withFileTypes: true })
                .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
                .map((e) => e.name)
                .sort((a, b) => b.localeCompare(a))
            let targetDate: string | null = null
            let latestFile: string | null = null
            for (const d of dateDirs) {
                const dayDir = path.join(root, d)
                const files = fs
                    .readdirSync(dayDir)
                    .filter((f) => f.endsWith('.log'))
                    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dayDir, f)).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime)
                if (files.length > 0) {
                    targetDate = d
                    latestFile = files[0].name
                    break
                }
            }
            if (!targetDate || !latestFile) return { lines: [], total: 0, file: null }
            const filePath = path.join(root, targetDate, latestFile)
            const content = fs.readFileSync(filePath, 'utf-8')
            let lines = content.split('\n').filter((l) => l.trim())
            if (level && level !== 'ALL') {
                lines = lines.filter((l) => l.includes(`| ${level} `))
            }
            const maxLines = Number(limit) || 100
            const total = lines.length
            lines = lines.slice(-maxLines)
            return { lines, total, file: latestFile, date: targetDate }
        } catch {
            return { error: '读取当前日志失败' }
        }
    })
}
