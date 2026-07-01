import { ipcMain } from 'electron'
import {
    getAutoReplyRules,
    getAutoReplyRule,
    createAutoReplyRule,
    updateAutoReplyRule,
    deleteAutoReplyRule,
    toggleAutoReplyRule,
    getAISettings,
    saveAISettings
} from '../shared/db/index.js'
import { testAIConnection } from '../shared/services/index.js'
import { DEFAULT_PROMPT } from '../shared/core/default-prompt.js'

export function registerAutoReplyIPC() {
    // ===== AI 设置 =====
    ipcMain.handle('autoreply:ai:get', async () => {
        const settings = getAISettings()
        return {
            baseUrl: settings.baseUrl,
            apiKey: settings.apiKey ? '******' : '',
            hasApiKey: !!settings.apiKey,
            model: settings.model,
            systemPrompt: settings.systemPrompt
        }
    })

    ipcMain.handle('autoreply:ai:save', async (_e, body) => {
        const updates: any = {}
        if (body?.baseUrl !== undefined) updates.baseUrl = body.baseUrl
        if (body?.apiKey !== undefined && body.apiKey !== '******') updates.apiKey = body.apiKey
        if (body?.model !== undefined) updates.model = body.model
        if (body?.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt
        saveAISettings(updates)
        return { success: true }
    })

    ipcMain.handle('autoreply:ai:test', async () => {
        return await testAIConnection()
    })

    ipcMain.handle('autoreply:ai:defaultPrompt', async () => {
        return { prompt: DEFAULT_PROMPT }
    })

    // ===== 规则管理 =====
    ipcMain.handle('autoreply:list', async () => {
        const rules = getAutoReplyRules()
        return {
            rules: rules.map((r: any) => ({
                id: r.id,
                name: r.name,
                enabled: r.enabled === 1,
                priority: r.priority,
                matchType: r.match_type,
                matchPattern: r.match_pattern,
                replyContent: r.reply_content,
                accountId: r.account_id,
                excludeMatch: r.exclude_match === 1,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            }))
        }
    })

    ipcMain.handle('autoreply:get', async (_e, { id }) => {
        const rule = getAutoReplyRule(Number(id))
        if (!rule) return { error: 'Rule not found' }
        return {
            id: rule.id,
            name: rule.name,
            enabled: rule.enabled === 1,
            priority: rule.priority,
            matchType: rule.match_type,
            matchPattern: rule.match_pattern,
            replyContent: rule.reply_content,
            accountId: rule.account_id,
            excludeMatch: rule.exclude_match === 1,
            createdAt: rule.created_at,
            updatedAt: rule.updated_at
        }
    })

    ipcMain.handle('autoreply:create', async (_e, body) => {
        const { name, enabled, priority, matchType, matchPattern, replyContent, accountId, excludeMatch } = body || {}
        if (!name || !matchType) return { success: false, error: 'Missing required fields' }
        if (!excludeMatch && matchType !== 'ai' && (!matchPattern || !replyContent)) {
            return { success: false, error: 'Missing required fields' }
        }
        if (!['exact', 'contains', 'regex', 'ai'].includes(matchType)) {
            return { success: false, error: 'Invalid matchType' }
        }
        let finalReplyContent = replyContent || ''
        if (matchType === 'ai' && !finalReplyContent) {
            finalReplyContent = getAISettings().systemPrompt || ''
        }
        const id = createAutoReplyRule({
            name,
            enabled: enabled !== false,
            priority: priority || 0,
            matchType,
            matchPattern: matchPattern || '',
            replyContent: finalReplyContent,
            accountId: accountId || null,
            excludeMatch: excludeMatch || false
        })
        return { success: true, id }
    })

    ipcMain.handle('autoreply:update', async (_e, { id, ...body }) => {
        if (body.matchType && !['exact', 'contains', 'regex', 'ai'].includes(body.matchType)) {
            return { success: false, error: 'Invalid matchType' }
        }
        if (body.matchType === 'ai' && !body.replyContent) {
            body.replyContent = getAISettings().systemPrompt || ''
        }
        const success = updateAutoReplyRule(Number(id), body)
        return { success }
    })

    ipcMain.handle('autoreply:delete', async (_e, { id }) => {
        const success = deleteAutoReplyRule(Number(id))
        return { success }
    })

    ipcMain.handle('autoreply:toggle', async (_e, { id }) => {
        const success = toggleAutoReplyRule(Number(id))
        return { success }
    })
}
