"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Search } from "lucide-react";
import { formatDateLabel, productCategoryLabels } from "@shop-claw/shared/labels";
import { ApiResponse, ProductCategory, PublishedMeta } from "@shop-claw/shared/types";
import { ProductFeedItem, ProductFeedPage } from "@/lib/product-feed";

interface ProductListBoardProps {
  initialPage: ProductFeedPage;
  latestSyncAt: string;
  meta: PublishedMeta;
}

type LoadMode = "idle" | "replace" | "append";

export function ProductListBoard({ initialPage, latestSyncAt, meta }: ProductListBoardProps) {
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [page, setPage] = useState(initialPage);
  const [loadMode, setLoadMode] = useState<LoadMode>("idle");
  const [error, setError] = useState("");
  const hydratedRef = useRef(false);
  const deferredKeyword = useDeferredValue(keyword);

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
        const response = await fetch(buildProductsUrl({ activeCategory, keyword: deferredKeyword, minPrice, maxPrice }), {
          signal: controller.signal,
          cache: "no-store"
        });
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
  }, [activeCategory, deferredKeyword, minPrice, maxPrice]);

  async function handleLoadMore() {
    if (!page.nextCursor || loadMode !== "idle") {
      return;
    }

    setLoadMode("append");
    setError("");

    try {
      const response = await fetch(
        buildProductsUrl({
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

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98)_0%,rgba(247,240,230,0.92)_100%)] p-4 shadow-[0_18px_48px_rgba(53,44,30,0.08)] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-serif text-[2rem] leading-tight text-[color:var(--ink)] sm:text-[2.45rem]">商品列表</h1>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <CompactStat label="当前展示" value={`${page.summary.total}`} />
            <CompactStat label="有货" value={`${page.summary.inStock}`} />
            <CompactStat label="公开店铺" value={`${meta.shopCount}`} />
            <CompactStat label="同步时间" value={formatDateLabel(latestSyncAt)} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_180px_150px_150px]">
          <label className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((item) => (
              <ProductCard key={item.id} item={item} />
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

function ProductCard({ item }: { item: ProductFeedItem }) {
  const specialAccountLabel = getSpecialAccountLabel(item);
  const tone = getCardTone(item, Boolean(specialAccountLabel));
  const priceLabel = item.price > 0 ? `¥${item.price}` : "--";

  const card = (
    <div
      className={`flex min-h-[112px] flex-col justify-between rounded-[24px] border px-4 py-3.5 shadow-[0_12px_30px_rgba(53,44,30,0.07)] transition duration-200 ${tone.card} ${
        item.shopUrl ? "hover:-translate-y-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 title={item.rawName} className={`min-w-0 flex-1 truncate text-[15px] font-semibold leading-6 ${tone.title}`}>
          {item.rawName}
        </h2>
        <div className={`shrink-0 font-mono text-[1.02rem] font-semibold leading-6 ${tone.price}`}>{priceLabel}</div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div title={item.shopName} className={`min-w-0 truncate text-xs ${tone.meta}`}>
          {item.shopName || "未命名店铺"}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[18px] border border-[color:var(--line-soft)] bg-white/78 px-4 py-3 shadow-[0_10px_24px_rgba(53,44,30,0.05)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-[color:var(--ink)]">{value}</div>
    </article>
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
    <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--line-soft)] bg-[color:var(--paper-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
      <span>¥</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full bg-transparent text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]/70"
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
  activeCategory,
  keyword,
  minPrice,
  maxPrice,
  cursor
}: {
  activeCategory: "ALL" | ProductCategory;
  keyword: string;
  minPrice: string;
  maxPrice: string;
  cursor?: string | null;
}) {
  const search = new URLSearchParams();

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
      card: "border-[#d5d9de] bg-[linear-gradient(180deg,#f3f4f6_0%,#e8ebef_100%)]",
      title: "text-[#48515d]",
      price: "text-[#48515d]",
      meta: "text-[#6b7280]",
      icon: "text-[#6b7280]"
    };
  }

  if (!item.isDetected || item.stockStatus === "OUT_OF_STOCK") {
    return {
      card: "border-[#ecd0c4] bg-[linear-gradient(180deg,#fff7f4_0%,#fbece4_100%)]",
      title: "text-[#7a4431]",
      price: "text-[#7a4431]",
      meta: "text-[#9a6554]",
      icon: "text-[#9a6554]"
    };
  }

  if (item.stockStatus === "LOW_STOCK") {
    return {
      card: "border-[#efdfb4] bg-[linear-gradient(180deg,#fffaf1_0%,#fff1d3_100%)]",
      title: "text-[#6e5213]",
      price: "text-[#6e5213]",
      meta: "text-[#8e722f]",
      icon: "text-[#8e722f]"
    };
  }

  return {
    card: "border-[color:var(--line-strong)] bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e6_100%)] hover:border-[#c8bba6]",
    title: "text-[color:var(--ink)]",
    price: "text-[color:var(--ink)]",
    meta: "text-[color:var(--muted)]",
    icon: "text-[color:var(--muted)]"
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
