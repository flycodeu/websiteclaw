import { productCategoryLabels } from "@shop-claw/shared/labels";
import { ProductCategory, PublishedProductCatalog, PublishedProductCatalogItem } from "@shop-claw/shared/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export type ProductFeedItem = PublishedProductCatalogItem;
export type ProductAvailabilityFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";

export interface ProductFeedPage {
  items: ProductFeedItem[];
  nextCursor: string | null;
  total: number;
  categories: ProductCategory[];
  publishedAt: string;
  summary: ProductFeedSummary;
}

export interface ProductFeedSummary {
  total: number;
  inStock: number;
  lowStock: number;
  dimmed: number;
}

interface ProductFeedOptions {
  availability?: string | null;
  category?: string | null;
  cursor?: string | null;
  limit?: number;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

interface ProductFeedFilterOptions {
  availability?: string | null;
  category?: string | null;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

export function getProductFeedCategories(catalog: PublishedProductCatalog, options: Pick<ProductFeedFilterOptions, "availability"> = {}) {
  const availability = readAvailabilityFilter(options.availability);
  const available = new Set(
    catalog.items
      .filter((item) => isListableProduct(item))
      .filter((item) => matchesAvailability(item, availability))
      .map((item) => item.category)
  );

  return catalog.categories.filter((category) => available.has(category));
}

export function getProductFeedItems(catalog: PublishedProductCatalog, options: ProductFeedFilterOptions = {}) {
  const availability = readAvailabilityFilter(options.availability);
  const categories = getProductFeedCategories(catalog, { availability });
  const activeCategory = readCategoryFilter(options.category, categories);
  const keyword = normalizeText(options.keyword);
  const minPrice = readPrice(options.minPrice);
  const maxPrice = readPrice(options.maxPrice);
  const categoryRank = new Map(categories.map((category, index) => [category, index] as const));

  return catalog.items
    .filter((item) => isListableProduct(item))
    .filter((item) => matchesAvailability(item, availability))
    .filter((item) => !activeCategory || item.category === activeCategory)
    .filter((item) => matchesKeyword(item, keyword))
    .filter((item) => matchesPrice(item, minPrice, maxPrice))
    .sort((left, right) => {
      const categoryDiff =
        (categoryRank.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryRank.get(right.category) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      if (left.price === 0) {
        return 1;
      }

      if (right.price === 0) {
        return -1;
      }

      const priceDiff = left.price - right.price;
      if (priceDiff !== 0) {
        return priceDiff;
      }

      const displayPriority = getDisplayPriority(left) - getDisplayPriority(right);
      if (displayPriority !== 0) {
        return displayPriority;
      }

      const nameDiff = left.rawName.localeCompare(right.rawName, "zh-CN");
      if (nameDiff !== 0) {
        return nameDiff;
      }

      return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
    });
}

export function getProductFeedPage(catalog: PublishedProductCatalog, options: ProductFeedOptions = {}): ProductFeedPage {
  const cursor = readCursor(options.cursor);
  const limit = readLimit(options.limit);
  const filtered = getProductFeedItems(catalog, options);
  const availability = readAvailabilityFilter(options.availability);
  const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

  return {
    items: filtered.slice(cursor, cursor + limit),
    nextCursor,
    total: filtered.length,
    categories: getProductFeedCategories(catalog, { availability }),
    publishedAt: catalog.publishedAt,
    summary: getProductFeedSummary(filtered)
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

function isListableProduct(item: ProductFeedItem) {
  return Boolean(normalizeText(item.rawName));
}

function matchesKeyword(item: ProductFeedItem, keyword: string) {
  if (!keyword) {
    return true;
  }

  return normalizeText(
    [item.rawName, item.specLabel, item.shopName, productCategoryLabels[item.category], item.inventoryText].join(" ")
  ).includes(keyword);
}

function matchesPrice(item: ProductFeedItem, minPrice: number | null, maxPrice: number | null) {
  if (minPrice === null && maxPrice === null) {
    return true;
  }

  if (!Number.isFinite(item.price) || item.price <= 0) {
    return false;
  }

  if (minPrice !== null && item.price < minPrice) {
    return false;
  }

  if (maxPrice !== null && item.price > maxPrice) {
    return false;
  }

  return true;
}

function matchesAvailability(item: ProductFeedItem, availability: ProductAvailabilityFilter) {
  if (availability === "ALL") {
    return true;
  }

  const isOutOfStock = isDimmedProductFeedItem(item);
  return availability === "IN_STOCK" ? !isOutOfStock : isOutOfStock;
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

function readAvailabilityFilter(value: string | null | undefined): ProductAvailabilityFilter {
  if (value === "IN_STOCK" || value === "OUT_OF_STOCK") {
    return value;
  }

  return "ALL";
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
