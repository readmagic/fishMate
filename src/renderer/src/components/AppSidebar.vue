<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const router = useRouter()
const route = useRoute()

interface MenuItem {
  key: string
  label: string
  icon: any
}

const groups: { items: MenuItem[] }[] = [
  {
    items: [{ key: '/dashboard', label: '仪表盘', icon: DashboardOutlined }]
  },
  {
    items: [
      { key: '/accounts', label: '账号管理', icon: UserOutlined },
      { key: '/goods', label: '商品管理', icon: ProfileOutlined },
      { key: '/orders', label: '订单管理', icon: ShoppingCartOutlined },
      { key: '/conversations', label: '对话消息', icon: MessageOutlined }
    ]
  },
  {
    items: [
      { key: '/autosell', label: '自动发货', icon: CloudUploadOutlined },
      { key: '/workflow', label: '发货流程', icon: ApartmentOutlined },
      { key: '/autoreply', label: '自动回复', icon: RobotOutlined }
    ]
  },
  {
    items: [
      { key: '/logs', label: '系统日志', icon: FileTextOutlined },
      { key: '/setting', label: '系统设置', icon: SettingOutlined }
    ]
  }
]

const selectedKeys = ref<string[]>([route.path])
watch(
  () => route.path,
  (p) => {
    selectedKeys.value = [p]
  }
)

const flatItems = computed(() => groups.flatMap((g) => g.items))

function onMenuClick({ key }: { key: string }) {
  router.push(key)
}
</script>

<template>
  <div class="sidebar-logo">
    <img :src="logoUrl" alt="logo" class="logo-icon" />
    <span v-show="!collapsed" class="logo-text">fishMate</span>
  </div>
  <a-menu
    v-model:selectedKeys="selectedKeys"
    mode="inline"
    theme="dark"
    :collapsed="collapsed"
    @click="onMenuClick"
  >
    <template v-for="(group, gi) in groups" :key="gi">
      <a-menu-item v-for="item in group.items" :key="item.key">
        <component :is="item.icon" />
        <span>{{ item.label }}</span>
      </a-menu-item>
      <a-menu-divider v-if="gi < groups.length - 1" />
    </template>
  </a-menu>
</template>

<style scoped>
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 20px;
  color: #fff;
  overflow: hidden;
}
.logo-icon {
  width: 28px;
  height: 28px;
}
.logo-text {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
:deep(.ant-menu) {
  border-inline-end: none !important;
}
</style>
