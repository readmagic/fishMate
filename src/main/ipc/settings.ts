import { ipcMain } from 'electron'
import { getStorageToken, saveStorageToken } from '../shared/db/index.js'

export function registerSettingsIPC() {
    ipcMain.handle('setting:storageToken:get', () => getStorageToken())
    ipcMain.handle('setting:storageToken:set', (_e, { token }: { token: string }) => {
        saveStorageToken(token)
        return { success: true }
    })
}
