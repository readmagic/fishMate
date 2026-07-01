import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/403', component: () => import('@/views/error/403.vue'), meta: { title: '无权限' } },
  { path: '/404', component: () => import('@/views/error/404.vue'), meta: { title: '页面不存在' } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: () => import('@/views/system-dashboard/index.vue'),
        meta: { title: '仪表盘' }
      },
      {
        path: 'accounts',
        component: () => import('@/views/goofish-accounts/index.vue'),
        meta: { title: '账号管理' }
      },
      {
        path: 'goods',
        component: () => import('@/views/goofish-goods/index.vue'),
        meta: { title: '商品管理' }
      },
      {
        path: 'orders',
        component: () => import('@/views/goofish-orders/index.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'conversations',
        component: () => import('@/views/goofish-conversations/index.vue'),
        meta: { title: '对话消息' }
      },
      {
        path: 'autoreply',
        component: () => import('@/views/bot-autoreply/index.vue'),
        meta: { title: '自动回复' }
      },
      {
        path: 'autosell',
        component: () => import('@/views/bot-autosell/index.vue'),
        meta: { title: '自动发货' }
      },
      {
        path: 'workflow',
        component: () => import('@/views/bot-workflow/index.vue'),
        meta: { title: '发货流程' }
      },
      {
        path: 'logs',
        component: () => import('@/views/system-logs/index.vue'),
        meta: { title: '系统日志' }
      },
      {
        path: 'setting',
        component: () => import('@/views/system-setting/index.vue'),
        meta: { title: '系统设置' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/404' }
]

// hash 路由：打包后经 loadFile(file://) 加载，history 模式会把文件路径当路由解析
// 命中通配规则重定向到 /404；hash 模式 (#/dashboard) 不依赖服务端, dev/prod 通用
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
