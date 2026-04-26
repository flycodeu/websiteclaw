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

export function buildManualVerificationChromeSetupHint() {
  return `请先关闭所有普通 Chrome 窗口，再用一个独立调试目录启动 Chrome：${MANUAL_VERIFICATION_CHROME_COMMAND}。如果系统无法直接识别 chrome.exe，请改成你本机 Chrome 的实际安装路径；启动后返回这里点击“连接当前 Chrome”。`;
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
