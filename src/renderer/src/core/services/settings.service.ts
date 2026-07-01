import { invoke } from '@/core/utils/ipc'

export interface AISettings {
  baseUrl: string
  apiKey: string
  hasApiKey: boolean
  model: string
  systemPrompt: string
}

export const settingsService = {
  getAISettings() {
    return invoke<AISettings>('autoreply:ai:get')
  },
  saveAISettings(settings: Partial<AISettings>) {
    return invoke<{ success: boolean }>('autoreply:ai:save', settings)
  },
  testAIConnection() {
    return invoke<{ success: boolean; error?: string }>('autoreply:ai:test')
  },
  getDefaultPrompt() {
    return invoke<{ prompt: string }>('autoreply:ai:defaultPrompt')
  }
}
