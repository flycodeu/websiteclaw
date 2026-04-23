export type ShopStatus = "OPEN" | "RISK" | "CLOSED";
export type ProductStatus = "ON_SALE" | "LOW_STOCK" | "OFFLINE";
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export type CrawlMode = "AUTO" | "MANUAL_ASSIST";
export type VerificationMethod = "NONE" | "CAPTCHA" | "LOGIN" | "MANUAL";
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
export type ReviewStatus = "REVIEWING" | "READY_TO_PUBLISH" | "PUBLISHED";
export type CrawlPageState = "COLLECTED" | "WAITING_VERIFICATION" | "RESUMED";

export interface ProductItem {
  rawName: string;
  normalizedType: string;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  status: ProductStatus;
  confidence?: number;
  updatedAt: string;
  sourceLine?: string;
}

export interface ShopSummary {
  shopId: string;
  sourceId: string;
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
  crawlTaskId?: string;
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

export interface SourceRequestHeader {
  key: string;
  value: string;
}

export interface DataSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  entryUrl: string;
  crawlMode: CrawlMode;
  enabled: boolean;
  remark: string;
  parserHint: string;
  lastRunAt: string;
  createdAt: string;
  updatedAt: string;
  verificationMethod: VerificationMethod;
  verificationPrompt: string;
  waitSelector: string;
  headless: boolean;
  blockAssets: boolean;
  requestHeaders: SourceRequestHeader[];
}

export interface TaskTimelineItem {
  at: string;
  title: string;
  detail: string;
}

export interface CrawlArtifacts {
  htmlPath?: string;
  textPath?: string;
  screenshotPath?: string;
  storageStatePath?: string;
}

export interface CrawlTask {
  id: string;
  sourceId: string;
  sourceName: string;
  status: TaskStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  logSummary: string;
  nextAction: string;
  rawUrl: string;
  currentUrl?: string;
  rawFragments: string[];
  timeline: TaskTimelineItem[];
  reviewId?: string;
  requiresVerification: boolean;
  verificationMethod?: VerificationMethod;
  verificationPrompt?: string;
  verificationNote?: string;
  errorMessage?: string;
  sessionId?: string;
  pageState?: CrawlPageState;
  artifacts?: CrawlArtifacts;
}

export interface ReviewRecord {
  id: string;
  taskId: string;
  sourceId: string;
  sourceName: string;
  status: ReviewStatus;
  snapshotDate: string;
  extractedSummary: string;
  rawFragments: string[];
  products: ProductItem[];
  previousDiff: ShopChange[];
  aiModel?: string;
  aiConclusion: string;
  riskNotes: string[];
}

export interface OverviewMetric {
  label: string;
  value: string;
  detail: string;
}

export interface PublishedData {
  shops: ShopSummary[];
  snapshots: ShopSnapshot[];
  diffs: ShopDiff[];
  priceRankings: RankingEntry[];
  stabilityRankings: RankingEntry[];
  compareGroups: CompareGroup[];
  overviewMetrics: OverviewMetric[];
  publishedAt: string;
}

export interface PlatformState {
  version: number;
  updatedAt: string;
  sources: DataSource[];
  tasks: CrawlTask[];
  reviews: ReviewRecord[];
  published: PublishedData;
}

export interface AiSettings {
  enabled: boolean;
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  updatedAt: string;
}

export interface NewSourcePayload {
  sourceName: string;
  sourceUrl: string;
  entryUrl?: string;
  crawlMode?: CrawlMode;
  enabled?: boolean;
  remark?: string;
  parserHint?: string;
  verificationMethod?: VerificationMethod;
  verificationPrompt?: string;
  waitSelector?: string;
  headless?: boolean;
  blockAssets?: boolean;
  requestHeaders?: SourceRequestHeader[];
}

export interface CrawlRequestPayload {
  sourceId: string;
}

export interface ContinueTaskPayload {
  verificationToken?: string;
  storageState?: string;
  verificationNote?: string;
  manualContent?: string;
}

export interface SaveReviewPayload {
  extractedSummary?: string;
  aiConclusion?: string;
  riskNotes?: string[];
  products?: ProductItem[];
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  traceId: string;
  data: T;
}
