import { productCategoryLabels } from "@shop-claw/shared/labels";
import { ProductCategory, ProductStatus, PublishedData, StockStatus } from "@shop-claw/shared/types";

const categoryOrder = Object.keys(productCategoryLabels) as ProductCategory[];
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

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
  status: ProductStatus;
  inventoryText: string;
  warrantySupported: boolean | null;
  updatedAt: string;
  isDetected: boolean;
}

export interface ProductFeedPage {
  items: ProductFeedItem[];
  nextCursor: string | null;
  total: number;
}

export interface ProductFeedSummary {
  total: number;
  inStock: number;
  lowStock: number;
  dimmed: number;
}

interface ProductFeedOptions {
  category?: string | null;
  cursor?: string | null;
  limit?: number;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

interface ProductFeedFilterOptions {
  category?: string | null;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

export function getProductFeedCategories(published: PublishedData) {
  const categorySet = new Set(
    published.shopProducts
      .filter((product) => isListableProduct(product))
      .map((product) => product.category)
  );

  return categoryOrder.filter((category) => categorySet.has(category));
}

export function getProductFeedItems(published: PublishedData, options: ProductFeedFilterOptions = {}): ProductFeedItem[] {
  const categories = getProductFeedCategories(published);
  const activeCategory = readCategoryFilter(options.category, categories);
  const keyword = normalizeText(options.keyword);
  const minPrice = readPrice(options.minPrice);
  const maxPrice = readPrice(options.maxPrice);
  const shopMap = new Map(published.shops.map((shop) => [shop.shopId, shop]));

  return published.shopProducts
    .filter((product) => isListableProduct(product))
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
        status: product.current.status,
        inventoryText: product.current.inventoryText,
        warrantySupported: product.current.warrantySupported,
        updatedAt: product.current.updatedAt,
        isDetected: product.current.isDetected
      } satisfies ProductFeedItem;
    })
    .filter((product) => matchesKeyword(product, keyword))
    .filter((product) => matchesPrice(product, minPrice, maxPrice))
    .sort((left, right) => {
      const displayPriority = getDisplayPriority(left) - getDisplayPriority(right);
      if (displayPriority !== 0) {
        return displayPriority;
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
}

export function getProductFeedPage(published: PublishedData, options: ProductFeedOptions = {}): ProductFeedPage {
  const cursor = readCursor(options.cursor);
  const limit = readLimit(options.limit);
  const filtered = getProductFeedItems(published, options);

  const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

  return {
    items: filtered.slice(cursor, cursor + limit),
    nextCursor,
    total: filtered.length
  };
}

export const getAvailableProductCategories = getProductFeedCategories;
export const getAvailableProductPage = getProductFeedPage;
export const getAvailableProductItems = getProductFeedItems;

export function getProductFeedSummary(items: ProductFeedItem[]): ProductFeedSummary {
  return {
    total: items.length,
    inStock: items.filter((item) => item.stockStatus === "IN_STOCK" && !isDimmedProductFeedItem(item)).length,
    lowStock: items.filter((item) => item.stockStatus === "LOW_STOCK" && item.status !== "OFFLINE" && item.isDetected).length,
    dimmed: items.filter((item) => isDimmedProductFeedItem(item)).length
  };
}

export function isDimmedProductFeedItem(item: Pick<ProductFeedItem, "status" | "stockStatus" | "isDetected">) {
  return item.status === "OFFLINE" || item.stockStatus === "OUT_OF_STOCK" || !item.isDetected;
}

function isListableProduct(product: PublishedData["shopProducts"][number]) {
  return Boolean(normalizeText(product.current.rawName));
}

function matchesKeyword(product: ProductFeedItem, keyword: string) {
  if (!keyword) {
    return true;
  }

  return normalizeText(
    [product.rawName, product.specLabel, product.shopName, productCategoryLabels[product.category], product.inventoryText].join(" ")
  ).includes(keyword);
}

function matchesPrice(product: ProductFeedItem, minPrice: number | null, maxPrice: number | null) {
  if (minPrice === null && maxPrice === null) {
    return true;
  }

  if (!Number.isFinite(product.price) || product.price <= 0) {
    return false;
  }

  if (minPrice !== null && product.price < minPrice) {
    return false;
  }

  if (maxPrice !== null && product.price > maxPrice) {
    return false;
  }

  return true;
}

function getDisplayPriority(product: ProductFeedItem) {
  if (product.status === "OFFLINE") {
    return 3;
  }

  if (product.stockStatus === "OUT_OF_STOCK") {
    return 2;
  }

  if (product.stockStatus === "LOW_STOCK") {
    return 1;
  }

  return 0;
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

function readPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeText(input: string | null | undefined) {
  return (input ?? "").trim().toLowerCase();
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
