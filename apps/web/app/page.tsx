import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { changeTypeLabels, formatDateLabel, formatDateOnlyLabel, shopStatusLabels } from "@shop-claw/shared/labels";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const published = await getPublishedData();
  const featuredShops = published.shops.slice(0, 3);
  const visibleProducts = published.shopProducts.filter((item) => item.current.isDetected);
  const lowStockCount = visibleProducts.filter((item) => item.current.stockStatus === "LOW_STOCK").length;
  const outOfStockCount = visibleProducts.filter((item) => item.current.stockStatus === "OUT_OF_STOCK").length;
  const metrics = [
    { label: "已监控站点", value: `${published.shops.length}`.padStart(2, "0"), detail: "已公开的店铺数量" },
    { label: "当前商品", value: `${visibleProducts.length}`, detail: "当前检测到的商品总数" },
    { label: "库存紧张", value: `${lowStockCount}`, detail: "需要优先关注的低库存商品" },
    { label: "无货商品", value: `${outOfStockCount}`, detail: "本次结果中已显示无货的商品" }
  ];

  return (
    <div className="space-y-6">
      <section className="rise-in overflow-hidden rounded-[32px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#fbf7f0_0%,#f3ebdd_48%,#edf4e7_100%)] p-6 shadow-[0_24px_70px_rgba(102,88,64,0.12)]">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/84 px-4 py-2 text-sm text-slate-600 shadow-[0_10px_24px_rgba(102,88,64,0.06)]">
              公开数据最后更新于 {formatDateLabel(published.publishedAt)}
            </div>
            <h1 className="mt-6 max-w-3xl font-serif text-5xl leading-tight text-[#18222c]">公开商铺与商品总览</h1>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/shops"
                className="inline-flex items-center gap-2 rounded-full bg-[#355344] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_28px_rgba(53,83,68,0.18)]"
              >
                查看店铺监控
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => (
              <article key={metric.label} className="rounded-[24px] border border-[#d8cfbf] bg-white/82 p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
                <div className="mt-3 text-4xl font-semibold text-[#355344]">{metric.value}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{metric.detail}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rise-in rounded-[30px] border border-black/5 bg-[#f7f1e6] p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-[1.9rem] text-[#18222c]">最近变动</h2>
              <p className="mt-2 text-sm text-slate-600">按最新公开结果显示商品上下架、价格和库存变化。</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {published.shopDiffs.slice(0, 6).map((diff) => {
              const shop = published.shops.find((item) => item.shopId === diff.shopId);
              return (
                <article
                  key={`${diff.shopId}-${diff.snapshotDate}`}
                  className="rounded-[22px] border border-[#273346]/10 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-[#18222c]">{shop?.name ?? diff.shopId}</h3>
                    <div className="rounded-full border border-[#273346]/10 bg-[#faf5eb] px-3 py-1.5 text-xs text-slate-500">
                      {formatDateOnlyLabel(diff.snapshotDate)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {diff.changes.slice(0, 4).map((change) => (
                      <span
                        key={`${change.type}-${change.productKey ?? change.note}`}
                        className="rounded-full border border-[#273346]/10 bg-[#faf5eb] px-3 py-1.5 text-xs text-slate-700"
                      >
                        {changeTypeLabels[change.type]}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}

            {published.shopDiffs.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#273346]/15 bg-white px-4 py-10 text-center text-slate-500">
                当前还没有公开变动记录。
              </div>
            ) : null}
          </div>
        </div>

        <div className="rise-in rounded-[30px] border border-black/5 bg-[#f7f1e6] p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-[1.9rem] text-[#18222c]">重点店铺</h2>
              <p className="mt-2 text-sm text-slate-600">优先显示最近有变动或仍在正常上架的站点。</p>
            </div>
            <Link href="/shops" className="text-sm text-[#7a5f14]">
              查看全部
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {featuredShops.map((shop) => (
              <article key={shop.shopId} className="rounded-[24px] border border-[#273346]/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#18222c]">{shop.name}</h3>
                    <div className="mt-1 text-xs text-slate-500">{formatDateLabel(shop.lastCrawledAt)}</div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      shop.status === "OPEN"
                        ? "bg-[#ecf4dd] text-[#355535]"
                        : shop.status === "RISK"
                          ? "bg-[#fdf1ce] text-[#8b6510]"
                          : "bg-[#f8dfd9] text-[#9d402d]"
                    }`}
                  >
                    {shopStatusLabels[shop.status]}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MetricCell label="商品数" value={`${shop.productCount}`} />
                  <MetricCell label="最低价" value={shop.lowestPrice > 0 ? `¥${shop.lowestPrice}` : "--"} />
                  <MetricCell label="近次变动" value={`${shop.recentChangeCount}`} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
                  <div>{shop.runCount} 次历史记录</div>
                  <a
                    href={shop.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#273346]/10 bg-[#faf5eb] px-3 py-1.5 text-xs text-[#7a5f14]"
                  >
                    打开网页
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            ))}

            {featuredShops.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#273346]/15 bg-white px-4 py-10 text-center text-slate-500">
                当前还没有公开店铺数据。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#273346]/10 bg-[#faf5eb] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-[#18222c]">{value}</div>
    </div>
  );
}
