import { ipcMain } from 'electron'
import { getAllAccounts, getAccount } from '../shared/db/index.js'
import { fetchGoodsList } from '../shared/services/index.js'
import type { ClientManager } from '../shared/websocket/client.manager.js'

export function registerGoodsIPC(cm: ClientManager) {
    ipcMain.handle('goods:list', async (_e, { accountId, page = 1 }: { accountId?: string; page?: number }) => {
        if (accountId) {
            const account = getAccount(accountId)
            if (!account) return { error: 'Account not found' }
            const result = await fetchGoodsList(accountId, accountId, page)
            return {
                items: result.items.map((item: any) => ({ ...item, accountId })),
                nextPage: result.nextPage,
                totalCount: result.totalCount
            }
        }

        const accounts = getAllAccounts()
        const allItems: any[] = []
        let totalCount = 0
        for (const account of accounts) {
            const client = cm.getClient(account.id)
            if (!client || !client.isConnected()) continue
            const result = await fetchGoodsList(account.id, account.id, page)
            const itemsWithAccount = result.items.map((item: any) => ({
                ...item,
                accountId: account.id,
                accountNickname: account.nickname
            }))
            allItems.push(...itemsWithAccount)
            totalCount += result.totalCount
        }
        return { items: allItems, totalCount }
    })

    ipcMain.handle('goods:byAccount', async (_e, { id, page = 1 }: { id: string; page?: number }) => {
        const account = getAccount(id)
        if (!account) return { error: 'Account not found' }
        const result = await fetchGoodsList(id, id, page)
        return { items: result.items, nextPage: result.nextPage, totalCount: result.totalCount }
    })
}
