import { randomUUID } from "node:crypto";
import { stockStatusLabels } from "@shop-claw/shared/labels";
import {
  buildManualVerificationChromeSetupHint,
  detectManualVerificationReason,
  detectManualVerificationReasonFromPage
} from "@shop-claw/shared/manual-verification";
import { getPlatformState, savePlatformState } from "@shop-claw/shared/store";
import {
  AiSettings,
  AiUsageSummary,
  ContinueTaskPayload,
  CrawlBatchState,
  CrawlRequestPayload,
  CrawlTask,
  DataSource,
  PlatformState,
  ProductCategory,
  ProductItem,
  ProductStatus,
  ReviewRecord,
  ShopChange,
  StockStatus,
  VerificationMethod
} from "@shop-claw/shared/types";
import { publishReview } from "@shop-claw/shared/workflow";
import { readAiSettingsFromEnv } from "@/lib/ai-config";
import type { BrowserCrawlResult, CapturedProductCard } from "@/lib/playwright-crawler";
import {
  closeEmbeddedVerificationSession,
  exportEmbeddedVerificationSession,
  getEmbeddedVerificationWorkspace,
  startEmbeddedVerificationSession
} from "@/lib/verification-proxy";

async function loadPlaywrightCrawler() {
  return import("@/lib/playwright-crawler");
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function normalizeText(input: string) {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeToken(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildProductKey(category: ProductCategory, specLabel: string) {
  return `${category}__${normalizeToken(specLabel || "DEFAULT") || "DEFAULT"}`;
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
  return [
    ...new Set(
      stripHtml(raw)
        .split(/\n+/)
        .map(normalizeText)
        .filter((line) => line.length >= 4)
        .filter((line) => /\d/.test(line) || /(claude|gpt|chatgpt|gemini|perplexity|会员|月卡|年卡|pro|plus)/i.test(line))
    )
  ].slice(0, 16);
}

const MAX_FULL_PAGE_TEXT_LENGTH = 18_000;
const MAX_FULL_PAGE_HTML_LENGTH = 12_000;
const MAX_SEGMENT_TEXT_LENGTH = 6_000;
const MAX_SEGMENT_COUNT = 6;
const MIN_SEGMENT_BREAKPOINT = 3_200;
const PRODUCT_SCHEMA_PROMPT =
  '{"summary":"","conclusion":"","flags":[""],"products":[{"rawName":"","category":"CHATGPT","specLabel":"","price":0,"currency":"CNY","stockStatus":"IN_STOCK","status":"ON_SALE","inventoryText":"","warrantySupported":null,"confidence":0.9,"sourceLine":""}]}';
const NOISE_PRODUCT_NAMES = new Set([
  "商品名称",
  "分类",
  "规格标识",
  "价格",
  "库存状态",
  "商品状态",
  "库存文本",
  "质保",
  "来源片段",
  "日期",
  "商品数",
  "状态",
  "有货",
  "无货",
  "在售",
  "待确认",
  "其他",
  "异常项"
]);

interface StructuredAiResponse {
  summary?: string;
  conclusion?: string;
  flags?: string[];
  products?: Array<Record<string, unknown>>;
}

interface AiAnalysisResult {
  modelLabel: string;
  summary: string;
  conclusion: string;
  flags: string[];
  products: ProductItem[];
  isReliable: boolean;
  aiUsage: AiUsageSummary;
}

interface AiResponseUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
}

type StructuredProductCandidate =
  | {
      product: ProductItem;
      reason?: never;
    }
  | {
      product?: never;
      reason: string;
    };

function uniqueTexts(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function createEmptyAiUsage(settings: AiSettings): AiUsageSummary {
  return {
    provider: settings.provider,
    providerLabel: settings.providerLabel,
    model: settings.model,
    callCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    estimatedCost: 0,
    currency: settings.currency,
    inputPricePerMillion: settings.inputPricePerMillion,
    outputPricePerMillion: settings.outputPricePerMillion,
    cacheHitInputPricePerMillion: settings.cacheHitInputPricePerMillion,
    updatedAt: nowIso()
  };
}

function mergeAiUsage(settings: AiSettings, current: AiUsageSummary, delta: AiResponseUsage): AiUsageSummary {
  const promptCacheHitTokens = Math.max(delta.promptCacheHitTokens, 0);
  const promptCacheMissTokens =
    delta.promptCacheMissTokens > 0 ? delta.promptCacheMissTokens : Math.max(delta.promptTokens - promptCacheHitTokens, 0);
  const promptTokens = current.promptTokens + Math.max(delta.promptTokens, 0);
  const completionTokens = current.completionTokens + Math.max(delta.completionTokens, 0);
  const totalTokens = current.totalTokens + Math.max(delta.totalTokens, delta.promptTokens + delta.completionTokens, 0);
  const cacheHitTotal = current.promptCacheHitTokens + promptCacheHitTokens;
  const cacheMissTotal = current.promptCacheMissTokens + promptCacheMissTokens;
  const estimatedCost = roundBillingAmount(
    (cacheHitTotal / 1_000_000) * settings.cacheHitInputPricePerMillion +
      (cacheMissTotal / 1_000_000) * settings.inputPricePerMillion +
      (completionTokens / 1_000_000) * settings.outputPricePerMillion
  );

  return {
    provider: settings.provider,
    providerLabel: settings.providerLabel,
    model: settings.model,
    callCount: current.callCount + 1,
    promptTokens,
    completionTokens,
    totalTokens,
    promptCacheHitTokens: cacheHitTotal,
    promptCacheMissTokens: cacheMissTotal,
    estimatedCost,
    currency: settings.currency,
    inputPricePerMillion: settings.inputPricePerMillion,
    outputPricePerMillion: settings.outputPricePerMillion,
    cacheHitInputPricePerMillion: settings.cacheHitInputPricePerMillion,
    updatedAt: nowIso()
  };
}

function roundBillingAmount(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sanitizeVisibleTextForAnalysis(raw: string) {
  return raw
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_FULL_PAGE_TEXT_LENGTH * MAX_SEGMENT_COUNT);
}

function sanitizeHtmlForAnalysis(raw: string) {
  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function splitTextIntoSegments(raw: string) {
  const normalized = raw.trim();

  if (!normalized) {
    return [];
  }

  if (normalized.length <= MAX_FULL_PAGE_TEXT_LENGTH) {
    return [normalized];
  }

  const segments: string[] = [];
  let remaining = normalized;

  while (remaining && segments.length < MAX_SEGMENT_COUNT) {
    if (remaining.length <= MAX_SEGMENT_TEXT_LENGTH) {
      segments.push(remaining);
      remaining = "";
      break;
    }

    let splitAt = remaining.lastIndexOf("\n", MAX_SEGMENT_TEXT_LENGTH);

    if (splitAt < MIN_SEGMENT_BREAKPOINT) {
      splitAt = remaining.indexOf("\n", MAX_SEGMENT_TEXT_LENGTH);
    }

    if (splitAt === -1 || splitAt < MIN_SEGMENT_BREAKPOINT) {
      splitAt = MAX_SEGMENT_TEXT_LENGTH;
    }

    segments.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining && segments.length > 0) {
    const tail = remaining.slice(0, MAX_SEGMENT_TEXT_LENGTH);
    const lastIndex = segments.length - 1;
    const mergedTail = `${segments[lastIndex]}\n${tail}`.trim();
    segments[lastIndex] = mergedTail.slice(0, MAX_FULL_PAGE_TEXT_LENGTH);
  }

  return segments.filter(Boolean);
}

function buildAnalysisPrompt(
  source: DataSource,
  pageTitle: string,
  textSegment: string,
  htmlSummary: string,
  segmentIndex?: number,
  segmentCount?: number
) {
  const segmentInstruction =
    segmentCount && segmentCount > 1
      ? `这是整页内容的第 ${segmentIndex! + 1}/${segmentCount} 段，只输出本段明确出现的商品。`
      : "请基于整页上下文输出当前页面中的全部商品。";

  return [
    "请把商品售卖网页整理成 JSON。",
    segmentInstruction,
    "识别目标：页面中所有明确在售、展示价格或明确展示套餐信息的商品、套餐、订阅项。",
    "分类只允许使用：CHATGPT、CLAUDE、GEMINI、PERPLEXITY、GROK、GOOGLE_ACCOUNT、VIRTUAL_CARD、APPLE_ACCOUNT、OTHER。",
    "不要把纯数字、年份、时长片段、栏目标题、分类标签、按钮文案、库存词、说明文本、导航文本当作商品。",
    "商品名称必须是页面中的完整售卖项名称；如果信息不足以构成完整商品，请不要输出。",
    "如果字段无法确认，可使用 null 或空字符串，但不要编造商品。",
    `只返回 JSON，不要附加解释。字段格式：${PRODUCT_SCHEMA_PROMPT}`,
    `站点名称：${source.sourceName}`,
    `抓取入口：${source.entryUrl}`,
    `页面标题：${pageTitle || source.sourceName}`,
    `完整可见文本：\n${textSegment}`,
    `HTML 摘要：\n${htmlSummary}`
  ].join("\n\n");
}

function extractMessageContent(payload: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
}) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }

  return "";
}

function extractUsage(payload: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}) {
  const promptTokens = Number(payload.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(payload.usage?.completion_tokens ?? 0);
  const cachedTokens = Number(
    payload.usage?.prompt_cache_hit_tokens ?? payload.usage?.prompt_tokens_details?.cached_tokens ?? 0
  );
  const uncachedTokens = Number(payload.usage?.prompt_cache_miss_tokens ?? Math.max(promptTokens - cachedTokens, 0));

  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(payload.usage?.total_tokens ?? promptTokens + completionTokens),
    promptCacheHitTokens: cachedTokens,
    promptCacheMissTokens: uncachedTokens
  } satisfies AiResponseUsage;
}

function getNoiseProductReason(rawName: string) {
  const plain = normalizeText(rawName);
  const lower = plain.toLowerCase();

  if (!plain) {
    return "商品名称为空";
  }

  if (plain.length < 2) {
    return "商品名称过短";
  }

  if (/^(¥|￥)?\d+(?:\.\d+)?$/.test(plain)) {
    return "商品名称是纯数字或价格";
  }

  if (/^\d{1,4}(?:[-/]\d{1,4})+(?:年|个月|月|天)?$/.test(plain) || /^\d{2,4}(?:年|个月|月|天)$/.test(plain)) {
    return "商品名称看起来是年份或时长片段";
  }

  if (!/[A-Za-z\u4E00-\u9FFF]/.test(plain)) {
    return "商品名称缺少可读文本";
  }

  if (NOISE_PRODUCT_NAMES.has(plain)) {
    return "商品名称看起来是页面标签";
  }

  if (/^(google gemini|openai gpt|chatgpt|gemini|claude|perplexity|openai|google)$/i.test(lower)) {
    return "商品名称看起来是栏目标题";
  }

  return null;
}

function scoreProductCandidate(item: ProductItem) {
  return (
    item.rawName.length +
    (item.sourceLine?.length ?? 0) +
    (item.confidence ?? 0) * 10 +
    (item.warrantySupported === null ? 0 : 4)
  );
}

function mergeProductCandidates(items: ProductItem[]) {
  const merged = new Map<string, ProductItem>();

  items.forEach((item) => {
    const existing = merged.get(item.productKey);

    if (!existing || scoreProductCandidate(item) >= scoreProductCandidate(existing)) {
      merged.set(item.productKey, item);
    }
  });

  return [...merged.values()];
}

function coerceStructuredProduct(item: Record<string, unknown>): StructuredProductCandidate {
  const rawName = typeof item.rawName === "string" ? normalizeText(item.rawName) : "";
  const price = Number(item.price ?? 0);

  if (!rawName) {
    return { reason: "缺少商品名称" };
  }

  if (Number.isNaN(price) || price <= 0) {
    return { reason: `${rawName} 缺少有效价格` };
  }

  const noiseReason = getNoiseProductReason(rawName);

  if (noiseReason) {
    return { reason: `${rawName}：${noiseReason}` };
  }

  const line =
    typeof item.sourceLine === "string" && item.sourceLine.trim() ? normalizeText(item.sourceLine) : rawName;
  const category = coerceCategory(item.category, rawName, line);
  const specLabel =
    typeof item.specLabel === "string" && item.specLabel.trim()
      ? normalizeToken(item.specLabel.trim())
      : inferSpecLabel(rawName, category);
  const stockStatus = coerceStockStatus(item.stockStatus);

  return {
    product: {
      productKey: buildProductKey(category, specLabel),
      rawName,
      category,
      specLabel,
      price,
      currency: typeof item.currency === "string" && item.currency.trim() ? item.currency.trim() : "CNY",
      stockStatus,
      status: coerceProductStatus(item.status, stockStatus),
      inventoryText:
        typeof item.inventoryText === "string" && item.inventoryText.trim()
          ? item.inventoryText.trim()
          : inferInventoryText(rawName, line, stockStatus),
      warrantySupported: coerceWarranty(item.warrantySupported, rawName, line),
      isDetected: true,
      confidence: typeof item.confidence === "number" ? item.confidence : 0.88,
      sourceLine: line,
      updatedAt: nowIso()
    } satisfies ProductItem
  };
}

function buildAnalysisFailure(
  settings: AiSettings,
  reason: string,
  flags: string[],
  rawFragments: string[],
  aiUsage = createEmptyAiUsage(settings)
): AiAnalysisResult {
  const debugCandidates = heuristicParseProducts(rawFragments);

  return {
    modelLabel: settings.enabled ? settings.model : "AI 未启用",
    summary: reason,
    conclusion: "请在校对页手动补充商品，或检查 AI 配置后重新抓取。",
    flags: uniqueTexts([
      ...flags,
      debugCandidates.length > 0 ? `规则片段中发现 ${debugCandidates.length} 个可疑候选，但已禁用自动兜底。` : ""
    ]),
    products: [],
    isReliable: false,
    aiUsage
  };
}

async function requestStructuredAnalysis(
  settings: AiSettings,
  prompt: string
): Promise<{ parsed?: StructuredAiResponse; usage: AiResponseUsage; error?: string }> {
  const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: settings.model,
    temperature: settings.temperature,
    stream: false,
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
  };

  if (settings.provider === "deepseek-compatible") {
    if (settings.thinkingEnabled) {
      body.thinking = { type: "enabled" };
    }

    if (settings.reasoningEffort) {
      body.reasoning_effort = settings.reasoningEffort;
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI 接口返回 ${response.status}${errorText ? `：${errorText.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    };
  };
  const content = extractMessageContent(payload);
  const usage = extractUsage(payload);

  if (!content) {
    return {
      usage,
      error: "AI 返回为空"
    };
  }

  try {
    return {
      parsed: JSON.parse(extractJsonObject(content)) as StructuredAiResponse,
      usage
    };
  } catch (error) {
    return {
      usage,
      error: error instanceof Error ? `AI 返回不是合法 JSON：${error.message}` : "AI 返回不是合法 JSON"
    };
  }
}

function inferCategory(rawName: string, line: string): ProductCategory {
  const marker = `${rawName} ${line}`.toLowerCase();

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

function inferSpecLabel(rawName: string, category: ProductCategory) {
  const categoryTokens = {
    CHATGPT: /(chatgpt|gpt)/gi,
    CLAUDE: /(claude)/gi,
    GEMINI: /(gemini)/gi,
    PERPLEXITY: /(perplexity)/gi,
    GROK: /(grok)/gi,
    GOOGLE_ACCOUNT: /(google account|google账号|google 帐号|谷歌账号|gmail)/gi,
    VIRTUAL_CARD: /(虚拟卡|vcc|virtual card|visa card|master card|wildcard)/gi,
    APPLE_ACCOUNT: /(苹果账号|apple id|apple account|icloud)/gi,
    OTHER: /$^/g
  };

  const stripped = normalizeText(rawName.replace(categoryTokens[category], " "));
  return normalizeToken(stripped || rawName || "DEFAULT") || "DEFAULT";
}

function inferStockStatus(line: string): StockStatus {
  if (/(out of stock|sold out|无货|售罄|缺货|无库存)/i.test(line)) {
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

function inferWarranty(line: string): boolean | null {
  if (/(no warranty|without warranty|不支持质保|无质保|不保修)/i.test(line)) {
    return false;
  }

  if (/(warranty|guarantee|质保|保修|售后)/i.test(line)) {
    return true;
  }

  return null;
}

function inferInventoryText(rawName: string, tail: string, stockStatus: StockStatus) {
  const merged = normalizeText(`${rawName} ${tail}`);

  if (stockStatus === "OUT_OF_STOCK") {
    return /(?:out of stock|sold out|无货|售罄|缺货|无库存)/i.exec(merged)?.[0] || "无货";
  }

  if (stockStatus === "LOW_STOCK") {
    return /(?:low stock|only \d+ left|紧张|少量|仅剩|库存低)/i.exec(merged)?.[0] || "库存紧张";
  }

  return "有货";
}

function buildProduct(rawName: string, price: number, line: string, tail = "", confidence = 0.72): ProductItem {
  const category = inferCategory(rawName, line);
  const specLabel = inferSpecLabel(rawName, category);
  const stockStatus = inferStockStatus(`${rawName} ${tail}`);
  const updatedAt = nowIso();

  return {
    productKey: buildProductKey(category, specLabel),
    rawName,
    category,
    specLabel,
    price,
    currency: "CNY",
    stockStatus,
    status: inferProductStatus(stockStatus),
    inventoryText: inferInventoryText(rawName, tail, stockStatus),
    warrantySupported: inferWarranty(`${rawName} ${tail}`),
    isDetected: true,
    confidence,
    sourceLine: line,
    updatedAt
  };
}

function heuristicParseProducts(lines: string[]) {
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

    if (!rawName || Number.isNaN(price) || price <= 0) {
      return;
    }

    const tail = normalizeText(match[3] ?? line);
    parsed.push(buildProduct(rawName, price, line, tail, 0.72));
  });

  return [...new Map(parsed.map((item) => [item.productKey, item])).values()];
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
  if (value === "OFFLINE" || value === "已下架" || value === "未上架") {
    return "OFFLINE";
  }

  if (value === "LOW_STOCK" || value === "低库存") {
    return "LOW_STOCK";
  }

  return inferProductStatus(stockStatus);
}

function coerceCategory(value: unknown, rawName: string, line: string): ProductCategory {
  if (
    value === "CHATGPT" ||
    value === "CLAUDE" ||
    value === "GEMINI" ||
    value === "PERPLEXITY" ||
    value === "GROK" ||
    value === "GOOGLE_ACCOUNT" ||
    value === "VIRTUAL_CARD" ||
    value === "APPLE_ACCOUNT" ||
    value === "OTHER"
  ) {
    return value;
  }

  return inferCategory(rawName, line);
}

function coerceWarranty(value: unknown, rawName: string, line: string): boolean | null {
  if (value === true || value === false) {
    return value;
  }

  return inferWarranty(`${rawName} ${line}`);
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
  pageTitle: string,
  visibleText: string,
  html: string,
  rawFragments: string[]
) : Promise<AiAnalysisResult> {
  const normalizedText = sanitizeVisibleTextForAnalysis(visibleText);
  const normalizedHtml = sanitizeHtmlForAnalysis(html).slice(0, MAX_FULL_PAGE_HTML_LENGTH);
  let aiUsage = createEmptyAiUsage(settings);

  if (!settings.enabled || !settings.baseUrl.trim() || !settings.model.trim() || !settings.apiKey.trim()) {
    return buildAnalysisFailure(settings, "AI 未启用，未生成商品草稿。", ["请先配置可用的 AI 接口。"], rawFragments, aiUsage);
  }

  if (normalizedText.length < 40 && rawFragments.length === 0) {
    return buildAnalysisFailure(
      settings,
      "当前页面有效文本不足，未生成商品草稿。",
      ["页面有效文本不足", "建议启动人工验证工作区，验证完成后自动继续，或补充人工整理页面文本"],
      rawFragments,
      aiUsage
    );
  }

  const segments = splitTextIntoSegments(normalizedText);

  if (segments.length === 0) {
    return buildAnalysisFailure(settings, "当前页面缺少可分析内容。", ["未提取到可分析文本"], rawFragments, aiUsage);
  }

  const allProducts: ProductItem[] = [];
  const flags: string[] = [];
  let summary = "";
  let conclusion = "";

  for (const [index, segment] of segments.entries()) {
    try {
      const attempt = await requestStructuredAnalysis(
        settings,
        buildAnalysisPrompt(source, pageTitle, segment, normalizedHtml, index, segments.length)
      );

      aiUsage = mergeAiUsage(settings, aiUsage, attempt.usage);

      if (!attempt.parsed) {
        flags.push(`第 ${index + 1} 段 AI 解析失败：${attempt.error || "未知异常"}`);
        continue;
      }

      summary = summary || attempt.parsed.summary?.trim() || "";
      conclusion = conclusion || attempt.parsed.conclusion?.trim() || "";
      flags.push(...(attempt.parsed.flags ?? []));

      const rejected: string[] = [];

      (attempt.parsed.products ?? []).forEach((item) => {
        const candidate = coerceStructuredProduct(item);

        if (candidate.product) {
          allProducts.push(candidate.product);
          return;
        }

        rejected.push(candidate.reason ?? "候选商品无效");
      });

      if (rejected.length > 0) {
        flags.push(`第 ${index + 1} 段过滤了 ${rejected.length} 条无效候选：${rejected.slice(0, 3).join("；")}`);
      }
    } catch (error) {
      flags.push(`第 ${index + 1} 段 AI 解析失败：${error instanceof Error ? error.message : "未知异常"}`);
    }
  }

  const products = mergeProductCandidates(allProducts);

  if (products.length === 0) {
    return buildAnalysisFailure(
      settings,
      "已抓取页面内容，但未识别到可信商品。",
      [
        segments.length > 1 ? `整页内容已分 ${segments.length} 段分析，但未得到可信商品。` : "",
        ...flags
      ],
      rawFragments,
      aiUsage
    );
  }

  return {
    modelLabel: settings.model,
    summary: summary || `已基于整页上下文识别 ${products.length} 个商品。`,
    conclusion: conclusion || `已生成 ${products.length} 个可信商品候选，请校对后发布。`,
    flags: uniqueTexts([
      segments.length > 1 ? `已按整页分 ${segments.length} 段分析并汇总结果。` : "",
      ...flags
    ]),
    products,
    isReliable: true,
    aiUsage
  };
}

function buildChanges(previousProducts: ProductItem[], nextProducts: ProductItem[]) {
  const previousMap = new Map(
    previousProducts.filter((item) => item.isDetected).map((item) => [item.productKey, item] as const)
  );
  const nextMap = new Map(
    nextProducts.filter((item) => item.isDetected).map((item) => [item.productKey, item] as const)
  );
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

function buildProductFromCapturedCard(card: CapturedProductCard): ProductItem {
  const category = inferCategory(card.rawName, card.sourceLine);
  const specLabel = inferSpecLabel(card.rawName, category);
  const stockStatus = coerceStockStatus(card.stockStatus);

  return {
    productKey: buildProductKey(category, specLabel),
    rawName: card.rawName,
    category,
    specLabel,
    price: card.price,
    currency: card.currency || "CNY",
    stockStatus,
    status: inferProductStatus(stockStatus),
    inventoryText: card.inventoryText || inferInventoryText(card.rawName, card.sourceLine, stockStatus),
    warrantySupported: inferWarranty(card.sourceLine),
    isDetected: true,
    confidence: 0.98,
    sourceLine: card.sourceLine,
    updatedAt: nowIso()
  };
}

function replaceTaskInState(state: PlatformState, nextTask: CrawlTask) {
  return {
    ...state,
    tasks: state.tasks.map((item) => (item.id === nextTask.id ? nextTask : item))
  };
}

function isFinalTaskStatus(status: CrawlTask["status"]) {
  return status === "PUBLISHED" || status === "FAILED";
}

function inferNextCrawlVersion(state: PlatformState) {
  const maxPublishedVersion = state.published.shops.reduce(
    (current, shop) => Math.max(current, Number.isFinite(shop.currentVersion) ? shop.currentVersion : -1),
    -1
  );
  const maxTaskVersion = state.tasks.reduce(
    (current, task) => Math.max(current, typeof task.crawlVersion === "number" ? task.crawlVersion : -1),
    -1
  );
  const maxReviewVersion = state.reviews.reduce(
    (current, review) => Math.max(current, typeof review.crawlVersion === "number" ? review.crawlVersion : -1),
    -1
  );
  const maxBatchVersion = state.crawlBatch?.version ?? -1;

  return Math.max(maxPublishedVersion, maxTaskVersion, maxReviewVersion, maxBatchVersion, -1) + 1;
}

function buildPendingTask(
  source: DataSource,
  options: {
    createdAt?: string;
    batchId?: string;
    batchIndex?: number;
    crawlVersion: number;
  }
): CrawlTask {
  const createdAt = options.createdAt ?? nowIso();

  return {
    id: createId("task"),
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    batchId: options.batchId,
    batchIndex: options.batchIndex,
    crawlVersion: options.crawlVersion,
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
    requiresVerification: false,
    verificationMethod: source.verificationMethod,
    verificationPrompt: source.verificationPrompt,
    sessionId: `session_${randomUUID().slice(0, 8)}`,
    artifacts: {}
  };
}

function withSourceRunTimestamp(state: PlatformState, sourceId: string, timestamp: string) {
  return state.sources.map((item) =>
    item.sourceId === sourceId ? { ...item, lastRunAt: timestamp, updatedAt: timestamp } : item
  );
}

function resolveSourcesForBatch(state: PlatformState, sourceIds: string[]) {
  const normalizedSourceIds = [...new Set(sourceIds.map((item) => item?.trim()).filter(Boolean))];

  if (normalizedSourceIds.length === 0) {
    throw new Error("请至少选择一个数据源");
  }

  return normalizedSourceIds.map((sourceId) => {
    const source = state.sources.find((item) => item.sourceId === sourceId);

    if (!source) {
      throw new Error(`数据源不存在：${sourceId}`);
    }

    if (!source.enabled) {
      throw new Error(`数据源已停用：${source.sourceName}`);
    }

    return source;
  });
}

function buildBatchState(
  batchId: string,
  version: number,
  sourceIds: string[],
  task: CrawlTask,
  timestamp: string
): CrawlBatchState {
  return {
    batchId,
    version,
    sourceIds,
    completedSourceIds: [],
    currentIndex: 0,
    currentSourceId: task.sourceId,
    currentTaskId: task.id,
    startedAt: timestamp,
    updatedAt: timestamp
  };
}

function getNextBatchSourceId(batch: CrawlBatchState | null | undefined) {
  return batch?.sourceIds.find((sourceId) => !batch.completedSourceIds.includes(sourceId));
}

interface CaptureProcessingOptions {
  payload?: ContinueTaskPayload;
  fromManualVerification?: boolean;
}

function inferVerificationMethod(
  source: DataSource,
  ...inputs: Array<string | undefined>
): VerificationMethod {
  const marker = inputs.filter(Boolean).join("\n");

  if (/(captcha|verify you are human|robot check|请完成验证|验证码|安全验证|滑动验证|真人验证)/i.test(marker)) {
    return "CAPTCHA";
  }

  if (/(sign in|log in|login to continue|请先登录|登录后查看|账户验证)/i.test(marker)) {
    return "LOGIN";
  }

  return source.verificationMethod !== "NONE" ? source.verificationMethod : "MANUAL";
}

function buildWaitingHumanTask(
  workingTask: CrawlTask,
  source: DataSource,
  options: {
    verificationNote?: string;
    verificationReason?: string;
    fromManualVerification?: boolean;
    currentUrl?: string;
    rawFragments?: string[];
    artifacts?: CrawlTask["artifacts"];
    errorMessage?: string;
  } = {}
) {
  const detail =
    options.verificationReason ||
    source.verificationPrompt ||
    options.errorMessage ||
    "站点要求先完成验证。";

  return {
    ...workingTask,
    status: "WAITING_HUMAN",
    updatedAt: nowIso(),
    currentUrl: options.currentUrl || workingTask.currentUrl,
    rawFragments: options.rawFragments ?? workingTask.rawFragments,
    requiresVerification: true,
    verificationMethod: inferVerificationMethod(
      source,
      options.verificationReason,
      options.errorMessage,
      options.verificationNote,
      source.verificationPrompt
    ),
    verificationPrompt: options.verificationReason || source.verificationPrompt || workingTask.verificationPrompt,
    verificationNote: options.verificationNote,
    errorMessage: options.errorMessage,
    pageState: options.fromManualVerification ? "VERIFYING" : "WAITING_VERIFICATION",
    artifacts: options.artifacts ?? workingTask.artifacts,
    logSummary:
      options.verificationReason ||
      options.errorMessage ||
      (options.fromManualVerification ? "人工验证尚未完成，请继续处理。" : "页面需要人工验证后继续。"),
    nextAction: options.fromManualVerification
      ? "在人工验证工作台中继续完成验证码、登录或页面放行，然后点击“完成验证并继续抓取”。"
      : "进入人工验证工作台，处理验证码、登录或站点拦截后继续抓取。",
    timeline: buildTimeline(
      workingTask.timeline,
      options.fromManualVerification ? "继续人工验证" : "等待人工验证",
      detail
    )
  } satisfies CrawlTask;
}

async function processCaptureResult(
  state: PlatformState,
  workingTask: CrawlTask,
  source: DataSource,
  capture: BrowserCrawlResult,
  aiSettings: AiSettings,
  options: CaptureProcessingOptions = {}
) {
  const rawContent = `${capture.title}\n${capture.visibleText}\n${capture.html}`;
  const rawFragments = extractRawFragments(rawContent);
  const verificationNote = options.payload?.verificationNote?.trim() || workingTask.verificationNote;
  const captureVerificationReason =
    capture.verificationReason ??
    detectManualVerificationReasonFromPage({
      title: capture.title,
      visibleText: capture.visibleText,
      html: capture.html,
      finalUrl: capture.finalUrl
    });
  const normalizedVisibleText = sanitizeVisibleTextForAnalysis(capture.visibleText);
  const shouldFallbackToManualVerification =
    !options.payload?.manualContent?.trim() &&
    !captureVerificationReason &&
    capture.productCards.length === 0 &&
    normalizedVisibleText.length < 80 &&
    (source.verificationMethod !== "NONE" || source.crawlMode === "MANUAL_ASSIST");

  if (captureVerificationReason) {
    const waitingTask = buildWaitingHumanTask(workingTask, source, {
      verificationNote,
      verificationReason: captureVerificationReason,
      fromManualVerification: options.fromManualVerification,
      currentUrl: capture.finalUrl || workingTask.currentUrl,
      rawFragments,
      artifacts: capture.artifacts
    });

    return {
      state: replaceTaskInState(state, waitingTask),
      task: waitingTask
    };
  }

  if (shouldFallbackToManualVerification) {
    const waitingTask = buildWaitingHumanTask(workingTask, source, {
      verificationNote,
      verificationReason: "当前页面可读内容过少，建议先完成人工验证后继续抓取。",
      fromManualVerification: options.fromManualVerification,
      currentUrl: capture.finalUrl || workingTask.currentUrl,
      rawFragments,
      artifacts: capture.artifacts
    });

    return {
      state: replaceTaskInState(state, waitingTask),
      task: waitingTask
    };
  }

  const analysis = await analyzeWithAi(
    aiSettings,
    source,
    capture.title,
    capture.visibleText,
    capture.html,
    rawFragments
  );
  const capturedProducts = capture.productCards.map((item) => buildProductFromCapturedCard(item));
  const mergedProducts = mergeProductCandidates([...capturedProducts, ...analysis.products]);
  const existingShop = state.published.shops.find((item) => item.sourceId === source.sourceId);
  const previousProducts = existingShop
    ? state.published.shopProducts.filter((item) => item.shopId === existingShop.shopId).map((item) => item.current)
    : [];
  const review: ReviewRecord = {
    id: createId("review"),
    taskId: workingTask.id,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    batchId: workingTask.batchId,
    crawlVersion: workingTask.crawlVersion,
    status: "REVIEWING",
    snapshotDate: nowIso().slice(0, 10),
    summary: analysis.summary,
    rawFragments,
    products: mergedProducts,
    previousDiff: buildChanges(previousProducts, mergedProducts),
    modelLabel: analysis.modelLabel,
    conclusion: analysis.conclusion,
    flags: uniqueTexts([
      ...analysis.flags,
      capture.productCards.length > analysis.products.length
        ? `页面结构化抓取识别 ${capture.productCards.length} 个商品卡，已补全 AI 漏掉的商品。`
        : ""
    ])
  };
  const requiresManualProductFill = mergedProducts.length === 0;
  const usedManualContent = Boolean(options.payload?.manualContent?.trim());

  const reviewingTask: CrawlTask = {
    ...workingTask,
    status: "REVIEWING",
    updatedAt: nowIso(),
    finishedAt: nowIso(),
    currentUrl: capture.finalUrl || workingTask.currentUrl,
    rawFragments,
    reviewId: review.id,
    requiresVerification: false,
    verificationNote,
    pageState: options.fromManualVerification || options.payload ? "RESUMED" : "COLLECTED",
    artifacts: capture.artifacts,
    aiUsage: analysis.aiUsage,
    logSummary: usedManualContent
      ? requiresManualProductFill
        ? "已接收人工补充内容，但 AI 未识别到可信商品，请人工补充。"
        : "已接收人工补充内容，生成商品结构，等待校对。"
      : options.fromManualVerification
        ? requiresManualProductFill
          ? "人工验证完成，已获取页面内容，但 AI 未识别到可信商品，请人工补充。"
          : "人工验证完成，已获取页面内容并生成商品结构，等待校对。"
        : requiresManualProductFill
          ? "浏览器抓取完成，但 AI 未识别到可信商品，请人工补充。"
          : "浏览器抓取完成，已生成商品结构，等待校对。",
    nextAction: requiresManualProductFill
      ? "进入校对页手动补充商品，或调整 AI 配置后重新抓取。"
      : "进入校对页确认分类、规格、价格、库存和质保。",
    timeline: buildTimeline(
      workingTask.timeline,
      "进入校对",
      requiresManualProductFill ? "未识别到可信商品，等待人工补充。" : `识别 ${review.products.length} 个商品，等待人工确认。`
    )
  };

  return {
    state: {
      ...replaceTaskInState(state, reviewingTask),
      reviews: [review, ...state.reviews]
    },
    task: reviewingTask
  };
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
      ? await (await loadPlaywrightCrawler()).saveManualCapture(task.id, payload.manualContent.trim())
      : await (await loadPlaywrightCrawler()).runPlaywrightCapture(source, task.id, payload, task);

    return processCaptureResult(state, workingTask, source, capture, aiSettings, { payload });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知异常";
    const verificationReason = detectManualVerificationReason(errorMessage);

    if (verificationReason || source.verificationMethod !== "NONE" || source.crawlMode === "MANUAL_ASSIST") {
      const waitingTask = buildWaitingHumanTask(workingTask, source, {
        verificationNote: payload?.verificationNote?.trim() || workingTask.verificationNote,
        verificationReason: verificationReason || source.verificationPrompt || errorMessage,
        currentUrl: workingTask.currentUrl,
        rawFragments: workingTask.rawFragments,
        artifacts: workingTask.artifacts,
        errorMessage
      });

      return {
        state: {
          ...state,
          tasks: state.tasks.map((item) => (item.id === waitingTask.id ? waitingTask : item))
        },
        task: waitingTask
      };
    }

    const failedTask: CrawlTask = {
      ...workingTask,
      status: "FAILED",
      updatedAt: nowIso(),
      finishedAt: nowIso(),
      errorMessage,
      logSummary: "抓取流程失败。",
      nextAction: "请重试抓取；如果仍失败，需要继续检查页面加载和站点兼容逻辑。",
      timeline: buildTimeline(workingTask.timeline, "任务失败", errorMessage)
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
  const requestedSourceIds = [...new Set((payload.sourceIds ?? []).map((item) => item?.trim()).filter(Boolean))];
  const shouldStartBatch = Boolean(payload.startBatch || requestedSourceIds.length > 1);
  const createdAt = nowIso();
  const crawlVersion = inferNextCrawlVersion(state);
  let source: DataSource;
  let task: CrawlTask;
  let preparedState: PlatformState;

  if (shouldStartBatch) {
    if (state.crawlBatch) {
      throw new Error("当前已有进行中的批量抓取，请先完成当前批次。");
    }

    const sources = resolveSourcesForBatch(
      state,
      requestedSourceIds.length > 0 ? requestedSourceIds : payload.sourceId ? [payload.sourceId] : []
    );
    const batchId = createId("batch");
    source = sources[0];
    task = buildPendingTask(source, {
      createdAt,
      batchId,
      batchIndex: 0,
      crawlVersion
    });
    preparedState = {
      ...state,
      tasks: [task, ...state.tasks],
      sources: withSourceRunTimestamp(state, source.sourceId, createdAt),
      crawlBatch: buildBatchState(
        batchId,
        crawlVersion,
        sources.map((item) => item.sourceId),
        task,
        createdAt
      )
    };
  } else {
    if (state.crawlBatch) {
      throw new Error("当前存在进行中的批量抓取，请先完成该批次。");
    }

    const sourceId = payload.sourceId?.trim() || requestedSourceIds[0];

    if (!sourceId) {
      throw new Error("数据源不存在");
    }

    const resolvedSource = state.sources.find((item) => item.sourceId === sourceId);

    if (!resolvedSource) {
      throw new Error("数据源不存在");
    }

    if (!resolvedSource.enabled) {
      throw new Error("该数据源已停用");
    }

    source = resolvedSource;
    task = buildPendingTask(source, {
      createdAt,
      crawlVersion
    });
    preparedState = {
      ...state,
      tasks: [task, ...state.tasks],
      sources: withSourceRunTimestamp(state, source.sourceId, createdAt)
    };
  }

  await savePlatformState(preparedState);
  const pipelineResult = await runTaskPipeline(preparedState, task, source);
  await savePlatformState(pipelineResult.state);
  return pipelineResult.task;
}

export async function startTaskVerification(
  taskId: string,
  options: { preferEmbedded?: boolean; allowEmbeddedFallback?: boolean } = {}
) {
  const state = await getPlatformState();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("任务不存在");
  }

  if (task.status !== "WAITING_HUMAN") {
    throw new Error("当前任务无需人工验证。");
  }

  const source = state.sources.find((item) => item.sourceId === task.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  let currentUrl = task.currentUrl;
  let logSummary = "已连接当前 Chrome 验证会话，等待人工完成验证码、登录或页面放行。";
  let nextAction = "请在当前 Chrome 中完成验证，然后返回后台点击“完成验证并继续抓取”。";
  let timelineDetail = "已连接当前 Chrome 会话供人工验证，完成后将自动继续抓取。";

  if (options.preferEmbedded) {
    const workspace = await startEmbeddedVerificationSession(source, task);
    currentUrl = workspace.currentUrl || task.currentUrl;
    logSummary = "已打开内嵌人工验证工作台，请直接在后台界面中完成验证码、登录或页面放行。";
    nextAction = "请在当前后台工作台中完成验证，完成后点击“完成验证并继续抓取”。";
    timelineDetail = "已直接进入内嵌人工验证工作台。";
  } else {
    try {
      const session = await (await loadPlaywrightCrawler()).startManualVerificationSession(source, task);
      currentUrl = session.finalUrl || task.currentUrl;
      await closeEmbeddedVerificationSession(task.id);
    } catch {
      if (options.allowEmbeddedFallback === false) {
        throw new Error(
          `无法连接可调试的 Chrome。${buildManualVerificationChromeSetupHint()}`
        );
      }

      const workspace = await startEmbeddedVerificationSession(source, task);
      currentUrl = workspace.currentUrl || task.currentUrl;
      logSummary = "已打开内嵌人工验证工作台，请直接在后台界面中完成验证码、登录或页面放行。";
      nextAction = "请在当前后台工作台中完成验证，完成后点击“完成验证并继续抓取”。";
      timelineDetail = "当前 Chrome 接管不可用，已回退到内嵌人工验证工作台。";
    }
  }

  const nextTask: CrawlTask = {
    ...task,
    updatedAt: nowIso(),
    currentUrl,
    requiresVerification: true,
    pageState: "VERIFYING",
    logSummary,
    nextAction,
    timeline: buildTimeline(
      task.timeline,
      task.pageState === "VERIFYING" ? "恢复验证会话" : "启动人工验证",
      timelineDetail
    )
  };

  await savePlatformState(replaceTaskInState(state, nextTask));
  return nextTask;
}

export async function completeTaskVerification(taskId: string) {
  const state = await getPlatformState();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("任务不存在");
  }

  if (task.status !== "WAITING_HUMAN") {
    throw new Error("当前任务不在等待验证状态。");
  }

  const source = state.sources.find((item) => item.sourceId === task.sourceId);

  if (!source) {
    throw new Error("数据源不存在");
  }

  const aiSettings = readAiSettingsFromEnv();
  const embeddedWorkspace = await getEmbeddedVerificationWorkspace(task.id);
  const embeddedSession = embeddedWorkspace ? await exportEmbeddedVerificationSession(task.id) : null;
  const resumedTask: CrawlTask = {
    ...task,
    currentUrl: embeddedSession?.currentUrl || task.currentUrl
  };
  const workingTask: CrawlTask = {
    ...resumedTask,
    status: "CRAWLING",
    updatedAt: nowIso(),
    currentUrl: resumedTask.currentUrl,
    nextAction: "正在读取人工验证后的页面内容",
    logSummary: "正在提取人工验证后的页面内容。",
    timeline: buildTimeline(task.timeline, "读取验证结果", "正在从人工验证会话提取页面内容。")
  };
  const stateWithWorkingTask = replaceTaskInState(state, workingTask);
  await savePlatformState(stateWithWorkingTask);
  let pipelineResult:
    | {
        state: PlatformState;
        task: CrawlTask;
      };

  if (embeddedSession) {
    const capture = await (await loadPlaywrightCrawler()).runPlaywrightCapture(
      source,
      resumedTask.id,
      {
        storageState: embeddedSession.storageState,
        verificationToken: embeddedSession.cookieHeader
      },
      resumedTask
    );
    pipelineResult = await processCaptureResult(stateWithWorkingTask, workingTask, source, capture, aiSettings, {
      fromManualVerification: true,
      payload: {
        storageState: embeddedSession.storageState,
        verificationToken: embeddedSession.cookieHeader
      }
    });
  } else {
    const capture = await (await loadPlaywrightCrawler()).completeManualVerificationSession(source, resumedTask);
    pipelineResult = await processCaptureResult(stateWithWorkingTask, workingTask, source, capture, aiSettings, {
      fromManualVerification: true
    });
  }

  if (pipelineResult.task.status !== "WAITING_HUMAN") {
    await (await loadPlaywrightCrawler()).closeManualVerificationSession(task.id);
    await closeEmbeddedVerificationSession(task.id);
  }

  await savePlatformState(pipelineResult.state);
  return pipelineResult.task;
}

export async function getTaskVerificationWorkspace(taskId: string) {
  const state = await getPlatformState();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("任务不存在");
  }

  const source = state.sources.find((item) => item.sourceId === task.sourceId);
  let workspace = await (await loadPlaywrightCrawler()).getManualVerificationSessionSnapshot(task.id);
  const embeddedWorkspace = await getEmbeddedVerificationWorkspace(task.id);

  if (!workspace && embeddedWorkspace) {
    return {
      active: true,
      stale: false,
      currentUrl: embeddedWorkspace.currentUrl || task.currentUrl || task.rawUrl,
      embedUrl: embeddedWorkspace.embedUrl,
      lastUpdatedAt: embeddedWorkspace.lastUpdatedAt || task.updatedAt,
      errorMessage: undefined as string | undefined
    };
  }

  const isVerifying =
    task.status === "WAITING_HUMAN" &&
    (task.pageState === "VERIFYING" || task.pageState === "WAITING_VERIFICATION");

  if (!workspace && isVerifying && source) {
    try {
      await (await loadPlaywrightCrawler()).startManualVerificationSession(source, task, { focus: false });
      workspace = await (await loadPlaywrightCrawler()).getManualVerificationSessionSnapshot(task.id);
    } catch {
      try {
        const recoveredEmbeddedWorkspace = await startEmbeddedVerificationSession(source, task);
        return {
          active: true,
          stale: false,
          currentUrl: recoveredEmbeddedWorkspace.currentUrl || task.currentUrl || task.rawUrl,
          embedUrl: recoveredEmbeddedWorkspace.embedUrl,
          lastUpdatedAt: recoveredEmbeddedWorkspace.lastUpdatedAt || task.updatedAt,
          errorMessage: undefined as string | undefined
        };
      } catch (error) {
        return {
          active: false,
          stale: true,
          currentUrl: task.currentUrl || task.rawUrl || "",
          embedUrl: "",
          lastUpdatedAt: task.updatedAt,
          errorMessage: error instanceof Error ? error.message : "验证会话恢复失败"
        };
      }
    }
  }

  return {
    active: Boolean(workspace),
    stale: isVerifying && !workspace,
    currentUrl: workspace?.currentUrl || task.currentUrl || task.rawUrl || "",
    embedUrl: "",
    lastUpdatedAt: workspace?.lastUpdatedAt || task.updatedAt,
    errorMessage: undefined as string | undefined
  };
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

  await (await loadPlaywrightCrawler()).closeManualVerificationSession(task.id);
  await closeEmbeddedVerificationSession(task.id);

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

export async function publishReviewAndContinue(reviewId: string) {
  const publishResult = await publishReview(reviewId);

  if (!publishResult.batchId || !publishResult.hasNextInBatch) {
    return {
      ...publishResult,
      batchCompleted: true,
      nextTask: null as CrawlTask | null
    };
  }

  const state = await getPlatformState();
  const batch = state.crawlBatch;

  if (!batch || batch.batchId !== publishResult.batchId) {
    return {
      ...publishResult,
      batchCompleted: true,
      nextTask: null as CrawlTask | null
    };
  }

  const inflightTasks = state.tasks.filter((item) => !isFinalTaskStatus(item.status));

  if (inflightTasks.length > 0) {
    throw new Error("当前仍有未完成任务，暂时不能继续下一站。");
  }

  const nextSourceId = getNextBatchSourceId(batch);

  if (!nextSourceId) {
    return {
      ...publishResult,
      batchCompleted: true,
      nextTask: null as CrawlTask | null
    };
  }

  const source = state.sources.find((item) => item.sourceId === nextSourceId);

  if (!source) {
    throw new Error("下一站数据源不存在，当前批次已中断。");
  }

  if (!source.enabled) {
    throw new Error(`下一站数据源“${source.sourceName}”已停用，当前批次已中断。`);
  }

  const createdAt = nowIso();
  const nextTask = buildPendingTask(source, {
    createdAt,
    batchId: batch.batchId,
    batchIndex: batch.completedSourceIds.length,
    crawlVersion: batch.version
  });
  const preparedState: PlatformState = {
    ...state,
    tasks: [nextTask, ...state.tasks],
    sources: withSourceRunTimestamp(state, source.sourceId, createdAt),
    crawlBatch: {
      ...batch,
      currentIndex: batch.completedSourceIds.length,
      currentSourceId: source.sourceId,
      currentTaskId: nextTask.id,
      updatedAt: createdAt
    }
  };

  await savePlatformState(preparedState);
  const pipelineResult = await runTaskPipeline(preparedState, nextTask, source);
  await savePlatformState(pipelineResult.state);

  return {
    ...publishResult,
    batchCompleted: false,
    nextTask: pipelineResult.task
  };
}
