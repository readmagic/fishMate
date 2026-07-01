<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tooltip as ATooltip } from 'ant-design-vue'
import {
  DashboardOutlined,
  UserOutlined,
  ProfileOutlined,
  ShoppingCartOutlined,
  MessageOutlined,
  CloudUploadOutlined,
  ApartmentOutlined,
  RobotOutlined,
  FileTextOutlined,
  SettingOutlined
} from '@ant-design/icons-vue'
import logoUrl from '@/assets/logo.png'
import { usePushStore } from '@/core/stores/usePushStore'

const router = useRouter()
const route = useRoute()
const pushStore = usePushStore()

// 全局订阅对话消息（常驻，供图标条未读角标用；conversations 视图复用同一订阅）
onMounted(() => pushStore.subscribeConversations(20))
const unreadTotal = computed(() =>
  pushStore.conversations.reduce((s, c) => s + (c.unread || 0), 0)
)

interface MenuItem {
  key: string
  label: string
  icon: any
}

// 扁平化菜单（微信无分组），/setting 单独放底部
const flatItems: MenuItem[] = [
  { key: '/dashboard', label: '仪表盘', icon: DashboardOutlined },
  { key: '/accounts', label: '账号管理', icon: UserOutlined },
  { key: '/goods', label: '商品管理', icon: ProfileOutlined },
  { key: '/orders', label: '订单管理', icon: ShoppingCartOutlined },
  { key: '/conversations', label: '对话消息', icon: MessageOutlined },
  { key: '/autosell', label: '自动发货', icon: CloudUploadOutlined },
  { key: '/workflow', label: '发货流程', icon: ApartmentOutlined },
  { key: '/autoreply', label: '自动回复', icon: RobotOutlined },
  { key: '/logs', label: '系统日志', icon: FileTextOutlined }
]

// 组间分隔：仪表盘后(0) / 4个业务页后(4) / 3个机器人页后(7)
const separators = [0, 4, 7]

const activeKey = computed(() => route.path)

function isActive(key: string) {
  return activeKey.value === key || activeKey.value.startsWith(key + '/')
}

function go(key: string) {
  router.push(key)
}
</script>

<template>
  <nav class="wm-rail">
    <div class="wm-rail-logo">
      <img :src="logoUrl" alt="fishMate" />
    </div>
    <div class="wm-rail-items">
      <template v-for="(item, i) in flatItems" :key="item.key">
        <ATooltip :title="item.label" placement="right">
          <div class="wm-rail-item" :class="{ active: isActive(item.key) }" @click="go(item.key)">
            <component :is="item.icon" />
            <span v-if="item.key === '/conversations' && unreadTotal > 0" class="wm-rail-badge">
              {{ unreadTotal > 99 ? '99+' : unreadTotal }}
            </span>
          </div>
        </ATooltip>
        <div v-if="separators.includes(i)" class="wm-rail-sep" />
      </template>
    </div>
    <div class="wm-rail-bottom">
      <ATooltip title="系统设置" placement="right">
        <div class="wm-rail-item" :class="{ active: isActive('/setting') }" @click="go('/setting')">
          <SettingOutlined />
        </div>
      </ATooltip>
    </div>
  </nav>
</template>

<style scoped>
.wm-rail {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  width: var(--wm-rail-width);
  background: var(--wm-rail-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
}
.wm-rail-logo img {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  margin-bottom: 8px;
  object-fit: contain;
}
.wm-rail-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  overflow-y: auto;
}
.wm-rail-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wm-rail-icon);
  font-size: 20px;
  border-radius: 8px;
  cursor: pointer;
  margin: 2px 0;
  position: relative;
  transition: background 0.15s, color 0.15s;
}
.wm-rail-item:hover {
  background: var(--wm-rail-hover-bg);
  color: var(--wm-rail-icon-hover);
}
.wm-rail-item.active {
  background: var(--wm-rail-active-bg);
  color: var(--wm-rail-icon-hover);
}
.wm-rail-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--wm-primary);
  border-radius: 0 2px 2px 0;
}
.wm-rail-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #f5222d;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
  z-index: 2;
  box-sizing: border-box;
}
.wm-rail-sep {
  width: 28px;
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  margin: 6px 0;
}
.wm-rail-bottom {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wm-rail-items::-webkit-scrollbar {
  width: 0;
}
</style>
