export type ShopStatus = "OPEN" | "RISK" | "CLOSED";
export type ProductStatus = "ON_SALE" | "LOW_STOCK" | "OFFLINE";
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export type CrawlMode = "AUTO" | "MANUAL_ASSIST";
export type TaskStatus =
  | "PENDING"
  | "CRAWLING"
  | "WAITING_HUMAN"
  | "AI_PARSING"
  | "REVIEWING"
  | "PUBLISHED"
  | "FAILED";
export type ChangeType =
  | "PRODUCT_REMOVED"
  | "PRODUCT_ADDED"
  | "PRICE_INCREASED"
  | "PRICE_DECREASED"
  | "STOCK_CHANGED"
  | "SHOP_STATUS_CHANGED";

export interface ProductItem {
  rawName: string;
  normalizedType: string;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  status: ProductStatus;
  confidence?: number;
  updatedAt: string;
}

export interface ShopSummary {
  shopId: string;
  name: string;
  url: string;
  status: ShopStatus;
  lastCrawledAt: string;
  stabilityScore: number;
  productCount: number;
  lowestPrice: number;
  averagePrice: number;
  tags: string[];
  healthNote: string;
}

export interface ShopSnapshot {
  shopId: string;
  snapshotDate: string;
  summary: string;
  products: ProductItem[];
}

export interface ShopChange {
  type: ChangeType;
  productType?: string;
  oldPrice?: number;
  newPrice?: number;
  note: string;
}

export interface ShopDiff {
  shopId: string;
  snapshotDate: string;
  changes: ShopChange[];
  summary: string;
}

export interface RankingEntry {
  rank: number;
  shopId: string;
  shopName: string;
  metricLabel: string;
  value: number;
  description: string;
}

export interface CompareGroup {
  normalizedType: string;
  trend: string;
  offers: Array<{
    shopId: string;
    shopName: string;
    price: number;
    currency: string;
    stockStatus: StockStatus;
    stabilityScore: number;
  }>;
}

export interface DataSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  crawlMode: CrawlMode;
  enabled: boolean;
  remark: string;
  lastRunAt: string;
}

export interface CrawlTask {
  id: string;
  sourceId: string;
  sourceName: string;
  status: TaskStatus;
  startedAt: string;
  updatedAt: string;
  logSummary: string;
  nextAction: string;
}

export interface ReviewRecord {
  id: string;
  sourceName: string;
  status: "REVIEWING" | "READY_TO_PUBLISH";
  snapshotDate: string;
  extractedSummary: string;
  rawFragments: string[];
  products: ProductItem[];
  previousDiff: ShopChange[];
}

export interface OverviewMetric {
  label: string;
  value: string;
  detail: string;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  traceId: string;
  data: T;
}
