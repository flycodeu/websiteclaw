import { randomUUID } from "node:crypto";
import {
  ChangeType,
  DataSource,
  NewSourcePayload,
  PlatformState,
  ProductItem,
  ReviewRecord,
  SaveReviewPayload,
  ShopChange,
  ShopDiff,
  ShopSnapshot,
  ShopSummary,
  StockStatus,
  TaskTimelineItem
} from "./types";
import { getPlatformState, savePlatformState } from "./store";
import { stockStatusLabels } from "./labels";

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

function buildChanges(previousProducts: ProductItem[], nextProducts: ProductItem[]) {
  const previousMap = new Map(previousProducts.map((item) => [item.normalizedType, item]));
  const nextMap = new Map(nextProducts.map((item) => [item.normalizedType, item]));
  const changes: ShopChange[] = [];

  nextProducts.forEach((product) => {
    const previous = previousMap.get(product.normalizedType);

    if (!previous) {
      changes.push({
        type: "PRODUCT_ADDED",
        productType: product.normalizedType,
        note: `${product.rawName} 首次出现在本次抓取结果中。`
      });
      return;
    }

    if (previous.price !== product.price) {
      changes.push({
        type: previous.price < product.price ? "PRICE_INCREASED" : "PRICE_DECREASED",
        productType: product.normalizedType,
        oldPrice: previous.price,
        newPrice: product.price,
        note: `${product.rawName} 价格从 ¥${previous.price} 变为 ¥${product.price}。`
      });
    }

    if (previous.stockStatus !== product.stockStatus || previous.status !== product.status) {
      changes.push({
        type: "STOCK_CHANGED",
        productType: product.normalizedType,
        note: `${product.rawName} 库存状态由 ${stockStatusLabels[previous.stockStatus]} 变更为 ${stockStatusLabels[product.stockStatus]}。`
      });
    }
  });

  previousProducts.forEach((product) => {
    if (!nextMap.has(product.normalizedType)) {
      changes.push({
        type: "PRODUCT_REMOVED",
        productType: product.normalizedType,
        note: `${product.rawName} 在本次抓取中未再出现。`
      });
    }
  });

  return changes;
}

function buildDiffSummary(changes: ShopChange[]) {
  if (changes.length === 0) {
    return "本次抓取未发现明显变化。";
  }

  const grouped = changes.reduce<Record<ChangeType, number>>(
    (accumulator, item) => ({
      ...accumulator,
      [item.type]: (accumulator[item.type] ?? 0) + 1
    }),
    {
      PRODUCT_ADDED: 0,
      PRODUCT_REMOVED: 0,
      PRICE_DECREASED: 0,
      PRICE_INCREASED: 0,
      STOCK_CHANGED: 0,
      SHOP_STATUS_CHANGED: 0
    }
  );

  const parts = [
    grouped.PRODUCT_ADDED > 0 ? `新增 ${grouped.PRODUCT_ADDED} 项` : "",
    grouped.PRODUCT_REMOVED > 0 ? `下架 ${grouped.PRODUCT_REMOVED} 项` : "",
    grouped.PRICE_DECREASED > 0 ? `降价 ${grouped.PRICE_DECREASED} 项` : "",
    grouped.PRICE_INCREASED > 0 ? `涨价 ${grouped.PRICE_INCREASED} 项` : "",
    grouped.STOCK_CHANGED > 0 ? `库存变化 ${grouped.STOCK_CHANGED} 项` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("，") : "本次抓取完成，建议人工快速复核。";
}

function buildShopTags(source: DataSource, products: ProductItem[], riskNotes: string[]) {
  const tags = [source.crawlMode === "AUTO" ? "自动抓取" : "人工辅助"];

  if (source.verificationMethod !== "NONE") {
    tags.push("需要验证");
  }

  if (products.some((item) => item.stockStatus === "LOW_STOCK")) {
    tags.push("低库存");
  }

  if (products.some((item) => item.stockStatus === "OUT_OF_STOCK")) {
    tags.push("存在缺货");
  }

  if (riskNotes.length > 0) {
    tags.push("AI 已分析");
  }

  return dedupe(tags).slice(0, 4);
}

function scoreStability(source: DataSource, products: ProductItem[]) {
  const lowStockCount = products.filter((item) => item.stockStatus === "LOW_STOCK").length;
  const outOfStockCount = products.filter((item) => item.stockStatus === "OUT_OF_STOCK").length;
  const base = source.crawlMode === "AUTO" ? 88 : 80;
  const verificationPenalty = source.verificationMethod === "NONE" ? 0 : 6;
  return clamp(base - lowStockCount * 4 - outOfStockCount * 7 - verificationPenalty, 45, 97);
}

function buildShopSummary(source: DataSource, review: ReviewRecord, existingShop: ShopSummary | undefined): ShopSummary {
  const totalPrice = review.products.reduce((sum, item) => sum + item.price, 0);
  const productCount = review.products.length;
  const status = productCount > 0 ? "OPEN" : "RISK";

  return {
    shopId: existingShop?.shopId ?? `shop_${source.sourceId}`,
    sourceId: source.sourceId,
    name: source.sourceName,
    url: source.sourceUrl,
    status,
    lastCrawledAt: nowIso(),
    stabilityScore: scoreStability(source, review.products),
    productCount,
    lowestPrice: productCount > 0 ? Math.min(...review.products.map((item) => item.price)) : 0,
    averagePrice: productCount > 0 ? Number((totalPrice / productCount).toFixed(2)) : 0,
    tags: buildShopTags(source, review.products, review.riskNotes),
    healthNote: review.aiConclusion || source.remark || "等待更多样本判断稳定性。"
  };
}

function buildPriceRankings(shops: ShopSummary[]) {
  return shops
    .filter((shop) => shop.productCount > 0)
    .sort((left, right) => left.lowestPrice - right.lowestPrice)
    .slice(0, 5)
    .map((shop, index) => ({
      rank: index + 1,
      shopId: shop.shopId,
      shopName: shop.name,
      metricLabel: "最低报价",
      value: shop.lowestPrice,
      description: `当前最低有效价格为 ¥${shop.lowestPrice}。`
    }));
}

function buildStabilityRankings(shops: ShopSummary[]) {
  return shops
    .filter((shop) => shop.productCount > 0)
    .sort((left, right) => right.stabilityScore - left.stabilityScore)
    .slice(0, 5)
    .map((shop, index) => ({
      rank: index + 1,
      shopId: shop.shopId,
      shopName: shop.name,
      metricLabel: "稳定度",
      value: shop.stabilityScore,
      description: "结合抓取连通性、库存波动和验证成本计算。"
    }));
}

function buildCompareGroups(shops: ShopSummary[], snapshots: ShopSnapshot[]) {
  const latestSnapshotByShop = new Map<string, ShopSnapshot>();

  snapshots.forEach((snapshot) => {
    const current = latestSnapshotByShop.get(snapshot.shopId);

    if (!current || current.snapshotDate < snapshot.snapshotDate) {
      latestSnapshotByShop.set(snapshot.shopId, snapshot);
    }
  });

  const grouped = new Map<
    string,
    Array<{
      shopId: string;
      shopName: string;
      price: number;
      currency: string;
      stockStatus: StockStatus;
      stabilityScore: number;
    }>
  >();

  shops.forEach((shop) => {
    const snapshot = latestSnapshotByShop.get(shop.shopId);

    snapshot?.products.forEach((product) => {
      const current = grouped.get(product.normalizedType) ?? [];
      current.push({
        shopId: shop.shopId,
        shopName: shop.name,
        price: product.price,
        currency: product.currency,
        stockStatus: product.stockStatus,
        stabilityScore: shop.stabilityScore
      });
      grouped.set(product.normalizedType, current);
    });
  });

  return [...grouped.entries()]
    .map(([normalizedType, offers]) => ({
      normalizedType,
      trend:
        offers.length > 1
          ? `共发现 ${offers.length} 家店铺可比价，最低价 ¥${Math.min(...offers.map((offer) => offer.price))}。`
          : "当前仅有单一来源，建议继续补充样本。",
      offers: offers.sort((left, right) => left.price - right.price)
    }))
    .slice(0, 8);
}

function buildOverviewMetrics(state: PlatformState, published: PlatformState["published"]) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayTasks = state.tasks.filter((task) => task.startedAt.startsWith(today));
  const publishedTasks = state.tasks.filter((task) => task.status === "PUBLISHED");
  const successRate =
    state.tasks.length > 0 ? `${Math.round((publishedTasks.length / state.tasks.length) * 100)}%` : "0%";

  return [
    {
      label: "已监控商铺",
      value: `${published.shops.length}`.padStart(2, "0"),
      detail: `${state.sources.filter((source) => source.enabled).length} 个数据源处于启用状态`
    },
    {
      label: "今日有效商品",
      value: `${published.shops.reduce((sum, shop) => sum + shop.productCount, 0)}`,
      detail: `今日任务 ${todayTasks.length} 条，已生成最新发布快照`
    },
    {
      label: "待处理任务",
      value: `${state.tasks.filter((task) => task.status === "WAITING_HUMAN" || task.status === "REVIEWING").length}`,
      detail: `${state.tasks.filter((task) => task.status === "WAITING_HUMAN").length} 条待验证，${state.tasks.filter((task) => task.status === "REVIEWING").length} 条待审核`
    },
    {
      label: "发布成功率",
      value: successRate,
      detail: `${publishedTasks.length} 条任务已写入发布结果`
    }
  ];
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
    remark: payload.remark?.trim() ?? "",
    parserHint: payload.parserHint?.trim() ?? "",
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

export async function saveReviewDraft(reviewId: string, payload: SaveReviewPayload) {
  const state = await getPlatformState();
  const review = state.reviews.find((item) => item.id === reviewId);

  if (!review) {
    throw new Error("审核记录不存在");
  }

  const nextReview: ReviewRecord = {
    ...review,
    extractedSummary: payload.extractedSummary?.trim() || review.extractedSummary,
    aiConclusion: payload.aiConclusion?.trim() || review.aiConclusion,
    riskNotes: payload.riskNotes?.filter(Boolean) ?? review.riskNotes,
    products:
      payload.products?.map((item) => ({
        ...item,
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
            logSummary: "审核草稿已保存。",
            nextAction: "可直接发布或继续编辑审核结果。",
            timeline: buildTimeline(item.timeline, "保存审核草稿", "结构化结果已更新。")
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
    throw new Error("审核记录不存在");
  }

  const source = state.sources.find((item) => item.sourceId === review.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const existingShop = state.published.shops.find((item) => item.sourceId === review.sourceId);
  const shop = buildShopSummary(source, review, existingShop);
  const shopId = shop.shopId;
  const previousSnapshot = [...state.published.snapshots].reverse().find((item) => item.shopId === shopId);
  const changes = buildChanges(previousSnapshot?.products ?? [], review.products);
  const diff: ShopDiff = {
    shopId,
    snapshotDate: review.snapshotDate,
    changes,
    summary: buildDiffSummary(changes)
  };
  const snapshot: ShopSnapshot = {
    shopId,
    crawlTaskId: review.taskId,
    snapshotDate: review.snapshotDate,
    summary: review.extractedSummary,
    products: review.products
  };

  const nextShops = [shop, ...state.published.shops.filter((item) => item.shopId !== shopId)];
  const nextSnapshots = [
    snapshot,
    ...state.published.snapshots.filter(
      (item) => !(item.shopId === shopId && item.snapshotDate === snapshot.snapshotDate && item.crawlTaskId === review.taskId)
    )
  ];
  const nextDiffs = [
    diff,
    ...state.published.diffs.filter((item) => !(item.shopId === shopId && item.snapshotDate === diff.snapshotDate))
  ];

  const publishedAt = nowIso();
  const nextStateBase: PlatformState = {
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
            updatedAt: nowIso(),
            finishedAt: nowIso(),
            logSummary: "审核结果已发布。",
            nextAction: "等待下一次抓取。",
            timeline: buildTimeline(item.timeline, "发布完成", "结果已写入发布数据。")
          }
        : item
    ),
    published: {
      shops: nextShops,
      snapshots: nextSnapshots,
      diffs: nextDiffs,
      priceRankings: buildPriceRankings(nextShops),
      stabilityRankings: buildStabilityRankings(nextShops),
      compareGroups: buildCompareGroups(nextShops, nextSnapshots),
      overviewMetrics: state.published.overviewMetrics,
      publishedAt
    }
  };

  const nextPublished = {
    ...nextStateBase.published,
    overviewMetrics: buildOverviewMetrics(nextStateBase, nextStateBase.published)
  };

  const nextState: PlatformState = {
    ...nextStateBase,
    published: nextPublished
  };

  await savePlatformState(nextState);
  return {
    reviewId,
    shopId,
    publishedAt
  };
}
