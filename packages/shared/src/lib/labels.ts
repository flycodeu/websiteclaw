import {
  ChangeType,
  CrawlMode,
  ProductCategory,
  ProductStatus,
  ReviewStatus,
  ShopStatus,
  StockStatus,
  TaskStatus,
  VerificationMethod
} from "./types";

export const shopStatusLabels: Record<ShopStatus, string> = {
  OPEN: "正常",
  RISK: "异常",
  CLOSED: "关闭"
};

export const stockStatusLabels: Record<StockStatus, string> = {
  IN_STOCK: "有货",
  LOW_STOCK: "库存紧张",
  OUT_OF_STOCK: "无货"
};

export const productStatusLabels: Record<ProductStatus, string> = {
  ON_SALE: "在售",
  LOW_STOCK: "低库存",
  OFFLINE: "未上架"
};

export const crawlModeLabels: Record<CrawlMode, string> = {
  AUTO: "自动抓取",
  MANUAL_ASSIST: "人工辅助"
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  PENDING: "待开始",
  CRAWLING: "抓取中",
  WAITING_HUMAN: "待补充验证",
  AI_PARSING: "结构化处理中",
  REVIEWING: "待校对",
  PUBLISHED: "已发布",
  FAILED: "失败"
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  REVIEWING: "待校对",
  READY_TO_PUBLISH: "可发布",
  PUBLISHED: "已发布"
};

export const verificationMethodLabels: Record<VerificationMethod, string> = {
  NONE: "无需验证",
  CAPTCHA: "验证码",
  LOGIN: "登录态",
  MANUAL: "人工确认"
};

export const changeTypeLabels: Record<ChangeType, string> = {
  PRODUCT_REMOVED: "商品移除",
  PRODUCT_ADDED: "商品新增",
  PRICE_INCREASED: "价格上涨",
  PRICE_DECREASED: "价格下降",
  STOCK_CHANGED: "库存变化",
  WARRANTY_CHANGED: "质保变化",
  SHOP_STATUS_CHANGED: "站点状态变化"
};

export const productCategoryLabels: Record<ProductCategory, string> = {
  CHATGPT: "ChatGPT",
  CLAUDE: "Claude",
  GEMINI: "Gemini",
  PERPLEXITY: "Perplexity",
  GROK: "Grok",
  GOOGLE_ACCOUNT: "Google账号",
  VIRTUAL_CARD: "虚拟卡",
  APPLE_ACCOUNT: "苹果账号",
  OTHER: "其他"
};

export function formatBooleanLabel(value: boolean) {
  return value ? "启用" : "停用";
}

export function formatWarrantyLabel(value: boolean | null) {
  if (value === true) {
    return "支持质保";
  }

  if (value === false) {
    return "不支持质保";
  }

  return "待确认";
}

export function formatDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDateOnlyLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function maskSecret(secret: string) {
  if (!secret) {
    return "未设置";
  }

  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }

  return `${secret.slice(0, 4)}${"*".repeat(Math.max(secret.length - 8, 4))}${secret.slice(-4)}`;
}
