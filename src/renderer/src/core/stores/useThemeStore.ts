/**
 * 主题 store（替代 Angular ThemeService）
 *
 * localStorage + matchMedia + document.documentElement.setAttribute 逻辑原样复用。
 * AntDV 暗色联动由 App.vue 的 ConfigProvider 读取 isDark 完成。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme_mode'

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>(loadTheme())
  const isDark = ref(false)

  let mql: MediaQueryList | null = null

  function loadTheme(): ThemeMode {
    try {
      return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system'
    } catch {
      return 'system'
    }
  }

  function applyTheme() {
    const mode = themeMode.value
    const dark =
      mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : mode === 'dark'
    isDark.value = dark
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }

  function setTheme(mode: ThemeMode) {
    themeMode.value = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
    applyTheme()
  }

  function watchSystemTheme() {
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      if (themeMode.value === 'system') applyTheme()
    })
  }

  function init() {
    applyTheme()
    watchSystemTheme()
  }

  const isSystem = computed(() => themeMode.value === 'system')

  return { themeMode, isDark, isSystem, setTheme, init }
})
