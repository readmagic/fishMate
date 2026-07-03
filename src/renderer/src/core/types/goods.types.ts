/**
 * 商品相关类型定义
 */

export interface GoodsItem {
    id: string;
    title: string;
    price: string;
    picUrl: string;
    picWidth: number;
    picHeight: number;
    categoryId: number;
    itemStatus: number;
    hasVideo: boolean;
    soldPrice?: string;
    postInfo?: string;
    accountId?: string;
    accountNickname?: string;
}

export interface GoodsListResponse {
    items: GoodsItem[];
    nextPage?: boolean;
    totalCount: number;
}

// 草稿商品图片（上传闲鱼 CDN 后拿到的 url + 尺寸）
export interface GoodsDraftImage {
    url: string;
    width: number;
    height: number;
}

// 类目信息（AI 识别接口返回的 catId/catName 等映射）
export interface CategoryInfo {
    catId: string;
    catName: string;
    channelCatId: string;
    tbCatId: string;
}

// 草稿商品（本地存储，未发布到闲鱼）
export interface GoodsDraft {
    id: string;
    accountId?: string;
    title: string;
    price: string;
    originalPrice?: string;
    picUrl: string;
    picWidth: number;
    picHeight: number;
    images: GoodsDraftImage[];
    categoryId: number;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateGoodsDraftParams {
    accountId?: string;
    title: string;
    price: string;
    originalPrice?: string;
    images: GoodsDraftImage[];
    categoryId?: number;
    description?: string;
}

export interface UpdateGoodsDraftParams {
    id: string;
    accountId?: string;
    title?: string;
    price?: string;
    originalPrice?: string;
    images?: GoodsDraftImage[];
    categoryId?: number;
    description?: string;
}
