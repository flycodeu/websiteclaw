"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import {
  formatDateLabel,
  formatWarrantyLabel,
  productCategoryLabels,
  productStatusLabels,
  shopStatusLabels,
  stockStatusLabels
} from "@shop-claw/shared/labels";
import { ProductCategory, PublishedShopProduct, ShopSummary } from "@shop-claw/shared/types";

interface ShopExplorerProps {
  shops: ShopSummary[];
  products: PublishedShopProduct[];
}

const categoryOrder = Object.keys(productCategoryLabels) as ProductCategory[];

export function ShopExplorer({ shops, products }: ShopExplorerProps) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | ShopSummary["status"]>("ALL");
  const [sortBy, setSortBy] = useState<"updated" | "price" | "changes">("updated");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");

  const filtered = useMemo(() => {
    return [...shops]
      .filter((shop) => {
        const keywordMatched =
          shop.name.toLowerCase().includes(keyword.toLowerCase()) ||
          shop.categories.some((category) => productCategoryLabels[category].toLowerCase().includes(keyword.toLowerCase()));
        const statusMatched = status === "ALL" || shop.status === status;
        return keywordMatched && statusMatched;
      })
      .sort((a, b) => {
        if (sortBy === "price") {
          if (a.lowestPrice === 0) {
            return 1;
          }

          if (b.lowestPrice === 0) {
            return -1;
          }

          return a.lowestPrice - b.lowestPrice;
        }

        if (sortBy === "changes") {
          return b.recentChangeCount - a.recentChangeCount;
        }

        return Date.parse(b.lastCrawledAt) - Date.parse(a.lastCrawledAt);
      });
  }, [keyword, shops, sortBy, status]);

  const activeShop = shops.find((item) => item.shopId === activeId) ?? null;
  const activeProducts = useMemo(
    () =>
      activeShop
        ? products
            .filter((item) => item.shopId === activeShop.shopId)
            .sort((left, right) => {
              const stockPriority = getStockPriority(left) - getStockPriority(right);
              if (stockPriority !== 0) {
                return stockPriority;
              }

              if (left.category !== right.category) {
                return left.category.localeCompare(right.category, "zh-CN");
              }

              return left.current.rawName.localeCompare(right.current.rawName, "zh-CN");
            })
        : [],
    [activeShop, products]
  );

  const activeCategories = useMemo(() => {
    const currentSet = new Set(activeProducts.map((product) => product.category));
    return categoryOrder.filter((category) => currentSet.has(category));
  }, [activeProducts]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === "ALL") {
      return activeProducts;
    }

    return activeProducts.filter((product) => product.category === activeCategory);
  }, [activeCategory, activeProducts]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeId]);

  useEffect(() => {
    if (activeId && !shops.some((item) => item.shopId === activeId)) {
      setActiveId(null);
    }
  }, [activeId, shops]);

  useEffect(() => {
    setActiveCategory("ALL");
  }, [activeId]);

  return (
    <div className="space-y-6">
      <section className="rise-in overflow-hidden rounded-[32px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#fbf7f0_0%,#f3ebdd_52%,#edf4e7_100%)] p-5 shadow-panel">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/82 px-4 py-2 text-sm text-slate-600 shadow-[0_10px_24px_rgba(102,88,64,0.08)]">
              当前公开 {filtered.length} 家店铺
            </div>
            <h1 className="mt-4 font-serif text-4xl text-[#18222c]">店铺监控</h1>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.78fr)_minmax(0,0.78fr)]">
            <label className="flex min-w-0 items-center gap-2 rounded-[20px] border border-[#d8cfbf] bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-[0_10px_24px_rgba(102,88,64,0.06)]">
              <Search className="h-4 w-4" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索店铺或分类"
                className="w-full min-w-0 bg-transparent text-[#18222c] outline-none placeholder:text-slate-400"
              />
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-[20px] border border-[#d8cfbf] bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-[0_10px_24px_rgba(102,88,64,0.06)]">
              <SlidersHorizontal className="h-4 w-4" />
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as "ALL" | ShopSummary["status"])}
                className="w-full min-w-0 bg-transparent text-[#18222c] outline-none"
              >
                <option value="ALL">全部状态</option>
                <option value="OPEN">正常</option>
                <option value="RISK">异常</option>
                <option value="CLOSED">关闭</option>
              </select>
            </label>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "updated" | "price" | "changes")}
              className="min-w-0 rounded-[20px] border border-[#d8cfbf] bg-white/90 px-4 py-3 text-sm text-[#18222c] outline-none shadow-[0_10px_24px_rgba(102,88,64,0.06)]"
            >
              <option value="updated">按最近更新</option>
              <option value="price">按最低价</option>
              <option value="changes">按最近变动</option>
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((shop) => (
          <button
            key={shop.shopId}
            type="button"
            onClick={() => setActiveId(shop.shopId)}
            className="rise-in rounded-[28px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee3_100%)] p-5 text-left shadow-panel transition duration-200 hover:-translate-y-0.5 hover:border-[#cbbca2]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="break-words text-[1.25rem] font-semibold text-[#18222c]">{shop.name}</h2>
                <div className="mt-1 text-sm text-slate-500">{formatDateLabel(shop.lastCrawledAt)}</div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${getShopStatusTone(shop.status)}`}>
                {shopStatusLabels[shop.status]}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MetricCard label="商品数" value={`${shop.productCount}`} />
              <MetricCard label="有货" value={`${shop.inStockCount}`} />
              <MetricCard label="最低价" value={shop.lowestPrice > 0 ? `¥${shop.lowestPrice}` : "--"} />
              <MetricCard label="近次变动" value={`${shop.recentChangeCount}`} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {shop.outOfStockCount > 0 ? (
                <span className="rounded-full border border-[#efc8bb] bg-[#fff2ed] px-3 py-1 text-xs text-[#a3462c]">
                  {shop.outOfStockCount} 件无货
                </span>
              ) : null}
              {shop.lowStockCount > 0 ? (
                <span className="rounded-full border border-[#efddad] bg-[#fff7e0] px-3 py-1 text-xs text-[#8b6510]">
                  {shop.lowStockCount} 件库存紧张
                </span>
              ) : null}
              {shop.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-[#e1d6c5] bg-white/88 px-3 py-1 text-xs text-slate-700"
                >
                  {productCategoryLabels[category]}
                </span>
              ))}
            </div>
          </button>
        ))}

        {filtered.length === 0 ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-[#d8cfbf] bg-[#f7f1e6] px-4 py-12 text-center text-slate-500">
            当前没有匹配的店铺。
          </div>
        ) : null}
      </section>

      {activeShop ? (
        <>
          <button
            type="button"
            aria-label="关闭店铺详情"
            onClick={() => setActiveId(null)}
            className="fixed inset-0 z-40 bg-[#18222c]/14 backdrop-blur-[2px]"
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <section
              role="dialog"
              aria-modal="true"
              className="flex max-h-[90vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee2_62%,#edf4e7_100%)] shadow-[0_24px_80px_rgba(24,34,44,0.18)]"
            >
              <div className="border-b border-[#e2d8c9] px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs ${getShopStatusTone(activeShop.status)}`}>
                        {shopStatusLabels[activeShop.status]}
                      </span>
                      <span className="rounded-full border border-[#d8cfbf] bg-white/86 px-3 py-1 text-xs text-slate-500">
                        {formatDateLabel(activeShop.lastCrawledAt)}
                      </span>
                    </div>
                    <h2 className="mt-3 break-words font-serif text-[2rem] leading-tight text-[#18222c]">{activeShop.name}</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={activeShop.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[#d8cfbf] bg-white/88 px-4 py-2 text-sm text-slate-700 shadow-[0_10px_20px_rgba(102,88,64,0.06)]"
                    >
                      打开原站点
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8cfbf] bg-white/88 text-slate-600 shadow-[0_10px_20px_rgba(102,88,64,0.06)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ShopMetricPill label="商品总数" value={`${activeShop.productCount}`} />
                  <ShopMetricPill label="当前有货" value={`${activeShop.inStockCount}`} tone="success" />
                  <ShopMetricPill label="库存紧张" value={`${activeShop.lowStockCount}`} tone="warn" />
                  <ShopMetricPill label="当前无货" value={`${activeShop.outOfStockCount}`} tone="danger" />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <FilterChip
                    active={activeCategory === "ALL"}
                    label={`全部 ${activeProducts.length}`}
                    onClick={() => setActiveCategory("ALL")}
                  />
                  {activeCategories.map((category) => (
                    <FilterChip
                      key={category}
                      active={activeCategory === category}
                      label={productCategoryLabels[category]}
                      onClick={() => setActiveCategory(category)}
                    />
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {visibleProducts.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {visibleProducts.map((product) => {
                      const tone = getProductTone(product);

                      return (
                        <article
                          key={product.productKey}
                          className={`min-w-0 rounded-[24px] border p-4 shadow-[0_12px_28px_rgba(102,88,64,0.08)] ${tone.card}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-[#d8cfbf] bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                  {productCategoryLabels[product.category]}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-xs ${tone.stockBadge}`}>
                                  {product.current.isDetected ? stockStatusLabels[product.current.stockStatus] : "本次未检测到"}
                                </span>
                              </div>
                              <h3 className="mt-3 break-words text-lg font-semibold text-[#18222c]">{product.current.rawName}</h3>
                              <div className="mt-1 text-sm text-slate-500">{product.specLabel || "未标注规格"}</div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-xl font-semibold text-[#18222c]">
                                {product.current.price > 0 ? `¥${product.current.price}` : "--"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{formatDateLabel(product.current.updatedAt)}</div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <ProductChip label={productStatusLabels[product.current.status]} />
                            <ProductChip label={formatWarrantyLabel(product.current.warrantySupported)} />
                          </div>

                          <div className="mt-4 rounded-[18px] border border-white/60 bg-white/72 p-3">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">库存说明</div>
                            <div className="mt-1 text-sm leading-6 text-slate-700">
                              {product.current.inventoryText || "未提供库存说明"}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#d8cfbf] bg-white/78 px-4 py-12 text-center text-slate-500">
                    当前筛选条件下没有商品记录。
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#e1d6c5] bg-white/82 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-[#18222c]">{value}</div>
    </div>
  );
}

function ShopMetricPill({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#efc8bb] bg-[#fff2ed] text-[#a3462c]"
      : tone === "warn"
        ? "border-[#efddad] bg-[#fff7e0] text-[#8b6510]"
        : tone === "success"
          ? "border-[#d4e3c4] bg-[#edf6e2] text-[#355535]"
          : "border-[#d8cfbf] bg-white/84 text-[#355344]";

  return (
    <div className={`rounded-[20px] border p-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
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

function ProductChip({ label }: { label: string }) {
  return <span className="rounded-full border border-[#d8cfbf] bg-white/84 px-3 py-1 text-xs text-slate-700">{label}</span>;
}

function getStockPriority(product: PublishedShopProduct) {
  if (!product.current.isDetected) {
    return 3;
  }

  if (product.current.stockStatus === "OUT_OF_STOCK") {
    return 0;
  }

  if (product.current.stockStatus === "LOW_STOCK") {
    return 1;
  }

  return 2;
}

function getShopStatusTone(status: ShopSummary["status"]) {
  if (status === "OPEN") {
    return "border border-[#d4e3c4] bg-[#edf6e2] text-[#355535]";
  }

  if (status === "RISK") {
    return "border border-[#efddad] bg-[#fff7e0] text-[#8b6510]";
  }

  return "border border-[#efc8bb] bg-[#fff2ed] text-[#a3462c]";
}

function getProductTone(product: PublishedShopProduct) {
  if (!product.current.isDetected) {
    return {
      card: "border-[#d8cfbf] bg-white/86",
      stockBadge: "border border-[#d8cfbf] bg-white text-slate-600"
    };
  }

  if (product.current.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-[#efc8bb] bg-[linear-gradient(180deg,#fff7f4_0%,#fdebe4_100%)]",
      stockBadge: "border border-[#da7b5b] bg-[#c54d2a] text-white"
    };
  }

  if (product.current.stockStatus === "LOW_STOCK") {
    return {
      card: "border-[#efddad] bg-[linear-gradient(180deg,#fffaf0_0%,#fff2d9_100%)]",
      stockBadge: "border border-[#efddad] bg-[#fff2c0] text-[#8b6510]"
    };
  }

  return {
    card: "border-[#d8cfbf] bg-white/88",
    stockBadge: "border border-[#d4e3c4] bg-[#edf6e2] text-[#355535]"
  };
}
