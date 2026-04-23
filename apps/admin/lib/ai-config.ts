import { AiSettings } from "@shop-claw/shared/types";

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

export function readAiSettingsFromEnv(): AiSettings {
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const enabled = readBooleanEnv("AI_ENABLED", true) && apiKey.length > 0;

  return {
    enabled,
    providerLabel: "环境变量",
    baseUrl: process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
    apiKey,
    model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
    temperature: readNumberEnv("AI_TEMPERATURE", 0.2),
    systemPrompt:
      process.env.AI_SYSTEM_PROMPT?.trim() ||
      "你是电商数据结构化助手。请将抓取文本整理为 JSON，输出商铺摘要、风险提示和商品列表，价格统一为数字，无法确认的字段使用 null。",
    updatedAt: new Date().toISOString()
  };
}
