import { formatDateLabel } from "@shop-claw/shared/labels";
import { getPlatformState } from "@shop-claw/shared/store";
import { readAiSettingsFromEnv } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const state = await getPlatformState();
  const aiSettings = readAiSettingsFromEnv();
  const aiUsageTasks = state.tasks.filter((task) => task.aiUsage);
  const latestAiUsageTasks = [...aiUsageTasks]
    .sort((left, right) => {
      const leftTime = Date.parse(left.aiUsage?.updatedAt ?? left.updatedAt);
      const rightTime = Date.parse(right.aiUsage?.updatedAt ?? right.updatedAt);
      return rightTime - leftTime;
    })
    .slice(0, 8);
  const totalPromptTokens = aiUsageTasks.reduce((sum, task) => sum + (task.aiUsage?.promptTokens ?? 0), 0);
  const totalCompletionTokens = aiUsageTasks.reduce((sum, task) => sum + (task.aiUsage?.completionTokens ?? 0), 0);
  const totalAiTokens = aiUsageTasks.reduce((sum, task) => sum + (task.aiUsage?.totalTokens ?? 0), 0);
  const totalAiCalls = aiUsageTasks.reduce((sum, task) => sum + (task.aiUsage?.callCount ?? 0), 0);
  const totalAiCost = aiUsageTasks.reduce((sum, task) => sum + (task.aiUsage?.estimatedCost ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="当前模型" value={aiSettings.model} detail="用于抓取整理与结构化识别" />
        <MetricCard label="累计费用" value={formatMoney(totalAiCost, aiSettings.currency)} detail="全任务累计估算费用" />
        <MetricCard label="累计 Tokens" value={formatTokenCount(totalAiTokens)} detail="输入与输出总和" />
        <MetricCard label="调用次数" value={`${totalAiCalls}`} detail="累计 AI 请求次数" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[32px] border border-[#d8cfbf] bg-[linear-gradient(160deg,#faf4ea_0%,#eef4e8_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/78 px-4 py-2 text-sm text-[#566271]">
            AI 计费
          </div>
          <h2 className="mt-4 font-serif text-3xl text-[#18222c]">{aiSettings.model}</h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PricingCard label="输入未命中" value={formatRate(aiSettings.inputPricePerMillion, aiSettings.currency)} />
            <PricingCard label="输入缓存命中" value={formatRate(aiSettings.cacheHitInputPricePerMillion, aiSettings.currency)} />
            <PricingCard label="输出" value={formatRate(aiSettings.outputPricePerMillion, aiSettings.currency)} />
            <PricingCard label="累计费用" value={formatMoney(totalAiCost, aiSettings.currency)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PricingCard label="输入 Tokens" value={formatTokenCount(totalPromptTokens)} compact />
            <PricingCard label="输出 Tokens" value={formatTokenCount(totalCompletionTokens)} compact />
            <PricingCard label="调用次数" value={`${totalAiCalls}`} compact />
          </div>
        </div>

        <div className="rounded-[32px] border border-[#d8cfbf] bg-[#f8f3ea] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">Token 用量</div>
            <h2 className="font-serif text-3xl text-[#18222c]">最近 AI 调用</h2>
          </div>

          <div className="mt-5 grid gap-4">
            {latestAiUsageTasks.length > 0 ? (
              latestAiUsageTasks.map((task) => (
                <article key={`${task.id}-${task.aiUsage?.updatedAt}`} className="rounded-[22px] border border-[#ded4c4] bg-white/92 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#18222c]">{task.sourceName}</h3>
                      <div className="mt-2 text-sm text-slate-500">{task.aiUsage?.model}</div>
                    </div>
                    <div className="rounded-full border border-[#ded4c4] bg-[#faf7f1] px-3 py-1 text-xs text-slate-600">
                      {formatDateLabel(task.aiUsage?.updatedAt ?? task.updatedAt)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MiniUsageCard label="总 Tokens" value={formatTokenCount(task.aiUsage?.totalTokens ?? 0)} />
                    <MiniUsageCard label="缓存命中" value={formatTokenCount(task.aiUsage?.promptCacheHitTokens ?? 0)} />
                    <MiniUsageCard
                      label="费用"
                      value={formatMoney(task.aiUsage?.estimatedCost ?? 0, task.aiUsage?.currency ?? aiSettings.currency)}
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#ded4c4] bg-white/92 px-4 py-10 text-center text-slate-500">
                还没有 AI token 计费记录。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf4ea_0%,#ffffff_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#566271]">{label}</div>
      <div className="mt-4 break-words text-3xl font-semibold text-[#18222c]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{detail}</div>
    </article>
  );
}

function PricingCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-[22px] border border-[#d8cfbf] bg-white/88 p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#566271]">{label}</div>
      <div className={`mt-2 font-semibold text-[#18222c] ${compact ? "text-xl" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function MiniUsageCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#e5dccd] bg-[#faf7f1] p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[#566271]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[#18222c]">{value}</div>
    </div>
  );
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatMoney(value: number, currency: string) {
  const formatted = value.toFixed(4);
  return currency.toUpperCase() === "CNY" ? `¥${formatted}` : `${currency.toUpperCase()} ${formatted}`;
}

function formatRate(value: number, currency: string) {
  const prefix = currency.toUpperCase() === "CNY" ? "¥" : `${currency.toUpperCase()} `;
  return `${prefix}${value} / 百万`;
}
