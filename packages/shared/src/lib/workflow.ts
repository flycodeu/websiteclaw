import { randomUUID } from "node:crypto";
import {
  DataSource,
  NewSourcePayload,
  PlatformState,
  ProductItem,
  ProductObservation,
  ProductPricePoint,
  ProductPriceTrend,
  ProductStatus,
  PublishedShopProduct,
  ReviewRecord,
  SaveReviewPayload,
  ShopChange,
  ShopDiff,
  ShopSnapshot,
  ShopStatus,
  StockStatus,
  TaskStatus,
  TaskTimelineItem,
  UpdateSourcePayload
} from "./types";
import { deleteTaskRuntimeDirectory, getPlatformState, savePlatformState } from "./store";
import { stockStatusLabels } from "./labels";

const HISTORY_LIMIT = 10;
const MAX_MISSING_STREAK = 3;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function dedupe<T>(items: T[]) {
  return [...new Set(items)];
}

function buildTimeline(items: TaskTimelineItem[], title: string, detail: string) {
  return [
    ...items,
    {
      at: nowIso(),
      title,
      detail
    }
  ];
}

function trimHistory<T>(items: T[]) {
  return items.slice(0, HISTORY_LIMIT);
}

function dedupeProductsByKey(items: ProductItem[]) {
  const map = new Map<string, ProductItem>();

  items.forEach((item) => {
    map.set(item.productKey, item);
  });

  return [...map.values()];
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
  const resolvedCurrentPrice =
    Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : latest?.price && latest.price > 0 ? latest.price : 0;
  const previousPrice = previous?.price && previous.price > 0 ? previous.price : null;
  const changeAmount = previousPrice === null ? 0 : resolvedCurrentPrice - previousPrice;
  const changePercent =
    previousPrice && previousPrice > 0 ? Number((((resolvedCurrentPrice - previousPrice) / previousPrice) * 100).toFixed(2)) : null;

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
    currentPrice: resolvedCurrentPrice,
    changeAmount: Number(changeAmount.toFixed(2)),
    changePercent,
    lowestPrice: values.length > 0 ? Math.min(...values) : null,
    highestPrice: values.length > 0 ? Math.max(...values) : null,
    sampleCount: priceHistory.length
  };
}

function buildPublishedProductRecord(item: Omit<PublishedShopProduct, "priceHistory" | "priceTrend">): PublishedShopProduct {
  const history = trimHistory(item.history);
  const priceHistory = buildPriceHistory(history);

  return {
    ...item,
    history,
    priceHistory,
    priceTrend: buildPriceTrend(priceHistory, item.current.price)
  };
}

function buildChangeComparableMap(items: ProductItem[]) {
  return new Map(items.filter((item) => item.productKey).map((item) => [item.productKey, item] as const));
}

function buildChanges(previousProducts: ProductItem[], nextProducts: ProductItem[]) {
  const previousMap = buildChangeComparableMap(previousProducts);
  const nextMap = buildChangeComparableMap(nextProducts);
  const changes: ShopChange[] = [];

  nextMap.forEach((product, productKey) => {
    const previous = previousMap.get(productKey);

    if (!previous) {
      changes.push({
        type: "PRODUCT_ADDED",
        productKey,
        productLabel: product.rawName,
        note: `${product.rawName} 已进入当前商品列表。`
      });
      return;
    }

    if (previous.price !== product.price) {
      changes.push({
        type: previous.price < product.price ? "PRICE_INCREASED" : "PRICE_DECREASED",
        productKey,
        productLabel: product.rawName,
        oldPrice: previous.price,
        newPrice: product.price,
        note: `${product.rawName} 价格从 ¥${previous.price} 变为 ¥${product.price}。`
      });
    }

    if (previous.stockStatus !== product.stockStatus || previous.status !== product.status) {
      changes.push({
        type: "STOCK_CHANGED",
        productKey,
        productLabel: product.rawName,
        oldStockStatus: previous.stockStatus,
        newStockStatus: product.stockStatus,
        note: `${product.rawName} 库存状态由 ${stockStatusLabels[previous.stockStatus]} 变更为 ${stockStatusLabels[product.stockStatus]}。`
      });
    }

    if (previous.warrantySupported !== product.warrantySupported) {
      changes.push({
        type: "WARRANTY_CHANGED",
        productKey,
        productLabel: product.rawName,
        previousWarrantySupported: previous.warrantySupported,
        nextWarrantySupported: product.warrantySupported,
        note: `${product.rawName} 质保判定发生变化。`
      });
    }
  });

  previousMap.forEach((product, productKey) => {
    if (!nextMap.has(productKey)) {
      changes.push({
        type: "PRODUCT_REMOVED",
        productKey,
        productLabel: product.rawName,
        note: `${product.rawName} 本次未再检测到。`
      });
    }
  });

  return changes;
}

function buildDiffSummary(changes: ShopChange[]) {
  if (changes.length === 0) {
    return "本次抓取未发现明显变动。";
  }

  const counters = changes.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.type] = (accumulator[item.type] ?? 0) + 1;
    return accumulator;
  }, {});

  const parts = [
    counters.PRODUCT_ADDED ? `新增 ${counters.PRODUCT_ADDED} 项` : "",
    counters.PRODUCT_REMOVED ? `移除 ${counters.PRODUCT_REMOVED} 项` : "",
    counters.PRICE_DECREASED ? `降价 ${counters.PRICE_DECREASED} 项` : "",
    counters.PRICE_INCREASED ? `涨价 ${counters.PRICE_INCREASED} 项` : "",
    counters.STOCK_CHANGED ? `库存变化 ${counters.STOCK_CHANGED} 项` : "",
    counters.WARRANTY_CHANGED ? `质保变化 ${counters.WARRANTY_CHANGED} 项` : ""
  ].filter(Boolean);

  return parts.join("，");
}

function buildObservation(
  shopId: string,
  sourceId: string,
  review: ReviewRecord,
  product: ProductItem
): ProductObservation {
  return {
    shopId,
    sourceId,
    productKey: product.productKey,
    rawName: product.rawName,
    category: product.category,
    specLabel: product.specLabel,
    price: product.price,
    currency: product.currency,
    stockStatus: product.stockStatus,
    status: product.status,
    inventoryText: product.inventoryText,
    warrantySupported: product.warrantySupported,
    isDetected: product.isDetected,
    capturedAt: product.updatedAt,
    snapshotDate: review.snapshotDate,
    crawlTaskId: review.taskId,
    reviewId: review.id,
    sourceLine: product.sourceLine
  };
}

function buildMissingProduct(previous: PublishedShopProduct, timestamp: string): ProductItem {
  return {
    ...previous.current,
    stockStatus: "OUT_OF_STOCK",
    status: "OFFLINE",
    inventoryText: "本次抓取未再次识别",
    isDetected: false,
    updatedAt: timestamp
  };
}

function sortPublishedProducts(items: PublishedShopProduct[]) {
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

function sortArchivedProducts(items: PublishedShopProduct[]) {
  return [...items].sort((left, right) => {
    const removedDiff = Date.parse(right.removedAt ?? right.current.updatedAt) - Date.parse(left.removedAt ?? left.current.updatedAt);
    if (removedDiff !== 0) {
      return removedDiff;
    }

    return right.current.rawName.localeCompare(left.current.rawName, "zh-CN");
  });
}

function mergeShopProducts(
  shopId: string,
  sourceId: string,
  review: ReviewRecord,
  previousProducts: PublishedShopProduct[],
  previousArchivedProducts: PublishedShopProduct[]
) {
  const previousByKey = new Map(
    [...previousArchivedProducts, ...previousProducts].map((item) => [item.productKey, item] as const)
  );
  const nextDetected = dedupeProductsByKey(
    review.products.map((product) => ({
      ...product,
      isDetected: true
    }))
  );
  const nextByKey = new Map(nextDetected.map((item) => [item.productKey, item]));
  const activeProducts: PublishedShopProduct[] = [];
  const archivedProducts: PublishedShopProduct[] = [];

  nextDetected.forEach((product) => {
    const previous = previousByKey.get(product.productKey);
    const observation = buildObservation(shopId, sourceId, review, product);

    activeProducts.push(
      buildPublishedProductRecord({
        shopId,
        sourceId,
        productKey: product.productKey,
        category: product.category,
        specLabel: product.specLabel,
        current: product,
        history: [observation, ...(previous?.history ?? [])],
        missingStreak: 0,
        lastSeenAt: product.updatedAt,
        lastMissingAt: undefined,
        removedAt: undefined
      })
    );
  });

  previousProducts.forEach((product) => {
    if (nextByKey.has(product.productKey)) {
      return;
    }

    const missingAt = nowIso();
    const missingCurrent = buildMissingProduct(product, missingAt);
    const observation = buildObservation(shopId, sourceId, review, missingCurrent);
    const missingStreak = Math.max(product.missingStreak, 0) + 1;
    const nextRecord = buildPublishedProductRecord({
      shopId,
      sourceId,
      productKey: product.productKey,
      category: product.category,
      specLabel: product.specLabel,
      current: missingCurrent,
      history: [observation, ...product.history],
      missingStreak,
      lastSeenAt: product.lastSeenAt || product.current.updatedAt,
      lastMissingAt: missingAt,
      removedAt: missingStreak >= MAX_MISSING_STREAK ? missingAt : undefined
    });

    if (missingStreak >= MAX_MISSING_STREAK) {
      archivedProducts.push(nextRecord);
      return;
    }

    activeProducts.push(nextRecord);
  });

  previousArchivedProducts.forEach((product) => {
    if (nextByKey.has(product.productKey)) {
      return;
    }

    archivedProducts.push(product);
  });

  return {
    activeProducts: sortPublishedProducts(activeProducts),
    archivedProducts: sortArchivedProducts(archivedProducts)
  };
}

function buildShopStatus(products: PublishedShopProduct[]): ShopStatus {
  const visibleProducts = products.filter((item) => item.current.isDetected);

  if (visibleProducts.length === 0) {
    return "RISK";
  }

  const inStockCount = visibleProducts.filter((item) => item.current.stockStatus === "IN_STOCK").length;
  return inStockCount > 0 ? "OPEN" : "RISK";
}

function buildShopSummary(
  source: DataSource,
  shopId: string,
  shopProducts: PublishedShopProduct[],
  recentChangeCount: number,
  runCount: number,
  currentVersion: number
) {
  const activeProducts = shopProducts;
  const visibleProducts = activeProducts.filter((item) => item.current.isDetected);
  const inStockCount = activeProducts.filter((item) => item.current.stockStatus === "IN_STOCK").length;
  const lowStockCount = activeProducts.filter((item) => item.current.stockStatus === "LOW_STOCK").length;
  const outOfStockCount = activeProducts.filter((item) => item.current.stockStatus === "OUT_OF_STOCK").length;
  const visiblePrices = visibleProducts
    .map((item) => item.current.price)
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    shopId,
    sourceId: source.sourceId,
    name: source.sourceName,
    url: source.sourceUrl,
    status: buildShopStatus(shopProducts),
    currentVersion,
    lastCrawledAt: nowIso(),
    productCount: activeProducts.length,
    inStockCount,
    lowStockCount,
    outOfStockCount,
    lowestPrice: visiblePrices.length > 0 ? Math.min(...visiblePrices) : 0,
    categories: dedupe(activeProducts.map((item) => item.category)),
    recentChangeCount,
    runCount
  };
}

function trimSnapshotsForShop(shopId: string, items: ShopSnapshot[]) {
  return trimHistory(items.filter((item) => item.shopId === shopId));
}

function trimDiffsForShop(shopId: string, items: ShopDiff[]) {
  return trimHistory(items.filter((item) => item.shopId === shopId));
}

function upsertShopSummary(items: PlatformState["published"]["shops"], nextShop: PlatformState["published"]["shops"][number]) {
  return [nextShop, ...items.filter((item) => item.shopId !== nextShop.shopId)];
}

function upsertShopProducts(items: PublishedShopProduct[], shopId: string, nextProducts: PublishedShopProduct[]) {
  return [...nextProducts, ...items.filter((item) => item.shopId !== shopId)];
}

function markBatchSourceCompleted(
  batch: PlatformState["crawlBatch"],
  sourceId: string
): PlatformState["crawlBatch"] {
  if (!batch || !batch.sourceIds.includes(sourceId)) {
    return batch;
  }

  const completedSourceIds = dedupe([...batch.completedSourceIds, sourceId]);
  const nextIndex = batch.sourceIds.findIndex((item) => !completedSourceIds.includes(item));

  if (nextIndex === -1) {
    return null;
  }

  return {
    ...batch,
    completedSourceIds,
    currentIndex: nextIndex,
    currentSourceId: batch.sourceIds[nextIndex],
    currentTaskId: undefined,
    updatedAt: nowIso(),
    finishedAt: undefined
  };
}

function cancelBatchIfSourceAffected(
  batch: PlatformState["crawlBatch"],
  sourceIds: string[]
): PlatformState["crawlBatch"] {
  if (!batch || sourceIds.length === 0) {
    return batch;
  }

  return sourceIds.some((sourceId) => batch.sourceIds.includes(sourceId) || batch.currentSourceId === sourceId) ? null : batch;
}

function cancelBatchIfTaskAffected(batch: PlatformState["crawlBatch"], tasks: Array<{ batchId?: string }>): PlatformState["crawlBatch"] {
  if (!batch || tasks.length === 0) {
    return batch;
  }

  return tasks.some((task) => task.batchId === batch.batchId) ? null : batch;
}

export async function createSource(payload: NewSourcePayload) {
  const sourceName = payload.sourceName?.trim();
  const sourceUrl = payload.sourceUrl?.trim();

  if (!sourceName || !sourceUrl) {
    throw new Error("名称和链接不能为空");
  }

  const state = await getPlatformState();
  const now = nowIso();
  const source: DataSource = {
    sourceId: createId("src"),
    sourceName,
    sourceUrl,
    entryUrl: payload.entryUrl?.trim() || sourceUrl,
    crawlMode: payload.crawlMode ?? "AUTO",
    enabled: payload.enabled ?? true,
    visible: payload.visible ?? true,
    lastRunAt: "",
    createdAt: now,
    updatedAt: now,
    verificationMethod: payload.verificationMethod ?? "NONE",
    verificationPrompt: payload.verificationPrompt?.trim() ?? "",
    waitSelector: payload.waitSelector?.trim() || "body",
    headless: payload.headless ?? true,
    blockAssets: payload.blockAssets ?? true,
    requestHeaders: payload.requestHeaders ?? []
  };

  await savePlatformState({
    ...state,
    sources: [source, ...state.sources]
  });

  return source;
}

export async function updateSourceVisibility(sourceId: string, visible: boolean) {
  const normalizedSourceId = sourceId?.trim();

  if (!normalizedSourceId) {
    throw new Error("数据源不存在");
  }

  const state = await getPlatformState();
  const source = state.sources.find((item) => item.sourceId === normalizedSourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const updatedAt = nowIso();
  const nextSource: DataSource = {
    ...source,
    visible,
    updatedAt
  };

  await savePlatformState({
    ...state,
    sources: state.sources.map((item) => (item.sourceId === normalizedSourceId ? nextSource : item)),
    published: {
      ...state.published,
      publishedAt: updatedAt
    }
  });

  return nextSource;
}

export async function updateSource(sourceId: string, payload: UpdateSourcePayload) {
  const normalizedSourceId = sourceId?.trim();

  if (!normalizedSourceId) {
    throw new Error("数据源不存在");
  }

  const state = await getPlatformState();
  const source = state.sources.find((item) => item.sourceId === normalizedSourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const sourceName = payload.sourceName?.trim() ?? source.sourceName;
  const sourceUrl = payload.sourceUrl?.trim() ?? source.sourceUrl;
  const entryUrl = payload.entryUrl?.trim() || sourceUrl;

  if (!sourceName || !sourceUrl) {
    throw new Error("名称和链接不能为空");
  }

  const updatedAt = nowIso();
  const nextSource: DataSource = {
    ...source,
    sourceName,
    sourceUrl,
    entryUrl,
    crawlMode: payload.crawlMode ?? source.crawlMode,
    enabled: payload.enabled ?? source.enabled,
    visible: payload.visible ?? source.visible,
    verificationMethod: payload.verificationMethod ?? source.verificationMethod,
    verificationPrompt: payload.verificationPrompt?.trim() ?? source.verificationPrompt,
    waitSelector: payload.waitSelector?.trim() || "body",
    headless: payload.headless ?? source.headless,
    blockAssets: payload.blockAssets ?? source.blockAssets,
    requestHeaders: payload.requestHeaders ?? source.requestHeaders,
    updatedAt
  };

  await savePlatformState({
    ...state,
    sources: state.sources.map((item) => (item.sourceId === normalizedSourceId ? nextSource : item)),
    published: {
      ...state.published,
      shops: state.published.shops.map((shop) =>
        shop.sourceId === normalizedSourceId
          ? {
              ...shop,
              name: nextSource.sourceName,
              url: nextSource.sourceUrl
            }
          : shop
      ),
      publishedAt: updatedAt
    }
  });

  return nextSource;
}

export async function deleteSource(sourceId: string) {
  const normalizedSourceId = sourceId?.trim();

  if (!normalizedSourceId) {
    throw new Error("数据源不存在");
  }

  const state = await getPlatformState();
  const source = state.sources.find((item) => item.sourceId === normalizedSourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const taskIds = state.tasks.filter((task) => task.sourceId === normalizedSourceId).map((task) => task.id);
  const deletedReviewCount = state.reviews.filter((item) => item.sourceId === normalizedSourceId).length;
  const deletedShopCount = state.published.shops.filter((item) => item.sourceId === normalizedSourceId).length;
  const shopIds = dedupe(
    [
      ...state.published.shops.filter((shop) => shop.sourceId === normalizedSourceId).map((shop) => shop.shopId),
      `shop_${normalizedSourceId}`
    ].filter(Boolean)
  );

  const nextState: PlatformState = {
    ...state,
    sources: state.sources.filter((item) => item.sourceId !== normalizedSourceId),
    tasks: state.tasks.filter((item) => item.sourceId !== normalizedSourceId),
    reviews: state.reviews.filter((item) => item.sourceId !== normalizedSourceId),
    crawlBatch: cancelBatchIfSourceAffected(state.crawlBatch, [normalizedSourceId]),
    published: {
      ...state.published,
      shops: state.published.shops.filter((item) => item.sourceId !== normalizedSourceId),
      shopProducts: state.published.shopProducts.filter(
        (item) => item.sourceId !== normalizedSourceId && !shopIds.includes(item.shopId)
      ),
      archivedShopProducts: state.published.archivedShopProducts.filter(
        (item) => item.sourceId !== normalizedSourceId && !shopIds.includes(item.shopId)
      ),
      shopSnapshots: state.published.shopSnapshots.filter((item) => !shopIds.includes(item.shopId)),
      shopDiffs: state.published.shopDiffs.filter((item) => !shopIds.includes(item.shopId))
    }
  };

  await savePlatformState(nextState);
  await Promise.all(taskIds.map((taskId) => deleteTaskRuntimeDirectory(taskId)));

  return {
    sourceId: normalizedSourceId,
    deletedTaskCount: taskIds.length,
    deletedReviewCount,
    deletedShopCount
  };
}

export async function clearTasksByStatus(status: TaskStatus) {
  if (status !== "WAITING_HUMAN" && status !== "REVIEWING" && status !== "FAILED") {
    throw new Error("仅支持清空待补充验证、待校对和失败任务");
  }

  const state = await getPlatformState();
  const tasksToClear = state.tasks.filter((task) => task.status === status);
  const taskIds = tasksToClear.map((task) => task.id);

  if (taskIds.length === 0) {
    return {
      status,
      clearedCount: 0,
      clearedTaskIds: [] as string[],
      clearedReviewCount: 0
    };
  }

  const reviewIdsToClear = new Set(tasksToClear.map((task) => task.reviewId).filter((reviewId): reviewId is string => Boolean(reviewId)));
  const nextReviews =
    status === "REVIEWING"
      ? state.reviews.filter((review) => !reviewIdsToClear.has(review.id) && !taskIds.includes(review.taskId))
      : state.reviews;

  const nextState: PlatformState = {
    ...state,
    tasks: state.tasks.filter((task) => task.status !== status),
    crawlBatch: cancelBatchIfTaskAffected(state.crawlBatch, tasksToClear),
    reviews: nextReviews
  };

  await savePlatformState(nextState);
  await Promise.all(taskIds.map((taskId) => deleteTaskRuntimeDirectory(taskId)));

  return {
    status,
    clearedCount: taskIds.length,
    clearedTaskIds: taskIds,
    clearedReviewCount: state.reviews.length - nextReviews.length
  };
}

export async function saveReviewDraft(reviewId: string, payload: SaveReviewPayload) {
  const state = await getPlatformState();
  const review = state.reviews.find((item) => item.id === reviewId);

  if (!review) {
    throw new Error("校对记录不存在");
  }

  const nextReview: ReviewRecord = {
    ...review,
    summary: payload.summary?.trim() || review.summary,
    conclusion: payload.conclusion?.trim() || review.conclusion,
    flags: payload.flags?.filter(Boolean) ?? review.flags,
    products:
      payload.products?.map((item) => ({
        ...item,
        isDetected: item.isDetected ?? true,
        updatedAt: item.updatedAt || nowIso()
      })) ?? review.products,
    status: "READY_TO_PUBLISH"
  };

  const nextState: PlatformState = {
    ...state,
    reviews: state.reviews.map((item) => (item.id === reviewId ? nextReview : item)),
    tasks: state.tasks.map((item) =>
      item.reviewId === reviewId
        ? {
            ...item,
            status: "REVIEWING",
            updatedAt: nowIso(),
            logSummary: "校对草稿已保存。",
            nextAction: "可继续校对，或直接发布到公开数据。",
            timeline: buildTimeline(item.timeline, "保存校对草稿", "商品结构已更新。")
          }
        : item
    )
  };

  await savePlatformState(nextState);
  return nextReview;
}

export async function publishReview(reviewId: string) {
  const state = await getPlatformState();
  const review = state.reviews.find((item) => item.id === reviewId);

  if (!review) {
    throw new Error("校对记录不存在");
  }

  const source = state.sources.find((item) => item.sourceId === review.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const existingShop = state.published.shops.find((item) => item.sourceId === review.sourceId);
  const shopId = existingShop?.shopId ?? `shop_${source.sourceId}`;
  const previousShopProducts = state.published.shopProducts.filter((item) => item.shopId === shopId);
  const previousArchivedProducts = state.published.archivedShopProducts.filter((item) => item.shopId === shopId);
  const nextReviewProducts = dedupeProductsByKey(review.products);
  const diffCapturedAt = nowIso();
  const nextMergedProducts = mergeShopProducts(
    shopId,
    source.sourceId,
    review,
    previousShopProducts,
    previousArchivedProducts
  );
  const previousProductMap = new Map(previousShopProducts.map((item) => [item.productKey, item] as const));
  const changes = buildChanges(
    previousShopProducts.map((item) => item.current),
    nextMergedProducts.activeProducts.map((item) => item.current)
  ).map((change) => {
    if (change.type !== "PRODUCT_REMOVED" || !change.productKey) {
      return change;
    }

    const previousProduct = previousProductMap.get(change.productKey);
    const productLabel = change.productLabel ?? previousProduct?.current.rawName ?? change.productKey;

    return {
      ...change,
      note: `${productLabel} 连续 ${Math.max((previousProduct?.missingStreak ?? MAX_MISSING_STREAK - 1) + 1, MAX_MISSING_STREAK)} 次未再检测到，已从公开列表移除。`
    };
  });
  const snapshot: ShopSnapshot = {
    shopId,
    crawlTaskId: review.taskId,
    version: Math.max(review.crawlVersion ?? existingShop?.currentVersion ?? 0, 0),
    snapshotDate: review.snapshotDate,
    capturedAt: diffCapturedAt,
    summary: review.summary,
    conclusion: review.conclusion,
    productCount: nextReviewProducts.filter((item) => item.isDetected).length,
    productKeys: nextReviewProducts.map((item) => item.productKey)
  };
  const previousSnapshots = state.published.shopSnapshots.filter((item) => item.shopId === shopId);
  const nextSnapshots = trimSnapshotsForShop(shopId, [snapshot, ...previousSnapshots]);
  const nextRunCount = Math.max(existingShop?.runCount ?? 0, 0) + 1;
  const currentVersion = Math.max(review.crawlVersion ?? existingShop?.currentVersion ?? nextRunCount - 1, 0);
  const nextShop = buildShopSummary(
    source,
    shopId,
    nextMergedProducts.activeProducts,
    changes.length,
    nextRunCount,
    currentVersion
  );
  const diffChanges =
    existingShop && existingShop.status !== nextShop.status
      ? [
          ...changes,
          {
            type: "SHOP_STATUS_CHANGED" as const,
            note: `站点状态由 ${existingShop.status} 变更为 ${nextShop.status}。`
          }
        ]
      : changes;
  const diff: ShopDiff = {
    shopId,
    version: currentVersion,
    snapshotDate: review.snapshotDate,
    capturedAt: diffCapturedAt,
    changes: diffChanges,
    summary: buildDiffSummary(diffChanges)
  };
  const previousDiffs = state.published.shopDiffs.filter((item) => item.shopId === shopId);
  const nextDiffs = trimDiffsForShop(shopId, [diff, ...previousDiffs]);

  const nextPublished = {
    shops: upsertShopSummary(state.published.shops, nextShop),
    shopProducts: upsertShopProducts(state.published.shopProducts, shopId, nextMergedProducts.activeProducts),
    archivedShopProducts: upsertShopProducts(
      state.published.archivedShopProducts,
      shopId,
      nextMergedProducts.archivedProducts
    ),
    shopSnapshots: [...nextSnapshots, ...state.published.shopSnapshots.filter((item) => item.shopId !== shopId)],
    shopDiffs: [...nextDiffs, ...state.published.shopDiffs.filter((item) => item.shopId !== shopId)],
    publishedAt: diffCapturedAt
  };

  const nextBatch =
    review.batchId && state.crawlBatch?.batchId === review.batchId
      ? markBatchSourceCompleted(state.crawlBatch, review.sourceId)
      : state.crawlBatch;
  const hasNextInBatch = Boolean(
    review.batchId &&
      nextBatch?.batchId === review.batchId &&
      nextBatch.sourceIds.some((sourceId) => !nextBatch.completedSourceIds.includes(sourceId))
  );
  const nextState: PlatformState = {
    ...state,
    reviews: state.reviews.map((item) =>
      item.id === reviewId
        ? {
            ...item,
            status: "PUBLISHED"
          }
        : item
    ),
    crawlBatch: nextBatch,
    tasks: state.tasks.map((item) =>
      item.reviewId === reviewId
        ? {
            ...item,
            status: "PUBLISHED",
            updatedAt: diffCapturedAt,
            finishedAt: diffCapturedAt,
            logSummary: "结果已写入公开数据。",
            nextAction: "等待下一次抓取。",
            timeline: buildTimeline(item.timeline, "发布完成", "公开数据已更新。")
          }
        : item
    ),
    published: nextPublished
  };

  await savePlatformState(nextState);
  return {
    reviewId,
    shopId,
    publishedAt: diffCapturedAt,
    batchId: review.batchId,
    crawlVersion: currentVersion,
    hasNextInBatch
  };
}
