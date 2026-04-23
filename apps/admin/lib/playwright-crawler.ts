import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContextOptions } from "playwright";
import { getTaskRuntimeDirectory, toWorkspaceRelativePath } from "@shop-claw/shared/store";
import { ContinueTaskPayload, DataSource } from "@shop-claw/shared/types";

interface CrawlCaptureArtifacts {
  htmlPath: string;
  textPath: string;
  screenshotPath?: string;
  storageStatePath: string;
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

export async function runPlaywrightCapture(
  source: DataSource,
  taskId: string,
  payload?: ContinueTaskPayload
): Promise<BrowserCrawlResult> {
  const storageStateInput = parseStorageState(payload?.storageState) ?? parseStorageState(payload?.verificationToken);
  const browser = await chromium.launch({
    headless: payload?.manualContent ? true : source.headless
  });

  try {
    const context = await browser.newContext({
      storageState: storageStateInput,
      extraHTTPHeaders: source.requestHeaders.reduce<Record<string, string>>(
        (accumulator, header) =>
          header.key.trim()
            ? {
                ...accumulator,
                [header.key.trim()]: header.value
              }
            : accumulator,
        {}
      )
    });

    if (source.blockAssets) {
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

    const page = await context.newPage();
    const targetUrl = source.entryUrl || source.sourceUrl;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

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
  } finally {
    await browser.close();
  }
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
