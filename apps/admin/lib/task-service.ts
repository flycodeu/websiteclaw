import { randomUUID } from "node:crypto";
import { stockStatusLabels } from "@shop-claw/shared/labels";
import { getPlatformState, savePlatformState } from "@shop-claw/shared/store";
import {
  AiSettings,
  ContinueTaskPayload,
  CrawlRequestPayload,
  CrawlTask,
  DataSource,
  PlatformState,
  ProductItem,
  ProductStatus,
  ReviewRecord,
  ShopChange,
  ShopStatus,
  StockStatus
} from "@shop-claw/shared/types";
import { readAiSettingsFromEnv } from "@/lib/ai-config";
import { runPlaywrightCapture, saveManualCapture } from "@/lib/playwright-crawler";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function normalizeText(input: string) {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&yen;|&#165;|&#xa5;/gi, "¥")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(raw: string) {
  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function extractRawFragments(raw: string) {
  return [...new Set(
    stripHtml(raw)
      .split(/\n+/)
      .map(normalizeText)
      .filter((line) => line.length >= 4)
      .filter((line) => /\d/.test(line) || /(claude|gpt|gemini|perplexity|pro|plus|会员|月卡|年卡)/i.test(line))
  )].slice(0, 12);
}

function inferStockStatus(line: string): StockStatus {
  if (/(out of stock|sold out|无货|售罄|缺货)/i.test(line)) {
    return "OUT_OF_STOCK";
  }

  if (/(low stock|only \d+ left|紧张|少量|仅剩|库存低)/i.test(line)) {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
}

function inferProductStatus(stockStatus: StockStatus): ProductStatus {
  if (stockStatus === "OUT_OF_STOCK") {
    return "OFFLINE";
  }

  if (stockStatus === "LOW_STOCK") {
    return "LOW_STOCK";
  }

  return "ON_SALE";
}

function normalizeProductType(name: string) {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return base || "UNSPECIFIED";
}

function heuristicParseProducts(lines: string[]) {
  const timestamp = nowIso();
  const matcher =
    /^(.+?)(?:\s*[-:：丨|]\s*|\s+)(?:¥|￥|cny|CNY|rmb|RMB)?\s*(\d+(?:\.\d{1,2})?)(?:\s*(?:元|cny|CNY|rmb|RMB))?(.*)$/;
  const parsed: ProductItem[] = [];

  lines.forEach((line) => {
    const match = line.match(matcher);

    if (!match) {
      return;
    }

    const rawName = normalizeText(match[1] ?? "");
    const price = Number.parseFloat(match[2] ?? "");

    if (!rawName || Number.isNaN(price)) {
      return;
    }

    const tail = normalizeText(match[3] ?? line);
    const stockStatus = inferStockStatus(`${rawName} ${tail}`);

    parsed.push({
      rawName,
      normalizedType: normalizeProductType(rawName),
      price,
      currency: "CNY",
      stockStatus,
      status: inferProductStatus(stockStatus),
      confidence: 0.72,
      updatedAt: timestamp,
      sourceLine: line
    });
  });

  return [...new Set(parsed.map((item) => JSON.stringify(item)))].map((item) => JSON.parse(item) as ProductItem);
}

function coerceStockStatus(value: unknown): StockStatus {
  if (value === "LOW_STOCK" || value === "库存紧张" || value === "低库存") {
    return "LOW_STOCK";
  }

  if (value === "OUT_OF_STOCK" || value === "无货" || value === "已售罄") {
    return "OUT_OF_STOCK";
  }

  return "IN_STOCK";
}

function coerceProductStatus(value: unknown, stockStatus: StockStatus): ProductStatus {
  if (value === "OFFLINE" || value === "已下架") {
    return "OFFLINE";
  }

  if (value === "LOW_STOCK" || value === "低库存") {
    return "LOW_STOCK";
  }

  return inferProductStatus(stockStatus);
}

function coerceShopStatus(value: unknown, productCount: number): ShopStatus {
  if (value === "CLOSED" || value === "已关闭") {
    return "CLOSED";
  }

  if (value === "RISK" || value === "存在风险") {
    return "RISK";
  }

  return productCount > 0 ? "OPEN" : "RISK";
}

function extractJsonObject(content: string) {
  const direct = content.trim();

  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const matched = direct.match(/\{[\s\S]*\}/);
  return matched?.[0] ?? "";
}

async function analyzeWithAi(
  settings: AiSettings,
  source: DataSource,
  rawContent: string,
  rawFragments: string[]
) {
  const fallbackProducts = heuristicParseProducts(rawFragments);

  const fallback = {
    aiModel: settings.enabled ? settings.model : "本地规则",
    extractedSummary:
      fallbackProducts.length > 0
        ? `解析到 ${fallbackProducts.length} 条商品信息，建议人工确认价格和库存。`
        : "未识别到稳定商品结构，建议补充人工抓取内容。",
    aiConclusion:
      fallbackProducts.length > 0
        ? "已使用本地规则完成首轮结构化，适合作为 AI 纠偏前的草稿。"
        : "当前内容不足以直接发布，建议先完成人工验证后重试。",
    riskNotes:
      fallbackProducts.length > 0
        ? ["商品解析使用本地规则，复杂站点可能遗漏规格。", "建议人工核对低库存与异常低价。"]
        : ["站点文本有效信息不足。", "建议提供通过验证后的页面文本、Cookie 或 storageState。"],
    products: fallbackProducts,
    shopStatus: coerceShopStatus(undefined, fallbackProducts.length)
  };

  if (!settings.enabled || !settings.baseUrl.trim() || !settings.model.trim() || !settings.apiKey.trim()) {
    return fallback;
  }

  try {
    const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const prompt = [
      "请把下面的抓取文本整理成 JSON。",
      '只返回 JSON，不要附加解释。字段格式：{"summary":"","conclusion":"","riskNotes":[""],"shopStatus":"OPEN","products":[{"rawName":"","normalizedType":"","price":0,"currency":"CNY","stockStatus":"IN_STOCK","status":"ON_SALE","confidence":0.9,"sourceLine":""}]}',
      `站点名称：${source.sourceName}`,
      `站点说明：${source.parserHint || source.remark || "无"}`,
      `抓取文本：\n${rawFragments.join("\n")}\n\n原始内容摘要：\n${rawContent.slice(0, 6000)}`
    ].join("\n\n");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature,
        messages: [
          {
            role: "system",
            content: settings.systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`AI 接口返回 ${response.status}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("AI 返回为空");
    }

    const parsed = JSON.parse(extractJsonObject(content)) as {
      summary?: string;
      conclusion?: string;
      riskNotes?: string[];
      shopStatus?: string;
      products?: Array<Record<string, unknown>>;
    };

    const products: ProductItem[] = [];

    (parsed.products ?? []).forEach((item) => {
      const stockStatus = coerceStockStatus(item.stockStatus);
      const rawName = typeof item.rawName === "string" ? item.rawName.trim() : "";
      const price = Number(item.price ?? 0);

      if (!rawName || Number.isNaN(price) || price <= 0) {
        return;
      }

      products.push({
        rawName,
        normalizedType:
          typeof item.normalizedType === "string" && item.normalizedType.trim()
            ? item.normalizedType.trim()
            : normalizeProductType(rawName),
        price,
        currency: typeof item.currency === "string" && item.currency.trim() ? item.currency.trim() : "CNY",
        stockStatus,
        status: coerceProductStatus(item.status, stockStatus),
        confidence: typeof item.confidence === "number" ? item.confidence : 0.88,
        updatedAt: nowIso(),
        sourceLine: typeof item.sourceLine === "string" ? item.sourceLine : rawName
      });
    });

    if (products.length === 0) {
      return fallback;
    }

    return {
      aiModel: settings.model,
      extractedSummary: parsed.summary?.trim() || fallback.extractedSummary,
      aiConclusion: parsed.conclusion?.trim() || fallback.aiConclusion,
      riskNotes: parsed.riskNotes?.filter(Boolean) ?? fallback.riskNotes,
      products,
      shopStatus: coerceShopStatus(parsed.shopStatus, products.length)
    };
  } catch {
    return fallback;
  }
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

function buildTimeline(items: CrawlTask["timeline"], title: string, detail: string) {
  return [
    ...items,
    {
      at: nowIso(),
      title,
      detail
    }
  ];
}

async function runTaskPipeline(
  state: PlatformState,
  task: CrawlTask,
  source: DataSource,
  payload?: ContinueTaskPayload
) {
  const aiSettings = readAiSettingsFromEnv();
  const workingTask: CrawlTask = {
    ...task,
    status: "CRAWLING",
    updatedAt: nowIso(),
    nextAction: "正在通过浏览器抓取目标页面",
    logSummary: "已启动浏览器抓取。",
    timeline: buildTimeline(task.timeline, "开始抓取", "已进入浏览器抓取流程。")
  };

  try {
    const capture = payload?.manualContent?.trim()
      ? await saveManualCapture(task.id, payload.manualContent.trim())
      : await runPlaywrightCapture(source, task.id, payload);
    const rawContent = `${capture.title}\n${capture.visibleText}\n${capture.html}`;
    const rawFragments = extractRawFragments(rawContent);

    if (capture.requiresVerification) {
      const waitingTask: CrawlTask = {
        ...workingTask,
        status: "WAITING_HUMAN",
        updatedAt: nowIso(),
        currentUrl: capture.finalUrl || workingTask.currentUrl,
        rawFragments,
        requiresVerification: true,
        verificationMethod: source.verificationMethod,
        verificationPrompt: source.verificationPrompt || capture.verificationReason,
        verificationNote: payload?.verificationNote?.trim() || workingTask.verificationNote,
        pageState: "WAITING_VERIFICATION",
        artifacts: capture.artifacts,
        logSummary: capture.verificationReason || "页面需要人工验证后才能继续。",
        nextAction: "请补充 Cookie、storageState 或人工整理后的页面文本，然后继续抓取。",
        timeline: buildTimeline(
          workingTask.timeline,
          "等待人工验证",
          capture.verificationReason || source.verificationPrompt || "站点要求先完成人工验证。"
        )
      };

      return {
        state: {
          ...state,
          tasks: state.tasks.map((item) => (item.id === waitingTask.id ? waitingTask : item))
        },
        task: waitingTask
      };
    }

    const analysis = await analyzeWithAi(aiSettings, source, rawContent, rawFragments);
    const existingShop = state.published.shops.find((item) => item.sourceId === source.sourceId);
    const previousSnapshot = existingShop
      ? [...state.published.snapshots].reverse().find((item) => item.shopId === existingShop.shopId)
      : undefined;
    const review: ReviewRecord = {
      id: createId("review"),
      taskId: task.id,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      status: "REVIEWING",
      snapshotDate: nowIso().slice(0, 10),
      extractedSummary: analysis.extractedSummary,
      rawFragments,
      products: analysis.products,
      previousDiff: buildChanges(previousSnapshot?.products ?? [], analysis.products),
      aiModel: analysis.aiModel,
      aiConclusion: analysis.aiConclusion,
      riskNotes: analysis.riskNotes
    };

    const reviewingTask: CrawlTask = {
      ...workingTask,
      status: "REVIEWING",
      updatedAt: nowIso(),
      finishedAt: nowIso(),
      currentUrl: capture.finalUrl || workingTask.currentUrl,
      rawFragments,
      reviewId: review.id,
      requiresVerification: false,
      verificationNote: payload?.verificationNote?.trim() || workingTask.verificationNote,
      pageState: payload ? "RESUMED" : "COLLECTED",
      artifacts: capture.artifacts,
      logSummary: payload?.manualContent?.trim()
        ? "已接收人工补充内容，生成结构化结果，等待审核。"
        : "浏览器抓取完成，已生成结构化结果，等待审核。",
      nextAction: "进入审核页确认价格、库存和差异。",
      timeline: buildTimeline(
        workingTask.timeline,
        "进入审核",
        `识别 ${review.products.length} 个商品，等待人工确认。`
      )
    };

    return {
      state: {
        ...state,
        tasks: state.tasks.map((item) => (item.id === reviewingTask.id ? reviewingTask : item)),
        reviews: [review, ...state.reviews]
      },
      task: reviewingTask
    };
  } catch (error) {
    const failedTask: CrawlTask = {
      ...workingTask,
      status: "FAILED",
      updatedAt: nowIso(),
      finishedAt: nowIso(),
      errorMessage: error instanceof Error ? error.message : "未知异常",
      logSummary: "抓取流程失败。",
      nextAction: "检查站点地址、浏览器依赖和验证信息后重试。",
      timeline: buildTimeline(
        workingTask.timeline,
        "任务失败",
        error instanceof Error ? error.message : "未知异常"
      )
    };

    return {
      state: {
        ...state,
        tasks: state.tasks.map((item) => (item.id === failedTask.id ? failedTask : item))
      },
      task: failedTask
    };
  }
}

export async function createAndRunTask(payload: CrawlRequestPayload) {
  const state = await getPlatformState();
  const source = state.sources.find((item) => item.sourceId === payload.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  if (!source.enabled) {
    throw new Error("该数据源已停用");
  }

  const createdAt = nowIso();
  const task: CrawlTask = {
    id: createId("task"),
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    status: "PENDING",
    startedAt: createdAt,
    updatedAt: createdAt,
    logSummary: "任务已创建，等待浏览器抓取。",
    nextAction: "准备启动浏览器",
    rawUrl: source.entryUrl || source.sourceUrl,
    currentUrl: source.entryUrl || source.sourceUrl,
    rawFragments: [],
    timeline: [
      {
        at: createdAt,
        title: "任务创建",
        detail: "已加入抓取队列。"
      }
    ],
    requiresVerification: source.verificationMethod !== "NONE",
    verificationMethod: source.verificationMethod,
    verificationPrompt: source.verificationPrompt,
    sessionId: `session_${randomUUID().slice(0, 8)}`,
    artifacts: {}
  };

  const preparedState: PlatformState = {
    ...state,
    tasks: [task, ...state.tasks],
    sources: state.sources.map((item) =>
      item.sourceId === source.sourceId ? { ...item, lastRunAt: createdAt, updatedAt: createdAt } : item
    )
  };

  await savePlatformState(preparedState);
  const pipelineResult = await runTaskPipeline(preparedState, task, source);
  await savePlatformState(pipelineResult.state);
  return pipelineResult.task;
}

export async function continueTask(taskId: string, payload: ContinueTaskPayload) {
  const state = await getPlatformState();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("任务不存在");
  }

  const source = state.sources.find((item) => item.sourceId === task.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const updatedTask: CrawlTask = {
    ...task,
    verificationNote:
      payload.verificationNote?.trim() || payload.verificationToken?.trim() || payload.storageState?.trim() || task.verificationNote
  };
  const stateWithTask: PlatformState = {
    ...state,
    tasks: state.tasks.map((item) => (item.id === task.id ? updatedTask : item))
  };

  await savePlatformState(stateWithTask);
  const pipelineResult = await runTaskPipeline(stateWithTask, updatedTask, source, payload);
  await savePlatformState(pipelineResult.state);
  return pipelineResult.task;
}
