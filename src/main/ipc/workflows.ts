import { ipcMain } from 'electron'
import {
    getWorkflows,
    getWorkflowById,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow
} from '../shared/db/index.js'

export function registerWorkflowIPC() {
    ipcMain.handle('workflow:list', async () => {
        return { workflows: getWorkflows() }
    })

    ipcMain.handle('workflow:get', async (_e, { id }) => {
        const workflow = getWorkflowById(Number(id))
        if (!workflow) return { error: '流程不存在' }
        return { workflow }
    })

    ipcMain.handle('workflow:create', async (_e, body) => {
        const { name, description, definition, isDefault } = body || {}
        if (!name || !definition) return { success: false, error: '缺少必要参数' }
        const id = createWorkflow({ name, description, definition, isDefault })
        return { success: true, id }
    })

    ipcMain.handle('workflow:update', async (_e, { id, ...body }) => {
        const success = updateWorkflow(Number(id), body)
        return { success }
    })

    ipcMain.handle('workflow:delete', async (_e, { id }) => {
        const success = deleteWorkflow(Number(id))
        return { success }
    })

    ipcMain.handle('workflow:setDefault', async (_e, { id }) => {
        const success = updateWorkflow(Number(id), { isDefault: true })
        return { success }
    })
}
