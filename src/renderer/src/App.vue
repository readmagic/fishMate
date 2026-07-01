<script setup lang="ts">
import { computed } from 'vue'
import { ConfigProvider, theme as antdTheme } from 'ant-design-vue'
import { useThemeStore } from '@/core/stores/useThemeStore'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
const themeConfig = computed(() => ({
  algorithm: isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: { colorPrimary: '#07c160' }
}))
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <RouterView />
  </ConfigProvider>
</template>
