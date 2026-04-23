import Link from "next/link";
import { Activity, ArrowRight, ExternalLink } from "lucide-react";
import { changeTypeLabels, formatDateOnlyLabel, shopStatusLabels } from "@shop-claw/shared/labels";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { diffs, overviewMetrics, shops } = await getPublishedData();
  const featuredShops = shops.filter((shop) => shop.status !== "CLOSED").slice(0, 4);

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
                  key={`${item.shopId}-${item.snapshotDate}`}
                  className="group rounded-[22px] border border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 transition duration-200 hover:border-[#c6d8ff] hover:shadow-[0_16px_34px_rgba(59,130,246,0.08)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{shop?.name ?? item.shopId}</h3>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
                      {formatDateOnlyLabel(item.snapshotDate)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.changes.map((change) => (
                      <span
                        key={`${change.type}-${change.productType ?? change.note}`}
                        className="rounded-full border border-[#dce7fb] bg-[#f4f8ff] px-3 py-1.5 text-xs text-[#4469b3]"
                      >
                        {changeTypeLabels[change.type]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="float-in rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[1.8rem]">重点商铺</h2>
            <Link href="/shops" className="text-sm text-[#2567eb]">
              查看全部
            </Link>
          </div>

          <div className="mt-4 grid gap-3">
            {featuredShops.map((shop) => (
              <article
                key={shop.shopId}
                className="rounded-[22px] border border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 transition duration-200 hover:border-[#c6d8ff] hover:shadow-[0_16px_34px_rgba(59,130,246,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{shop.name}</h3>
                    <div className="mt-1 text-xs text-slate-500">{formatDateOnlyLabel(shop.lastCrawledAt)}</div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      shop.status === "OPEN"
                        ? "bg-[#e8f6ef] text-[#21714c]"
                        : shop.status === "RISK"
                          ? "bg-[#fff4dc] text-[#8d5a09]"
                          : "bg-[#fdecec] text-[#9f2e2e]"
                    }`}
                  >
                    {shopStatusLabels[shop.status]}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MetricCell label="商品数" value={`${shop.productCount}`} />
                  <MetricCell label="最低价" value={`¥${shop.lowestPrice || "--"}`} />
                  <MetricCell label="稳定度" value={`${shop.stabilityScore}`} />
                </div>

                <div className="mt-4 flex justify-end">
                  <a
                    href={shop.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#d7e6ff] bg-white px-3 py-1.5 text-xs text-[#215edc]"
                  >
                    打开
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#e1e9f7] bg-[#fbfdff] p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-ink">{value}</div>
    </div>
  );
}
