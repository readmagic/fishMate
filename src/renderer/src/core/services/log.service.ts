import { invoke } from '@/core/utils/ipc'
import type { LogFile, LogContentResponse } from '@/core/types'

export const logService = {
  getLogDates() {
    return invoke<{ dates: string[] }>('logs:dates')
  },
  getLogFiles(date: string) {
    return invoke<{ files: LogFile[] }>('logs:files', { date })
  },
  getLogContent(date: string, file: string, level?: string, limit = 500) {
    return invoke<LogContentResponse>('logs:content', { date, file, level, limit })
  },
  getCurrentLog(level?: string, limit = 100) {
    return invoke<LogContentResponse>('logs:current', { level, limit })
  }
}
