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
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 transition-all">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_180px_150px_150px_auto]">
          <label className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all md:col-span-2 xl:col-span-1">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索商品或商家"
              className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>

          <label className="flex items-center rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all">
            <select
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value as "ALL" | ProductCategory)}
              className="w-full bg-transparent text-zinc-900 outline-none cursor-pointer"
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

        <div className="mt-5 flex flex-wrap gap-2">
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
        <section className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</section>
      ) : null}

      <section className="relative min-h-[240px]">
        {isLoading ? <LoadingCurtain /> : null}

        {page.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center text-sm text-zinc-500">
            当前筛选条件下没有可展示的商品。
          </div>
        ) : (
          <div className="space-y-6">
            {productSections.map((section) => (
              <article
                key={section.category}
                className="rounded-2xl border border-zinc-200 bg-white/60 p-4 shadow-sm backdrop-blur-md sm:p-5"
              >
                <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs uppercase tracking-widest text-zinc-600 font-medium shadow-sm">
                      {productCategoryLabels[section.category]}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SectionMetaToken label={`${section.items.length} 件商品`} />
                    <SectionMetaToken label={section.priceRangeLabel} />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isAppending}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
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
      className={`group relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-2xl border px-4 py-4 transition-all duration-200 sm:min-h-[112px] ${tone.card} ${
        item.shopUrl ? "hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className={`font-mono text-[1.15rem] font-semibold tracking-tight ${tone.price}`}>{priceLabel}</div>
        <h2 title={item.rawName} className={`break-words text-[15px] font-medium leading-relaxed ${tone.title}`}>
          {item.rawName}
        </h2>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div title={item.shopName} className={`min-w-0 break-words text-xs ${tone.meta}`}>
          {item.shopName || "未命名店铺"}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {specialAccountLabel ? <CardBadge label={specialAccountLabel} tone="muted" /> : null}
          {!specialAccountLabel && !item.isDetected ? <CardBadge label="缺席" tone="muted" /> : null}
          {!specialAccountLabel && item.isDetected && item.stockStatus === "OUT_OF_STOCK" ? <CardBadge label="缺货" tone="danger" /> : null}
          {!specialAccountLabel && item.isDetected && item.stockStatus === "LOW_STOCK" ? <CardBadge label="少量" tone="warn" /> : null}
          {item.shopUrl ? <ArrowUpRight className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${tone.icon}`} /> : null}
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
    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500 font-medium">
      {label}
    </span>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-zinc-900 text-white shadow-sm"
          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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
      className={`min-w-[72px] rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-zinc-800 text-white shadow-sm"
          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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
      ? "border-red-200 bg-red-50 text-red-600 font-bold"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700 font-medium"
        : "border-zinc-200 bg-zinc-100 text-zinc-500 font-medium";

  return <span className={`rounded-full border px-2 py-0.5 text-[11px] leading-none ${toneClass}`}>{label}</span>;
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
    <label className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all">
      <span className="font-mono text-zinc-400">¥</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
      />
    </label>
  );
}

function LoadingCurtain() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 shadow-sm">
        <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" />
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
      card: "border-zinc-200 bg-zinc-50/50 shadow-sm",
      title: "text-zinc-600",
      price: "text-zinc-600",
      meta: "text-zinc-400",
      icon: "text-zinc-400"
    };
  }

  if (!item.isDetected || item.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-zinc-200 bg-zinc-100/50 shadow-sm opacity-90",
      title: "text-zinc-500",
      price: "text-zinc-500",
      meta: "text-zinc-400",
      icon: "text-zinc-400"
    };
  }

  if (item.stockStatus === "LOW_STOCK") {
    return {
      card: "border-amber-200 bg-amber-50/30 shadow-sm",
      title: "text-amber-900",
      price: "text-amber-700",
      meta: "text-amber-600/80",
      icon: "text-amber-600/80"
    };
  }

  return {
    card: "border-zinc-200 bg-white shadow-sm hover:border-zinc-300",
    title: "text-zinc-900",
    price: "text-zinc-900",
    meta: "text-zinc-500",
    icon: "text-zinc-400"
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
