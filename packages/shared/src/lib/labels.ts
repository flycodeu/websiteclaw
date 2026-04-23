import {
  ChangeType,
  CrawlMode,
  ProductStatus,
  ReviewStatus,
  ShopStatus,
  StockStatus,
  TaskStatus,
  VerificationMethod
} from "./types";

export const shopStatusLabels: Record<ShopStatus, string> = {
  OPEN: "营业中",
  RISK: "存在风险",
  CLOSED: "已关闭"
};

export const stockStatusLabels: Record<StockStatus, string> = {
  IN_STOCK: "有货",
  LOW_STOCK: "库存紧张",
  OUT_OF_STOCK: "无货"
};

export const productStatusLabels: Record<ProductStatus, string> = {
  ON_SALE: "在售",
  LOW_STOCK: "低库存",
  OFFLINE: "已下架"
};

export const crawlModeLabels: Record<CrawlMode, string> = {
  AUTO: "自动抓取",
  MANUAL_ASSIST: "人工辅助"
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  PENDING: "待开始",
  CRAWLING: "抓取中",
  WAITING_HUMAN: "待人工验证",
  AI_PARSING: "AI 分析中",
  REVIEWING: "待审核",
  PUBLISHED: "已发布",
  FAILED: "失败"
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  REVIEWING: "待审核",
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
  PRODUCT_REMOVED: "商品下架",
  PRODUCT_ADDED: "新增商品",
  PRICE_INCREASED: "价格上涨",
  PRICE_DECREASED: "价格下降",
  STOCK_CHANGED: "库存变化",
  SHOP_STATUS_CHANGED: "店铺状态变化"
};

export function formatBooleanLabel(value: boolean) {
  return value ? "启用" : "停用";
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
