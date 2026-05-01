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
    <div className="space-y-5">
      <section className="rounded-[30px] border border-[color:var(--line-strong)] bg-[rgba(255,252,246,0.92)] p-4 shadow-[0_16px_44px_rgba(53,44,30,0.08)] sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_190px_190px]">
          <label className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索店铺或商品类型"
              className="w-full min-w-0 bg-transparent text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]/70"
            />
          </label>

          <label className="flex items-center rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "ALL" | ShopSummary["status"])}
              className="w-full bg-transparent text-[color:var(--ink)] outline-none"
            >
              <option value="ALL">全部状态</option>
              <option value="OPEN">正常</option>
              <option value="RISK">异常</option>
              <option value="CLOSED">关闭</option>
            </select>
          </label>

          <label className="flex items-center rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "updated" | "price")}
              className="w-full bg-transparent text-[color:var(--ink)] outline-none"
            >
              <option value="updated">按最近更新</option>
              <option value="price">按最低价</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredShops.map((shop) => (
          <button
            key={shop.shopId}
            type="button"
            onClick={() => setActiveId(shop.shopId)}
            className="group rounded-[24px] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,#fffdf9_0%,#f7efe4_100%)] p-4 text-left shadow-[0_12px_32px_rgba(53,44,30,0.07)] transition hover:-translate-y-1 hover:border-[#c8bba6]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[1.05rem] font-semibold text-[color:var(--ink)]">{shop.name}</h2>
                <div className="mt-1 text-xs text-[color:var(--muted)]">{formatDateLabel(shop.lastCrawledAt)}</div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${getShopStatusTone(shop.status)}`}>
                {shopStatusLabels[shop.status]}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <SummaryToken label={`${shop.productCount} 商品`} />
              <SummaryToken label={`${shop.inStockCount} 有货`} />
              <SummaryToken label={shop.lowestPrice > 0 ? `¥${shop.lowestPrice}` : "暂无价格"} />
            </div>

            <div className="mt-3 truncate text-xs text-[color:var(--muted)]">
              {shop.categories.map((category) => productCategoryLabels[category]).join(" · ") || "未分类"}
            </div>
          </button>
        ))}

        {filteredShops.length === 0 ? (
          <div className="col-span-full rounded-[28px] border border-dashed border-[color:var(--line-strong)] bg-[rgba(255,250,242,0.86)] px-5 py-16 text-center text-[color:var(--muted)]">
            当前没有匹配的店铺。
          </div>
        ) : null}
      </section>

      {activeShop ? (
        <div className="fixed inset-0 z-50 bg-[rgba(20,28,35,0.26)] backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="关闭店铺详情"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setActiveId(null)}
          />

          <aside className="absolute inset-4 z-10 flex flex-col overflow-hidden rounded-[32px] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,#fffdf8_0%,#f6ecdd_100%)] shadow-[0_28px_90px_rgba(19,28,35,0.22)] sm:inset-6 xl:inset-10">
            <div className="border-b border-[color:var(--line-strong)] px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs ${getShopStatusTone(activeShop.status)}`}>
                      {shopStatusLabels[activeShop.status]}
                    </span>
                    <span className="rounded-full border border-[color:var(--line-strong)] bg-white/76 px-3 py-1 text-xs text-[color:var(--muted)]">
                      {formatDateLabel(activeShop.lastCrawledAt)}
                    </span>
                  </div>
                  <h2 className="mt-3 break-words font-serif text-[2.35rem] leading-tight text-[color:var(--ink)]">
                    {activeShop.name}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {activeShop.url ? (
                    <a
                      href={activeShop.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-white/82 px-4 py-2 text-sm text-[color:var(--ink)] shadow-[0_10px_24px_rgba(53,44,30,0.06)]"
                    >
                      打开原站点
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-white/82 text-[color:var(--muted)] shadow-[0_10px_24px_rgba(53,44,30,0.06)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <Tile label="商品总数" value={`${activeShop.productCount}`} />
                <Tile label="当前有货" value={`${activeShop.inStockCount}`} />
                <Tile label="库存紧张" value={`${activeShop.lowStockCount}`} />
                <Tile label="当前离线" value={`${activeShop.outOfStockCount}`} />
              </div>

              {activeDetail ? (
                <div className="mt-5 flex flex-wrap gap-2">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {loadingDetail ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-white/84 px-4 py-2 text-sm text-[color:var(--muted)] shadow-[0_10px_24px_rgba(53,44,30,0.06)]">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    正在读取单店详情
                  </div>
                </div>
              ) : detailError ? (
                <div className="rounded-[24px] border border-[#ecd0c4] bg-[#fff4ef] px-5 py-4 text-sm text-[#8a3f27]">{detailError}</div>
              ) : activeDetail ? (
                <div className="space-y-6">
                  <section className="rounded-[24px] border border-[color:var(--line-strong)] bg-white/72 p-4 shadow-[0_12px_32px_rgba(53,44,30,0.06)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-[color:var(--ink)]">商品列表</h3>
                        <div className="mt-1 text-sm text-[color:var(--muted)]">弹窗会根据屏幕宽度自动调整列数，方便集中查看单店全部商品。</div>
                      </div>
                      <span className="rounded-full border border-[color:var(--line-strong)] bg-[color:var(--paper-soft)] px-3 py-1 text-xs text-[color:var(--muted)]">
                        当前 {visibleProducts.length} 件
                      </span>
                    </div>

                    {visibleProducts.length === 0 ? (
                      <div className="mt-4 rounded-[24px] border border-dashed border-[color:var(--line-strong)] bg-[color:var(--paper-soft)] px-5 py-14 text-center text-[color:var(--muted)]">
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[20px] border border-[color:var(--line-strong)] bg-white/78 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold text-[color:var(--ink)]">{value}</div>
    </article>
  );
}

function SummaryToken({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[color:var(--line-strong)] bg-white/76 px-3 py-1 text-xs text-[color:var(--muted)]">
      {label}
    </span>
  );
}

function CategoryFilter({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "border border-[#1c4336] bg-[#1c4336] text-white shadow-[0_10px_24px_rgba(28,67,54,0.18)]"
          : "border border-[color:var(--line-strong)] bg-white/76 text-[color:var(--muted)] hover:border-[#c8bba6] hover:text-[color:var(--ink)]"
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
    <article className={`relative overflow-hidden rounded-[24px] border p-4 shadow-[0_12px_32px_rgba(53,44,30,0.08)] ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--line-strong)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {productCategoryLabels[product.category]}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs ${tone.stockBadge}`}>
              {product.current.isDetected ? stockStatusLabels[product.current.stockStatus] : `缺席 ${product.missingStreak} 次`}
            </span>
          </div>
          <h3 className={`mt-3 break-words text-lg font-semibold ${tone.title}`}>{product.current.rawName}</h3>
          <div className={`mt-1 text-sm ${tone.meta}`}>{product.specLabel || "未标注规格"}</div>
        </div>

        <div className="text-right">
          <div className={`font-mono text-[1.8rem] font-semibold ${tone.price}`}>{priceLabel}</div>
          <div className={`mt-1 text-xs ${tone.meta}`}>{formatDateLabel(product.current.updatedAt)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <MiniTag label={productStatusLabels[product.current.status]} />
        <MiniTag label={formatWarrantyLabel(product.current.warrantySupported)} />
        <MiniTag label={`价格样本 ${product.priceSampleCount}`} />
        {product.priceTrend.previousPrice !== null ? <MiniTag label={formatTrend(product)} /> : null}
      </div>

      <div className={`mt-4 rounded-[18px] border p-3 text-sm leading-6 ${tone.surface}`}>
        {product.current.inventoryText || "未提供库存说明"}
      </div>
    </article>
  );
}

function MiniTag({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[color:var(--line-strong)] bg-white/74 px-3 py-1 text-xs text-[color:var(--muted)]">
      {label}
    </span>
  );
}

function getShopStatusTone(status: ShopSummary["status"]) {
  if (status === "OPEN") {
    return "border border-[#cfe4cf] bg-[#edf6ea] text-[#214f35]";
  }

  if (status === "RISK") {
    return "border border-[#efdfb4] bg-[#fff3c8] text-[#835f11]";
  }

  return "border border-[#ecd0c4] bg-[#fff1ea] text-[#8a3f27]";
}

function getProductTone(product: PublishedShopProductPreview) {
  if (!product.current.isDetected) {
    return {
      card: "border-[#cfd6de] bg-[linear-gradient(180deg,#f4f6f8_0%,#e8edf2_100%)] shadow-[0_16px_32px_rgba(84,96,111,0.10)]",
      stockBadge: "border border-[#c3ccd5] bg-[#e5eaef] text-[#4c5b6d]",
      title: "text-[#425062]",
      price: "text-[#425062]",
      meta: "text-[#6d7b8c]",
      surface: "border-[#dbe2e9] bg-[rgba(255,255,255,0.72)] text-[#6d7b8c]"
    };
  }

  if (product.current.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-[#c8d0d8] bg-[linear-gradient(180deg,#f1f4f7_0%,#e1e7ee_100%)] shadow-[0_16px_32px_rgba(84,96,111,0.12)]",
      stockBadge: "border border-[#e9b8b8] bg-[#f7e5e5] text-[#c93c3c]",
      title: "text-[#3f4d5f]",
      price: "text-[#3f4d5f]",
      meta: "text-[#6a7888]",
      surface: "border-[#d7dfe7] bg-[rgba(255,255,255,0.76)] text-[#6a7888]"
    };
  }

  if (product.current.stockStatus === "LOW_STOCK") {
    return {
      card: "border-[#e3c27b] bg-[linear-gradient(180deg,#fff7e8_0%,#ffe6b3_100%)] shadow-[0_16px_34px_rgba(180,129,27,0.16)]",
      stockBadge: "border border-[#e3c27b] bg-[#fff0b8] text-[#835f11]",
      title: "text-[#6e5213]",
      price: "text-[#6e5213]",
      meta: "text-[#8e722f]",
      surface: "border-white/60 bg-white/74 text-[#8e722f]"
    };
  }

  return {
    card: "border-[#dde3ea] bg-[linear-gradient(180deg,#ffffff_0%,#f6f8fb_100%)] shadow-[0_16px_32px_rgba(84,96,111,0.10)]",
    stockBadge: "border border-[#d5dee7] bg-white text-[#2b3947]",
    title: "text-[color:var(--ink)]",
    price: "text-[color:var(--ink)]",
    meta: "text-[#667487]",
    surface: "border-[#edf1f5] bg-[rgba(248,250,252,0.92)] text-[#667487]"
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
