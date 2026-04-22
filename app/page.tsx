import Link from "next/link";
import { Activity, ArrowRight, GitBranch, Shield, Sparkles } from "lucide-react";
import { diffs, overviewMetrics, priceRankings, shops, stabilityRankings } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_0.9fr]">
        <div className="rounded-[36px] border border-white/70 bg-white p-8 shadow-panel">
          <div className="inline-flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm text-slate-600">
            <Sparkles className="h-4 w-4 text-signal" />
            Shop Monitoring MVP
          </div>
          <h1 className="mt-6 max-w-3xl font-serif text-5xl leading-tight text-ink">
            一个聚焦抓取审核闭环的商铺商品监控与分析平台。
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            当前版本已按需求文档建立用户端与管理端骨架，前端先消费标准化 JSON 结构，后续可直接接 FastAPI + Playwright
            采集服务。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/shops" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-white transition hover:bg-signal">
              查看商铺列表
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-slate-700">
              进入管理端
              <GitBranch className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-[36px] border border-ink/10 bg-ink p-8 text-white shadow-glow">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-300">Launch Scope</p>
          <div className="mt-6 space-y-4">
            {[
              "商铺列表与详情抽屉",
              "跨店商品比价面板",
              "稳定度排行榜与评分说明",
              "数据源 / 任务 / 审核管理页面",
              "对接文档定义的标准 API 结构"
            ].map((item) => (
              <div key={item} className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map((metric) => (
          <div key={metric.label} className="rounded-[28px] border border-white/80 bg-white p-6 shadow-panel">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">{metric.label}</div>
            <div className="mt-3 text-4xl font-semibold text-ink">{metric.value}</div>
            <div className="mt-2 text-sm text-slate-500">{metric.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Recent Changes</p>
              <h2 className="mt-2 font-serif text-3xl">最近变动</h2>
            </div>
            <Activity className="h-5 w-5 text-signal" />
          </div>

          <div className="mt-6 grid gap-4">
            {diffs.map((item) => {
              const shop = shops.find((shopEntry) => shopEntry.shopId === item.shopId);
              return (
                <div key={item.shopId} className="rounded-[24px] bg-shell p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{shop?.name ?? item.shopId}</h3>
                      <p className="mt-1 text-sm text-slate-500">{item.summary}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-2 text-xs text-slate-500">{item.snapshotDate}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.changes.map((change) => (
                      <span key={`${change.type}-${change.productType ?? change.note}`} className="rounded-full bg-white px-3 py-2 text-xs text-slate-600">
                        {change.type}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <RankingCard title="最低价榜" icon={<Shield className="h-5 w-5 text-signal" />} entries={priceRankings} suffix="元" />
          <RankingCard title="稳定度榜" icon={<Shield className="h-5 w-5 text-signal" />} entries={stabilityRankings} suffix="分" />
        </div>
      </section>
    </div>
  );
}

function RankingCard({
  title,
  icon,
  entries,
  suffix
}: {
  title: string;
  icon: React.ReactNode;
  entries: typeof priceRankings;
  suffix: string;
}) {
  return (
    <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">rankings</p>
          <h2 className="mt-2 font-serif text-2xl">{title}</h2>
        </div>
        {icon}
      </div>

      <div className="mt-5 space-y-4">
        {entries.map((entry) => (
          <div key={`${title}-${entry.rank}`} className="flex items-start gap-4 rounded-[22px] bg-shell p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-sm font-semibold text-white">
              {entry.rank}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{entry.shopName}</div>
                <div className="text-lg font-semibold text-signal">
                  {entry.value}
                  {suffix}
                </div>
              </div>
              <div className="mt-1 text-sm text-slate-500">{entry.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
