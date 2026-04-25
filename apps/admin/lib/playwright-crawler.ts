import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";
import { getTaskRuntimeDirectory, resolveWorkspaceRoot, toWorkspaceRelativePath } from "@shop-claw/shared/store";
import { ContinueTaskPayload, CrawlTask, DataSource } from "@shop-claw/shared/types";

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

export interface BrowserCrawlResult {
  html: string;
  visibleText: string;
  title: string;
  finalUrl: string;
  requiresVerification: boolean;
  verificationReason?: string;
  artifacts: CrawlCaptureArtifacts;
}

interface ManualVerificationStartResult {
  capture?: BrowserCrawlResult;
  finalUrl: string;
}

const manualVerificationSessions = new Map<string, ManualVerificationSession>();

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

  if (/(captcha|verify you are human|robot check|请完成验证|验证码|安全验证)/i.test(marker)) {
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
  if (source.waitSelector.trim()) {
    await page.waitForSelector(source.waitSelector, { timeout: 12_000 }).catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

  const html = await page.content();
  const visibleText =
    (await page.locator("body").innerText().catch(() => undefined)) ||
    (await page.evaluate(() => document.body?.innerText ?? ""));
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
    artifacts
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
    artifacts
  } satisfies BrowserCrawlResult;
}
