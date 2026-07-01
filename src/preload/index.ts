import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),
  subscribe: (events: string[], params?: Record<string, unknown>): void => {
    ipcRenderer.send('push:subscribe', { events, params })
  },
  unsubscribe: (events: string[]): void => {
    ipcRenderer.send('push:unsubscribe', { events })
  },
  updateParams: (params: Record<string, unknown>): void => {
    ipcRenderer.send('push:updateParams', { params })
  },
  onPush: (cb: (payload: { event: string; data: unknown }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { event: string; data: unknown }) => cb(payload)
    ipcRenderer.on('push:event', listener)
    return () => ipcRenderer.off('push:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
