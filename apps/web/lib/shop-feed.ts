import { merchantTypeLabels, productCategoryLabels } from "@shop-claw/shared/labels";
import { PublishedMeta, PublishedShopIndex, ShopSummary } from "@shop-claw/shared/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export interface ShopFeedPage {
  items: ShopSummary[];
  nextCursor: string | null;
  total: number;
  publishedAt: string;
  meta: PublishedMeta;
}

interface ShopFeedOptions {
  cursor?: string | null;
  keyword?: string | null;
  limit?: number;
  sort?: string | null;
  status?: string | null;
  merchantType?: string | null;
}

export function getShopFeedItems(index: PublishedShopIndex, options: ShopFeedOptions = {}) {
  const keyword = normalizeText(options.keyword);
  const activeStatus = readStatusFilter(options.status);
  const activeMerchantType = readMerchantTypeFilter(options.merchantType);
  const sortBy = readSortFilter(options.sort);

  return index.shops
    .filter((shop) => {
      const keywordMatched =
        !keyword ||
        shop.name.toLowerCase().includes(keyword) ||
        shop.categories.some(
          (category) =>
            category.toLowerCase().includes(keyword) || productCategoryLabels[category].toLowerCase().includes(keyword)
        ) ||
        merchantTypeLabels[shop.merchantType].toLowerCase().includes(keyword);
      const statusMatched = !activeStatus || shop.status === activeStatus;
      const merchantTypeMatched = !activeMerchantType || shop.merchantType === activeMerchantType;
      return keywordMatched && statusMatched && merchantTypeMatched;
    })
    .sort((left, right) => {
      if (sortBy === "price") {
        if (left.lowestPrice === 0) {
          return 1;
        }

        if (right.lowestPrice === 0) {
          return -1;
        }

        return left.lowestPrice - right.lowestPrice;
      }

      if (sortBy === "changes") {
        return right.recentChangeCount - left.recentChangeCount;
      }

      return Date.parse(right.lastCrawledAt) - Date.parse(left.lastCrawledAt);
    });
}

export function getShopFeedPage(index: PublishedShopIndex, options: ShopFeedOptions = {}): ShopFeedPage {
  const cursor = readCursor(options.cursor);
  const limit = readLimit(options.limit);
  const filtered = getShopFeedItems(index, options);
  const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

  return {
    items: filtered.slice(cursor, cursor + limit),
    nextCursor,
    total: filtered.length,
    publishedAt: index.publishedAt,
    meta: index.meta
  };
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

function readSortFilter(value: string | null | undefined) {
  if (value === "price" || value === "changes") {
    return value;
  }

  return "updated";
}

function readStatusFilter(value: string | null | undefined) {
  if (value === "OPEN" || value === "RISK" || value === "CLOSED") {
    return value;
  }

  return null;
}

function readMerchantTypeFilter(value: string | null | undefined) {
  if (value === "SMALL_SHOP" || value === "TOP_UP") {
    return value;
  }

  return null;
}

function normalizeText(input: string | null | undefined) {
  return (input ?? "").trim().toLowerCase();
}
