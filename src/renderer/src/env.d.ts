/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'simple-mind-map'
declare module 'simple-mind-map/src/plugins/Drag.js'
declare module 'simple-mind-map/src/plugins/TouchEvent.js'
declare module 'simple-mind-map/src/plugins/Export.js'

interface Window {
  api: {
    invoke: (channel: string, payload?: unknown) => Promise<unknown>
    subscribe: (events: string[], params?: Record<string, unknown>) => void
    unsubscribe: (events: string[]) => void
    updateParams: (params: Record<string, unknown>) => void
    onPush: (cb: (payload: { event: string; data: unknown }) => void) => () => void
  }
}
