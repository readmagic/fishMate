<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { goodsService, accountService } from '@/core/services'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { GoodsItem, Account } from '@/core/types'

const STORAGE_KEY_ACCOUNT = 'goofish_goods_filter_account'
const STORAGE_KEY_STATUS = 'goofish_goods_filter_status'

const goods = ref<GoodsItem[]>([])
const accounts = ref<Account[]>([])
const selectedAccountId = ref(localStorage.getItem(STORAGE_KEY_ACCOUNT) || '')
const selectedStatus = ref<string>(localStorage.getItem(STORAGE_KEY_STATUS) || '')
const loading = ref(false)
const totalCount = ref(0)
const selectedGoodsId = ref<string | null>(null)

const filteredGoods = computed(() => {
  if (selectedStatus.value === '') return goods.value
  return goods.value.filter((i) => i.itemStatus === Number(selectedStatus.value))
})

const selectedGoods = computed(() => goods.value.find((g) => g.id === selectedGoodsId.value) || null)

// 选中商品 → 注入账号 cookie 到 webview session → 加载 goofish 商品页
const webviewSrc = ref('')
const wvRef = ref<any>(null)
watch(selectedGoods, async (g) => {
  webviewSrc.value = ''
  if (!g) return
  if (g.accountId) {
    try { await goodsService.injectCookies(g.accountId) } catch { /* ignore */ }
  }
  webviewSrc.value = `https://www.goofish.com/item?id=${g.id}`
})

// 反检测脚本：伪造 navigator 全套属性 + window.chrome + WebGL 指纹，规避闲鱼滑动验证
const STEALTH_JS = `(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en'], configurable: true });
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const a = [
          { name:'PDF Viewer', filename:'internal-pdf-viewer', description:'Portable Document Format' },
          { name:'Chrome PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'Chromium PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'Microsoft Edge PDF Viewer', filename:'internal-pdf-viewer', description:'' },
          { name:'WebKit built-in PDF', filename:'internal-pdf-viewer', description:'' }
        ];
        a.item = (i) => a[i] || null;
        a.namedItem = (n) => a.find(p => p.name === n) || null;
        a.refresh = () => {};
        return a;
      },
      configurable: true
    });
    window.chrome = window.chrome || {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.app) window.chrome.app = { isInstalled:false, getDetails:()=>null, getIsInstalled:()=>false };
    if (!window.chrome.csi) window.chrome.csi = () => ({});
    if (!window.chrome.loadTimes) window.chrome.loadTimes = () => ({});
    const GP = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p){
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
      return GP.call(this, p);
    };
    if (window.WebGL2RenderingContext) {
      const GP2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(p){
        if (p === 37445) return 'Intel Inc.';
        if (p === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
        return GP2.call(this, p);
      };
    }
    if (window.navigator.permissions) {
      const oq = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : oq(params);
    }
  } catch (e) {}
})();`

// 清理闲鱼商品页干扰元素：class 含 surveyWrap（问卷弹层）或 sidebar-container（右侧侧栏）
const CLEANUP_JS = `(() => {
  const SEL = '[class*="surveyWrap"], [class*="sidebar-container"]';
  const sweep = () => document.querySelectorAll(SEL).forEach(el => el.remove());
  sweep();
  try {
    const mo = new MutationObserver(() => sweep());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();`

function onWebviewDomReady() {
  try { wvRef.value?.executeJavaScript(`${STEALTH_JS}\n${CLEANUP_JS}`, true) } catch { /* ignore */ }
}

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
    if (selectedGoodsId.value && !goods.value.some((g) => g.id === selectedGoodsId.value)) {
      selectedGoodsId.value = null
    }
  } catch (e) {
    console.error('加载商品列表失败', e)
  } finally {
    loading.value = false
  }
}

function onAccountChange(v: string) {
  selectedAccountId.value = v
  localStorage.setItem(STORAGE_KEY_ACCOUNT, v)
  selectedGoodsId.value = null
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
  <TwoPaneLayout :list-width="320">
    <template #list>
      <div class="list-header">
        <a-select v-model:value="selectedAccountId" style="width: 120px" @change="onAccountChange">
          <a-select-option value="">全部账号</a-select-option>
          <a-select-option v-for="a in accounts" :key="a.id" :value="a.id">
            {{ a.nickname || a.id }}
          </a-select-option>
        </a-select>
        <a-select v-model:value="selectedStatus" style="width: 100px" @change="onStatusChange">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="0">在售</a-select-option>
          <a-select-option value="1">已下架</a-select-option>
        </a-select>
        <a-button size="small" :loading="loading" @click="loadGoods">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </div>
      <div class="list-meta">共 {{ totalCount }} 件商品</div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="filteredGoods.length === 0" description="暂无商品" />
          <div v-else class="goods-list">
            <div
              v-for="item in filteredGoods"
              :key="item.id"
              class="goods-row"
              :class="{ active: selectedGoodsId === item.id }"
              @click="selectedGoodsId = item.id"
            >
              <div class="thumb-wrap">
                <img :src="item.picUrl" :alt="item.title" class="thumb" loading="lazy" />
                <a-tag v-if="item.hasVideo" class="badge-video">视频</a-tag>
              </div>
              <div class="row-meta">
                <p class="row-title" :title="item.title">{{ item.title }}</p>
                <div class="row-bottom">
                  <span class="price">¥{{ item.price }}</span>
                  <a-tag :color="statusColor(item.itemStatus)" class="status-tag">
                    {{ statusText(item.itemStatus) }}
                  </a-tag>
                </div>
              </div>
            </div>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="selectedGoods" class="detail-webview-wrap">
        <webview
          v-if="webviewSrc"
          ref="wvRef"
          :src="webviewSrc"
          :key="selectedGoods.id"
          partition="persist:goofish"
          useragent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
          style="height: 100%"
          @dom-ready="onWebviewDomReady"
        />
        <div v-else class="detail-loading"><a-spin /></div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个商品查看详情" />
      </div>
    </template>
  </TwoPaneLayout>
</template>

<style scoped>
.list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.list-meta {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--wm-text-secondary);
  border-bottom: 1px solid var(--wm-border);
  flex-shrink: 0;
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.goods-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.goods-row {
  display: flex;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 6px;
}
.goods-row:hover {
  background: var(--wm-list-hover);
}
.goods-row.active {
  background: var(--wm-list-active);
}
.thumb-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}
.badge-video {
  position: absolute;
  top: 2px;
  left: 2px;
  margin: 0;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
}
.row-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.row-title {
  font-size: 13px;
  margin: 0;
  color: var(--wm-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.price {
  color: #f5222d;
  font-size: 14px;
  font-weight: 700;
}
.status-tag {
  margin: 0;
}

.detail-webview-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}
.detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
