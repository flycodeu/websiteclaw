"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Search } from "lucide-react";
import { productCategoryLabels } from "@shop-claw/shared/labels";
import { ApiResponse, ProductCategory } from "@shop-claw/shared/types";
import { ProductAvailabilityFilter, ProductFeedItem, ProductFeedPage } from "@/lib/product-feed";

interface ProductListBoardProps {
  initialPage: ProductFeedPage;
}

type LoadMode = "idle" | "replace" | "append";

interface ProductCategorySection {
  category: ProductCategory;
  items: ProductFeedItem[];
  priceRangeLabel: string;
}

export function ProductListBoard({ initialPage }: ProductListBoardProps) {
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [availability, setAvailability] = useState<ProductAvailabilityFilter>("IN_STOCK");
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [page, setPage] = useState(initialPage);
  const [loadMode, setLoadMode] = useState<LoadMode>("idle");
  const [error, setError] = useState("");
  const hydratedRef = useRef(false);
  const deferredKeyword = useDeferredValue(keyword);

  function handleAvailabilityChange(nextAvailability: ProductAvailabilityFilter) {
    setAvailability(nextAvailability);
    setActiveCategory("ALL");
  }

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    const controller = new AbortController();

    async function refreshPage() {
      setLoadMode("replace");
      setError("");

      try {
        const response = await fetch(
          buildProductsUrl({ availability, activeCategory, keyword: deferredKeyword, minPrice, maxPrice }),
          {
            signal: controller.signal,
            cache: "no-store"
          }
        );
        const payload = (await response.json()) as ApiResponse<ProductFeedPage>;

        if (!response.ok || payload.code !== 0 || !payload.data) {
          throw new Error(payload.message || "商品列表加载失败");
        }

        startTransition(() => {
          setPage(payload.data);
          setLoadMode("idle");
        });
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadMode("idle");
        setError(fetchError instanceof Error ? fetchError.message : "商品列表加载失败");
      }
    }

    void refreshPage();

    return () => controller.abort();
  }, [availability, activeCategory, deferredKeyword, minPrice, maxPrice]);

  async function handleLoadMore() {
    if (!page.nextCursor || loadMode !== "idle") {
      return;
    }

    setLoadMode("append");
    setError("");

    try {
      const response = await fetch(
        buildProductsUrl({
          availability,
          activeCategory,
          keyword: deferredKeyword,
          minPrice,
          maxPrice,
          cursor: page.nextCursor
        }),
        {
          cache: "no-store"
        }
      );
      const payload = (await response.json()) as ApiResponse<ProductFeedPage>;

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "更多商品加载失败");
      }

      startTransition(() => {
        setPage((current) => ({
          ...payload.data,
          items: [...current.items, ...payload.data.items]
        }));
        setLoadMode("idle");
      });
    } catch (fetchError) {
      setLoadMode("idle");
      setError(fetchError instanceof Error ? fetchError.message : "更多商品加载失败");
    }
  }

  const isLoading = loadMode === "replace";
  const isAppending = loadMode === "append";
  const productSections = buildProductSections(page.items, page.categories);

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98)_0%,rgba(247,240,230,0.92)_100%)] p-4 shadow-[0_18px_48px_rgba(53,44,30,0.08)] sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_150px_150px_auto]">
          <label className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)] md:col-span-2 xl:col-span-1">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索商品或商家"
              className="w-full min-w-0 bg-transparent text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]/70"
            />
          </label>

          <label className="flex items-center rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
            <select
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value as "ALL" | ProductCategory)}
              className="w-full bg-transparent text-[color:var(--ink)] outline-none"
            >
              <option value="ALL">全部类型</option>
              {page.categories.map((category) => (
                <option key={category} value={category}>
                  {productCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>

          <PriceInput value={minPrice} onChange={setMinPrice} placeholder="最低价" />
          <PriceInput value={maxPrice} onChange={setMaxPrice} placeholder="最高价" />

          <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
            <AvailabilityChip active={availability === "IN_STOCK"} label="有货" onClick={() => handleAvailabilityChange("IN_STOCK")} />
            <AvailabilityChip active={availability === "OUT_OF_STOCK"} label="无货" onClick={() => handleAvailabilityChange("OUT_OF_STOCK")} />
            <AvailabilityChip active={availability === "ALL"} label="全部" onClick={() => handleAvailabilityChange("ALL")} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <CategoryChip active={activeCategory === "ALL"} label={`全部 ${page.summary.total}`} onClick={() => setActiveCategory("ALL")} />
          {page.categories.map((category) => (
            <CategoryChip
              key={category}
              active={activeCategory === category}
              label={productCategoryLabels[category]}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>
      </section>

      {error ? (
        <section className="rounded-[24px] border border-[#efc8bb] bg-[#fff4ef] px-5 py-4 text-sm text-[#8a3f27]">{error}</section>
      ) : null}

      <section className="relative min-h-[240px]">
        {isLoading ? <LoadingCurtain /> : null}

        {page.items.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-[color:var(--line-strong)] bg-[rgba(255,250,242,0.86)] px-6 py-16 text-center text-[color:var(--muted)] shadow-[0_16px_40px_rgba(53,44,30,0.06)]">
            当前筛选条件下没有可展示的商品。
          </div>
        ) : (
          <div className="space-y-4">
            {productSections.map((section) => (
              <article
                key={section.category}
                className="rounded-[28px] border border-[color:var(--line-strong)] bg-[rgba(255,251,246,0.92)] p-4 shadow-[0_16px_40px_rgba(53,44,30,0.07)] sm:p-5"
              >
                <div className="flex flex-col gap-3 border-b border-[color:var(--line-soft)] pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-[color:var(--line-strong)] bg-white/82 px-3 py-1 text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      {productCategoryLabels[section.category]}
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--muted)]">当前分类已按价格从低到高排列，方便横向比价。</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SectionMetaToken label={`${section.items.length} 件商品`} />
                    <SectionMetaToken label={section.priceRangeLabel} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {page.nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isAppending}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-[rgba(255,251,246,0.96)] px-5 py-3 text-sm text-[color:var(--ink)] shadow-[0_12px_32px_rgba(53,44,30,0.08)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAppending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {isAppending ? "正在加载" : "继续加载更多"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const InStockProductsBoard = ProductListBoard;

function buildProductSections(items: ProductFeedItem[], categoryOrder: ProductCategory[]): ProductCategorySection[] {
  const grouped = new Map<ProductCategory, ProductFeedItem[]>();

  for (const item of items) {
    const existing = grouped.get(item.category);

    if (existing) {
      existing.push(item);
      continue;
    }

    grouped.set(item.category, [item]);
  }

  const orderedCategories = [
    ...categoryOrder.filter((category) => grouped.has(category)),
    ...Array.from(grouped.keys()).filter((category) => !categoryOrder.includes(category))
  ];

  return orderedCategories.map((category) => {
    const sectionItems = [...(grouped.get(category) ?? [])].sort(compareProductItemsByPrice);

    return {
      category,
      items: sectionItems,
      priceRangeLabel: formatSectionPriceRange(sectionItems)
    };
  });
}

function compareProductItemsByPrice(left: ProductFeedItem, right: ProductFeedItem) {
  if (left.price === 0) {
    return right.price === 0 ? 0 : 1;
  }

  if (right.price === 0) {
    return -1;
  }

  const priceDiff = left.price - right.price;
  if (priceDiff !== 0) {
    return priceDiff;
  }

  const nameDiff = left.rawName.localeCompare(right.rawName, "zh-CN");
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function formatSectionPriceRange(items: ProductFeedItem[]) {
  const prices = items.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);

  if (prices.length === 0) {
    return "暂无有效价格";
  }

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  if (lowest === highest) {
    return `当前价 ¥${formatPriceValue(lowest)}`;
  }

  return `¥${formatPriceValue(lowest)} - ¥${formatPriceValue(highest)}`;
}

function formatPriceValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, "");
}

function ProductCard({ item }: { item: ProductFeedItem }) {
  const specialAccountLabel = getSpecialAccountLabel(item);
  const tone = getCardTone(item, Boolean(specialAccountLabel));
  const priceLabel = item.price > 0 ? `¥${item.price}` : "--";

  const card = (
    <div
      className={`relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-[24px] border px-4 py-3.5 shadow-[0_12px_30px_rgba(53,44,30,0.07)] transition duration-200 sm:min-h-[112px] ${tone.card} ${
        item.shopUrl ? "hover:-translate-y-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 title={item.rawName} className={`min-w-0 flex-1 break-words text-[15px] font-semibold leading-5 sm:leading-6 ${tone.title}`}>
          {item.rawName}
        </h2>
        <div className={`shrink-0 font-mono text-[1.02rem] font-semibold leading-6 ${tone.price}`}>{priceLabel}</div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div title={item.shopName} className={`min-w-0 break-words text-xs ${tone.meta}`}>
          {item.shopName || "未命名店铺"}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {specialAccountLabel ? <CardBadge label={specialAccountLabel} tone="muted" /> : null}
          {!specialAccountLabel && !item.isDetected ? <CardBadge label="缺席" tone="muted" /> : null}
          {!specialAccountLabel && item.isDetected && item.stockStatus === "OUT_OF_STOCK" ? <CardBadge label="缺货" tone="danger" /> : null}
          {!specialAccountLabel && item.isDetected && item.stockStatus === "LOW_STOCK" ? <CardBadge label="少量" tone="warn" /> : null}
          {item.shopUrl ? <ArrowUpRight className={`h-4 w-4 ${tone.icon}`} /> : null}
        </div>
      </div>
    </div>
  );

  if (!item.shopUrl) {
    return card;
  }

  return (
    <a href={item.shopUrl} target="_blank" rel="noreferrer" className="block">
      {card}
    </a>
  );
}

function SectionMetaToken({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[color:var(--line-strong)] bg-[color:var(--paper-soft)] px-3 py-1.5 text-xs text-[color:var(--muted)]">
      {label}
    </span>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "border border-[#1c4336] bg-[#1c4336] text-white shadow-[0_10px_24px_rgba(28,67,54,0.22)]"
          : "border border-[color:var(--line-strong)] bg-white/74 text-[color:var(--muted)] hover:border-[#c8bba6] hover:text-[color:var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}

function AvailabilityChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[72px] rounded-full px-4 py-2 text-sm transition ${
        active
          ? "border border-[#2d4f44] bg-[#2d4f44] text-white shadow-[0_10px_24px_rgba(45,79,68,0.20)]"
          : "border border-[color:var(--line-strong)] bg-white/80 text-[color:var(--muted)] hover:border-[#c8bba6] hover:text-[color:var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}

function CardBadge({
  label,
  tone
}: {
  label: string;
  tone: "muted" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border border-[#e4c3b8] bg-[#fff2ed] text-[#93452e]"
      : tone === "warn"
        ? "border border-[#ebd7a8] bg-[#fff6dd] text-[#896313]"
        : "border border-[#d5d9de] bg-[#f3f4f6] text-[#5d6570]";

  return <span className={`rounded-full px-2.5 py-1 text-[11px] leading-none ${toneClass}`}>{label}</span>;
}

function PriceInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
      <span>¥</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]/70"
      />
    </label>
  );
}

function LoadingCurtain() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[30px] bg-[rgba(250,244,236,0.72)] backdrop-blur-[2px]">
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-white/88 px-4 py-2 text-sm text-[color:var(--muted)] shadow-[0_12px_30px_rgba(53,44,30,0.08)]">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        正在刷新商品列表
      </div>
    </div>
  );
}

function buildProductsUrl({
  availability,
  activeCategory,
  keyword,
  minPrice,
  maxPrice,
  cursor
}: {
  availability: ProductAvailabilityFilter;
  activeCategory: "ALL" | ProductCategory;
  keyword: string;
  minPrice: string;
  maxPrice: string;
  cursor?: string | null;
}) {
  const search = new URLSearchParams();

  if (availability !== "ALL") {
    search.set("availability", availability);
  }

  if (activeCategory !== "ALL") {
    search.set("category", activeCategory);
  }

  if (keyword.trim()) {
    search.set("keyword", keyword.trim());
  }

  if (minPrice.trim()) {
    search.set("minPrice", minPrice.trim());
  }

  if (maxPrice.trim()) {
    search.set("maxPrice", maxPrice.trim());
  }

  if (cursor) {
    search.set("cursor", cursor);
  }

  search.set("limit", "24");
  return `/api/products?${search.toString()}`;
}

function getCardTone(item: ProductFeedItem, accountless: boolean) {
  if (accountless) {
    return {
      card: "border-[#cfd6de] bg-[linear-gradient(180deg,#f4f6f8_0%,#e8edf2_100%)] shadow-[0_16px_30px_rgba(84,96,111,0.10)]",
      title: "text-[#425062]",
      price: "text-[#425062]",
      meta: "text-[#6d7b8c]",
      icon: "text-[#6d7b8c]"
    };
  }

  if (!item.isDetected || item.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-[#c8d0d8] bg-[linear-gradient(180deg,#f1f4f7_0%,#e1e7ee_100%)] shadow-[0_16px_30px_rgba(84,96,111,0.12)]",
      title: "text-[#3f4d5f]",
      price: "text-[#3f4d5f]",
      meta: "text-[#6a7888]",
      icon: "text-[#6a7888]"
    };
  }

  if (item.stockStatus === "LOW_STOCK") {
    return {
      card: "border-[#e3c27b] bg-[linear-gradient(180deg,#fff7e8_0%,#ffe6b3_100%)] shadow-[0_14px_30px_rgba(180,129,27,0.16)]",
      title: "text-[#6e5213]",
      price: "text-[#6e5213]",
      meta: "text-[#8e722f]",
      icon: "text-[#8e722f]"
    };
  }

  return {
    card: "border-[#dde3ea] bg-[linear-gradient(180deg,#ffffff_0%,#f5f8fb_100%)] shadow-[0_16px_32px_rgba(84,96,111,0.10)] hover:border-[#a8b5c3]",
    title: "text-[color:var(--ink)]",
    price: "text-[color:var(--ink)]",
    meta: "text-[#667487]",
    icon: "text-[#667487]"
  };
}

function getSpecialAccountLabel(item: Pick<ProductFeedItem, "rawName" | "specLabel">) {
  const text = `${item.rawName} ${item.specLabel}`.toLowerCase();

  if (text.includes("无号")) {
    return "无号";
  }

  if (text.includes("白号")) {
    return "白号";
  }

  if (text.includes("普号")) {
    return "普号";
  }

  return null;
}
