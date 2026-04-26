import { promises as fs } from "node:fs";
import path from "node:path";
import { getTaskRuntimeDirectory, resolveWorkspaceRoot } from "@shop-claw/shared/store";
import { CrawlTask, DataSource } from "@shop-claw/shared/types";

type CookieSameSite = "Lax" | "None" | "Strict";

interface VerificationProxyCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: CookieSameSite;
}

interface VerificationProxySession {
  taskId: string;
  currentUrl: string;
  updatedAt: string;
  cookies: VerificationProxyCookie[];
  requestHeaders: Record<string, string>;
}

export interface VerificationWorkspaceState {
  active: boolean;
  stale?: boolean;
  currentUrl: string;
  embedUrl: string;
  lastUpdatedAt: string;
}

interface ExportedVerificationSession {
  currentUrl: string;
  storageState: string;
  cookieHeader: string;
}

const verificationProxySessions = new Map<string, VerificationProxySession>();

function nowIso() {
  return new Date().toISOString();
}

function normalizeCookieDomain(domain: string) {
  return domain.trim().replace(/^\./, "").toLowerCase();
}

function buildRequestHeaders(source: DataSource) {
  return source.requestHeaders.reduce<Record<string, string>>((accumulator, header) => {
    const key = header.key.trim();

    if (!key) {
      return accumulator;
    }

    return {
      ...accumulator,
      [key]: header.value
    };
  }, {});
}

function buildProxyUrl(taskId: string, targetUrl: string) {
  return `/api/tasks/${encodeURIComponent(taskId)}/verification/web?target=${encodeURIComponent(targetUrl)}`;
}

function clampUrlInput(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  return normalized;
}

function isExpiredCookie(cookie: VerificationProxyCookie) {
  return cookie.expires !== -1 && cookie.expires <= Math.floor(Date.now() / 1000);
}

function sameSiteValue(input: string | undefined): CookieSameSite | undefined {
  if (!input) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();

  if (normalized === "lax") {
    return "Lax";
  }

  if (normalized === "strict") {
    return "Strict";
  }

  if (normalized === "none") {
    return "None";
  }

  return undefined;
}

function parseStorageState(input: string | undefined) {
  const raw = input?.trim();

  if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) {
    return null;
  }

  return JSON.parse(raw) as {
    cookies?: VerificationProxyCookie[];
  };
}

function matchesCookie(cookie: VerificationProxyCookie, targetUrl: URL) {
  if (isExpiredCookie(cookie)) {
    return false;
  }

  const hostname = targetUrl.hostname.toLowerCase();
  const domain = normalizeCookieDomain(cookie.domain);

  if (!(hostname === domain || hostname.endsWith(`.${domain}`))) {
    return false;
  }

  const pathname = targetUrl.pathname || "/";
  const cookiePath = cookie.path || "/";

  if (!pathname.startsWith(cookiePath)) {
    return false;
  }

  if (cookie.secure && targetUrl.protocol !== "https:") {
    return false;
  }

  return true;
}

function buildCookieHeader(cookies: VerificationProxyCookie[], targetUrl: string) {
  const url = new URL(targetUrl);

  return cookies
    .filter((cookie) => matchesCookie(cookie, url))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function upsertCookies(
  existing: VerificationProxyCookie[],
  nextCookies: VerificationProxyCookie[]
) {
  const merged = new Map<string, VerificationProxyCookie>();

  existing.filter((item) => !isExpiredCookie(item)).forEach((cookie) => {
    merged.set(`${cookie.name}__${normalizeCookieDomain(cookie.domain)}__${cookie.path || "/"}`, cookie);
  });

  nextCookies.forEach((cookie) => {
    const key = `${cookie.name}__${normalizeCookieDomain(cookie.domain)}__${cookie.path || "/"}`;

    if (isExpiredCookie(cookie) || cookie.value === "") {
      merged.delete(key);
      return;
    }

    merged.set(key, cookie);
  });

  return [...merged.values()];
}

function parseSetCookieHeader(setCookieLine: string, targetUrl: string) {
  const [cookiePart, ...attributeParts] = setCookieLine.split(";");
  const separatorIndex = cookiePart.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const target = new URL(targetUrl);
  const cookie: VerificationProxyCookie = {
    name: cookiePart.slice(0, separatorIndex).trim(),
    value: cookiePart.slice(separatorIndex + 1),
    domain: target.hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: target.protocol === "https:"
  };

  attributeParts.forEach((part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();

    if (key === "domain" && value) {
      cookie.domain = normalizeCookieDomain(value);
      return;
    }

    if (key === "path" && value) {
      cookie.path = value;
      return;
    }

    if (key === "expires" && value) {
      const expiresAt = Date.parse(value);

      if (Number.isFinite(expiresAt)) {
        cookie.expires = Math.floor(expiresAt / 1000);
      }

      return;
    }

    if (key === "max-age" && value) {
      const maxAge = Number.parseInt(value, 10);

      if (Number.isFinite(maxAge)) {
        cookie.expires = Math.floor(Date.now() / 1000) + maxAge;
      }

      return;
    }

    if (key === "httponly") {
      cookie.httpOnly = true;
      return;
    }

    if (key === "secure") {
      cookie.secure = true;
      return;
    }

    if (key === "samesite") {
      cookie.sameSite = sameSiteValue(value);
    }
  });

  return cookie;
}

async function readStoredCookies(task: Pick<CrawlTask, "artifacts"> | undefined) {
  const relativePath = task?.artifacts?.storageStatePath?.trim();

  if (!relativePath) {
    return [];
  }

  try {
    const workspaceRoot = await resolveWorkspaceRoot();
    const raw = await fs.readFile(path.join(workspaceRoot, relativePath), "utf8");
    const parsed = parseStorageState(raw);

    return (parsed?.cookies ?? [])
      .filter((item) => item.name && item.domain)
      .map((item) => ({
        name: item.name,
        value: item.value,
        domain: normalizeCookieDomain(item.domain),
        path: item.path || "/",
        expires: Number.isFinite(item.expires) ? item.expires : -1,
        httpOnly: Boolean(item.httpOnly),
        secure: Boolean(item.secure),
        sameSite: sameSiteValue(item.sameSite)
      }));
  } catch {
    return [];
  }
}

function buildWorkspace(session: VerificationProxySession): VerificationWorkspaceState {
  return {
    active: true,
    currentUrl: session.currentUrl,
    embedUrl: buildProxyUrl(session.taskId, session.currentUrl),
    lastUpdatedAt: session.updatedAt
  };
}

function resolveTargetUrl(session: VerificationProxySession, rawTarget: string | null) {
  const explicit = clampUrlInput(rawTarget);

  if (explicit) {
    return explicit;
  }

  return session.currentUrl;
}

function copyResponseHeaders(upstreamHeaders: Headers, options: { rewritten: boolean; location?: string }) {
  const headers = new Headers();

  upstreamHeaders.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "set-cookie") {
      return;
    }

    if (
      normalizedKey === "content-security-policy" ||
      normalizedKey === "content-security-policy-report-only" ||
      normalizedKey === "x-frame-options" ||
      normalizedKey === "frame-options"
    ) {
      return;
    }

    if (normalizedKey === "location") {
      return;
    }

    if (
      normalizedKey === "content-length" ||
      normalizedKey === "content-encoding" ||
      normalizedKey === "transfer-encoding"
    ) {
      return;
    }

    headers.set(key, value);
  });

  headers.set("Cache-Control", "no-store");

  if (options.location) {
    headers.set("Location", options.location);
  }

  return headers;
}

function isSkippableUrl(value: string) {
  return /^(#|javascript:|data:|mailto:|tel:|about:blank)/i.test(value.trim());
}

function rewriteUrlValue(taskId: string, baseUrl: string, rawValue: string) {
  const value = rawValue.trim();

  if (!value || isSkippableUrl(value)) {
    return rawValue;
  }

  try {
    return buildProxyUrl(taskId, new URL(value, baseUrl).toString());
  } catch {
    return rawValue;
  }
}

function rewriteSrcsetValue(taskId: string, baseUrl: string, rawValue: string) {
  return rawValue
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const parts = segment.split(/\s+/);
      const [url, ...descriptors] = parts;

      return [rewriteUrlValue(taskId, baseUrl, url), ...descriptors].join(" ");
    })
    .join(", ");
}

function rewriteCssForProxy(css: string, taskId: string, baseUrl: string) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote: string, url: string) => {
      if (!url || isSkippableUrl(url)) {
        return match;
      }

      return `url(${quote}${rewriteUrlValue(taskId, baseUrl, url)}${quote})`;
    })
    .replace(/@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?/gi, (match, quote: string, url: string) => {
      if (!url || isSkippableUrl(url)) {
        return match;
      }

      return `@import ${quote}${rewriteUrlValue(taskId, baseUrl, url)}${quote}`;
    });
}

function isJavaScriptResponse(contentType: string, targetUrl: string) {
  if (/javascript|ecmascript|module/i.test(contentType)) {
    return true;
  }

  try {
    return /\.m?js$/i.test(new URL(targetUrl).pathname);
  } catch {
    return false;
  }
}

function rewriteJavaScriptForProxy(script: string, taskId: string, baseUrl: string) {
  const rewriteSpecifier = (value: string) => rewriteUrlValue(taskId, baseUrl, value);

  return script
    .replace(/(\bfrom\s*)(['"])([^'"]+)\2/g, (match, prefix: string, quote: string, specifier: string) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === specifier ? match : `${prefix}${quote}${rewritten}${quote}`;
    })
    .replace(/(\bimport\s*)(?!\()(['"])([^'"]+)\2/g, (match, prefix: string, quote: string, specifier: string) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === specifier ? match : `${prefix}${quote}${rewritten}${quote}`;
    })
    .replace(/(\bimport\s*\(\s*)(['"])([^'"]+)\2(\s*\))/g, (
      match,
      prefix: string,
      quote: string,
      specifier: string,
      suffix: string
    ) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === specifier ? match : `${prefix}${quote}${rewritten}${quote}${suffix}`;
    })
    .replace(/(\bnew\s+URL\s*\(\s*)(['"])([^'"]+)\2(\s*,\s*import\.meta\.url\s*\))/g, (
      match,
      prefix: string,
      quote: string,
      specifier: string,
      suffix: string
    ) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === specifier ? match : `${prefix}${quote}${rewritten}${quote}${suffix}`;
    });
}

function buildInjectedRuntimeScript(taskId: string, targetUrl: string) {
  const proxyBase = `/api/tasks/${taskId}/verification/web`;
  const sessionBase = `/api/tasks/${taskId}/verification/session`;

  return `
<script>
(() => {
  const proxyBase = ${JSON.stringify(proxyBase)};
  const sessionBase = ${JSON.stringify(sessionBase)};
  let targetBase = ${JSON.stringify(targetUrl)};
  const originalFetch = window.fetch.bind(window);
  const skip = (value) => !value || /^(#|javascript:|data:|mailto:|tel:|about:blank)/i.test(String(value).trim());
  const reportCurrentUrl = (value) => {
    if (skip(value)) return;
    try {
      targetBase = new URL(String(value), targetBase).toString();
      originalFetch(sessionBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUrl: targetBase }),
        keepalive: true
      }).catch(() => {});
    } catch {}
  };
  const syncFromLocation = () => {
    try {
      const current = new URL(window.location.href);
      const nextTarget = current.searchParams.get("target");
      if (nextTarget && /^https?:\\/\\//i.test(nextTarget)) {
        const nextUrl = new URL(nextTarget);
        nextUrl.hash = current.hash;
        reportCurrentUrl(nextUrl.toString());
        return;
      }
      const nextUrl = new URL(targetBase);
      nextUrl.hash = current.hash;
      reportCurrentUrl(nextUrl.toString());
    } catch {}
  };
  const toProxy = (value) => {
    if (skip(value)) return value;
    try {
      return proxyBase + "?target=" + encodeURIComponent(new URL(String(value), targetBase).toString());
    } catch {
      return value;
    }
  };
  const rewriteSrcset = (value) => String(value)
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const parts = segment.split(/\\s+/);
      const [url, ...descriptors] = parts;
      return [toProxy(url), ...descriptors].join(" ");
    })
    .join(", ");
  const rewriteNode = (node) => {
    if (!(node instanceof Element)) return;
    const attrs = ["href", "src", "action", "poster"];
    attrs.forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      const current = node.getAttribute(attr);
      if (!current || current.startsWith(proxyBase) || skip(current)) return;
      node.setAttribute(attr, toProxy(current));
    });
    if (node.hasAttribute("srcset")) {
      const current = node.getAttribute("srcset");
      if (current) node.setAttribute("srcset", rewriteSrcset(current));
    }
    if (node.tagName === "FORM" && !node.getAttribute("action")) {
      node.setAttribute("action", toProxy(targetBase));
    }
    node.querySelectorAll?.("[href],[src],[action],[poster],[srcset]").forEach((child) => rewriteNode(child));
  };
  rewriteNode(document.documentElement);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        rewriteNode(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => rewriteNode(node));
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "src", "action", "poster", "srcset"]
  });
  reportCurrentUrl(targetBase);
  window.fetch = (input, init) => {
    try {
      if (typeof input === "string") {
        return originalFetch(toProxy(input), init);
      }
      if (input instanceof URL) {
        return originalFetch(toProxy(input.toString()), init);
      }
      if (input instanceof Request) {
        return originalFetch(new Request(toProxy(input.url), input), init);
      }
    } catch {}
    return originalFetch(input, init);
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return originalOpen.call(this, method, toProxy(String(url)), ...rest);
  };
  const originalPushState = history.pushState.bind(history);
  history.pushState = function(state, title, url) {
    if (url) {
      targetBase = new URL(String(url), targetBase).toString();
      reportCurrentUrl(targetBase);
      return originalPushState(state, title, toProxy(targetBase));
    }
    reportCurrentUrl(targetBase);
    return originalPushState(state, title, url);
  };
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function(state, title, url) {
    if (url) {
      targetBase = new URL(String(url), targetBase).toString();
      reportCurrentUrl(targetBase);
      return originalReplaceState(state, title, toProxy(targetBase));
    }
    reportCurrentUrl(targetBase);
    return originalReplaceState(state, title, url);
  };
  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    const currentAction = this.getAttribute("action") || targetBase;
    this.setAttribute("action", toProxy(currentAction));
    return originalSubmit.call(this);
  };
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (anchor instanceof HTMLAnchorElement) {
      const href = anchor.getAttribute("href");
      if (href && !href.startsWith(proxyBase) && !skip(href)) {
        anchor.href = toProxy(href);
      }
    }
  }, true);
  window.addEventListener("popstate", syncFromLocation);
  window.addEventListener("hashchange", syncFromLocation);
})();
</script>`;
}

function rewriteHtmlForProxy(html: string, taskId: string, targetUrl: string) {
  let rewritten = html
    .replace(/<base[\s\S]*?>/gi, "")
    .replace(/\b(href|src|action|poster)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, attribute: string, wholeValue: string, doubleQuoted: string, singleQuoted: string, unquoted: string) => {
      const originalValue = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      const rewrittenValue = rewriteUrlValue(taskId, targetUrl, originalValue);

      if (originalValue === rewrittenValue) {
        return match;
      }

      const quote = wholeValue.startsWith("'") ? "'" : '"';
      return `${attribute}=${quote}${rewrittenValue}${quote}`;
    })
    .replace(/\bsrcset=("([^"]*)"|'([^']*)')/gi, (match, wholeValue: string, doubleQuoted: string, singleQuoted: string) => {
      const originalValue = doubleQuoted ?? singleQuoted ?? "";
      const rewrittenValue = rewriteSrcsetValue(taskId, targetUrl, originalValue);
      const quote = wholeValue.startsWith("'") ? "'" : '"';
      return `srcset=${quote}${rewrittenValue}${quote}`;
    });

  const injectedScript = buildInjectedRuntimeScript(taskId, targetUrl);

  if (/<head[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/<head[^>]*>/i, (matched) => `${matched}${injectedScript}`);
  } else {
    rewritten = `${injectedScript}${rewritten}`;
  }

  return rewritten;
}

async function persistProxyStorageState(taskId: string, cookies: VerificationProxyCookie[]) {
  const runtimeDirectory = await getTaskRuntimeDirectory(taskId);
  const storageStatePath = path.join(runtimeDirectory, "storage-state.json");
  const storageState = {
    cookies: cookies
      .filter((cookie) => !isExpiredCookie(cookie))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      })),
    origins: []
  };

  await fs.writeFile(storageStatePath, `${JSON.stringify(storageState, null, 2)}\n`, "utf8");
}

function buildForwardHeaders(
  browserRequest: Request,
  targetUrl: string,
  session: VerificationProxySession
) {
  const target = new URL(targetUrl);
  const headers = new Headers();
  const blockedHeaders = new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user"
  ]);

  browserRequest.headers.forEach((value, key) => {
    if (blockedHeaders.has(key.toLowerCase())) {
      return;
    }

    headers.set(key, value);
  });

  Object.entries(session.requestHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  headers.set("Accept-Encoding", "identity");
  headers.set("Origin", target.origin);
  headers.set("Referer", session.currentUrl || targetUrl);

  const cookieHeader = buildCookieHeader(session.cookies, targetUrl);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return headers;
}

function isHtmlResponse(contentType: string) {
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

function isCssResponse(contentType: string) {
  return /text\/css/i.test(contentType);
}

function shouldAdvanceCurrentUrl(request: Request, contentType: string) {
  if (request.method.toUpperCase() !== "GET") {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest")?.toLowerCase();

  if (destination === "document" || destination === "iframe") {
    return true;
  }

  return isHtmlResponse(contentType);
}

export async function startEmbeddedVerificationSession(
  source: DataSource,
  task: Pick<CrawlTask, "id" | "currentUrl" | "artifacts">
) {
  const existing = verificationProxySessions.get(task.id);
  const currentUrl = task.currentUrl || source.entryUrl || source.sourceUrl;

  if (existing) {
    existing.currentUrl = currentUrl || existing.currentUrl;
    existing.requestHeaders = buildRequestHeaders(source);
    existing.updatedAt = nowIso();
    return buildWorkspace(existing);
  }

  const session: VerificationProxySession = {
    taskId: task.id,
    currentUrl,
    updatedAt: nowIso(),
    cookies: await readStoredCookies(task),
    requestHeaders: buildRequestHeaders(source)
  };

  verificationProxySessions.set(task.id, session);
  await persistProxyStorageState(task.id, session.cookies);
  return buildWorkspace(session);
}

export async function closeEmbeddedVerificationSession(taskId: string) {
  verificationProxySessions.delete(taskId);
}

export async function getEmbeddedVerificationWorkspace(taskId: string) {
  const session = verificationProxySessions.get(taskId);

  if (!session) {
    return null;
  }

  session.updatedAt = nowIso();
  return buildWorkspace(session);
}

export function updateEmbeddedVerificationCurrentUrl(taskId: string, rawTargetUrl: string) {
  const session = verificationProxySessions.get(taskId);
  const currentUrl = clampUrlInput(rawTargetUrl);

  if (!session || !currentUrl) {
    return null;
  }

  session.currentUrl = currentUrl;
  session.updatedAt = nowIso();
  return buildWorkspace(session);
}

export async function exportEmbeddedVerificationSession(taskId: string): Promise<ExportedVerificationSession> {
  const session = verificationProxySessions.get(taskId);

  if (!session) {
    throw new Error("嵌入式验证会话不存在，请先启动验证工作台。");
  }

  await persistProxyStorageState(taskId, session.cookies);

  return {
    currentUrl: session.currentUrl,
    cookieHeader: buildCookieHeader(session.cookies, session.currentUrl),
    storageState: JSON.stringify({
      cookies: session.cookies
        .filter((cookie) => !isExpiredCookie(cookie))
        .map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || "/",
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        })),
      origins: []
    })
  };
}

export async function handleEmbeddedVerificationProxyRequest(taskId: string, request: Request) {
  const session = verificationProxySessions.get(taskId);

  if (!session) {
    return new Response("验证会话不存在，请先启动内嵌验证。", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const targetUrl = resolveTargetUrl(session, requestUrl.searchParams.get("target"));
  const method = request.method.toUpperCase();
  const headers = buildForwardHeaders(request, targetUrl, session);
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstreamResponse = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store"
  });
  const setCookieHeaders =
    typeof (upstreamResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (upstreamResponse.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [];

  if (setCookieHeaders.length > 0) {
    session.cookies = upsertCookies(
      session.cookies,
      setCookieHeaders
        .map((line) => parseSetCookieHeader(line, targetUrl))
        .filter((item): item is VerificationProxyCookie => Boolean(item))
    );
    await persistProxyStorageState(taskId, session.cookies);
  }

  const location = upstreamResponse.headers.get("location");
  const contentType = upstreamResponse.headers.get("content-type") || "";

  if (location) {
    const resolvedLocation = new URL(location, targetUrl).toString();

    if (shouldAdvanceCurrentUrl(request, contentType) || upstreamResponse.status >= 300) {
      session.currentUrl = resolvedLocation;
      session.updatedAt = nowIso();
    }

    return new Response(null, {
      status: upstreamResponse.status,
      headers: copyResponseHeaders(upstreamResponse.headers, {
        rewritten: true,
        location: buildProxyUrl(taskId, resolvedLocation)
      })
    });
  }

  if (shouldAdvanceCurrentUrl(request, contentType)) {
    session.currentUrl = targetUrl;
    session.updatedAt = nowIso();
  }

  if (isHtmlResponse(contentType)) {
    const html = await upstreamResponse.text();
    const rewrittenHtml = rewriteHtmlForProxy(html, taskId, targetUrl);
    const headersForHtml = copyResponseHeaders(upstreamResponse.headers, { rewritten: true });
    headersForHtml.set("Content-Type", "text/html; charset=utf-8");

    return new Response(rewrittenHtml, {
      status: upstreamResponse.status,
      headers: headersForHtml
    });
  }

  if (isCssResponse(contentType)) {
    const css = await upstreamResponse.text();
    const rewrittenCss = rewriteCssForProxy(css, taskId, targetUrl);
    const headersForCss = copyResponseHeaders(upstreamResponse.headers, { rewritten: true });
    headersForCss.set("Content-Type", "text/css; charset=utf-8");

    return new Response(rewrittenCss, {
      status: upstreamResponse.status,
      headers: headersForCss
    });
  }

  if (isJavaScriptResponse(contentType, targetUrl)) {
    const script = await upstreamResponse.text();
    const rewrittenScript = rewriteJavaScriptForProxy(script, taskId, targetUrl);
    const headersForScript = copyResponseHeaders(upstreamResponse.headers, { rewritten: true });
    headersForScript.set("Content-Type", "text/javascript; charset=utf-8");

    return new Response(rewrittenScript, {
      status: upstreamResponse.status,
      headers: headersForScript
    });
  }

  const binary = await upstreamResponse.arrayBuffer();

  return new Response(binary, {
    status: upstreamResponse.status,
    headers: copyResponseHeaders(upstreamResponse.headers, { rewritten: false })
  });
}
