export const MANUAL_VERIFICATION_DEBUG_HOST = "127.0.0.1";
export const MANUAL_VERIFICATION_DEBUG_PORT = 9222;
export const MANUAL_VERIFICATION_CDP_URL = `http://${MANUAL_VERIFICATION_DEBUG_HOST}:${MANUAL_VERIFICATION_DEBUG_PORT}`;
export const MANUAL_VERIFICATION_CHROME_COMMAND =
  `chrome.exe --remote-debugging-port=${MANUAL_VERIFICATION_DEBUG_PORT} --user-data-dir="$env:TEMP\\shop-claw-chrome-debug"`;

const BLOCKED_BY_WAF_PATTERN =
  /(403 forbidden|sorry,\s*you have been blocked|denied by http_bot_simple|access denied|requestid\s*:|ruleid\s*:|performance\s*&\s*security by|verifycode|verifyresult|certifyid|验证失败|验证未通过|疑似攻击请求|人机验证失败|\bf001\b)/i;
const CAPTCHA_CHALLENGE_PATTERN =
  /(captcha|verify you are human|robot check|请完成验证|验证码|安全验证|滑动验证|真人验证|人机验证)/i;
const LOGIN_CHALLENGE_PATTERN = /(sign in|log in|login to continue|请先登录|登录后查看|账户验证)/i;
const STRONG_PAGE_CAPTCHA_PATTERN =
  /(verify you are human|robot check|请完成(?:安全)?验证|请完成人机验证|滑动验证|真人验证|验证你不是机器人|点击验证|拖动滑块|按住滑块)/i;
const CAPTCHA_PROVIDER_PATTERN =
  /(g-recaptcha|grecaptcha|hcaptcha|h-captcha|turnstile|cf-chl|challenge-platform|geetest|aliyuncaptcha|slider[-_\s]?captcha)/i;
const COMMERCE_EVIDENCE_PATTERN =
  /(¥\s*\d+|库存|已售|件商品|售罄|加入购物车|立即购买|商品分类|分类|下单|购买)/gi;

export function buildManualVerificationChromeSetupHint() {
  return `系统会自动尝试启动调试 Chrome；如果失败，请先关闭所有普通 Chrome 窗口，再用一个独立调试目录启动 Chrome：${MANUAL_VERIFICATION_CHROME_COMMAND}。如果系统无法直接识别 chrome.exe，请改成你本机 Chrome 的实际安装路径。`;
}

export function detectManualVerificationReason(input: string | null | undefined) {
  const marker = input ?? "";

  if (BLOCKED_BY_WAF_PATTERN.test(marker)) {
    return "站点返回 403 或风控拦截页面，请继续在当前 Chrome 中完成人工验证后再抓取。";
  }

  if (CAPTCHA_CHALLENGE_PATTERN.test(marker)) {
    return "页面触发了验证码或人机验证。";
  }

  if (LOGIN_CHALLENGE_PATTERN.test(marker)) {
    return "页面要求登录后才能查看完整内容。";
  }

  return undefined;
}

function normalizePageText(input: string | null | undefined) {
  return (input ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function countMatches(input: string, pattern: RegExp) {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

export function detectManualVerificationReasonFromPage(page: {
  title?: string | null;
  visibleText?: string | null;
  html?: string | null;
  finalUrl?: string | null;
}) {
  const title = normalizePageText(page.title);
  const visibleText = normalizePageText(page.visibleText);
  const htmlHead = (page.html ?? "").slice(0, 8_000);
  const leadingText = normalizePageText(`${title}\n${visibleText.slice(0, 1_200)}`);
  const verificationMarker = `${leadingText}\n${htmlHead}\n${page.finalUrl ?? ""}`;

  if (BLOCKED_BY_WAF_PATTERN.test(verificationMarker)) {
    return "站点返回 403 或风控拦截页面，请继续在当前 Chrome 中完成人工验证后再抓取。";
  }

  const commerceEvidenceCount = countMatches(leadingText, COMMERCE_EVIDENCE_PATTERN);

  if (CAPTCHA_PROVIDER_PATTERN.test(htmlHead) || STRONG_PAGE_CAPTCHA_PATTERN.test(leadingText)) {
    if (commerceEvidenceCount < 4 || CAPTCHA_PROVIDER_PATTERN.test(htmlHead)) {
      return "页面触发了验证码或人机验证。";
    }
  }

  if (LOGIN_CHALLENGE_PATTERN.test(leadingText) && commerceEvidenceCount < 3) {
    return "页面要求登录后才能查看完整内容。";
  }

  return undefined;
}
