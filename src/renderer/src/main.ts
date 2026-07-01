import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import '@/styles/theme.css'

import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/core/stores/useThemeStore'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Antd)

// 主题初始化（在挂载前应用，避免闪烁）
useThemeStore().init()

app.mount('#app')
