/**
 * 渲染层 → 主进程 IPC 调用封装
 *
 * 各 service 用 invoke('domain:action', payload) 取代原 http.get/post。
 */
export const invoke = (channel: string, payload?: unknown): Promise<any> =>
  (window as unknown as { api: { invoke: (ch: string, p?: unknown) => Promise<any> } }).api.invoke(channel, payload)
