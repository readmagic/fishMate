<script setup lang="ts">
import { ConfigProvider, theme as antdTheme, App as AApp } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'

// 单一默认浅色主题（不切换）
const themeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: { colorPrimary: '#07c160' }
}

// 全局中文化：覆盖 antd 默认的"确定"为"确认"，统一弹框按钮文案
const locale = {
  ...zhCN,
  Modal: { ...zhCN.Modal, okText: '确认', cancelText: '取消' },
  Popconfirm: { ...zhCN.Popconfirm, okText: '确认', cancelText: '取消' }
}
</script>

<template>
  <ConfigProvider :locale="locale" :theme="themeConfig">
    <AApp>
      <RouterView />
    </AApp>
  </ConfigProvider>
</template>
