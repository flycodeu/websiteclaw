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
  | "WARRANTY_CHANGED"
  | "SHOP_STATUS_CHANGED";
export type ReviewStatus = "REVIEWING" | "READY_TO_PUBLISH" | "PUBLISHED";
export type CrawlPageState = "COLLECTED" | "WAITING_VERIFICATION" | "VERIFYING" | "RESUMED";
export type PriceTrendDirection = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type ProductCategory =
  | "CHATGPT"
  | "CLAUDE"
  | "GEMINI"
  | "PERPLEXITY"
  | "GROK"
  | "GOOGLE_ACCOUNT"
  | "VIRTUAL_CARD"
  | "APPLE_ACCOUNT"
  | "OTHER";
export type AiProvider = "openai-compatible" | "deepseek-compatible";

export interface AiUsageSummary {
  provider: AiProvider;
  providerLabel: string;
  model: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  estimatedCost: number;
  currency: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheHitInputPricePerMillion: number;
  updatedAt: string;
}

export interface ProductItem {
  productKey: string;
  rawName: string;
  category: ProductCategory;
  specLabel: string;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  status: ProductStatus;
  inventoryText: string;
  warrantySupported: boolean | null;
  isDetected: boolean;
  confidence?: number;
  sourceLine?: string;
  updatedAt: string;
}

export interface ProductObservation {
  shopId: string;
  sourceId: string;
  productKey: string;
  rawName: string;
  category: ProductCategory;
  specLabel: string;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  status: ProductStatus;
  inventoryText: string;
  warrantySupported: boolean | null;
  isDetected: boolean;
  capturedAt: string;
  snapshotDate: string;
  crawlTaskId?: string;
  reviewId?: string;
  sourceLine?: string;
}

export interface ProductPricePoint {
  price: number;
  currency: string;
  capturedAt: string;
  snapshotDate: string;
}

export interface ProductPriceTrend {
  direction: PriceTrendDirection;
  previousPrice: number | null;
  currentPrice: number;
  changeAmount: number;
  changePercent: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  sampleCount: number;
}

export interface PublishedShopProduct {
  shopId: string;
  sourceId: string;
  productKey: string;
  category: ProductCategory;
  specLabel: string;
  current: ProductItem;
  history: ProductObservation[];
  priceHistory: ProductPricePoint[];
  priceTrend: ProductPriceTrend;
  missingStreak: number;
  lastSeenAt: string;
  lastMissingAt?: string;
  removedAt?: string;
}

export interface ShopSummary {
  shopId: string;
  sourceId: string;
  name: string;
  url: string;
  status: ShopStatus;
  lastCrawledAt: string;
  productCount: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowestPrice: number;
  categories: ProductCategory[];
  recentChangeCount: number;
  runCount: number;
}

export interface ShopSnapshot {
  shopId: string;
  crawlTaskId?: string;
  snapshotDate: string;
  capturedAt: string;
  summary: string;
  conclusion: string;
  productCount: number;
  productKeys: string[];
}

export interface ShopChange {
  type: ChangeType;
  productKey?: string;
  productLabel?: string;
  oldPrice?: number;
  newPrice?: number;
  oldStockStatus?: StockStatus;
  newStockStatus?: StockStatus;
  previousWarrantySupported?: boolean | null;
  nextWarrantySupported?: boolean | null;
  note: string;
}

export interface ShopDiff {
  shopId: string;
  snapshotDate: string;
  capturedAt: string;
  changes: ShopChange[];
  summary: string;
}

export interface PublishedShopDetail {
  shop: ShopSummary;
  products: PublishedShopProduct[];
  recentSnapshots: ShopSnapshot[];
  recentDiffs: ShopDiff[];
  publishedAt: string;
}

export interface PublishedMeta {
  publishedAt: string;
  shopCount: number;
  liveProductCount: number;
  archivedProductCount: number;
  categoryCount: number;
  categories: ProductCategory[];
}

export interface PublishedShopIndex {
  shops: ShopSummary[];
  publishedAt: string;
  meta: PublishedMeta;
}

export interface PublishedProductCatalogItem {
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
  missingStreak: number;
  lastSeenAt: string;
  priceTrend: ProductPriceTrend;
}

export interface PublishedProductCatalog {
  items: PublishedProductCatalogItem[];
  categories: ProductCategory[];
  publishedAt: string;
  meta: PublishedMeta;
}

export interface PublishedDiffFeed {
  items: ShopDiff[];
  publishedAt: string;
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
  aiUsage?: AiUsageSummary;
}

export interface ReviewRecord {
  id: string;
  taskId: string;
  sourceId: string;
  sourceName: string;
  status: ReviewStatus;
  snapshotDate: string;
  summary: string;
  rawFragments: string[];
  products: ProductItem[];
  previousDiff: ShopChange[];
  modelLabel?: string;
  conclusion: string;
  flags: string[];
}

export interface PublishedData {
  shops: ShopSummary[];
  shopProducts: PublishedShopProduct[];
  archivedShopProducts: PublishedShopProduct[];
  shopSnapshots: ShopSnapshot[];
  shopDiffs: ShopDiff[];
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
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  thinkingEnabled: boolean;
  reasoningEffort?: string;
  currency: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheHitInputPricePerMillion: number;
  systemPrompt: string;
  updatedAt: string;
}

export interface NewSourcePayload {
  sourceName: string;
  sourceUrl: string;
  entryUrl?: string;
  crawlMode?: CrawlMode;
  enabled?: boolean;
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
  summary?: string;
  conclusion?: string;
  flags?: string[];
  products?: ProductItem[];
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  traceId: string;
  data: T;
}
