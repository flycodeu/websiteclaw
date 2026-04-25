import { productCategoryLabels } from "@shop-claw/shared/labels";
import { ProductCategory, PublishedData, StockStatus } from "@shop-claw/shared/types";

const categoryOrder = Object.keys(productCategoryLabels) as ProductCategory[];
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

export interface ProductFeedItem {
  id: string;
  shopId: string;
  shopName: string;
  shopUrl: string;
  productKey: string;
  rawName: string;
  specLabel: string;
  category: ProductCategory;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  inventoryText: string;
  warrantySupported: boolean | null;
  updatedAt: string;
}

export interface ProductFeedPage {
  items: ProductFeedItem[];
  nextCursor: string | null;
  total: number;
}

interface ProductFeedOptions {
  category?: string | null;
  cursor?: string | null;
  limit?: number;
}

export function getAvailableProductCategories(published: PublishedData) {
  const currentSet = new Set(
    published.shopProducts
      .filter((product) => isAvailableProduct(product))
      .map((product) => product.category)
  );

  return categoryOrder.filter((category) => currentSet.has(category));
}

export function getAvailableProductPage(published: PublishedData, options: ProductFeedOptions = {}): ProductFeedPage {
  const categories = getAvailableProductCategories(published);
  const activeCategory = readCategoryFilter(options.category, categories);
  const cursor = readCursor(options.cursor);
  const limit = readLimit(options.limit);
  const shopMap = new Map(published.shops.map((shop) => [shop.shopId, shop]));

  const filtered = published.shopProducts
    .filter((product) => isAvailableProduct(product))
    .filter((product) => !activeCategory || product.category === activeCategory)
    .map((product) => {
      const shop = shopMap.get(product.shopId);

      return {
        id: `${product.shopId}:${product.productKey}`,
        shopId: product.shopId,
        shopName: shop?.name ?? product.shopId,
        shopUrl: shop?.url ?? "",
        productKey: product.productKey,
        rawName: product.current.rawName,
        specLabel: product.specLabel,
        category: product.category,
        price: product.current.price,
        currency: product.current.currency,
        stockStatus: product.current.stockStatus,
        inventoryText: product.current.inventoryText,
        warrantySupported: product.current.warrantySupported,
        updatedAt: product.current.updatedAt
      } satisfies ProductFeedItem;
    })
    .sort((left, right) => {
      const stockPriority = getStockPriority(left.stockStatus) - getStockPriority(right.stockStatus);
      if (stockPriority !== 0) {
        return stockPriority;
      }

      const datePriority = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
      if (datePriority !== 0) {
        return datePriority;
      }

      if (left.price === 0) {
        return 1;
      }

      if (right.price === 0) {
        return -1;
      }

      return left.price - right.price || left.rawName.localeCompare(right.rawName, "zh-CN");
    });

  const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

  return {
    items: filtered.slice(cursor, cursor + limit),
    nextCursor,
    total: filtered.length
  };
}

function isAvailableProduct(product: PublishedData["shopProducts"][number]) {
  return product.current.isDetected && product.current.status !== "OFFLINE" && product.current.stockStatus !== "OUT_OF_STOCK";
}

function getStockPriority(status: StockStatus) {
  if (status === "IN_STOCK") {
    return 0;
  }

  if (status === "LOW_STOCK") {
    return 1;
  }

  return 2;
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
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
