"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { formatWarrantyLabel, productCategoryLabels, stockStatusLabels } from "@shop-claw/shared/labels";
import { ProductCategory } from "@shop-claw/shared/types";
import { ProductFeedItem, ProductFeedPage } from "@/lib/product-feed";

interface InStockProductsBoardProps {
  initialPage: ProductFeedPage;
  categories: ProductCategory[];
}

const PAGE_SIZE = 24;

export function InStockProductsBoard({ initialPage, categories }: InStockProductsBoardProps) {
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [items, setItems] = useState(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [total, setTotal] = useState(initialPage.total);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const hasHydratedRef = useRef(false);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inStockCount = items.filter((item) => item.stockStatus === "IN_STOCK").length;
  const lowStockCount = items.filter((item) => item.stockStatus === "LOW_STOCK").length;
  const visibleCategoryCount = new Set(items.map((item) => item.category)).size;

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    void fetchPage("replace");
  }, [activeCategory]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !cursor || loading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          void fetchPage("append");
        }
      },
      { rootMargin: "260px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, loading, items.length, activeCategory]);

  async function fetchPage(mode: "replace" | "append") {
    if (loading) {
      return;
    }

    setLoading(true);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

      if (activeCategory !== "ALL") {
        params.set("category", activeCategory);
      }

      if (mode === "append" && cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(`/api/products?${params.toString()}`);
      const page = await readPage(response);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setStatusText("");
      setTotal(page.total);
      setCursor(page.nextCursor);
      setItems((current) => (mode === "append" ? [...current, ...page.items] : page.items));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setStatusText(error instanceof Error ? error.message : "加载商品失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rise-in overflow-hidden rounded-[32px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#fbf7f0_0%,#f3ebdd_48%,#edf4e7_100%)] p-6 shadow-panel">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-serif text-4xl text-[#18222c]">有货商品</h1>
          </div>
          <div className="rounded-full border border-[#d8cfbf] bg-white/84 px-4 py-2 text-sm text-slate-600 shadow-[0_10px_24px_rgba(102,88,64,0.06)]">
            已加载 {items.length} / {total}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <FilterChip active={activeCategory === "ALL"} label="全部" onClick={() => setActiveCategory("ALL")} />
          {categories.map((category) => (
            <FilterChip
              key={category}
              active={activeCategory === category}
              label={productCategoryLabels[category]}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MiniMetric label="当前分类" value={activeCategory === "ALL" ? `${visibleCategoryCount} 类` : productCategoryLabels[activeCategory]} />
          <MiniMetric label="稳定有货" value={`${inStockCount}`} />
          <MiniMetric label="库存紧张" value={`${lowStockCount}`} tone="warn" />
        </div>
      </section>

      {statusText ? (
        <div className="rounded-[24px] border border-[#d8cfbf] bg-white/88 px-5 py-4 text-sm text-slate-700 shadow-[0_14px_32px_rgba(102,88,64,0.08)]">
          {statusText}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className={`flex min-h-[252px] flex-col rounded-[24px] border p-4 shadow-panel ${getProductCardTone(item.stockStatus)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#d8cfbf] bg-white/84 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {productCategoryLabels[item.category]}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs ${getStockBadgeTone(item.stockStatus)}`}>
                    {stockStatusLabels[item.stockStatus]}
                  </span>
                </div>
                <h2 className="mt-3 break-words text-base font-semibold leading-6 text-[#18222c] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {item.rawName}
                </h2>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">价格</div>
                <div className="mt-1 text-xl font-semibold text-[#18222c]">{item.price > 0 ? `¥${item.price}` : "--"}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-1 flex-col gap-3">
              <div className="rounded-[18px] border border-white/70 bg-white/78 p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">规格</div>
                <div className="mt-1 text-sm font-medium leading-6 text-[#18222c] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {item.specLabel || "未标注规格"}
                </div>
              </div>

              <div className="rounded-[18px] border border-white/70 bg-white/78 p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">库存说明</div>
                <div className="mt-1 text-sm leading-6 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                  {item.inventoryText || "未提供库存说明"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ProductChip label={formatWarrantyLabel(item.warrantySupported)} />
              <ProductChip label={item.stockStatus === "LOW_STOCK" ? "尽快下单" : "稳定展示"} />
            </div>

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/60 pt-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">商家</div>
                <div className="mt-1 truncate text-sm font-medium text-[#18222c]">{item.shopName}</div>
              </div>

              {item.shopUrl ? (
                <a
                  href={item.shopUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#d8cfbf] bg-white/88 px-3 py-2 text-xs text-[#355344] shadow-[0_10px_20px_rgba(102,88,64,0.06)] transition hover:border-[#cdbca0] hover:bg-white"
                >
                  跳转商家
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </article>
        ))}

        {items.length === 0 && !loading ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-[#d8cfbf] bg-white/82 px-4 py-12 text-center text-slate-500">
            当前筛选条件下没有可展示的商品。
          </div>
        ) : null}
      </section>

      <div ref={sentinelRef} className="h-2" />

      <div className="flex justify-center pb-2">
        {cursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchPage("append")}
            className="rounded-full border border-[#d8cfbf] bg-white/88 px-5 py-3 text-sm text-[#355344] shadow-[0_10px_24px_rgba(102,88,64,0.06)] disabled:opacity-60"
          >
            {loading ? "加载中..." : "继续加载"}
          </button>
        ) : total > 0 ? (
          <div className="rounded-full border border-[#d8cfbf] bg-white/82 px-4 py-2 text-sm text-slate-500">已显示全部商品</div>
        ) : null}
      </div>
    </div>
  );
}

async function readPage(response: Response) {
  const payload = (await response.json()) as { message?: string; data?: ProductFeedPage };
  if (!response.ok || !payload.data) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "border border-[#b8d0b2] bg-[#edf6e2] text-[#264233]"
          : "border border-[#d8cfbf] bg-white/82 text-slate-600 hover:border-[#cdbca0] hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" }) {
  return (
    <div
      className={`rounded-[20px] border p-4 ${
        tone === "warn" ? "border-[#efddad] bg-[#fff8e4]" : "border-[#d8cfbf] bg-white/82"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#18222c]">{value}</div>
    </div>
  );
}

function ProductChip({ label }: { label: string }) {
  return <span className="rounded-full border border-[#d8cfbf] bg-white/84 px-3 py-1 text-xs text-slate-700">{label}</span>;
}

function getStockBadgeTone(stockStatus: ProductFeedItem["stockStatus"]) {
  if (stockStatus === "LOW_STOCK") {
    return "border border-[#efddad] bg-[#fff2c0] text-[#8b6510]";
  }

  return "border border-[#d4e3c4] bg-[#edf6e2] text-[#355535]";
}

function getProductCardTone(stockStatus: ProductFeedItem["stockStatus"]) {
  if (stockStatus === "LOW_STOCK") {
    return "border-[#efddad] bg-[linear-gradient(180deg,#fffaf0_0%,#fff2d9_100%)]";
  }

  return "border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee3_100%)]";
}
