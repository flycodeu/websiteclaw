import {
  ProductCategory,
  PublishedShopDetail,
  PublishedShopDetailGroupResponse,
  PublishedShopDetailPage,
  PublishedShopProduct,
  PublishedShopProductPreview,
  ShopProductGroup,
  ShopProductGroupPage
} from "@shop-claw/shared/types";

const DEFAULT_GROUP_LIMIT = 8;
const MAX_GROUP_LIMIT = 24;

export const SHOP_PRODUCT_GROUPS: ShopProductGroup[] = ["IN_STOCK", "LOW_STOCK", "OFFLINE"];

interface ShopDetailPageOptions {
  category?: string | null;
  limit?: number;
}

interface ShopDetailGroupOptions extends ShopDetailPageOptions {
  cursor?: string | null;
  group: ShopProductGroup;
}

export function getShopDetailPage(detail: PublishedShopDetail, options: ShopDetailPageOptions = {}): PublishedShopDetailPage {
  const categories = getShopDetailCategories(detail);
  const activeCategory = readCategoryFilter(options.category, categories);
  const limit = readLimit(options.limit);
  const filteredProducts = getFilteredProducts(detail.products, activeCategory);

  return {
    shop: detail.shop,
    categories,
    activeCategory,
    groups: SHOP_PRODUCT_GROUPS.map((group) => getGroupPage(filteredProducts, group, 0, limit)),
    publishedAt: detail.publishedAt
  };
}

export function getShopDetailGroupResponse(
  detail: PublishedShopDetail,
  options: ShopDetailGroupOptions
): PublishedShopDetailGroupResponse {
  const categories = getShopDetailCategories(detail);
  const activeCategory = readCategoryFilter(options.category, categories);
  const cursor = readCursor(options.cursor);
  const limit = readLimit(options.limit);
  const filteredProducts = getFilteredProducts(detail.products, activeCategory);

  return {
    shop: detail.shop,
    categories,
    activeCategory,
    group: getGroupPage(filteredProducts, options.group, cursor, limit),
    publishedAt: detail.publishedAt
  };
}

export function readShopProductGroup(value: string | null | undefined) {
  return SHOP_PRODUCT_GROUPS.includes(value as ShopProductGroup) ? (value as ShopProductGroup) : null;
}

function getShopDetailCategories(detail: PublishedShopDetail) {
  return [...new Set(detail.products.map((product) => product.category))];
}

function getFilteredProducts(products: PublishedShopProduct[], activeCategory: ProductCategory | null) {
  return [...products]
    .filter((product) => !activeCategory || product.category === activeCategory)
    .sort((left, right) => {
      const datePriority = toTimestamp(right.current.updatedAt) - toTimestamp(left.current.updatedAt);
      if (datePriority !== 0) {
        return datePriority;
      }

      if (left.current.price === 0) {
        return 1;
      }

      if (right.current.price === 0) {
        return -1;
      }

      return left.current.price - right.current.price || left.current.rawName.localeCompare(right.current.rawName, "zh-CN");
    });
}

function getGroupPage(
  products: PublishedShopProduct[],
  group: ShopProductGroup,
  cursor: number,
  limit: number
): ShopProductGroupPage {
  const filtered = products.filter((product) => getShopProductGroup(product) === group);
  const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

  return {
    group,
    items: filtered.slice(cursor, cursor + limit).map(toProductPreview),
    nextCursor,
    total: filtered.length
  };
}

function getShopProductGroup(product: PublishedShopProduct): ShopProductGroup {
  if (!product.current.isDetected || product.current.stockStatus === "OUT_OF_STOCK") {
    return "OFFLINE";
  }

  if (product.current.stockStatus === "LOW_STOCK") {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
}

function toProductPreview(product: PublishedShopProduct): PublishedShopProductPreview {
  return {
    shopId: product.shopId,
    sourceId: product.sourceId,
    productKey: product.productKey,
    category: product.category,
    specLabel: product.specLabel,
    current: product.current,
    priceTrend: product.priceTrend,
    missingStreak: product.missingStreak,
    priceSampleCount: product.priceHistory.length
  };
}

function readCategoryFilter(category: string | null | undefined, categories: ProductCategory[]) {
  if (!category) {
    return null;
  }

  return categories.includes(category as ProductCategory) ? (category as ProductCategory) : null;
}

function readCursor(cursor: string | null | undefined) {
  const value = Number.parseInt(cursor ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readLimit(limit: number | undefined) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_GROUP_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_GROUP_LIMIT);
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
