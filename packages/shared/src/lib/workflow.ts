import { randomUUID } from "node:crypto";
import {
  DataSource,
  NewSourcePayload,
  PlatformState,
  ProductItem,
  ProductObservation,
  ProductStatus,
  PublishedShopProduct,
  ReviewRecord,
  SaveReviewPayload,
  ShopChange,
  ShopDiff,
  ShopSnapshot,
  ShopStatus,
  StockStatus,
  TaskTimelineItem
} from "./types";
import { deleteTaskRuntimeDirectory, getPlatformState, savePlatformState } from "./store";
import { stockStatusLabels } from "./labels";

const HISTORY_LIMIT = 10;

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

function buildChangeComparableMap(items: ProductItem[]) {
  return new Map(
    items
      .filter((item) => item.isDetected)
      .map((item) => [item.productKey, item] as const)
  );
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

function mergeShopProducts(
  shopId: string,
  sourceId: string,
  review: ReviewRecord,
  previousProducts: PublishedShopProduct[]
) {
  const previousByKey = new Map(previousProducts.map((item) => [item.productKey, item]));
  const nextDetected = dedupeProductsByKey(
    review.products.map((product) => ({
      ...product,
      isDetected: true
    }))
  );
  const nextByKey = new Map(nextDetected.map((item) => [item.productKey, item]));
  const merged: PublishedShopProduct[] = [];

  nextDetected.forEach((product) => {
    const previous = previousByKey.get(product.productKey);
    const observation = buildObservation(shopId, sourceId, review, product);

    merged.push({
      shopId,
      sourceId,
      productKey: product.productKey,
      category: product.category,
      specLabel: product.specLabel,
      current: product,
      history: trimHistory([observation, ...(previous?.history ?? [])])
    });
  });

  previousProducts.forEach((product) => {
    if (nextByKey.has(product.productKey)) {
      return;
    }

    const missingCurrent = buildMissingProduct(product, nowIso());
    const observation = buildObservation(shopId, sourceId, review, missingCurrent);

    merged.push({
      ...product,
      current: missingCurrent,
      history: trimHistory([observation, ...product.history])
    });
  });

  return merged.sort((left, right) => {
    if (left.current.isDetected !== right.current.isDetected) {
      return left.current.isDetected ? -1 : 1;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, "zh-CN");
    }

    return left.current.rawName.localeCompare(right.current.rawName, "zh-CN");
  });
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
  runCount: number
) {
  const visibleProducts = shopProducts.filter((item) => item.current.isDetected);
  const inStockCount = visibleProducts.filter((item) => item.current.stockStatus === "IN_STOCK").length;
  const lowStockCount = visibleProducts.filter((item) => item.current.stockStatus === "LOW_STOCK").length;
  const outOfStockCount = visibleProducts.filter((item) => item.current.stockStatus === "OUT_OF_STOCK").length;
  const visiblePrices = visibleProducts
    .map((item) => item.current.price)
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    shopId,
    sourceId: source.sourceId,
    name: source.sourceName,
    url: source.sourceUrl,
    status: buildShopStatus(shopProducts),
    lastCrawledAt: nowIso(),
    productCount: visibleProducts.length,
    inStockCount,
    lowStockCount,
    outOfStockCount,
    lowestPrice: visiblePrices.length > 0 ? Math.min(...visiblePrices) : 0,
    categories: dedupe(visibleProducts.map((item) => item.category)),
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
    published: {
      ...state.published,
      shops: state.published.shops.filter((item) => item.sourceId !== normalizedSourceId),
      shopProducts: state.published.shopProducts.filter(
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
  const previousCurrentProducts = previousShopProducts.map((item) => item.current);
  const nextReviewProducts = dedupeProductsByKey(review.products);
  const changes = buildChanges(previousCurrentProducts, nextReviewProducts);
  const diffCapturedAt = nowIso();
  const nextShopProducts = mergeShopProducts(shopId, source.sourceId, review, previousShopProducts);
  const snapshot: ShopSnapshot = {
    shopId,
    crawlTaskId: review.taskId,
    snapshotDate: review.snapshotDate,
    capturedAt: diffCapturedAt,
    summary: review.summary,
    conclusion: review.conclusion,
    productCount: nextReviewProducts.filter((item) => item.isDetected).length,
    productKeys: nextReviewProducts.map((item) => item.productKey)
  };
  const previousSnapshots = state.published.shopSnapshots.filter((item) => item.shopId === shopId);
  const nextSnapshots = trimSnapshotsForShop(shopId, [snapshot, ...previousSnapshots]);
  const nextShop = buildShopSummary(source, shopId, nextShopProducts, changes.length, nextSnapshots.length);
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
    snapshotDate: review.snapshotDate,
    capturedAt: diffCapturedAt,
    changes: diffChanges,
    summary: buildDiffSummary(diffChanges)
  };
  const previousDiffs = state.published.shopDiffs.filter((item) => item.shopId === shopId);
  const nextDiffs = trimDiffsForShop(shopId, [diff, ...previousDiffs]);

  const nextPublished = {
    shops: upsertShopSummary(state.published.shops, nextShop),
    shopProducts: upsertShopProducts(state.published.shopProducts, shopId, nextShopProducts),
    shopSnapshots: [...nextSnapshots, ...state.published.shopSnapshots.filter((item) => item.shopId !== shopId)],
    shopDiffs: [...nextDiffs, ...state.published.shopDiffs.filter((item) => item.shopId !== shopId)],
    publishedAt: diffCapturedAt
  };

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
    publishedAt: diffCapturedAt
  };
}
