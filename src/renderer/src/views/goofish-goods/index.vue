<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ReloadOutlined, LinkOutlined } from '@ant-design/icons-vue'
import { goodsService, accountService } from '@/core/services'
import type { GoodsItem, Account } from '@/core/types'

const STORAGE_KEY_ACCOUNT = 'goofish_goods_filter_account'
const STORAGE_KEY_STATUS = 'goofish_goods_filter_status'

const goods = ref<GoodsItem[]>([])
const accounts = ref<Account[]>([])
const selectedAccountId = ref(localStorage.getItem(STORAGE_KEY_ACCOUNT) || '')
const selectedStatus = ref<string>(localStorage.getItem(STORAGE_KEY_STATUS) || '')
const loading = ref(false)
const totalCount = ref(0)

const filteredGoods = computed(() => {
  if (selectedStatus.value === '') return goods.value
  return goods.value.filter((i) => i.itemStatus === Number(selectedStatus.value))
})

async function loadAccounts() {
  try {
    const res = await accountService.getAccounts()
    accounts.value = res.accounts
  } catch (e) {
    console.error('加载账号列表失败', e)
  }
}

async function loadGoods() {
  loading.value = true
  try {
    const res = await goodsService.getGoods(selectedAccountId.value || undefined)
    goods.value = res.items
    totalCount.value = res.totalCount
  } catch (e) {
    console.error('加载商品列表失败', e)
  } finally {
    loading.value = false
  }
}

function onAccountChange(v: string) {
  selectedAccountId.value = v
  localStorage.setItem(STORAGE_KEY_ACCOUNT, v)
  loadGoods()
}
function onStatusChange(v: string) {
  selectedStatus.value = v
  localStorage.setItem(STORAGE_KEY_STATUS, v)
}

function statusText(s: number) {
  return s === 0 ? '在售' : s === 1 ? '已下架' : '未知'
}
function statusColor(s: number) {
  return s === 0 ? 'green' : s === 1 ? 'orange' : 'default'
}

onMounted(() => {
  loadAccounts()
  loadGoods()
})
</script>

<template>
  <a-card class="filter-bar">
    <a-space wrap>
      <span class="filter-label">账号筛选：</span>
      <a-select
        v-model:value="selectedAccountId"
        style="width: 200px"
        @change="onAccountChange"
      >
        <a-select-option value="">全部账号</a-select-option>
        <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
          {{ a.nickname || a.id }}
        </a-select-option>
      </a-select>
      <span class="filter-label">状态筛选：</span>
      <a-select v-model:value="selectedStatus" style="width: 140px" @change="onStatusChange">
        <a-select-option value="">全部状态</a-select-option>
        <a-select-option value="0">在售</a-select-option>
        <a-select-option value="1">已下架</a-select-option>
      </a-select>
      <a-button :loading="loading" @click="loadGoods">
        <template #icon><ReloadOutlined /></template>
        刷新
      </a-button>
      <span class="total-text">共 {{ totalCount }} 件商品</span>
    </a-space>
  </a-card>

  <a-spin :spinning="loading" class="goods-spin">
    <a-empty v-if="filteredGoods.length === 0" description="暂无商品" class="empty-state" />
    <a-row v-else :gutter="[16, 16]" class="goods-grid">
      <a-col v-for="item in filteredGoods" :key="item.id" :xs="12" :sm="8" :md="6" :lg="4" :xl="4">
        <a-card hoverable :body-style="{ padding: 12 }">
          <template #cover>
            <div class="cover-wrap">
              <img :src="item.picUrl" :alt="item.title" class="cover-img" loading="lazy" />
              <a-tag v-if="item.hasVideo" class="badge-video">视频</a-tag>
              <a-tag :color="statusColor(item.itemStatus)" class="badge-status">
                {{ statusText(item.itemStatus) }}
              </a-tag>
            </div>
          </template>
          <p class="goods-title" :title="item.title">{{ item.title }}</p>
          <div class="goods-price-row">
            <span class="price">¥{{ item.price }}</span>
            <span v-if="item.postInfo" class="post">{{ item.postInfo }}</span>
          </div>
          <p v-if="item.accountNickname" class="account-name">{{ item.accountNickname }}</p>
          <a-button
            type="primary"
            size="small"
            block
            ghost
            :href="`https://www.goofish.com/item?id=${item.id}`"
            target="_blank"
          >
            <template #icon><LinkOutlined /></template>
            浏览商品
          </a-button>
        </a-card>
      </a-col>
    </a-row>
  </a-spin>
</template>

<style scoped>
.filter-bar {
  margin-bottom: 16px;
}
.filter-label {
  color: rgba(0, 0, 0, 0.55);
}
.total-text {
  margin-left: auto;
  color: rgba(0, 0, 0, 0.55);
}
.goods-grid {
  margin-top: 4px;
}
.empty-state {
  padding: 64px 0;
}
.cover-wrap {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.badge-video {
  position: absolute;
  top: 8px;
  left: 8px;
  margin: 0;
}
.badge-status {
  position: absolute;
  top: 8px;
  right: 8px;
  margin: 0;
}
.goods-title {
  font-size: 13px;
  line-height: 1.4;
  height: 38px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 0 0 8px;
}
.goods-price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.price {
  color: #f5222d;
  font-size: 16px;
  font-weight: 700;
}
.post {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.account-name {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0 8px;
}
</style>
