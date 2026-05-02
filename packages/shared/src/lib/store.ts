import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AiUsageSummary,
  CrawlBatchState,
  CrawlTask,
  DataSource,
  PlatformState,
  ProductCategory,
  ProductItem,
  ProductObservation,
  ProductPricePoint,
  ProductPriceTrend,
  PublishedData,
  PublishedDiffFeed,
  PublishedMeta,
  PublishedProductCatalog,
  PublishedProductCatalogItem,
  PublishedShopDetail,
  PublishedShopIndex,
  PublishedShopProduct,
  ReviewRecord,
  ShopDiff,
  ShopSnapshot,
  ShopStatus,
  StockStatus
} from "./types";

const PUBLIC_DIRECTORY_NAME = "public";
const PUBLIC_PUBLISHED_FILENAME = "published-data.json";
const LEGACY_PUBLIC_PUBLISHED_FILENAME = "published-shops.json";
const PUBLIC_META_FILENAME = "published-meta.json";
const PUBLIC_PRODUCTS_FILENAME = "published-products.json";
const PUBLIC_DIFFS_FILENAME = "published-diffs.json";
const PUBLIC_SHOP_DETAILS_DIRECTORY_NAME = "shops";
const HISTORY_LIMIT = 10;

let workspaceRootPromise: Promise<string> | undefined;

function nowIso() {
  return new Date().toISOString();
}

function normalizeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function guessCategory(rawName: string, fallback?: string): ProductCategory {
  const marker = `${rawName} ${fallback ?? ""}`.toLowerCase();

  if (marker.includes("gpt")) {
    return "CHATGPT";
  }

  if (marker.includes("claude")) {
    return "CLAUDE";
  }

  if (marker.includes("gemini")) {
    return "GEMINI";
  }

  if (marker.includes("perplexity")) {
    return "PERPLEXITY";
  }

  if (marker.includes("grok")) {
    return "GROK";
  }

  if (/(google account|google账号|google 帐号|谷歌账号|gmail)/i.test(marker)) {
    return "GOOGLE_ACCOUNT";
  }

  if (/(虚拟卡|vcc|virtual card|visa card|master card|wildcard)/i.test(marker)) {
    return "VIRTUAL_CARD";
  }

  if (/(苹果账号|apple id|apple account|icloud)/i.test(marker)) {
    return "APPLE_ACCOUNT";
  }

  return "OTHER";
}

function buildProductKey(category: ProductCategory, specLabel: string) {
  const normalizedSpec = normalizeToken(specLabel || "DEFAULT") || "DEFAULT";
  return `${category}__${normalizedSpec}`;
}

function normalizeSpec(rawName: string, fallback?: string) {
  return normalizeToken(fallback || rawName || "DEFAULT") || "DEFAULT";
}

function uniqueCategories(categories: ProductCategory[]) {
  return [...new Set(categories)];
}

function trimHistory<T>(items: T[]) {
  return items.slice(0, HISTORY_LIMIT);
}

function buildPriceHistory(entries: ProductObservation[]): ProductPricePoint[] {
  const seen = new Set<string>();
  const points: ProductPricePoint[] = [];

  entries.forEach((entry) => {
    if (!entry.isDetected || !Number.isFinite(entry.price) || entry.price <= 0) {
      return;
    }

    const key = `${entry.capturedAt}|${entry.price}|${entry.currency}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    points.push({
      price: entry.price,
      currency: entry.currency,
      capturedAt: entry.capturedAt,
      snapshotDate: entry.snapshotDate
    });
  });

  return trimHistory(points);
}

function buildPriceTrend(priceHistory: ProductPricePoint[], currentPrice: number): ProductPriceTrend {
  const latest = priceHistory[0];
  const previous = priceHistory[1];
  const values = priceHistory.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
  const activeCurrentPrice =
    Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : latest?.price && latest.price > 0 ? latest.price : 0;
  const previousPrice = previous?.price && previous.price > 0 ? previous.price : null;
  const changeAmount = previousPrice === null ? 0 : activeCurrentPrice - previousPrice;
  const changePercent =
    previousPrice && previousPrice > 0 ? Number((((activeCurrentPrice - previousPrice) / previousPrice) * 100).toFixed(2)) : null;

  return {
    direction:
      previousPrice === null
        ? "UNKNOWN"
        : changeAmount > 0
          ? "UP"
          : changeAmount < 0
            ? "DOWN"
            : "FLAT",
    previousPrice,
    currentPrice: activeCurrentPrice,
    changeAmount: Number(changeAmount.toFixed(2)),
    changePercent,
    lowestPrice: values.length > 0 ? Math.min(...values) : null,
    highestPrice: values.length > 0 ? Math.max(...values) : null,
    sampleCount: priceHistory.length
  };
}

function createEmptyPublishedData(now: string): PublishedData {
  return {
    shops: [],
    shopProducts: [],
    archivedShopProducts: [],
    shopSnapshots: [],
    shopDiffs: [],
    publishedAt: now
  };
}

function createEmptyPlatformState(): PlatformState {
  const now = nowIso();
  return {
    version: 2,
    updatedAt: now,
    sources: [],
    tasks: [],
    reviews: [],
    crawlBatch: null,
    published: createEmptyPublishedData(now)
  };
}

function normalizeSource(
  source: Partial<DataSource> & Pick<DataSource, "sourceId" | "sourceName" | "sourceUrl">
): DataSource {
  const now = nowIso();

  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    entryUrl: source.entryUrl ?? source.sourceUrl,
    crawlMode: source.crawlMode ?? "AUTO",
    enabled: source.enabled ?? true,
    visible: source.visible ?? true,
    lastRunAt: source.lastRunAt ?? "",
    createdAt: source.createdAt ?? now,
    updatedAt: source.updatedAt ?? now,
    verificationMethod: source.verificationMethod ?? "NONE",
    verificationPrompt: source.verificationPrompt ?? "",
    waitSelector: source.waitSelector ?? "body",
    headless: source.headless ?? true,
    blockAssets: source.blockAssets ?? true,
    requestHeaders: source.requestHeaders ?? []
  };
}

function normalizeTask(
  task: Partial<CrawlTask> &
    Pick<
      CrawlTask,
      "id" | "sourceId" | "sourceName" | "status" | "startedAt" | "updatedAt" | "logSummary" | "nextAction" | "rawUrl"
    >
): CrawlTask {
  return {
    id: task.id,
    sourceId: task.sourceId,
    sourceName: task.sourceName,
    batchId: task.batchId?.trim() || undefined,
    batchIndex: typeof task.batchIndex === "number" ? Math.max(task.batchIndex, 0) : undefined,
    crawlVersion: typeof task.crawlVersion === "number" ? Math.max(task.crawlVersion, 0) : undefined,
    status: task.status,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
    logSummary: task.logSummary,
    nextAction: task.nextAction,
    rawUrl: task.rawUrl,
    currentUrl: task.currentUrl,
    rawFragments: task.rawFragments ?? [],
    timeline: task.timeline ?? [],
    reviewId: task.reviewId,
    requiresVerification: task.requiresVerification ?? false,
    verificationMethod: task.verificationMethod,
    verificationPrompt: task.verificationPrompt,
    verificationNote: task.verificationNote,
    errorMessage: task.errorMessage,
    sessionId: task.sessionId,
    pageState: task.pageState,
    artifacts: task.artifacts ?? {},
    aiUsage: task.aiUsage ? normalizeAiUsage(task.aiUsage) : undefined
  };
}

function normalizeBatch(batch: Partial<CrawlBatchState> | null | undefined): CrawlBatchState | null {
  if (!batch?.batchId?.trim()) {
    return null;
  }

  return {
    batchId: batch.batchId.trim(),
    version: Math.max(Number(batch.version ?? 0), 0),
    sourceIds: [...new Set((batch.sourceIds ?? []).map((item) => item?.trim()).filter(Boolean))],
    completedSourceIds: [...new Set((batch.completedSourceIds ?? []).map((item) => item?.trim()).filter(Boolean))],
    currentIndex: Math.max(Number(batch.currentIndex ?? 0), 0),
    currentSourceId: batch.currentSourceId?.trim() || undefined,
    currentTaskId: batch.currentTaskId?.trim() || undefined,
    startedAt: batch.startedAt ?? nowIso(),
    updatedAt: batch.updatedAt ?? nowIso(),
    finishedAt: batch.finishedAt?.trim() || undefined
  };
}

function normalizeAiUsage(usage: Partial<AiUsageSummary>): AiUsageSummary {
  return {
    provider:
      usage.provider === "deepseek-compatible" || usage.provider === "openai-compatible"
        ? usage.provider
        : "openai-compatible",
    providerLabel: usage.providerLabel?.trim() || "AI",
    model: usage.model?.trim() || "",
    callCount: Number(usage.callCount ?? 0),
    promptTokens: Number(usage.promptTokens ?? 0),
    completionTokens: Number(usage.completionTokens ?? 0),
    totalTokens: Number(usage.totalTokens ?? 0),
    promptCacheHitTokens: Number(usage.promptCacheHitTokens ?? 0),
    promptCacheMissTokens: Number(usage.promptCacheMissTokens ?? 0),
    estimatedCost: Number(usage.estimatedCost ?? 0),
    currency: usage.currency?.trim() || "CNY",
    inputPricePerMillion: Number(usage.inputPricePerMillion ?? 0),
    outputPricePerMillion: Number(usage.outputPricePerMillion ?? 0),
    cacheHitInputPricePerMillion: Number(usage.cacheHitInputPricePerMillion ?? 0),
    updatedAt: usage.updatedAt ?? nowIso()
  };
}

function normalizeStockStatus(value: unknown): StockStatus {
  return value === "LOW_STOCK" || value === "OUT_OF_STOCK" || value === "IN_STOCK" ? value : "IN_STOCK";
}

function normalizeShopStatus(value: unknown): ShopStatus {
  return value === "RISK" || value === "CLOSED" || value === "OPEN" ? value : "OPEN";
}

function normalizeProductItem(item: Partial<ProductItem> & { rawName?: string; normalizedType?: string }): ProductItem {
  const rawName = item.rawName?.trim() || item.normalizedType?.trim() || "未命名商品";
  const category = guessCategory(rawName, String(item.category ?? item.normalizedType ?? ""));
  const specLabel = normalizeSpec(rawName, String(item.specLabel ?? item.normalizedType ?? ""));
  const stockStatus = normalizeStockStatus(item.stockStatus);
  const updatedAt = item.updatedAt ?? nowIso();

  return {
    productKey: item.productKey?.trim() || buildProductKey(category, specLabel),
    rawName,
    category,
    specLabel,
    price: Number(item.price ?? 0),
    currency: item.currency?.trim() || "CNY",
    stockStatus,
    status:
      item.status === "LOW_STOCK" || item.status === "OFFLINE" || item.status === "ON_SALE"
        ? item.status
        : stockStatus === "OUT_OF_STOCK"
          ? "OFFLINE"
          : stockStatus === "LOW_STOCK"
            ? "LOW_STOCK"
            : "ON_SALE",
    inventoryText: item.inventoryText?.trim() || "",
    warrantySupported:
      item.warrantySupported === true || item.warrantySupported === false ? item.warrantySupported : null,
    isDetected: item.isDetected ?? true,
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    sourceLine: item.sourceLine?.trim() || undefined,
    updatedAt
  };
}

function normalizeObservation(item: Partial<ProductObservation>): ProductObservation {
  const normalized = normalizeProductItem(item);

  return {
    shopId: item.shopId?.trim() || "",
    sourceId: item.sourceId?.trim() || "",
    productKey: normalized.productKey,
    rawName: normalized.rawName,
    category: normalized.category,
    specLabel: normalized.specLabel,
    price: normalized.price,
    currency: normalized.currency,
    stockStatus: normalized.stockStatus,
    status: normalized.status,
    inventoryText: normalized.inventoryText,
    warrantySupported: normalized.warrantySupported,
    isDetected: normalized.isDetected,
    capturedAt: item.capturedAt ?? normalized.updatedAt,
    snapshotDate: item.snapshotDate ?? normalized.updatedAt.slice(0, 10),
    crawlTaskId: item.crawlTaskId,
    reviewId: item.reviewId,
    sourceLine: normalized.sourceLine
  };
}

function normalizePublishedShopProduct(item: Partial<PublishedShopProduct>): PublishedShopProduct {
  const current = normalizeProductItem(item.current ?? {});
  const history = trimHistory((item.history ?? []).map((entry) => normalizeObservation(entry)));
  const priceHistory = trimHistory(item.priceHistory ?? buildPriceHistory(history));
  const priceTrend = item.priceTrend ?? buildPriceTrend(priceHistory, current.price);
  const firstDetected = history.find((entry) => entry.isDetected);

  return {
    shopId: item.shopId?.trim() || "",
    sourceId: item.sourceId?.trim() || "",
    productKey: item.productKey?.trim() || current.productKey,
    category: item.category ?? current.category,
    specLabel: item.specLabel?.trim() || current.specLabel,
    current,
    history,
    priceHistory,
    priceTrend: {
      ...priceTrend,
      currentPrice: Number(priceTrend.currentPrice ?? current.price ?? 0),
      previousPrice: priceTrend.previousPrice ?? null,
      changeAmount: Number(priceTrend.changeAmount ?? 0),
      changePercent:
        typeof priceTrend.changePercent === "number" && Number.isFinite(priceTrend.changePercent)
          ? priceTrend.changePercent
          : null,
      lowestPrice:
        typeof priceTrend.lowestPrice === "number" && Number.isFinite(priceTrend.lowestPrice) ? priceTrend.lowestPrice : null,
      highestPrice:
        typeof priceTrend.highestPrice === "number" && Number.isFinite(priceTrend.highestPrice)
          ? priceTrend.highestPrice
          : null,
      sampleCount: Number(priceTrend.sampleCount ?? priceHistory.length),
      direction:
        priceTrend.direction === "UP" ||
        priceTrend.direction === "DOWN" ||
        priceTrend.direction === "FLAT" ||
        priceTrend.direction === "UNKNOWN"
          ? priceTrend.direction
          : "UNKNOWN"
    },
    missingStreak: Math.max(Number(item.missingStreak ?? (current.isDetected ? 0 : 1)), 0),
    lastSeenAt: item.lastSeenAt?.trim() || firstDetected?.capturedAt || current.updatedAt,
    lastMissingAt: item.lastMissingAt?.trim() || undefined,
    removedAt: item.removedAt?.trim() || undefined
  };
}

function normalizeSnapshot(item: Partial<ShopSnapshot>): ShopSnapshot {
  return {
    shopId: item.shopId?.trim() || "",
    crawlTaskId: item.crawlTaskId,
    version: Math.max(Number(item.version ?? 0), 0),
    snapshotDate: item.snapshotDate ?? nowIso().slice(0, 10),
    capturedAt: item.capturedAt ?? nowIso(),
    summary: item.summary?.trim() || "",
    conclusion: item.conclusion?.trim() || "",
    productCount: Number(item.productCount ?? 0),
    productKeys: item.productKeys ?? []
  };
}

function normalizeDiff(item: Partial<ShopDiff>): ShopDiff {
  return {
    shopId: item.shopId?.trim() || "",
    version: Math.max(Number(item.version ?? 0), 0),
    snapshotDate: item.snapshotDate ?? nowIso().slice(0, 10),
    capturedAt: item.capturedAt ?? nowIso(),
    changes: item.changes ?? [],
    summary: item.summary?.trim() || ""
  };
}

function normalizeReview(item: ReviewRecord): ReviewRecord {
  return {
    ...item,
    batchId: item.batchId?.trim() || undefined,
    crawlVersion: typeof item.crawlVersion === "number" ? Math.max(item.crawlVersion, 0) : undefined,
    summary: item.summary ?? "",
    products: (item.products ?? []).map((product) => normalizeProductItem(product)),
    previousDiff: item.previousDiff ?? [],
    conclusion: item.conclusion ?? "",
    flags: item.flags ?? [],
    rawFragments: item.rawFragments ?? []
  };
}

function normalizePublished(state: Partial<PublishedData> & { snapshots?: ShopSnapshot[]; diffs?: ShopDiff[] }): PublishedData {
  return {
    shops: (state.shops ?? []).map((shop) => ({
      shopId: shop.shopId,
      sourceId: shop.sourceId,
      name: shop.name,
      url: shop.url,
      status: normalizeShopStatus(shop.status),
      currentVersion: Math.max(Number(shop.currentVersion ?? Number(shop.runCount ?? 0) - 1), 0),
      lastCrawledAt: shop.lastCrawledAt ?? "",
      productCount: Number(shop.productCount ?? 0),
      inStockCount: Number(shop.inStockCount ?? 0),
      lowStockCount: Number(shop.lowStockCount ?? 0),
      outOfStockCount: Number(shop.outOfStockCount ?? 0),
      lowestPrice: Number(shop.lowestPrice ?? 0),
      categories: (shop.categories ?? []).map((category) => category as ProductCategory),
      recentChangeCount: Number(shop.recentChangeCount ?? 0),
      runCount: Number(shop.runCount ?? 0)
    })),
    shopProducts: (state.shopProducts ?? []).map((item) => normalizePublishedShopProduct(item)),
    archivedShopProducts: (state.archivedShopProducts ?? []).map((item) => normalizePublishedShopProduct(item)),
    shopSnapshots: (state.shopSnapshots ?? state.snapshots ?? []).map((item) => normalizeSnapshot(item)),
    shopDiffs: (state.shopDiffs ?? state.diffs ?? []).map((item) => normalizeDiff(item)),
    publishedAt: state.publishedAt ?? nowIso()
  };
}

function normalizeState(state: PlatformState): PlatformState {
  const fallback = createEmptyPlatformState();
  const normalizedSources = (state.sources ?? []).map((source) =>
    normalizeSource(source as Partial<DataSource> & Pick<DataSource, "sourceId" | "sourceName" | "sourceUrl">)
  );
  const normalizedTasks = (state.tasks ?? []).map((task) =>
    normalizeTask(
      task as Partial<CrawlTask> &
        Pick<
          CrawlTask,
          "id" | "sourceId" | "sourceName" | "status" | "startedAt" | "updatedAt" | "logSummary" | "nextAction" | "rawUrl"
        >
    )
  );
  const normalizedReviews = (state.reviews ?? []).map((review) => normalizeReview(review));
  const normalizedPublished = normalizePublished(state.published ?? fallback.published);
  const publishedTaskCountBySourceId = normalizedTasks.reduce((map, task) => {
    if (task.status !== "PUBLISHED") {
      return map;
    }

    map.set(task.sourceId, (map.get(task.sourceId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const patchedPublished = {
    ...normalizedPublished,
    shops: normalizedPublished.shops.map((shop) => {
      const inferredRunCount = Math.max(shop.runCount, publishedTaskCountBySourceId.get(shop.sourceId) ?? 0);

      return {
        ...shop,
        runCount: inferredRunCount,
        currentVersion: Math.max(shop.currentVersion, inferredRunCount > 0 ? inferredRunCount - 1 : 0)
      };
    })
  };

  return {
    version: state.version ?? fallback.version,
    updatedAt: state.updatedAt ?? fallback.updatedAt,
    sources: normalizedSources,
    tasks: normalizedTasks,
    reviews: normalizedReviews,
    crawlBatch: normalizeBatch(state.crawlBatch),
    published: patchedPublished
  };
}

function sortDiffsDescending(items: ShopDiff[]) {
  return [...items].sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
}

function sortShopProducts(items: PublishedShopProduct[]) {
  return [...items].sort((left, right) => {
    if (left.current.isDetected !== right.current.isDetected) {
      return left.current.isDetected ? -1 : 1;
    }

    if (left.missingStreak !== right.missingStreak) {
      return left.missingStreak - right.missingStreak;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, "zh-CN");
    }

    return left.current.rawName.localeCompare(right.current.rawName, "zh-CN");
  });
}

function buildPublishedMeta(published: PublishedData): PublishedMeta {
  const categories = uniqueCategories(published.shopProducts.map((item) => item.category));

  return {
    publishedAt: published.publishedAt,
    shopCount: published.shops.length,
    liveProductCount: published.shopProducts.length,
    archivedProductCount: published.archivedShopProducts.length,
    categoryCount: categories.length,
    categories
  };
}

function buildPublishedProductCatalogItem(
  product: PublishedShopProduct,
  shopMap: Map<string, PublishedData["shops"][number]>
): PublishedProductCatalogItem {
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
    isDetected: product.current.isDetected,
    missingStreak: product.missingStreak,
    lastSeenAt: product.lastSeenAt,
    priceTrend: product.priceTrend
  };
}

function buildPublishedShopIndex(published: PublishedData, meta: PublishedMeta): PublishedShopIndex {
  return {
    shops: [...published.shops].sort((left, right) => Date.parse(right.lastCrawledAt) - Date.parse(left.lastCrawledAt)),
    publishedAt: published.publishedAt,
    meta
  };
}

function buildPublishedProductCatalog(published: PublishedData, meta: PublishedMeta): PublishedProductCatalog {
  const shopMap = new Map(published.shops.map((shop) => [shop.shopId, shop] as const));

  return {
    items: published.shopProducts.map((product) => buildPublishedProductCatalogItem(product, shopMap)),
    categories: meta.categories,
    publishedAt: published.publishedAt,
    meta
  };
}

function buildPublishedDiffFeed(published: PublishedData): PublishedDiffFeed {
  return {
    items: sortDiffsDescending(published.shopDiffs),
    publishedAt: published.publishedAt
  };
}

function buildPublishedShopDetail(
  shop: PublishedData["shops"][number],
  published: PublishedData
): PublishedShopDetail {
  return {
    shop,
    products: sortShopProducts(published.shopProducts.filter((item) => item.shopId === shop.shopId)),
    recentSnapshots: published.shopSnapshots.filter((item) => item.shopId === shop.shopId).slice(0, HISTORY_LIMIT),
    recentDiffs: sortDiffsDescending(published.shopDiffs.filter((item) => item.shopId === shop.shopId)).slice(0, HISTORY_LIMIT),
    publishedAt: published.publishedAt
  };
}

function filterPublishedDataBySourceVisibility(published: PublishedData, sources?: DataSource[]) {
  if (!sources || sources.length === 0) {
    return published;
  }

  const hiddenSourceIds = new Set(sources.filter((source) => source.visible === false).map((source) => source.sourceId));

  if (hiddenSourceIds.size === 0) {
    return published;
  }

  const shops = published.shops.filter((shop) => !hiddenSourceIds.has(shop.sourceId));
  const shopIds = new Set(shops.map((shop) => shop.shopId));

  return {
    ...published,
    shops,
    shopProducts: published.shopProducts.filter(
      (product) => !hiddenSourceIds.has(product.sourceId) && shopIds.has(product.shopId)
    ),
    archivedShopProducts: published.archivedShopProducts.filter(
      (product) => !hiddenSourceIds.has(product.sourceId) && shopIds.has(product.shopId)
    ),
    shopSnapshots: published.shopSnapshots.filter((snapshot) => shopIds.has(snapshot.shopId)),
    shopDiffs: published.shopDiffs.filter((diff) => shopIds.has(diff.shopId))
  };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspaceRoot() {
  if (!workspaceRootPromise) {
    workspaceRootPromise = (async () => {
      let current = process.cwd();

      while (true) {
        const packagePath = path.join(current, "package.json");

        if (await pathExists(packagePath)) {
          try {
            const content = await fs.readFile(packagePath, "utf8");
            const parsed = JSON.parse(content) as { workspaces?: string[] };

            if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
              return current;
            }
          } catch {
            // Ignore broken package files and keep walking upward.
          }
        }

        const parent = path.dirname(current);

        if (parent === current) {
          return process.cwd();
        }

        current = parent;
      }
    })();
  }

  return workspaceRootPromise;
}

export async function getDataDirectory() {
  const workspaceRoot = await resolveWorkspaceRoot();
  const dataDirectory = path.join(workspaceRoot, "data");
  await fs.mkdir(dataDirectory, { recursive: true });
  return dataDirectory;
}

export async function toWorkspaceRelativePath(targetPath: string) {
  const workspaceRoot = await resolveWorkspaceRoot();
  return path.relative(workspaceRoot, targetPath).replace(/\\/g, "/");
}

async function getPlatformStateFile() {
  const dataDirectory = await getDataDirectory();
  const filePath = path.join(dataDirectory, "platform-state.json");

  if (!(await pathExists(filePath))) {
    await fs.writeFile(filePath, `${JSON.stringify(createEmptyPlatformState(), null, 2)}\n`, "utf8");
  }

  return filePath;
}

async function getPublicDataDirectory() {
  const dataDirectory = await getDataDirectory();
  const publicDirectory = path.join(dataDirectory, PUBLIC_DIRECTORY_NAME);
  await fs.mkdir(publicDirectory, { recursive: true });
  return publicDirectory;
}

async function getPublicShopDetailsDirectory() {
  const publicDirectory = await getPublicDataDirectory();
  const detailsDirectory = path.join(publicDirectory, PUBLIC_SHOP_DETAILS_DIRECTORY_NAME);
  await fs.mkdir(detailsDirectory, { recursive: true });
  return detailsDirectory;
}

async function getPublishedDataFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, PUBLIC_PUBLISHED_FILENAME);
}

async function getLegacyPublishedDataFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, LEGACY_PUBLIC_PUBLISHED_FILENAME);
}

async function getPublishedMetaFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, PUBLIC_META_FILENAME);
}

async function getPublishedProductsFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, PUBLIC_PRODUCTS_FILENAME);
}

async function getPublishedDiffsFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, PUBLIC_DIFFS_FILENAME);
}

async function getPublishedShopsFile() {
  const publicDirectory = await getPublicDataDirectory();
  return path.join(publicDirectory, LEGACY_PUBLIC_PUBLISHED_FILENAME);
}

export async function getRuntimeDirectory() {
  const dataDirectory = await getDataDirectory();
  const runtimeDirectory = path.join(dataDirectory, "runtime");
  await fs.mkdir(runtimeDirectory, { recursive: true });
  return runtimeDirectory;
}

export async function getTaskRuntimeDirectory(taskId: string) {
  const runtimeDirectory = await getRuntimeDirectory();
  const taskDirectory = path.join(runtimeDirectory, "tasks", taskId);
  await fs.mkdir(taskDirectory, { recursive: true });
  return taskDirectory;
}

export async function deleteTaskRuntimeDirectory(taskId: string) {
  const runtimeDirectory = await getRuntimeDirectory();
  const taskDirectory = path.join(runtimeDirectory, "tasks", taskId);

  if (await pathExists(taskDirectory)) {
    await fs.rm(taskDirectory, { recursive: true, force: true });
  }
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, payload: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readPublishedDataPayload(fallback: PublishedData) {
  const publishedDataFile = await getPublishedDataFile();

  if (await pathExists(publishedDataFile)) {
    return {
      filePath: publishedDataFile,
      payload: await readJsonFile<PublishedData>(publishedDataFile, fallback)
    };
  }

  const legacyFile = await getLegacyPublishedDataFile();
  const legacyPayload = await readJsonFile<unknown>(legacyFile, fallback);

  if (
    legacyPayload &&
    typeof legacyPayload === "object" &&
    Array.isArray((legacyPayload as Partial<PublishedData>).shopProducts)
  ) {
    return {
      filePath: legacyFile,
      payload: legacyPayload as PublishedData
    };
  }

  return {
    filePath: publishedDataFile,
    payload: fallback
  };
}

async function writePublishedData(published: PublishedData, sources?: DataSource[]) {
  const normalized = normalizePublished(published);
  const publicPublished = filterPublishedDataBySourceVisibility(normalized, sources);
  const meta = buildPublishedMeta(publicPublished);
  const detailsDirectory = await getPublicShopDetailsDirectory();
  const publishedDataFile = await getPublishedDataFile();
  const publishedMetaFile = await getPublishedMetaFile();
  const publishedProductsFile = await getPublishedProductsFile();
  const publishedDiffsFile = await getPublishedDiffsFile();
  const publishedShopsFile = await getPublishedShopsFile();

  await writeJsonFile(publishedDataFile, publicPublished);
  await writeJsonFile(publishedMetaFile, meta);
  await writeJsonFile(publishedShopsFile, buildPublishedShopIndex(publicPublished, meta));
  await writeJsonFile(publishedProductsFile, buildPublishedProductCatalog(publicPublished, meta));
  await writeJsonFile(publishedDiffsFile, buildPublishedDiffFeed(publicPublished));
  await fs.rm(detailsDirectory, { recursive: true, force: true });
  await fs.mkdir(detailsDirectory, { recursive: true });

  await Promise.all(
    publicPublished.shops.map((shop) =>
      writeJsonFile(path.join(detailsDirectory, `${shop.shopId}.json`), buildPublishedShopDetail(shop, publicPublished))
    )
  );

  return publicPublished;
}

export async function getPlatformState() {
  const filePath = await getPlatformStateFile();
  const fallback = createEmptyPlatformState();
  const parsed = await readJsonFile<PlatformState>(filePath, fallback);
  return normalizeState(parsed);
}

export async function savePlatformState(nextState: PlatformState) {
  const filePath = await getPlatformStateFile();
  const current = await getPlatformState();
  const normalized = normalizeState({
    ...nextState,
    version: Math.max(current.version + 1, nextState.version || 1),
    updatedAt: nowIso()
  });

  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await writePublishedData(normalized.published, normalized.sources);
  return normalized;
}

export async function updatePlatformState(
  mutator: (current: PlatformState) => PlatformState | Promise<PlatformState>
) {
  const current = await getPlatformState();
  const next = await mutator(current);
  return savePlatformState(next);
}

export async function getPublishedData() {
  const fallback = createEmptyPublishedData(nowIso());
  const { payload: parsed } = await readPublishedDataPayload(fallback);
  const normalized = normalizePublished(parsed);

  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await writePublishedData(normalized);
  }

  return normalized;
}

export async function getTaskById(id: string) {
  const state = await getPlatformState();
  return state.tasks.find((task) => task.id === id) ?? null;
}

export async function getReviewById(id: string) {
  const state = await getPlatformState();
  return state.reviews.find((review) => review.id === id) ?? null;
}

export async function replaceReview(nextReview: ReviewRecord) {
  return updatePlatformState((current) => ({
    ...current,
    reviews: current.reviews.map((review) => (review.id === nextReview.id ? nextReview : review))
  }));
}

export async function getStoragePaths() {
  return {
    dataDirectory: await getDataDirectory(),
    platformStateFile: await getPlatformStateFile(),
    runtimeDirectory: await getRuntimeDirectory(),
    publicDataDirectory: await getPublicDataDirectory(),
    publicShopDetailsDirectory: await getPublicShopDetailsDirectory(),
    publishedDataFile: await getPublishedDataFile(),
    publishedMetaFile: await getPublishedMetaFile(),
    publishedShopsFile: await getPublishedShopsFile(),
    publishedProductsFile: await getPublishedProductsFile(),
    publishedDiffsFile: await getPublishedDiffsFile()
  };
}
