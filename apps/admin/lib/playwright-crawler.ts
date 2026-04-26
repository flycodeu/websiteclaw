import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";
import { getTaskRuntimeDirectory, resolveWorkspaceRoot, toWorkspaceRelativePath } from "@shop-claw/shared/store";
import { ContinueTaskPayload, CrawlTask, DataSource, StockStatus } from "@shop-claw/shared/types";

interface CrawlCaptureArtifacts {
  htmlPath: string;
  textPath: string;
  screenshotPath?: string;
  storageStatePath: string;
}

interface ManualVerificationSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface CapturedProductCard {
  rawName: string;
  price: number;
  currency: string;
  inventoryText: string;
  stockStatus: StockStatus;
  sourceLine: string;
}

export interface BrowserCrawlResult {
  html: string;
  visibleText: string;
  title: string;
  finalUrl: string;
  requiresVerification: boolean;
  verificationReason?: string;
  artifacts: CrawlCaptureArtifacts;
  productCards: CapturedProductCard[];
}

interface ManualVerificationStartResult {
  capture?: BrowserCrawlResult;
  finalUrl: string;
}

const manualVerificationSessions = new Map<string, ManualVerificationSession>();

function normalizeInlineText(input: string | null | undefined) {
  return (input ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isPageUnavailableError(error: unknown) {
  return error instanceof Error && /Target page, context or browser has been closed/i.test(error.message);
}

function inferStockStatusFromText(input: string) {
  const marker = input.toLowerCase();

  if (/(out of stock|sold out|无货|售罄|缺货|无库存)/i.test(marker)) {
    return "OUT_OF_STOCK" satisfies StockStatus;
  }

  if (/(low stock|only \d+ left|紧张|少量|仅剩|库存低|库存一般)/i.test(marker)) {
    return "LOW_STOCK" satisfies StockStatus;
  }

  return "IN_STOCK" satisfies StockStatus;
}

function parseStorageState(input: string | undefined) {
  const raw = input?.trim();

  if (!raw) {
    return undefined;
  }

  if (!raw.startsWith("{") && !raw.startsWith("[")) {
    return undefined;
  }

  return JSON.parse(raw) as BrowserContextOptions["storageState"];
}

function parseCookieHeader(cookieHeader: string, targetUrl: string) {
  const url = new URL(targetUrl);

  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const equalsIndex = chunk.indexOf("=");

      if (equalsIndex === -1) {
        return null;
      }

      const name = chunk.slice(0, equalsIndex).trim();
      const value = chunk.slice(equalsIndex + 1).trim();

      if (!name) {
        return null;
      }

      return {
        name,
        value,
        domain: url.hostname,
        path: "/",
        httpOnly: false,
        secure: url.protocol === "https:"
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function detectVerificationReason(source: DataSource, title: string, visibleText: string, html: string) {
  const marker = `${title}\n${visibleText}\n${html}`.toLowerCase();

  if (/(captcha|verify you are human|robot check|请完成验证|验证码|安全验证|滑动验证|真人验证)/i.test(marker)) {
    return "页面触发了验证码或人机验证。";
  }

  if (/(sign in|log in|login to continue|请先登录|登录后查看|账户验证)/i.test(marker)) {
    return "页面要求登录后才能查看完整内容。";
  }

  if (source.verificationMethod !== "NONE" && visibleText.trim().length < 120) {
    return source.verificationPrompt || "需要完成人工验证后继续抓取。";
  }

  if (source.crawlMode === "MANUAL_ASSIST" && visibleText.trim().length < 180) {
    return source.verificationPrompt || "当前页面有效内容不足，建议人工验证后继续。";
  }

  return undefined;
}

async function writeCaptureArtifacts(taskId: string, html: string, visibleText: string, screenshot?: Buffer) {
  const runtimeDirectory = await getTaskRuntimeDirectory(taskId);
  const htmlFile = path.join(runtimeDirectory, "page.html");
  const textFile = path.join(runtimeDirectory, "visible.txt");
  const screenshotFile = path.join(runtimeDirectory, "page.png");
  const storageStateFile = path.join(runtimeDirectory, "storage-state.json");

  await fs.writeFile(htmlFile, html, "utf8");
  await fs.writeFile(textFile, visibleText, "utf8");

  if (screenshot) {
    await fs.writeFile(screenshotFile, screenshot);
  }

  return {
    htmlPath: await toWorkspaceRelativePath(htmlFile),
    textPath: await toWorkspaceRelativePath(textFile),
    screenshotPath: screenshot ? await toWorkspaceRelativePath(screenshotFile) : undefined,
    storageStatePath: await toWorkspaceRelativePath(storageStateFile)
  };
}

async function readStoredStorageState(storageStatePath: string | undefined) {
  const relativePath = storageStatePath?.trim();

  if (!relativePath) {
    return undefined;
  }

  try {
    const workspaceRoot = await resolveWorkspaceRoot();
    const raw = await fs.readFile(path.join(workspaceRoot, relativePath), "utf8");
    return parseStorageState(raw);
  } catch {
    return undefined;
  }
}

function buildExtraHeaders(source: DataSource) {
  return source.requestHeaders.reduce<Record<string, string>>(
    (accumulator, header) =>
      header.key.trim()
        ? {
            ...accumulator,
            [header.key.trim()]: header.value
          }
        : accumulator,
    {}
  );
}

async function findVisibleLoadMoreControl(page: Page) {
  const candidates = [
    page.getByText("加载更多", { exact: false }),
    page.getByText("查看更多", { exact: false }),
    page.getByText("更多商品", { exact: false }),
    page.getByText("Load More", { exact: false }),
    page.getByText("Show More", { exact: false }),
    page.locator(".footer-extra span")
  ];

  for (const candidate of candidates) {
    const control = candidate.first();

    if (await control.isVisible().catch(() => false)) {
      return control;
    }
  }

  return null;
}

async function expandPageContent(page: Page) {
  const goodsLocator = page.locator(".goods_item");
  let previousCount = 0;
  let stagnantRounds = 0;

  for (let round = 0; round < 24; round += 1) {
    if (page.isClosed()) {
      return;
    }

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })).catch(() => undefined);

    try {
      await page.waitForTimeout(300);
    } catch (error) {
      if (isPageUnavailableError(error)) {
        return;
      }

      throw error;
    }

    const beforeCount = await goodsLocator.count().catch(() => 0);
    const loadMore = await findVisibleLoadMoreControl(page);

    if (loadMore) {
      await loadMore.scrollIntoViewIfNeeded().catch(() => undefined);
      await loadMore.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);

      try {
        await page.waitForTimeout(700);
      } catch (error) {
        if (isPageUnavailableError(error)) {
          return;
        }

        throw error;
      }
    }

    const afterCount = await goodsLocator.count().catch(() => 0);

    if (afterCount > previousCount || afterCount > beforeCount) {
      previousCount = Math.max(afterCount, beforeCount);
      stagnantRounds = 0;
      continue;
    }

    stagnantRounds += 1;

    if (!loadMore || stagnantRounds >= 2) {
      break;
    }
  }

  if (page.isClosed()) {
    return;
  }

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })).catch(() => undefined);
  await page.waitForTimeout(300).catch(() => undefined);
}

async function extractProductCards(page: Page): Promise<CapturedProductCard[]> {
  const cards = await page.evaluate(() => {
    const normalize = (input: string | null | undefined) => (input ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const parsePrice = (input: string) => {
      const matched = normalize(input).match(/\d+(?:\.\d{1,2})?/);
      return matched ? Number.parseFloat(matched[0]) : Number.NaN;
    };
    const inferStock = (input: string) => {
      const marker = normalize(input).toLowerCase();

      if (/(out of stock|sold out|无货|售罄|缺货|无库存)/i.test(marker)) {
        return "OUT_OF_STOCK";
      }

      if (/(low stock|only \d+ left|紧张|少量|仅剩|库存低|库存一般)/i.test(marker)) {
        return "LOW_STOCK";
      }

      return "IN_STOCK";
    };
    const readText = (container: Element, selectors: string[]) => {
      for (const selector of selectors) {
        const text = normalize(container.querySelector(selector)?.textContent);

        if (text) {
          return text;
        }
      }

      return "";
    };

    return Array.from(document.querySelectorAll(".goods_item"))
      .map((card) => {
        const rawName = readText(card, [".name", ".title", ".goods-name"]);
        const price = parsePrice(readText(card, [".nowPrice", ".goods-price", ".price"]));
        const currency = readText(card, [".currency"]) || "CNY";
        const inventoryText = readText(card, [".stock", ".inventory", ".discounts"]);

        if (!rawName || !Number.isFinite(price) || price <= 0) {
          return null;
        }

        const normalizedCurrency = /¥|￥/.test(currency) ? "CNY" : normalize(currency || "CNY");
        const normalizedInventory = inventoryText || "有货";

        return {
          rawName,
          price,
          currency: normalizedCurrency,
          inventoryText: normalizedInventory,
          stockStatus: inferStock(normalizedInventory),
          sourceLine: normalize(`${rawName} ¥${price} ${normalizedInventory}`)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  });

  const deduped = new Map<string, CapturedProductCard>();

  cards.forEach((card) => {
    deduped.set(`${card.rawName}__${card.price}__${card.inventoryText}`, {
      ...card,
      stockStatus: inferStockStatusFromText(card.inventoryText)
    });
  });

  return [...deduped.values()];
}

async function readVisibleText(page: Page): Promise<string> {
  const fromBodyInnerText = await page.locator("body").innerText().catch(() => "");

  if (normalizeInlineText(fromBodyInnerText)) {
    return fromBodyInnerText;
  }

  const fromBodyTextContent = await page.locator("body").textContent().catch(() => "");

  if (normalizeInlineText(fromBodyTextContent)) {
    return fromBodyTextContent ?? "";
  }

  const fromDocument = await page
    .evaluate(() => document.body?.innerText || document.documentElement?.innerText || document.body?.textContent || "")
    .catch(() => "");

  return fromDocument ?? "";
}

async function createBrowserSession(
  source: DataSource,
  task: Pick<CrawlTask, "artifacts"> | undefined,
  payload: ContinueTaskPayload | undefined,
  options: { interactive: boolean }
) {
  const storageStateInput =
    parseStorageState(payload?.storageState) ??
    parseStorageState(payload?.verificationToken) ??
    (await readStoredStorageState(task?.artifacts?.storageStatePath));

  const browser = await chromium.launch({
    headless: options.interactive ? false : source.headless
  });

  const context = await browser.newContext({
    storageState: storageStateInput,
    extraHTTPHeaders: buildExtraHeaders(source)
  });

  if (!options.interactive && source.blockAssets) {
    await context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();

      if (["image", "font", "media"].includes(resourceType)) {
        return route.abort();
      }

      return route.continue();
    });
  }

  const rawCookie = payload?.verificationToken?.trim();

  if (rawCookie && !storageStateInput && rawCookie.includes("=")) {
    const cookies = parseCookieHeader(rawCookie, source.entryUrl || source.sourceUrl);

    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }

  return { browser, context };
}

async function capturePageState(
  source: DataSource,
  taskId: string,
  context: BrowserContext,
  page: Page
): Promise<BrowserCrawlResult> {
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);

  if (!page.isClosed()) {
    await expandPageContent(page);
  }

  if (source.waitSelector.trim()) {
    await page.waitForSelector(source.waitSelector, { timeout: 12_000 }).catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  const productCards = await extractProductCards(page);

  const html = await page.content();
  const visibleText = await readVisibleText(page);
  const title = await page.title().catch(() => "");
  const screenshot = await page.screenshot({ fullPage: true }).catch(() => undefined);
  const artifacts = await writeCaptureArtifacts(taskId, html, visibleText, screenshot);

  await context.storageState({
    path: path.join(await getTaskRuntimeDirectory(taskId), "storage-state.json")
  });

  const verificationReason = detectVerificationReason(source, title, visibleText, html);

  return {
    html,
    visibleText,
    title,
    finalUrl: page.url(),
    requiresVerification: Boolean(verificationReason),
    verificationReason,
    artifacts,
    productCards
  };
}

async function releaseManualVerificationSession(taskId: string) {
  const session = manualVerificationSessions.get(taskId);

  if (!session) {
    return;
  }

  manualVerificationSessions.delete(taskId);

  await session.page.close().catch(() => undefined);
  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
}

async function getActiveManualVerificationSession(taskId: string) {
  const session = manualVerificationSessions.get(taskId);

  if (!session) {
    return null;
  }

  if (session.page.isClosed() || !session.browser.isConnected()) {
    await releaseManualVerificationSession(taskId);
    return null;
  }

  return session;
}

export async function closeManualVerificationSession(taskId: string) {
  await releaseManualVerificationSession(taskId);
}

export async function runPlaywrightCapture(
  source: DataSource,
  taskId: string,
  payload?: ContinueTaskPayload,
  task?: Pick<CrawlTask, "artifacts">
): Promise<BrowserCrawlResult> {
  const { browser, context } = await createBrowserSession(source, task, payload, { interactive: false });

  try {
    const page = await context.newPage();
    const targetUrl = source.entryUrl || source.sourceUrl;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

    return capturePageState(source, taskId, context, page);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function startManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id" | "currentUrl" | "artifacts">
): Promise<ManualVerificationStartResult> {
  const existingSession = await getActiveManualVerificationSession(task.id);

  if (existingSession) {
    await existingSession.page.bringToFront().catch(() => undefined);
    return {
      capture: await capturePageState(source, task.id, existingSession.context, existingSession.page).catch(() => undefined),
      finalUrl: existingSession.page.url()
    };
  }

  const { browser, context } = await createBrowserSession(source, task, undefined, { interactive: true });

  try {
    const page = await context.newPage();
    const targetUrl = task.currentUrl || source.entryUrl || source.sourceUrl;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

    await page.bringToFront().catch(() => undefined);

    const session: ManualVerificationSession = {
      browser,
      context,
      page
    };

    manualVerificationSessions.set(task.id, session);

    return {
      capture: await capturePageState(source, task.id, context, page).catch(() => undefined),
      finalUrl: page.url()
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    throw error;
  }
}

export async function completeManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id">
): Promise<BrowserCrawlResult> {
  const session = await getActiveManualVerificationSession(task.id);

  if (!session) {
    throw new Error("人工验证会话不存在，请先启动人工验证。");
  }

  const capture = await capturePageState(source, task.id, session.context, session.page);

  if (!capture.requiresVerification) {
    await releaseManualVerificationSession(task.id);
    return capture;
  }

  await session.page.bringToFront().catch(() => undefined);
  return capture;
}

export async function saveManualCapture(taskId: string, content: string) {
  const htmlLike = /<html|<body|<div|<span|<script/i.test(content);
  const html = htmlLike ? content : `<pre>${content}</pre>`;
  const artifacts = await writeCaptureArtifacts(taskId, html, content);

  return {
    html,
    visibleText: content,
    title: "人工补充内容",
    finalUrl: "",
    requiresVerification: false,
    artifacts,
    productCards: []
  } satisfies BrowserCrawlResult;
}
