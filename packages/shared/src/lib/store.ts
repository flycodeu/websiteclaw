import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CrawlTask,
  DataSource,
  PlatformState,
  PublishedData,
  ReviewRecord
} from "./types";

let workspaceRootPromise: Promise<string> | undefined;

function createEmptyPublishedData(now: string): PublishedData {
  return {
    shops: [],
    snapshots: [],
    diffs: [],
    priceRankings: [],
    stabilityRankings: [],
    compareGroups: [],
    overviewMetrics: [
      { label: "已监控商铺", value: "0", detail: "暂无已发布数据" },
      { label: "今日有效商品", value: "0", detail: "等待首次抓取和发布" },
      { label: "待处理任务", value: "0", detail: "当前没有待人工任务" },
      { label: "发布成功率", value: "0%", detail: "尚未产生发布记录" }
    ],
    publishedAt: now
  };
}

function createEmptyPlatformState(): PlatformState {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    sources: [],
    tasks: [],
    reviews: [],
    published: createEmptyPublishedData(now)
  };
}

function normalizeSource(source: Partial<DataSource> & Pick<DataSource, "sourceId" | "sourceName" | "sourceUrl">): DataSource {
  const now = new Date().toISOString();

  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    entryUrl: source.entryUrl ?? source.sourceUrl,
    crawlMode: source.crawlMode ?? "AUTO",
    enabled: source.enabled ?? true,
    remark: source.remark ?? "",
    parserHint: source.parserHint ?? "",
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

function normalizeTask(task: Partial<CrawlTask> & Pick<CrawlTask, "id" | "sourceId" | "sourceName" | "status" | "startedAt" | "updatedAt" | "logSummary" | "nextAction" | "rawUrl">): CrawlTask {
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
          Pick<CrawlTask, "id" | "sourceId" | "sourceName" | "status" | "startedAt" | "updatedAt" | "logSummary" | "nextAction" | "rawUrl">
      )
    ),
    reviews: state.reviews ?? [],
    published: state.published ?? fallback.published
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

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
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
    updatedAt: new Date().toISOString()
  });

  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
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
  const state = await getPlatformState();
  return state.published;
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
    runtimeDirectory: await getRuntimeDirectory()
  };
}
