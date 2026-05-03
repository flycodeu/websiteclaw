"use client";

import { startTransition, useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
import {
  formatDateLabel,
  formatWarrantyLabel,
  productCategoryLabels,
  productStatusLabels,
  shopStatusLabels,
  stockStatusLabels
} from "@shop-claw/shared/labels";
import {
  ApiResponse,
  PublicShopDetail,
  ProductCategory,
  PublishedShopProductPreview,
  ShopSummary
} from "@shop-claw/shared/types";

interface ShopExplorerProps {
  shops: ShopSummary[];
}

export function ShopExplorer({ shops }: ShopExplorerProps) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | ShopSummary["status"]>("ALL");
  const [sortBy, setSortBy] = useState<"updated" | "price">("updated");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [detailsByShop, setDetailsByShop] = useState<Record<string, PublicShopDetail>>({});
  const [detailError, setDetailError] = useState("");

  const filteredShops = [...shops]
    .filter((shop) => {
      const text = keyword.trim().toLowerCase();
      const keywordMatched =
        !text ||
        shop.name.toLowerCase().includes(text) ||
        shop.categories.some(
          (category) =>
            category.toLowerCase().includes(text) || productCategoryLabels[category].toLowerCase().includes(text)
        );
      const statusMatched = status === "ALL" || shop.status === status;
      return keywordMatched && statusMatched;
    })
    .sort((left, right) => {
      if (sortBy === "price") {
        if (left.lowestPrice === 0) {
          return 1;
        }

        if (right.lowestPrice === 0) {
          return -1;
        }

        return left.lowestPrice - right.lowestPrice;
      }

      return Date.parse(right.lastCrawledAt) - Date.parse(left.lastCrawledAt);
    });

  const activeShop = activeId ? shops.find((shop) => shop.shopId === activeId) ?? null : null;
  const activeDetail = activeId ? detailsByShop[activeId] ?? null : null;
  const loadingDetail = Boolean(activeId && !activeDetail && !detailError);
  const visibleProducts =
    activeDetail?.products.filter((product) => activeCategory === "ALL" || product.category === activeCategory) ?? [];
  const activeCategories = activeDetail?.categories ?? [];

  useEffect(() => {
    if (!activeId || detailsByShop[activeId]) {
      return;
    }

    const shopId = activeId;
    const controller = new AbortController();

    async function loadDetail() {
      setDetailError("");

      try {
        const response = await fetch(`/api/shops/${activeId}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const payload = (await response.json()) as ApiResponse<PublicShopDetail>;

        if (!response.ok || payload.code !== 0 || !payload.data) {
          throw new Error(payload.message || "店铺详情加载失败");
        }

        startTransition(() => {
          setDetailsByShop((current) => ({
            ...current,
            [shopId]: payload.data
          }));
        });
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setDetailError(fetchError instanceof Error ? fetchError.message : "店铺详情加载失败");
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [activeId, detailsByShop]);

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
    setActiveCategory("ALL");
    setDetailError("");
  }, [activeId]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 transition-all">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_190px_190px]">
          <label className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all md:col-span-2 xl:col-span-1">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索店铺或商品类型"
              className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>

          <label className="flex items-center rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "ALL" | ShopSummary["status"])}
              className="w-full bg-transparent text-zinc-900 outline-none cursor-pointer"
            >
              <option value="ALL">全部状态</option>
              <option value="OPEN">正常</option>
              <option value="RISK">异常</option>
              <option value="CLOSED">关闭</option>
            </select>
          </label>

          <label className="flex items-center rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "updated" | "price")}
              className="w-full bg-transparent text-zinc-900 outline-none cursor-pointer"
            >
              <option value="updated">按最近更新</option>
              <option value="price">按最低价</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredShops.map((shop) => (
          <button
            key={shop.shopId}
            type="button"
            onClick={() => setActiveId(shop.shopId)}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-zinc-900">{shop.name}</h2>
                <div className="mt-1 text-xs text-zinc-500">{formatDateLabel(shop.lastCrawledAt)}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${getShopStatusTone(shop.status)}`}>
                {shopStatusLabels[shop.status]}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <SummaryToken label={`${shop.productCount} 商品`} />
              <SummaryToken label={`${shop.inStockCount} 有货`} />
              <SummaryToken label={shop.lowestPrice > 0 ? `¥${shop.lowestPrice}` : "暂无价格"} />
            </div>

            <div className="mt-4 break-words text-xs text-zinc-500 font-medium">
              {shop.categories.map((category) => productCategoryLabels[category]).join(" · ") || "未分类"}
            </div>
          </button>
        ))}

        {filteredShops.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-5 py-16 text-center text-sm text-zinc-500">
            当前没有匹配的店铺。
          </div>
        ) : null}
      </section>

      {activeShop ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 sm:p-6 md:p-8 backdrop-blur-md transition-opacity"
          onClick={() => setActiveId(null)}
        >
          <aside
            className="z-10 flex w-full max-w-7xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-zinc-200/80 bg-white/95 shadow-[0_32px_96px_rgba(0,0,0,0.15)] backdrop-blur-xl rise-in"
            style={{ maxHeight: "calc(100dvh - 2rem)" }}
            onClick={(e) => e.stopPropagation()}
          >            <div className="border-b border-zinc-100 px-5 py-5 sm:px-8 sm:py-6 bg-zinc-50/30">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getShopStatusTone(activeShop.status)}`}>
                      {shopStatusLabels[activeShop.status]}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500 shadow-sm">
                      {formatDateLabel(activeShop.lastCrawledAt)}
                    </span>
                  </div>
                  <h2 className="mt-4 break-words font-sans font-bold tracking-tight text-2xl text-zinc-900 sm:text-3xl">
                    {activeShop.name}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  {activeShop.url ? (
                    <a
                      href={activeShop.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                    >
                      打开原站点
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
                <CompactTile label="商品总数" value={`${activeShop.productCount}`} />
                <CompactTile label="当前有货" value={`${activeShop.inStockCount}`} />
                <CompactTile label="库存紧张" value={`${activeShop.lowStockCount}`} />
                <CompactTile label="当前离线" value={`${activeShop.outOfStockCount}`} />
              </div>

              {activeDetail ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  <CategoryFilter active={activeCategory === "ALL"} label={`全部 ${activeDetail.products.length}`} onClick={() => setActiveCategory("ALL")} />
                  {activeCategories.map((category) => (
                    <CategoryFilter
                      key={category}
                      active={activeCategory === category}
                      label={productCategoryLabels[category]}
                      onClick={() => setActiveCategory(category)}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 bg-zinc-50/10">
              {loadingDetail ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-600 shadow-sm">
                    <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" />
                    正在读取单店详情
                  </div>
                </div>
              ) : detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{detailError}</div>
              ) : activeDetail ? (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-900">商品列表</h3>
                      </div>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
                        当前 {visibleProducts.length} 件
                      </span>
                    </div>

                    {visibleProducts.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-14 text-center text-sm text-zinc-500">
                        当前筛选条件下没有商品记录。
                      </div>
                    ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {visibleProducts.map((product) => (
                        <ProductPanel key={product.productKey} product={product} />
                      ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function CompactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg border border-zinc-200/60 bg-zinc-50/50 px-2.5 py-1.5 transition-colors hover:bg-zinc-50">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</span>
      <span className="text-sm font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function SummaryToken({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600">
      {label}
    </span>
  );
}

function CategoryFilter({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-zinc-900 text-white shadow-sm"
          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm"
      }`}
    >
      {label}
    </button>
  );
}

function ProductPanel({ product }: { product: PublishedShopProductPreview }) {
  const tone = getProductTone(product);
  const priceLabel = product.current.price > 0 ? `¥${product.current.price}` : "--";

  return (
    <article className={`relative overflow-hidden rounded-[1.25rem] border p-5 shadow-sm transition-all hover:shadow-md ${tone.card}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
              {productCategoryLabels[product.category]}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone.stockBadge}`}>
              {product.current.isDetected ? stockStatusLabels[product.current.stockStatus] : `缺席 ${product.missingStreak} 次`}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-mono text-[1.45rem] font-semibold tracking-tight sm:text-[1.8rem] ${tone.price}`}>{priceLabel}</div>
            <div className={`mt-1 text-xs font-medium ${tone.meta}`}>{formatDateLabel(product.current.updatedAt)}</div>
          </div>
        </div>

        <div>
          <h3 className={`break-words text-base font-semibold leading-relaxed sm:text-lg ${tone.title}`}>{product.current.rawName}</h3>
          <div className={`mt-1.5 text-sm font-medium ${tone.meta}`}>{product.specLabel || "未标注规格"}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <MiniTag label={productStatusLabels[product.current.status]} />
        <MiniTag label={formatWarrantyLabel(product.current.warrantySupported)} />
        <MiniTag label={`价格样本 ${product.priceSampleCount}`} />
        {product.priceTrend.previousPrice !== null ? <MiniTag label={formatTrend(product)} /> : null}
      </div>

      <div className={`mt-5 rounded-xl border p-3.5 text-sm leading-relaxed ${tone.surface}`}>
        {product.current.inventoryText || "未提供库存说明"}
      </div>
    </article>
  );
}

function MiniTag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-zinc-200/80 bg-white px-2 py-1 text-xs font-medium text-zinc-500 shadow-sm">
      {label}
    </span>
  );
}

function getShopStatusTone(status: ShopSummary["status"]) {
  if (status === "OPEN") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === "RISK") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-red-600";
}

function getProductTone(product: PublishedShopProductPreview) {
  if (!product.current.isDetected) {
    return {
      card: "border-zinc-200 bg-zinc-50",
      stockBadge: "border-zinc-200 bg-zinc-100 text-zinc-500",
      title: "text-zinc-500",
      price: "text-zinc-500",
      meta: "text-zinc-400",
      surface: "border-zinc-200 bg-zinc-100/50 text-zinc-500"
    };
  }

  if (product.current.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-zinc-200/80 bg-zinc-100/80 grayscale-[0.3]",
      stockBadge: "border-red-200 bg-red-50 text-red-600 font-bold",
      title: "text-zinc-500",
      price: "text-zinc-500",
      meta: "text-zinc-500",
      surface: "border-zinc-200 bg-zinc-100/50 text-zinc-500"
    };
  }

  if (product.current.stockStatus === "LOW_STOCK") {
    return {
      card: "border-amber-200/60 bg-amber-50/20",
      stockBadge: "border-amber-200 bg-amber-50 text-amber-700",
      title: "text-amber-900",
      price: "text-amber-800",
      meta: "text-amber-700",
      surface: "border-amber-200/50 bg-amber-50/50 text-amber-800"
    };
  }

  return {
    card: "border-zinc-200 bg-white hover:border-zinc-300",
    stockBadge: "border-zinc-200 bg-white text-zinc-600",
    title: "text-zinc-900",
    price: "text-zinc-900",
    meta: "text-zinc-500",
    surface: "border-zinc-100 bg-zinc-50 text-zinc-600"
  };
}

function formatTrend(product: PublishedShopProductPreview) {
  if (product.priceTrend.previousPrice === null) {
    return "价格新样本";
  }

  if (product.priceTrend.direction === "FLAT") {
    return "价格持平";
  }

  const direction = product.priceTrend.direction === "UP" ? "上涨" : "下降";
  return `${direction} ¥${Math.abs(product.priceTrend.changeAmount)}`;
}
