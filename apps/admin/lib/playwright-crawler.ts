import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import {
  MANUAL_VERIFICATION_CDP_URL,
  MANUAL_VERIFICATION_DEBUG_HOST,
  MANUAL_VERIFICATION_DEBUG_PORT,
  buildManualVerificationChromeSetupHint,
  detectManualVerificationReason
} from "@shop-claw/shared/manual-verification";
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
  viewport: {
    width: number;
    height: number;
  };
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
  finalUrl: string;
}

export interface ManualVerificationInteractable {
  id: string;
  kind: "INPUT" | "BUTTON" | "LINK" | "SELECT" | "FRAME" | "CONTROL";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualVerificationSessionSnapshot {
  active: boolean;
  title: string;
  currentUrl: string;
  lastUpdatedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  interactables: ManualVerificationInteractable[];
}

export interface ManualVerificationActionPayload {
  type: "back" | "click" | "drag" | "forward" | "press" | "reload" | "scroll" | "type" | "wait";
  x?: number;
  y?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  text?: string;
  key?: string;
  deltaY?: number;
  timeoutMs?: number;
}

interface PersistedStorageState {
  cookies?: Parameters<BrowserContext["addCookies"]>[0];
  origins?: Array<{
    origin: string;
    localStorage?: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

type SupportedStorageStateInput = PersistedStorageState | BrowserContextOptions["storageState"] | undefined;

const manualVerificationSessions = new Map<string, ManualVerificationSession>();
const pendingManualVerificationSessions = new Map<string, Promise<ManualVerificationSession>>();
const DEFAULT_MANUAL_VIEWPORT = {
  width: 1440,
  height: 1080
} as const;
let playwrightModulePromise: Promise<typeof import("playwright")> | null = null;

async function getChromium() {
  if (!playwrightModulePromise) {
    playwrightModulePromise = import("playwright");
  }

  const playwrightModule = await playwrightModulePromise;
  return playwrightModule.chromium;
}

function normalizeInlineText(input: string | null | undefined) {
  return (input ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPageUnavailableError(error: unknown) {
  return error instanceof Error && /Target page, context or browser has been closed/i.test(error.message);
}

function ensurePageIsAvailable(page: Page) {
  if (page.isClosed()) {
    throw new Error("浏览器页面已关闭，请重新启动验证会话。");
  }
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

function normalizePersistedStorageState(input: SupportedStorageStateInput) {
  if (!input || typeof input === "string" || Array.isArray(input)) {
    return undefined;
  }

  return input as PersistedStorageState;
}

function detectVerificationReason(_source: DataSource, title: string, visibleText: string, html: string, finalUrl: string) {
  return detectManualVerificationReason(`${title}\n${visibleText}\n${html}\n${finalUrl}`);
}

function isReusableChromeLandingUrl(url: string) {
  return /^(about:blank|chrome:\/\/newtab\/|chrome-search:\/\/local-ntp)/i.test(url);
}

function matchesTargetDomain(candidateUrl: string, targetUrl: string) {
  try {
    const candidate = new URL(candidateUrl);
    const target = new URL(targetUrl);

    return (
      candidate.origin === target.origin ||
      candidate.hostname === target.hostname ||
      candidate.hostname.endsWith(`.${target.hostname}`) ||
      target.hostname.endsWith(`.${candidate.hostname}`)
    );
  } catch {
    return false;
  }
}

function matchesCookieDomain(cookieDomain: string, hostname: string) {
  const normalizedCookieDomain = cookieDomain.replace(/^\./, "").toLowerCase();
  const normalizedHost = hostname.toLowerCase();

  return normalizedHost === normalizedCookieDomain || normalizedHost.endsWith(`.${normalizedCookieDomain}`);
}

function matchesCookieTarget(
  cookie: NonNullable<PersistedStorageState["cookies"]>[number],
  targetUrl: URL
) {
  if (cookie.domain) {
    return matchesCookieDomain(cookie.domain, targetUrl.hostname);
  }

  if (!cookie.url) {
    return false;
  }

  try {
    return matchesTargetDomain(cookie.url, targetUrl.toString());
  } catch {
    return false;
  }
}

function filterPersistedStorageStateForUrl(input: SupportedStorageStateInput, targetUrl: string) {
  const persistedState = normalizePersistedStorageState(input);

  if (!persistedState) {
    return undefined;
  }

  try {
    const url = new URL(targetUrl);

    return {
      cookies: (persistedState.cookies ?? []).filter((cookie) => matchesCookieTarget(cookie, url)),
      origins: (persistedState.origins ?? []).filter((origin) => {
        try {
          return new URL(origin.origin).origin === url.origin;
        } catch {
          return false;
        }
      })
    } satisfies PersistedStorageState;
  } catch {
    return persistedState;
  }
}

async function applyPersistedStorageState(
  context: BrowserContext,
  storageStateInput: SupportedStorageStateInput
) {
  const persistedState = normalizePersistedStorageState(storageStateInput);

  if (!persistedState) {
    return;
  }

  if (persistedState.cookies?.length) {
    await context.addCookies(persistedState.cookies).catch(() => undefined);
  }

  const originsWithLocalStorage = (persistedState.origins ?? [])
    .map((entry) => ({
      origin: entry.origin,
      localStorage: (entry.localStorage ?? []).filter((item) => item.name)
    }))
    .filter((entry) => entry.origin && entry.localStorage.length > 0);

  if (originsWithLocalStorage.length === 0) {
    return;
  }

  await context
    .addInitScript((entries: PersistedStorageState["origins"]) => {
      const currentOrigin = window.location.origin;
      const matched = entries?.find((entry) => entry.origin === currentOrigin);

      if (!matched?.localStorage?.length) {
        return;
      }

      for (const item of matched.localStorage) {
        try {
          window.localStorage.setItem(item.name, item.value);
        } catch {
          // Ignore storage write failures for locked-down origins.
        }
      }
    }, originsWithLocalStorage)
    .catch(() => undefined);
}

async function writeFilteredStorageStateArtifact(taskId: string, context: BrowserContext, targetUrl: string) {
  const storageStateFile = path.join(await getTaskRuntimeDirectory(taskId), "storage-state.json");
  const filteredStorageState = filterPersistedStorageStateForUrl(await context.storageState(), targetUrl) ?? {
    cookies: [],
    origins: []
  };
  await fs.writeFile(storageStateFile, `${JSON.stringify(filteredStorageState, null, 2)}\n`, "utf8");
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

function isConnectionRefusedError(error: unknown) {
  return (
    error instanceof Error &&
    /(econnrefused|connect econnrefused|unexpected status 404|unexpected status 403|websocket|devtools server|cannot connect)/i.test(
      error.message
    )
  );
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    process.platform === "win32" ? path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe") : undefined,
    process.platform === "win32"
      ? path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe")
      : undefined,
    process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe")
      : undefined,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome-stable" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // ignore
    }
  }

  return null;
}

async function launchManualVerificationBrowser(targetUrl: string) {
  const executablePath = await findChromeExecutable();

  if (!executablePath) {
    throw new Error(
      `未找到本机 Chrome 可执行文件。请把 Chrome 安装到常见位置，或设置 CHROME_PATH 后重试。${buildManualVerificationChromeSetupHint()}`
    );
  }

  const userDataDir = path.join(os.tmpdir(), "shop-claw-chrome-debug");
  const args = [
    `--remote-debugging-port=${MANUAL_VERIFICATION_DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    targetUrl || "about:blank"
  ];

  const child = spawn(executablePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });

  child.unref();
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
  ensurePageIsAvailable(page);
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
  ensurePageIsAvailable(page);
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
  const chromium = await getChromium();
  const storageStateInput =
    parseStorageState(payload?.storageState) ??
    parseStorageState(payload?.verificationToken) ??
    (await readStoredStorageState(task?.artifacts?.storageStatePath));

  const browser = await chromium.launch({
    headless: options.interactive ? false : source.headless
  });

  const context = await browser.newContext({
    storageState: storageStateInput,
    extraHTTPHeaders: buildExtraHeaders(source),
    viewport: options.interactive ? DEFAULT_MANUAL_VIEWPORT : undefined
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

async function connectToManualVerificationBrowser(targetUrl: string) {
  const chromium = await getChromium();
  let launched = false;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      return await chromium.connectOverCDP(MANUAL_VERIFICATION_CDP_URL);
    } catch (error) {
      if (!isConnectionRefusedError(error)) {
        throw error;
      }

      if (!launched) {
        await launchManualVerificationBrowser(targetUrl);
        launched = true;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  throw new Error(
    `无法连接到调试 Chrome（${MANUAL_VERIFICATION_DEBUG_HOST}:${MANUAL_VERIFICATION_DEBUG_PORT}）。请检查浏览器是否成功启动，或在 CHROME_PATH 中指定可执行文件路径。`
  );
}

async function attachManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "currentUrl" | "artifacts">
) {
  const targetUrl = task.currentUrl || source.entryUrl || source.sourceUrl;
  const browser = await connectToManualVerificationBrowser(targetUrl);
  const context = browser.contexts()[0];

  if (!context) {
    await browser.close().catch(() => undefined);
    throw new Error(`当前 Chrome 未暴露可用的浏览器上下文。${buildManualVerificationChromeSetupHint()}`);
  }

  const storageStateInput = filterPersistedStorageStateForUrl(
    await readStoredStorageState(task.artifacts?.storageStatePath),
    targetUrl
  );

  await applyPersistedStorageState(context, storageStateInput);

  const matchedPage = context.pages().find((candidate) => !candidate.isClosed() && matchesTargetDomain(candidate.url(), targetUrl));
  const reusablePage = context.pages().find((candidate) => !candidate.isClosed() && isReusableChromeLandingUrl(candidate.url()));
  const page = matchedPage ?? reusablePage ?? (await context.newPage());

  if (!matchedPage) {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });
  }

  return { browser, context, page };
}

async function createAttachedManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id" | "currentUrl" | "artifacts">
) {
  const pending = pendingManualVerificationSessions.get(task.id);

  if (pending) {
    return pending;
  }

  const creation = (async () => {
    const existing = await getActiveManualVerificationSession(task.id);

    if (existing) {
      return existing;
    }

    const { browser, context, page } = await attachManualVerificationSession(source, task);

    try {
      const session: ManualVerificationSession = {
        browser,
        context,
        page,
        viewport: DEFAULT_MANUAL_VIEWPORT
      };

      manualVerificationSessions.set(task.id, session);
      return session;
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  })();

  pendingManualVerificationSessions.set(task.id, creation);

  try {
    return await creation;
  } finally {
    pendingManualVerificationSessions.delete(task.id);
  }
}

async function collectManualVerificationInteractables(page: Page): Promise<ManualVerificationInteractable[]> {
  ensurePageIsAvailable(page);

  return page
    .evaluate(() => {
      const normalize = (input: string | null | undefined) => (input ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
      const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const inferKind = (element: Element): ManualVerificationInteractable["kind"] => {
        const tagName = element.tagName.toLowerCase();

        if (tagName === "input" || tagName === "textarea") {
          return "INPUT";
        }

        if (tagName === "select") {
          return "SELECT";
        }

        if (tagName === "iframe") {
          return "FRAME";
        }

        if (tagName === "a") {
          return "LINK";
        }

        if (tagName === "button") {
          return "BUTTON";
        }

        return "CONTROL";
      };

      return Array.from(
        document.querySelectorAll("input, textarea, select, button, a, iframe, [role='button'], [contenteditable='true']")
      )
        .map((element, index) => {
          const rect = element.getBoundingClientRect();

          if (rect.width < 20 || rect.height < 16) {
            return null;
          }

          if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewportHeight || rect.left >= viewportWidth) {
            return null;
          }

          const styles = window.getComputedStyle(element);

          if (styles.display === "none" || styles.visibility === "hidden" || Number(styles.opacity) === 0) {
            return null;
          }

          const rawLabel =
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            element.getAttribute("title") ||
            element.getAttribute("name") ||
            element.textContent;
          const label = normalize(rawLabel).slice(0, 32);

          return {
            id: `hint_${index}`,
            kind: inferKind(element),
            label: label || "可交互元素",
            x: clamp(rect.left, 0, viewportWidth),
            y: clamp(rect.top, 0, viewportHeight),
            width: clamp(rect.width, 0, viewportWidth),
            height: clamp(rect.height, 0, viewportHeight)
          };
        })
        .filter((item): item is ManualVerificationInteractable => Boolean(item))
        .slice(0, 24);
    })
    .catch((error) => {
      if (isPageUnavailableError(error)) {
        return [];
      }

      throw error;
    });
}

async function waitForManualVerificationStabilization(page: Page, timeoutMs = 350) {
  if (page.isClosed()) {
    return;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: clampNumber(timeoutMs, 200, 2_000) }).catch(() => undefined);
  await page.waitForTimeout(180).catch(() => undefined);
}

function normalizeViewportCoordinate(value: number | undefined) {
  if (!Number.isFinite(value)) {
    throw new Error("坐标无效，无法执行页面操作。");
  }

  return clampNumber(Number(value), 0, 1);
}

async function buildManualVerificationSessionSnapshot(
  page: Page,
  viewport: { width: number; height: number }
): Promise<ManualVerificationSessionSnapshot> {
  ensurePageIsAvailable(page);

  const currentViewport = page.viewportSize() ?? viewport;
  const interactables = await collectManualVerificationInteractables(page);

  return {
    active: true,
    title: await page.title().catch(() => ""),
    currentUrl: page.url(),
    lastUpdatedAt: new Date().toISOString(),
    viewport: currentViewport,
    interactables
  };
}

async function capturePageState(
  source: DataSource,
  taskId: string,
  context: BrowserContext,
  page: Page
): Promise<BrowserCrawlResult> {
  ensurePageIsAvailable(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);

  if (!page.isClosed()) {
    await expandPageContent(page);
  }

  if (source.waitSelector.trim()) {
    await page.waitForSelector(source.waitSelector, { timeout: 12_000 }).catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  ensurePageIsAvailable(page);
  const productCards = await extractProductCards(page);

  ensurePageIsAvailable(page);
  const html = await page.content();
  const visibleText = await readVisibleText(page);
  const title = await page.title().catch(() => "");
  const screenshot = await page.screenshot({ fullPage: true }).catch(() => undefined);
  const artifacts = await writeCaptureArtifacts(taskId, html, visibleText, screenshot);
  const finalUrl = page.url();
  await writeFilteredStorageStateArtifact(taskId, context, finalUrl);
  const verificationReason = detectVerificationReason(source, title, visibleText, html, finalUrl);

  return {
    html,
    visibleText,
    title,
    finalUrl,
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
  task?: Pick<CrawlTask, "artifacts" | "currentUrl">
): Promise<BrowserCrawlResult> {
  const { browser, context } = await createBrowserSession(source, task, payload, { interactive: false });

  try {
    const page = await context.newPage();
    const targetUrl = task?.currentUrl || source.entryUrl || source.sourceUrl;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

    return await capturePageState(source, taskId, context, page);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function startManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id" | "currentUrl" | "artifacts">,
  options: { focus?: boolean } = {}
): Promise<ManualVerificationStartResult> {
  const session =
    (await getActiveManualVerificationSession(task.id)) ?? (await createAttachedManualVerificationSession(source, task));

  if (options.focus !== false) {
    await session.page.bringToFront().catch(() => undefined);
  }

  return {
    finalUrl: session.page.url()
  };
}

export async function completeManualVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id" | "currentUrl" | "artifacts">
): Promise<BrowserCrawlResult> {
  const session =
    (await getActiveManualVerificationSession(task.id)) ?? (await createAttachedManualVerificationSession(source, task));

  const capture = await capturePageState(source, task.id, session.context, session.page);

  if (!capture.requiresVerification) {
    await releaseManualVerificationSession(task.id);
    return capture;
  }

  return capture;
}

export async function getManualVerificationSessionSnapshot(taskId: string) {
  const session = await getActiveManualVerificationSession(taskId);

  if (!session) {
    return null;
  }

  await waitForManualVerificationStabilization(session.page);
  return buildManualVerificationSessionSnapshot(session.page, session.viewport);
}

export async function getManualVerificationSessionScreenshot(taskId: string) {
  const session = await getActiveManualVerificationSession(taskId);

  if (!session) {
    return null;
  }

  await waitForManualVerificationStabilization(session.page, 250);

  try {
    return await session.page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide"
    });
  } catch (error) {
    if (isPageUnavailableError(error)) {
      await releaseManualVerificationSession(taskId);
      return null;
    }

    throw error;
  }
}

export async function applyManualVerificationAction(taskId: string, payload: ManualVerificationActionPayload) {
  const session = await getActiveManualVerificationSession(taskId);

  if (!session) {
    throw new Error("人工验证会话不存在，请先启动内嵌验证工作台。");
  }

  const page = session.page;
  const viewport = page.viewportSize() ?? session.viewport;

  ensurePageIsAvailable(page);

  switch (payload.type) {
    case "click": {
      const x = Math.round(normalizeViewportCoordinate(payload.x) * viewport.width);
      const y = Math.round(normalizeViewportCoordinate(payload.y) * viewport.height);
      await page.mouse.click(x, y, { delay: 40 });
      break;
    }
    case "drag": {
      const fromX = Math.round(normalizeViewportCoordinate(payload.fromX) * viewport.width);
      const fromY = Math.round(normalizeViewportCoordinate(payload.fromY) * viewport.height);
      const toX = Math.round(normalizeViewportCoordinate(payload.toX) * viewport.width);
      const toY = Math.round(normalizeViewportCoordinate(payload.toY) * viewport.height);
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.mouse.move(toX, toY, { steps: 18 });
      await page.mouse.up();
      break;
    }
    case "type": {
      if (typeof payload.text !== "string" || payload.text.length === 0) {
        throw new Error("请输入要发送到页面的文本。");
      }

      await page.keyboard.type(payload.text.slice(0, 600), { delay: 24 });
      break;
    }
    case "press": {
      const key = payload.key?.trim();

      if (!key) {
        throw new Error("请选择要发送的按键。");
      }

      await page.keyboard.press(key);
      break;
    }
    case "scroll": {
      const deltaY = clampNumber(Number(payload.deltaY ?? 560), -1_600, 1_600);
      await page.mouse.wheel(0, deltaY);
      break;
    }
    case "reload": {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
      break;
    }
    case "back": {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      break;
    }
    case "forward": {
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      break;
    }
    case "wait": {
      const timeoutMs = clampNumber(Number(payload.timeoutMs ?? 1_200), 200, 6_000);
      await page.waitForTimeout(timeoutMs).catch(() => undefined);
      break;
    }
    default:
      throw new Error("不支持的验证操作。");
  }

  await waitForManualVerificationStabilization(page, 700);
  return buildManualVerificationSessionSnapshot(page, session.viewport);
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
