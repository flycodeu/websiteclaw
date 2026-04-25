import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CrawlTask,
  DataSource,
  PlatformState,
  ProductCategory,
  ProductItem,
  ProductObservation,
  PublishedData,
  PublishedShopProduct,
  ReviewRecord,
  ShopDiff,
  ShopSnapshot,
  ShopStatus,
  StockStatus
} from "./types";

const PUBLIC_DIRECTORY_NAME = "public";
const PUBLIC_PUBLISHED_FILENAME = "published-shops.json";

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

  return "OTHER";
}

function buildProductKey(category: ProductCategory, specLabel: string) {
  const normalizedSpec = normalizeToken(specLabel || "DEFAULT") || "DEFAULT";
  return `${category}__${normalizedSpec}`;
}

function normalizeSpec(rawName: string, fallback?: string) {
  return normalizeToken(fallback || rawName || "DEFAULT") || "DEFAULT";
}

function createEmptyPublishedData(now: string): PublishedData {
  return {
    shops: [],
    shopProducts: [],
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
    artifacts: task.artifacts ?? {}
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
  const history = (item.history ?? []).map((entry) => normalizeObservation(entry));

  return {
    shopId: item.shopId?.trim() || "",
    sourceId: item.sourceId?.trim() || "",
    productKey: item.productKey?.trim() || current.productKey,
    category: item.category ?? current.category,
    specLabel: item.specLabel?.trim() || current.specLabel,
    current,
    history
  };
}

function normalizeSnapshot(item: Partial<ShopSnapshot>): ShopSnapshot {
  return {
    shopId: item.shopId?.trim() || "",
    crawlTaskId: item.crawlTaskId,
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
    snapshotDate: item.snapshotDate ?? nowIso().slice(0, 10),
    capturedAt: item.capturedAt ?? nowIso(),
    changes: item.changes ?? [],
    summary: item.summary?.trim() || ""
  };
}

function normalizeReview(item: ReviewRecord): ReviewRecord {
  return {
    ...item,
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
    shopSnapshots: (state.shopSnapshots ?? state.snapshots ?? []).map((item) => normalizeSnapshot(item)),
    shopDiffs: (state.shopDiffs ?? state.diffs ?? []).map((item) => normalizeDiff(item)),
    publishedAt: state.publishedAt ?? nowIso()
  };
}

function normalizeState(state: PlatformState): PlatformState {
  const fallback = createEmptyPlatformState();

  return {
    version: state.version ?? fallback.version,
    updatedAt: state.updatedAt ?? fallback.updatedAt,
    sources: (state.sources ?? []).map((source) =>
      normalizeSource(source as Partial<DataSource> & Pick<DataSource, "sourceId" | "sourceName" | "sourceUrl">)
    ),
    tasks: (state.tasks ?? []).map((task) =>
      normalizeTask(
        task as Partial<CrawlTask> &
          Pick<
            CrawlTask,
            "id" | "sourceId" | "sourceName" | "status" | "startedAt" | "updatedAt" | "logSummary" | "nextAction" | "rawUrl"
          >
      )
    ),
    reviews: (state.reviews ?? []).map((review) => normalizeReview(review)),
    published: normalizePublished(state.published ?? fallback.published)
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

async function getPublishedDataFile() {
  const publicDirectory = await getPublicDataDirectory();
  const filePath = path.join(publicDirectory, PUBLIC_PUBLISHED_FILENAME);

  if (!(await pathExists(filePath))) {
    await fs.writeFile(filePath, `${JSON.stringify(createEmptyPublishedData(nowIso()), null, 2)}\n`, "utf8");
  }

  return filePath;
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

async function writePublishedData(published: PublishedData) {
  const filePath = await getPublishedDataFile();
  const normalized = normalizePublished(published);
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
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
  await writePublishedData(normalized.published);
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
  const filePath = await getPublishedDataFile();
  const fallback = createEmptyPublishedData(nowIso());
  const parsed = await readJsonFile<PublishedData>(filePath, fallback);
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
    publishedDataFile: await getPublishedDataFile()
  };
}
