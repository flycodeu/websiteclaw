import { AiProvider, AiSettings } from "@shop-claw/shared/types";

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  return raw === "1" || raw.toLowerCase() === "true";
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readProviderEnv(baseUrl: string, model: string): AiProvider {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (raw === "deepseek" || raw === "deepseek-compatible") {
    return "deepseek-compatible";
  }

  if (raw === "openai" || raw === "openai-compatible") {
    return "openai-compatible";
  }

  if (baseUrl.toLowerCase().includes("deepseek.com") || model.toLowerCase().includes("deepseek")) {
    return "deepseek-compatible";
  }

  return "openai-compatible";
}

export function readAiSettingsFromEnv(): AiSettings {
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const enabled = readBooleanEnv("AI_ENABLED", true) && apiKey.length > 0;
  const baseUrl = process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL?.trim() || "gpt-4.1-mini";
  const provider = readProviderEnv(baseUrl, model);

  return {
    enabled,
    providerLabel: provider === "deepseek-compatible" ? "环境变量 / DeepSeek" : "环境变量 / OpenAI 兼容",
    provider,
    baseUrl,
    apiKey,
    model,
    temperature: readNumberEnv("AI_TEMPERATURE", 0.2),
    thinkingEnabled: readBooleanEnv("AI_THINKING_ENABLED", false),
    reasoningEffort: process.env.AI_REASONING_EFFORT?.trim() || undefined,
    systemPrompt:
      process.env.AI_SYSTEM_PROMPT?.trim() ||
      "你是商品结构化助手。你会收到商品售卖网页的完整可见文本和部分 HTML。请识别页面中所有明确在售的商品、套餐或订阅项，并输出 JSON。不要把纯数字、年份、库存词、栏目标题、标签、按钮文案、说明文本、导航文本当作商品。商品名必须是页面里的完整售卖项名称；如果信息不足以构成商品，就不要输出。商品字段需包含分类、规格、价格、库存文本和质保判断，无法确认的字段使用 null。",
    updatedAt: new Date().toISOString()
  };
}
