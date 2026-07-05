<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { App, message } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { goodsService, accountService } from '@/core/services'
import TwoPaneLayout from '@/components/TwoPaneLayout.vue'
import type { GoodsItem, Account, GoodsDraft, GoodsDraftImage } from '@/core/types'

// 闲鱼 SpBizType 类目枚举（文字↔数字固定映射，发布时直接用）
const CATEGORIES: { id: number; name: string }[] = [
  { id: 1, name: '手机' },
  { id: 2, name: '潮品' },
  { id: 3, name: '家电' },
  { id: 8, name: '乐器' },
  { id: 9, name: '3C数码' },
  { id: 16, name: '奢品' },
  { id: 17, name: '母婴' },
  { id: 18, name: '美妆个护' },
  { id: 19, name: '文玩/珠宝' },
  { id: 20, name: '游戏电玩' },
  { id: 21, name: '家居' },
  { id: 22, name: '虚拟游戏' },
  { id: 23, name: '租号' },
  { id: 24, name: '图书' },
  { id: 25, name: '卡券' },
  { id: 27, name: '食品' },
  { id: 28, name: '潮玩' },
  { id: 29, name: '二手车' },
  { id: 30, name: '宠植' },
  { id: 31, name: '工艺礼品' },
  { id: 33, name: '汽车服务' },
  { id: 99, name: '其他' }
]

const STORAGE_KEY_ACCOUNT = 'goofish_goods_filter_account'
const STORAGE_KEY_STATUS = 'goofish_goods_filter_status'

const goods = ref<GoodsItem[]>([])
const drafts = ref<GoodsDraft[]>([])
const accounts = ref<Account[]>([])
const selectedAccountId = ref(localStorage.getItem(STORAGE_KEY_ACCOUNT) || '')
const selectedStatus = ref<string>(localStorage.getItem(STORAGE_KEY_STATUS) || '')
const loading = ref(false)
const totalCount = ref(0)
const selectedGoodsId = ref<string | null>(null)

const { modal } = App.useApp()

// 草稿 id 以 'draft-' 前缀区分线上商品
const isDraft = (id: string) => id.startsWith('draft-')

const filteredGoods = computed(() => {
  if (selectedStatus.value === '') return goods.value
  return goods.value.filter((i) => i.itemStatus === Number(selectedStatus.value))
})

const selectedGoods = computed(() => goods.value.find((g) => g.id === selectedGoodsId.value) || null)
const selectedDraft = computed(() => {
  if (!selectedGoodsId.value || !isDraft(selectedGoodsId.value)) return null
  return drafts.value.find((d) => d.id === selectedGoodsId.value) || null
})

// 选中商品 → 注入账号 cookie 到 webview session → 加载 goofish 商品页
// 草稿不走 webview（由行点击直接打开编辑表单）
const webviewSrc = ref('')
const wvRef = ref<any>(null)
watch(selectedGoods, async (g) => {
  webviewSrc.value = ''
  if (!g || isDraft(g.id)) return
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
    const [res, draftList] = await Promise.all([
      goodsService.getGoods(selectedAccountId.value || undefined),
      goodsService.getDrafts(selectedAccountId.value || undefined)
    ])
    drafts.value = draftList
    // 草稿映射成 GoodsItem 形态（itemStatus=2），置顶展示
    const draftItems: GoodsItem[] = draftList.map((d) => ({
      id: d.id,
      title: d.title,
      price: d.price,
      picUrl: d.picUrl,
      picWidth: d.picWidth,
      picHeight: d.picHeight,
      categoryId: d.categoryId,
      itemStatus: 2,
      hasVideo: false,
      accountId: d.accountId
    }))
    goods.value = [...draftItems, ...res.items]
    totalCount.value = res.totalCount + draftItems.length
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
  return s === 0 ? '在售' : s === 1 ? '已下架' : s === 2 ? '草稿' : '未知'
}
function statusColor(s: number) {
  return s === 0 ? 'green' : s === 1 ? 'orange' : s === 2 ? 'blue' : 'default'
}
function categoryName(id: number | null | undefined) {
  if (!id) return '未分类'
  return CATEGORIES.find((c) => c.id === id)?.name || '未分类'
}
function accountName(id: string | undefined) {
  if (!id) return '未知'
  return accounts.value.find((a) => a.id === id)?.nickname || id
}

// ========== 草稿表单 ==========
interface DraftForm {
  id?: string
  accountId: string
  title: string
  price: number | null
  originalPrice: number | null
  categoryId: number | null
  images: GoodsDraftImage[]
  description: string
}
const draftModalVisible = ref(false)
const draftSaving = ref(false)
const draftUploading = ref(false)
const draftForm = ref<DraftForm>(emptyDraftForm())

function emptyDraftForm(): DraftForm {
  return {
    accountId: '',
    title: '',
    price: null,
    originalPrice: null,
    categoryId: null,
    images: [],
    description: ''
  }
}

function openDraftForm() {
  draftForm.value = { ...emptyDraftForm(), accountId: selectedAccountId.value || '' }
  draftModalVisible.value = true
}

function openDraftEdit(id: string) {
  const d = drafts.value.find((x) => x.id === id)
  if (!d) return
  draftForm.value = {
    id: d.id,
    accountId: d.accountId || '',
    title: d.title,
    price: Number(d.price) || null,
    originalPrice: d.originalPrice ? Number(d.originalPrice) : null,
    categoryId: d.categoryId || null,
    images: [...d.images],
    description: d.description || ''
  }
  draftModalVisible.value = true
}

function onRowClick(item: GoodsItem) {
  selectedGoodsId.value = item.id
}

async function onDraftUploadImages() {
  if (!draftForm.value.accountId) {
    message.warning('请先选择账号')
    return
  }
  draftUploading.value = true
  try {
    const res = await goodsService.uploadImages(draftForm.value.accountId)
    if (!res.success) {
      message.error(res.error || '上传失败')
      return
    }
    if (res.images.length) draftForm.value.images.push(...res.images)
  } catch (e) {
    message.error('上传失败')
  } finally {
    draftUploading.value = false
  }
}

function removeDraftImage(idx: number) {
  draftForm.value.images.splice(idx, 1)
}

async function onDraftSubmit() {
  const f = draftForm.value
  if (!f.accountId) { message.warning('请选择账号'); return }
  if (!f.title.trim()) { message.warning('请输入标题'); return }
  if (f.price == null || f.price < 0) { message.warning('请输入价格'); return }
  if (f.images.length === 0) { message.warning('请至少上传一张图片'); return }
  draftSaving.value = true
  try {
    const payload = {
      accountId: f.accountId,
      title: f.title.trim(),
      price: String(f.price),
      originalPrice: f.originalPrice != null ? String(f.originalPrice) : undefined,
      images: f.images,
      categoryId: f.categoryId ?? 0,
      description: f.description.trim() || undefined
    }
    if (f.id) {
      await goodsService.updateDraft({ id: f.id, ...JSON.parse(JSON.stringify(payload)) })
    } else {
      await goodsService.createDraft(JSON.parse(JSON.stringify(payload)))
    }
    message.success(f.id ? '已保存' : '已添加草稿')
    draftModalVisible.value = false
    await loadGoods()
  } catch (e: any) {
    message.error(`保存失败：${e?.message || e}`)
  } finally {
    draftSaving.value = false
  }
}

function onDraftDelete(item: GoodsItem) {
  modal.confirm({
    title: '删除草稿',
    content: `确定删除草稿「${item.title}」吗？此操作不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      try {
        const res = await goodsService.deleteDraft(item.id)
        if (res.success) {
          message.success('已删除')
          if (selectedGoodsId.value === item.id) selectedGoodsId.value = null
          await loadGoods()
        } else {
          message.error('删除失败')
        }
      } catch (e) {
        message.error('删除失败')
      }
    }
  })
}

// 右键菜单：草稿=上架/编辑/删除，线上商品=下架
function onContextClick(key: string, item: GoodsItem) {
  if (key === 'publish') onPublish(item)
  else if (key === 'delist') onDelist(item)
  else if (key === 'edit') openDraftEdit(item.id)
  else if (key === 'delete') onDraftDelete(item)
}

// 上架草稿：调用闲鱼发布 API
async function onPublish(item: GoodsItem) {
  if (!item.accountId) { message.error('未知账号'); return }
  modal.confirm({
    title: '上架商品',
    content: `确定上架「${item.title}」吗？`,
    onOk: async () => {
      try {
        const res = await goodsService.publishDraft(item.id)
        if (res.success) {
          message.success(`上架成功${res.itemId ? '，商品ID: ' + res.itemId : ''}`)
          webviewSrc.value = ''
          await loadGoods()
        } else {
          message.error(res.error || '上架失败')
        }
      } catch (e: any) {
        message.error(`上架失败：${e?.message || e}`)
      }
    }
  })
}

function onDelist(item: GoodsItem) {
  if (item.itemStatus === 1) {
    message.info('该商品已下架')
    return
  }
  if (!item.accountId) {
    message.error('未知账号，无法下架')
    return
  }
  modal.confirm({
    title: '下架商品',
    content: `确定下架「${item.title}」吗？下架后买家将看不到此商品。`,
    okType: 'danger',
    onOk: async () => {
      try {
        const res = await goodsService.delistGoods(item.accountId!, item.id)
        if (res.success) {
          message.success('已下架')
          await loadGoods()
        } else {
          message.error(res.error || '下架失败')
        }
      } catch (e) {
        message.error('下架失败')
      }
    }
  })
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
          <a-select-option value="2">草稿</a-select-option>
        </a-select>
        <a-button size="small" :loading="loading" @click="loadGoods">
          <template #icon><ReloadOutlined /></template>
        </a-button>
        <a-button size="small" type="primary" @click="openDraftForm">
          <template #icon><PlusOutlined /></template>
        </a-button>
      </div>
      <div class="list-meta">共 {{ totalCount }} 件商品</div>
      <div class="list-scroll">
        <a-spin :spinning="loading">
          <a-empty v-if="filteredGoods.length === 0" description="暂无商品" />
          <div v-else class="goods-list">
            <a-dropdown
              v-for="item in filteredGoods"
              :key="item.id"
              trigger="contextmenu"
            >
              <div
                class="goods-row"
                :class="{ active: selectedGoodsId === item.id }"
                @click="onRowClick(item)"
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
              <template #overlay>
                <a-menu @click="({ key }: { key: string }) => onContextClick(key, item)">
                  <template v-if="isDraft(item.id)">
                    <a-menu-item key="publish">上架</a-menu-item>
                    <a-menu-item key="edit">编辑</a-menu-item>
                    <a-menu-item key="delete" danger>删除</a-menu-item>
                  </template>
                  <template v-else>
                    <a-menu-item key="delist" :disabled="item.itemStatus === 1" danger>下架</a-menu-item>
                  </template>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </a-spin>
      </div>
    </template>

    <template #detail>
      <div v-if="selectedGoods && !isDraft(selectedGoods.id) && webviewSrc" class="detail-webview-wrap">
        <webview
          ref="wvRef"
          :src="webviewSrc"
          :key="selectedGoods.id"
          partition="persist:goofish"
          useragent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
          style="height: 100%"
          @dom-ready="onWebviewDomReady"
        />
      </div>
      <div v-else-if="selectedDraft" class="draft-detail">
        <div class="draft-detail-header">
          <a-tag color="blue">草稿</a-tag>
          <span class="draft-account">{{ accountName(selectedDraft.accountId) }}</span>
        </div>
        <div class="draft-detail-images">
          <div
            v-for="(img, idx) in selectedDraft.images"
            :key="img.url"
            class="draft-detail-img"
            :class="{ cover: idx === 0 }"
          >
            <img :src="img.url" :alt="`图片${idx + 1}`" />
            <span v-if="idx === 0" class="cover-badge">封面</span>
          </div>
          <div v-if="selectedDraft.images.length === 0" class="draft-detail-no-img">
            暂无图片
          </div>
        </div>
        <div class="draft-detail-info">
          <h3 class="draft-detail-title">{{ selectedDraft.title }}</h3>
          <div class="draft-detail-prices">
            <span class="draft-detail-price">¥{{ selectedDraft.price }}</span>
            <span v-if="selectedDraft.originalPrice" class="draft-detail-original">
              ¥{{ selectedDraft.originalPrice }}
            </span>
          </div>
          <div class="draft-detail-rows">
            <div class="draft-detail-row">
              <span class="draft-detail-label">类目</span>
              <span>{{ categoryName(selectedDraft.categoryId) }}</span>
            </div>
            <div v-if="selectedDraft.description" class="draft-detail-row">
              <span class="draft-detail-label">描述</span>
              <span class="draft-detail-desc">{{ selectedDraft.description }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty">
        <a-empty description="选择一个商品查看详情" />
      </div>
    </template>
  </TwoPaneLayout>

  <!-- 添加/编辑草稿商品表单 -->
  <a-modal
    v-model:open="draftModalVisible"
    :title="draftForm.id ? '编辑草稿' : '添加商品'"
    :confirm-loading="draftSaving"
    :ok-text="draftForm.id ? '保存' : '添加草稿'"
    :mask-closable="false"
    width="600px"
    class="draft-modal"
    @ok="onDraftSubmit"
  >
    <a-form layout="vertical" class="draft-form">
      <a-form-item label="账号" required>
        <a-select v-model:value="draftForm.accountId" placeholder="选择账号" show-search option-filter-prop="label">
          <a-select-option v-for="a in accounts" :key="a.id" :value="a.id" :label="a.nickname || a.id">
            {{ a.nickname || a.id }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="标题" required>
        <a-input v-model:value="draftForm.title" placeholder="商品标题" :maxlength="30" show-count />
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12">
          <a-form-item label="价格 (元)" required>
            <a-input-number
              v-model:value="draftForm.price"
              :min="0"
              :precision="2"
              :step="0.01"
              style="width: 100%"
              placeholder="0.00"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="原价 (元)">
            <a-input-number
              v-model:value="draftForm.originalPrice"
              :min="0"
              :precision="2"
              :step="0.01"
              style="width: 100%"
              placeholder="划线价，可选"
            />
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="类目">
        <a-select
          v-model:value="draftForm.categoryId"
          placeholder="选择类目"
          allow-clear
          show-search
          option-filter-prop="label"
        >
          <a-select-option v-for="c in CATEGORIES" :key="c.id" :value="c.id" :label="c.name">
            {{ c.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="图片">
        <div class="draft-images">
          <div
            v-for="(img, idx) in draftForm.images"
            :key="img.url"
            class="draft-img-item"
          >
            <img :src="img.url" :alt="`图片${idx + 1}`" />
            <span v-if="idx === 0" class="cover-badge">封面</span>
            <button class="del-img" @click="removeDraftImage(idx)">×</button>
          </div>
          <a-button
            class="draft-img-add"
            :loading="draftUploading"
            :disabled="!draftForm.accountId"
            @click="onDraftUploadImages"
          >
            + 添加图片
          </a-button>
        </div>
        <p class="draft-hint">第一张为封面。需先选账号才能上传。</p>
      </a-form-item>
      <a-form-item label="描述">
        <a-textarea
          v-model:value="draftForm.description"
          :rows="4"
          :maxlength="500"
          show-count
          placeholder="商品描述（可选）"
        />
      </a-form-item>
    </a-form>
  </a-modal>
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

/* 草稿表单图片区 */
.draft-form :deep(.ant-form-item) {
  margin-bottom: 14px;
}
.draft-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.draft-img-item,
.draft-img-add {
  width: 72px;
  height: 72px;
  border-radius: 6px;
}
.draft-img-item {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--wm-border, #eee);
}
.draft-img-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background: rgba(22, 119, 255, 0.85);
}
.del-img {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.del-img:hover {
  background: rgba(245, 34, 45, 0.85);
}
.draft-img-add {
  border: 1px dashed var(--wm-border, #d9d9d9);
  background: var(--wm-list-hover, #fafafa);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--wm-text-secondary, #666);
  white-space: normal;
  line-height: 1.2;
  font-size: 12px;
}
.draft-img-add:hover:not(:disabled) {
  border-color: #1677ff;
  color: #1677ff;
}
.draft-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--wm-text-secondary, #999);
}

/* 草稿详情面板 */
.draft-detail {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.draft-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.draft-account {
  font-size: 13px;
  color: var(--wm-text-secondary);
}
.draft-detail-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.draft-detail-img {
  width: 100px;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--wm-border, #eee);
}
.draft-detail-img.cover {
  width: 160px;
  height: 160px;
}
.draft-detail-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.draft-detail-no-img {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wm-text-secondary);
  font-size: 13px;
  border: 1px dashed var(--wm-border, #d9d9d9);
  border-radius: 6px;
}
.draft-detail-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.draft-detail-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--wm-text);
  line-height: 1.5;
}
.draft-detail-prices {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.draft-detail-price {
  font-size: 22px;
  font-weight: 700;
  color: #f5222d;
}
.draft-detail-original {
  font-size: 14px;
  color: var(--wm-text-secondary);
  text-decoration: line-through;
}
.draft-detail-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.draft-detail-row {
  display: flex;
  font-size: 13px;
  line-height: 1.6;
  color: var(--wm-text);
}
.draft-detail-label {
  width: 48px;
  flex-shrink: 0;
  color: var(--wm-text-secondary);
}
.draft-detail-desc {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
