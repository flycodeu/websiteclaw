"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import { ShopDiff, ShopSnapshot, ShopSummary } from "@/lib/types";

interface ShopExplorerProps {
  shops: ShopSummary[];
  snapshots: ShopSnapshot[];
  diffs: ShopDiff[];
}

const statusTone = {
  OPEN: "bg-mint text-emerald-900",
  RISK: "bg-amber-100 text-amber-900",
  CLOSED: "bg-rose-100 text-rose-900"
};

export function ShopExplorer({ shops, snapshots, diffs }: ShopExplorerProps) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | ShopSummary["status"]>("ALL");
  const [sortBy, setSortBy] = useState<"stability" | "price" | "updated">("stability");
  const [activeId, setActiveId] = useState<string | null>(shops[0]?.shopId ?? null);

  const filtered = useMemo(() => {
    return [...shops]
      .filter((shop) => {
        const keywordMatched =
          shop.name.toLowerCase().includes(keyword.toLowerCase()) ||
          shop.tags.some((tag) => tag.toLowerCase().includes(keyword.toLowerCase()));
        const statusMatched = status === "ALL" || shop.status === status;
        return keywordMatched && statusMatched;
      })
      .sort((a, b) => {
        if (sortBy === "price") {
          return a.lowestPrice - b.lowestPrice;
        }
        if (sortBy === "updated") {
          return Date.parse(b.lastCrawledAt) - Date.parse(a.lastCrawledAt);
        }
        return b.stabilityScore - a.stabilityScore;
      });
  }, [keyword, shops, sortBy, status]);

  const activeShop = filtered.find((item) => item.shopId === activeId) ?? shops.find((item) => item.shopId === activeId);
  const activeSnapshot = snapshots.find((item) => item.shopId === activeId);
  const activeDiff = diffs.find((item) => item.shopId === activeId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="mt-2 font-serif text-3xl">商铺监控面板</h2>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <Search className="h-4 w-4" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索商铺或标签"
                  className="w-44 bg-transparent outline-none"
                />
              </label>
              <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <SlidersHorizontal className="h-4 w-4" />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as "ALL" | ShopSummary["status"])}
                  className="bg-transparent outline-none"
                >
                  <option value="ALL">全部状态</option>
                  <option value="OPEN">OPEN</option>
                  <option value="RISK">RISK</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as "stability" | "price" | "updated")}
                className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none"
              >
                <option value="stability">按稳定度</option>
                <option value="price">按最低价</option>
                <option value="updated">按最近更新</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((shop) => (
            <button
              key={shop.shopId}
              type="button"
              onClick={() => setActiveId(shop.shopId)}
              className={`rounded-[28px] border p-5 text-left transition ${
                activeId === shop.shopId
                  ? "border-signal bg-slate-900 text-white shadow-panel"
                  : "border-slate-200 bg-white shadow-panel hover:-translate-y-1"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className={`mt-2 text-xl font-semibold ${activeId === shop.shopId ? "text-white" : "text-ink"}`}>
                    {shop.name}
                  </h3>
                  <p className={`mt-2 text-sm ${activeId === shop.shopId ? "text-slate-200" : "text-slate-500"}`}>
                    {shop.healthNote}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone[shop.status]}`}>
                  {shop.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MetricCard label="稳定度" value={`${shop.stabilityScore}`} inverse={activeId === shop.shopId} />
                <MetricCard label="商品数" value={`${shop.productCount}`} inverse={activeId === shop.shopId} />
                <MetricCard label="最低价" value={`¥${shop.lowestPrice || "--"}`} inverse={activeId === shop.shopId} />
                <MetricCard label="平均价" value={`¥${shop.averagePrice || "--"}`} inverse={activeId === shop.shopId} />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {shop.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`rounded-full px-3 py-1 text-xs ${
                      activeId === shop.shopId ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className="sticky top-24 h-fit rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
        {activeShop && activeSnapshot ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="mt-2 font-serif text-3xl">{activeShop.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="text-sm text-slate-500">最近抓取</div>
                <div className="mt-1 text-sm text-ink">{activeSnapshot.snapshotDate}</div>
              </div>
              <a
                href={activeShop.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
              >
                访问站点
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-semibold text-slate-500">商品列表</h4>
              {activeSnapshot.products.map((product) => (
                <div key={`${product.normalizedType}-${product.updatedAt}`} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-500">{product.normalizedType}</div>
                      <div className="mt-1 font-medium">{product.rawName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-ink">¥{product.price}</div>
                      <div className="text-xs text-slate-500">{product.stockStatus}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-500">变化分析</h4>
              <p className="mt-3 text-sm text-slate-600">{activeDiff?.summary ?? "暂无变化数据。"}</p>
              <div className="mt-4 space-y-3">
                {(activeDiff?.changes ?? []).map((change) => (
                  <div key={`${change.type}-${change.productType ?? change.note}`} className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
                    <div className="font-medium text-ink">{change.type}</div>
                    <div className="mt-1">{change.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
            选择一张商铺卡片查看完整分析。
          </div>
        )}
      </aside>
    </div>
  );
}

function MetricCard({ label, value, inverse }: { label: string; value: string; inverse?: boolean }) {
  return (
    <div className={`rounded-[20px] p-4 ${inverse ? "bg-white/10" : "bg-slate-50"}`}>
      <div className={`text-xs ${inverse ? "text-slate-300" : "text-slate-400"}`}>{label}</div>
      <div className={`mt-2 text-xl font-semibold ${inverse ? "text-white" : "text-ink"}`}>{value}</div>
    </div>
  );
}
