import Link from "next/link";
import { Activity, ArrowRight, Shield, TrendingDown } from "lucide-react";
import { diffs, overviewMetrics, priceRankings, shops, stabilityRankings } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="space-y-5">
      <section className="float-in rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,244,255,0.92))] p-4 shadow-[0_24px_70px_rgba(30,64,175,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[22px] border border-white/70 bg-white/88 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(27,99,255,0.1)]"
              >
                <div className="text-sm text-slate-500">{metric.label}</div>
                <div className="mt-2 text-[1.85rem] font-semibold leading-none text-ink">{metric.value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href="/shops"
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#1b63ff,#5ca8ff)] px-5 py-3 text-white shadow-[0_16px_32px_rgba(27,99,255,0.22)] transition hover:-translate-y-0.5"
            >
              查看商铺
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 rounded-full border border-[#d7e6ff] bg-white/88 px-5 py-3 text-[#215edc] transition hover:border-[#b7d1ff] hover:bg-white"
            >
              查看比价
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="float-in rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[1.8rem]">最近变动</h2>
            <div className="flex items-center gap-2 rounded-full bg-[#edf4ff] px-3 py-1.5 text-xs text-[#3168dc]">
              <Activity className="h-3.5 w-3.5" />
              今日更新
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {diffs.map((item) => {
              const shop = shops.find((shopEntry) => shopEntry.shopId === item.shopId);
              return (
                <div
                  key={item.shopId}
                  className="group rounded-[22px] border border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 transition duration-200 hover:border-[#c6d8ff] hover:shadow-[0_16px_34px_rgba(59,130,246,0.08)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{shop?.name ?? item.shopId}</h3>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
                      {item.snapshotDate}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.changes.map((change) => (
                      <span
                        key={`${change.type}-${change.productType ?? change.note}`}
                        className="rounded-full border border-[#dce7fb] bg-[#f4f8ff] px-3 py-1.5 text-xs text-[#4469b3]"
                      >
                        {change.type}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <RankingCard title="最低价榜" icon={<TrendingDown className="h-4 w-4 text-[#2867e8]" />} entries={priceRankings} suffix="元" />
          <RankingCard title="稳定度榜" icon={<Shield className="h-4 w-4 text-[#2867e8]" />} entries={stabilityRankings} suffix="分" />
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
    <div className="float-in rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_46px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[1.7rem]">{title}</h2>
        <div className="rounded-full bg-[#edf4ff] p-2">{icon}</div>
      </div>

      <div className="mt-4 space-y-3">
        {entries.map((entry) => (
          <div
            key={`${title}-${entry.rank}`}
            className={`flex items-start gap-3 rounded-[20px] border p-3.5 transition duration-200 hover:border-[#c6d8ff] ${
              entry.rank === 1
                ? "border-[#bed5ff] bg-[linear-gradient(135deg,#eef5ff,#e5f0ff)] shadow-[0_16px_30px_rgba(59,130,246,0.1)]"
                : "border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)]"
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#1d65ff,#7bb6ff)] text-sm font-semibold text-white">
              {entry.rank}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{entry.shopName}</div>
                <div className="text-lg font-semibold text-[#2567eb]">
                  {entry.value}
                  {suffix}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
