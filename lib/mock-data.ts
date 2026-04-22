import {
  CompareGroup,
  CrawlTask,
  DataSource,
  OverviewMetric,
  RankingEntry,
  ReviewRecord,
  ShopDiff,
  ShopSnapshot,
  ShopSummary
} from "@/lib/types";

export const shops: ShopSummary[] = [
  {
    shopId: "shop_001",
    name: "Claude Hub CN",
    url: "https://example.com/claude-hub",
    status: "OPEN",
    lastCrawledAt: "2026-04-22T10:00:00Z",
    stabilityScore: 91,
    productCount: 12,
    lowestPrice: 178,
    averagePrice: 242,
    tags: ["高频更新", "人工复核"],
    healthNote: "连续 18 天稳定上架，核心品类库存健康。"
  },
  {
    shopId: "shop_002",
    name: "Gemini Vault",
    url: "https://example.com/gemini-vault",
    status: "RISK",
    lastCrawledAt: "2026-04-22T09:40:00Z",
    stabilityScore: 73,
    productCount: 8,
    lowestPrice: 156,
    averagePrice: 214,
    tags: ["需登录", "价格波动"],
    healthNote: "近 7 天出现 2 次价格跳变，建议持续观察。"
  },
  {
    shopId: "shop_003",
    name: "Prompt Supply",
    url: "https://example.com/prompt-supply",
    status: "OPEN",
    lastCrawledAt: "2026-04-22T08:50:00Z",
    stabilityScore: 84,
    productCount: 10,
    lowestPrice: 132,
    averagePrice: 198,
    tags: ["低价位", "更新快"],
    healthNote: "价格优势明显，但个别账号类商品库存偏低。"
  },
  {
    shopId: "shop_004",
    name: "Account Delta",
    url: "https://example.com/account-delta",
    status: "CLOSED",
    lastCrawledAt: "2026-04-21T22:10:00Z",
    stabilityScore: 48,
    productCount: 0,
    lowestPrice: 0,
    averagePrice: 0,
    tags: ["抓取失败", "站点异常"],
    healthNote: "连续 2 次抓取失败，站点当前不可用。"
  }
];

export const snapshots: ShopSnapshot[] = [
  {
    shopId: "shop_001",
    snapshotDate: "2026-04-22",
    summary: "Claude / GPT 核心订阅稳定，价格相较昨日略降。",
    products: [
      {
        rawName: "Claude Pro 30 天",
        normalizedType: "CLAUDE_PRO",
        price: 178,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        status: "ON_SALE",
        confidence: 0.97,
        updatedAt: "2026-04-22T10:00:00Z"
      },
      {
        rawName: "GPT Plus 30 天",
        normalizedType: "GPT_PLUS",
        price: 145,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        status: "ON_SALE",
        confidence: 0.95,
        updatedAt: "2026-04-22T10:00:00Z"
      },
      {
        rawName: "Claude Max 20x",
        normalizedType: "CLAUDE_MAX_20X",
        price: 298,
        currency: "CNY",
        stockStatus: "LOW_STOCK",
        status: "LOW_STOCK",
        confidence: 0.88,
        updatedAt: "2026-04-22T10:00:00Z"
      }
    ]
  },
  {
    shopId: "shop_002",
    snapshotDate: "2026-04-22",
    summary: "Gemini 系列库存恢复，但 GPT Pro 涨价明显。",
    products: [
      {
        rawName: "Gemini Advanced 30 天",
        normalizedType: "GEMINI_ADVANCED",
        price: 156,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        status: "ON_SALE",
        confidence: 0.92,
        updatedAt: "2026-04-22T09:40:00Z"
      },
      {
        rawName: "GPT Pro 30 天",
        normalizedType: "GPT_PRO",
        price: 289,
        currency: "CNY",
        stockStatus: "LOW_STOCK",
        status: "LOW_STOCK",
        confidence: 0.9,
        updatedAt: "2026-04-22T09:40:00Z"
      }
    ]
  },
  {
    shopId: "shop_003",
    snapshotDate: "2026-04-22",
    summary: "价格竞争力最强，账号类商品库存变化较多。",
    products: [
      {
        rawName: "Claude Pro 30 天",
        normalizedType: "CLAUDE_PRO",
        price: 169,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        status: "ON_SALE",
        confidence: 0.94,
        updatedAt: "2026-04-22T08:50:00Z"
      },
      {
        rawName: "GPT Plus 30 天",
        normalizedType: "GPT_PLUS",
        price: 132,
        currency: "CNY",
        stockStatus: "LOW_STOCK",
        status: "LOW_STOCK",
        confidence: 0.93,
        updatedAt: "2026-04-22T08:50:00Z"
      },
      {
        rawName: "Perplexity Pro 30 天",
        normalizedType: "PERPLEXITY_PRO",
        price: 99,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        status: "ON_SALE",
        confidence: 0.84,
        updatedAt: "2026-04-22T08:50:00Z"
      }
    ]
  }
];

export const diffs: ShopDiff[] = [
  {
    shopId: "shop_001",
    snapshotDate: "2026-04-22",
    summary: "Claude Pro 下降 7 元，整体供给稳定。",
    changes: [
      {
        type: "PRICE_DECREASED",
        productType: "CLAUDE_PRO",
        oldPrice: 185,
        newPrice: 178,
        note: "日常主力商品价格回落。"
      },
      {
        type: "STOCK_CHANGED",
        productType: "CLAUDE_MAX_20X",
        note: "库存从充足切换为低库存。"
      }
    ]
  },
  {
    shopId: "shop_002",
    snapshotDate: "2026-04-22",
    summary: "GPT Pro 涨价，Gemini 系列恢复正常上架。",
    changes: [
      {
        type: "PRICE_INCREASED",
        productType: "GPT_PRO",
        oldPrice: 268,
        newPrice: 289,
        note: "价格波动较大。"
      },
      {
        type: "PRODUCT_ADDED",
        productType: "GEMINI_ADVANCED",
        note: "昨日缺货，今日重新上架。"
      }
    ]
  },
  {
    shopId: "shop_004",
    snapshotDate: "2026-04-22",
    summary: "站点无有效内容输出，需人工排查。",
    changes: [
      {
        type: "SHOP_STATUS_CHANGED",
        note: "抓取服务连续超时，状态调整为 CLOSED。"
      }
    ]
  }
];

export const priceRankings: RankingEntry[] = [
  {
    rank: 1,
    shopId: "shop_003",
    shopName: "Prompt Supply",
    metricLabel: "最低有效报价",
    value: 99,
    description: "Perplexity Pro 报价最低。"
  },
  {
    rank: 2,
    shopId: "shop_002",
    shopName: "Gemini Vault",
    metricLabel: "最低有效报价",
    value: 156,
    description: "Gemini Advanced 恢复上架。"
  },
  {
    rank: 3,
    shopId: "shop_001",
    shopName: "Claude Hub CN",
    metricLabel: "最低有效报价",
    value: 178,
    description: "主力商品稳定供给。"
  }
];

export const stabilityRankings: RankingEntry[] = [
  {
    rank: 1,
    shopId: "shop_001",
    shopName: "Claude Hub CN",
    metricLabel: "稳定度分数",
    value: 91,
    description: "连续上架率和抓取成功率表现最好。"
  },
  {
    rank: 2,
    shopId: "shop_003",
    shopName: "Prompt Supply",
    metricLabel: "稳定度分数",
    value: 84,
    description: "库存波动存在，但价格面稳定。"
  },
  {
    rank: 3,
    shopId: "shop_002",
    shopName: "Gemini Vault",
    metricLabel: "稳定度分数",
    value: 73,
    description: "存在登录和价格跳变风险。"
  }
];

export const compareGroups: CompareGroup[] = [
  {
    normalizedType: "CLAUDE_PRO",
    trend: "价格整体回落，Prompt Supply 报价最低。",
    offers: [
      {
        shopId: "shop_003",
        shopName: "Prompt Supply",
        price: 169,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        stabilityScore: 84
      },
      {
        shopId: "shop_001",
        shopName: "Claude Hub CN",
        price: 178,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        stabilityScore: 91
      }
    ]
  },
  {
    normalizedType: "GPT_PLUS",
    trend: "低价集中在更新频率高的商铺，但库存偏紧。",
    offers: [
      {
        shopId: "shop_003",
        shopName: "Prompt Supply",
        price: 132,
        currency: "CNY",
        stockStatus: "LOW_STOCK",
        stabilityScore: 84
      },
      {
        shopId: "shop_001",
        shopName: "Claude Hub CN",
        price: 145,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        stabilityScore: 91
      }
    ]
  },
  {
    normalizedType: "GEMINI_ADVANCED",
    trend: "可比报价较少，供应侧尚未完全恢复。",
    offers: [
      {
        shopId: "shop_002",
        shopName: "Gemini Vault",
        price: 156,
        currency: "CNY",
        stockStatus: "IN_STOCK",
        stabilityScore: 73
      }
    ]
  }
];

export const sources: DataSource[] = [
  {
    sourceId: "src_001",
    sourceName: "Claude Hub CN",
    sourceUrl: "https://example.com/claude-hub",
    crawlMode: "AUTO",
    enabled: true,
    remark: "标准订阅页，结构稳定。",
    lastRunAt: "2026-04-22T10:00:00Z"
  },
  {
    sourceId: "src_002",
    sourceName: "Gemini Vault",
    sourceUrl: "https://example.com/gemini-vault",
    crawlMode: "MANUAL_ASSIST",
    enabled: true,
    remark: "首次访问需要登录验证。",
    lastRunAt: "2026-04-22T09:40:00Z"
  },
  {
    sourceId: "src_003",
    sourceName: "Account Delta",
    sourceUrl: "https://example.com/account-delta",
    crawlMode: "AUTO",
    enabled: false,
    remark: "连续超时，临时停用。",
    lastRunAt: "2026-04-21T22:10:00Z"
  }
];

export const tasks: CrawlTask[] = [
  {
    id: "task_101",
    sourceId: "src_001",
    sourceName: "Claude Hub CN",
    status: "PUBLISHED",
    startedAt: "2026-04-22T09:52:00Z",
    updatedAt: "2026-04-22T10:07:00Z",
    logSummary: "Playwright 采集完成，AI 结构化通过，人工审核发布。",
    nextAction: "等待下一次定时抓取"
  },
  {
    id: "task_102",
    sourceId: "src_002",
    sourceName: "Gemini Vault",
    status: "WAITING_HUMAN",
    startedAt: "2026-04-22T09:32:00Z",
    updatedAt: "2026-04-22T09:43:00Z",
    logSummary: "站点返回登录验证页，已保留浏览器会话。",
    nextAction: "管理员完成验证码后继续抓取"
  },
  {
    id: "task_103",
    sourceId: "src_003",
    sourceName: "Account Delta",
    status: "FAILED",
    startedAt: "2026-04-22T08:51:00Z",
    updatedAt: "2026-04-22T08:57:00Z",
    logSummary: "页面脚本长时间阻塞，未提取到有效 DOM。",
    nextAction: "检查超时阈值和目标站点变更"
  },
  {
    id: "task_104",
    sourceId: "src_001",
    sourceName: "Claude Hub CN",
    status: "REVIEWING",
    startedAt: "2026-04-22T11:10:00Z",
    updatedAt: "2026-04-22T11:16:00Z",
    logSummary: "AI 输出已入审，等待人工确认价格异常。",
    nextAction: "进入审核页修正字段后发布"
  }
];

export const reviews: ReviewRecord[] = [
  {
    id: "review_001",
    sourceName: "Claude Hub CN",
    status: "REVIEWING",
    snapshotDate: "2026-04-22",
    extractedSummary: "AI 识别到 3 个主要商品，推断 Claude Max 20x 库存偏低。",
    rawFragments: [
      "claude pro 30 days - 178 cny",
      "gpt plus monthly - 145 cny in stock",
      "claude max 20x - 298 cny only 2 left"
    ],
    products: snapshots[0].products,
    previousDiff: diffs[0].changes
  }
];

export const overviewMetrics: OverviewMetric[] = [
  {
    label: "已监控商铺",
    value: "04",
    detail: "3 个正常输出，1 个需排障"
  },
  {
    label: "今日有效商品",
    value: "25",
    detail: "AI 结构化完成并通过 Schema 校验"
  },
  {
    label: "待处理任务",
    value: "02",
    detail: "1 个人工验证，1 个待审核"
  },
  {
    label: "发布成功率",
    value: "96%",
    detail: "近 7 天共 27 次发布"
  }
];

export function getShopDetail(shopId: string) {
  const shop = shops.find((item) => item.shopId === shopId);
  const snapshot = snapshots.find((item) => item.shopId === shopId);
  const diff = diffs.find((item) => item.shopId === shopId);

  if (!shop || !snapshot) {
    return null;
  }

  return {
    shop,
    snapshot,
    diff
  };
}

export function getReview(id: string) {
  return reviews.find((item) => item.id === id) ?? null;
}
