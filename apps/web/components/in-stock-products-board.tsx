"use client";

import { useDeferredValue, useState } from "react";
import { Search } from "lucide-react";
import { productCategoryLabels } from "@shop-claw/shared/labels";
import { ProductCategory } from "@shop-claw/shared/types";
import { isDimmedProductFeedItem, ProductFeedItem } from "@/lib/product-feed";

interface ProductListBoardProps {
  items: ProductFeedItem[];
  categories: ProductCategory[];
  latestSyncAt: string;
}

type CategoryTheme = {
  panel: string;
  dot: string;
};

const categoryThemes = {
  CHATGPT: {
    panel: "border-[#cfe1dc] bg-[linear-gradient(180deg,#fffdf9_0%,#f2fbf8_100%)]",
    dot: "bg-[#2d8277]"
  },
  CLAUDE: {
    panel: "border-[#ead3b4] bg-[linear-gradient(180deg,#fffdf9_0%,#fff6ea_100%)]",
    dot: "bg-[#c88224]"
  },
  GEMINI: {
    panel: "border-[#cfd9ee] bg-[linear-gradient(180deg,#fffdf9_0%,#f3f7ff_100%)]",
    dot: "bg-[#557bc4]"
  },
  PERPLEXITY: {
    panel: "border-[#e6d2dd] bg-[linear-gradient(180deg,#fffdf9_0%,#fdf3f8_100%)]",
    dot: "bg-[#b8618a]"
  },
  GROK: {
    panel: "border-[#d7dbe2] bg-[linear-gradient(180deg,#fffdf9_0%,#f5f7fa_100%)]",
    dot: "bg-[#5d7087]"
  },
  GOOGLE_ACCOUNT: {
    panel: "border-[#d3e1c8] bg-[linear-gradient(180deg,#fffdf9_0%,#f5fbef_100%)]",
    dot: "bg-[#62893e]"
  },
  VIRTUAL_CARD: {
    panel: "border-[#e4d5c8] bg-[linear-gradient(180deg,#fffdf9_0%,#faf4ee_100%)]",
    dot: "bg-[#a86a4d]"
  },
  APPLE_ACCOUNT: {
    panel: "border-[#d7dde6] bg-[linear-gradient(180deg,#fffdf9_0%,#f4f7fb_100%)]",
    dot: "bg-[#69809f]"
  },
  OTHER: {
    panel: "border-[#ddd5c7] bg-[linear-gradient(180deg,#fffdf9_0%,#f8f4ed_100%)]",
    dot: "bg-[#8c7a67]"
  }
} satisfies Record<ProductCategory, CategoryTheme>;

export function ProductListBoard({ items, categories }: ProductListBoardProps) {
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [activeCategory, setActiveCategory] = useState<"ALL" | ProductCategory>("ALL");
  const deferredKeyword = useDeferredValue(keyword);

  const filteredItems = items
    .filter((item) => matchesKeyword(item, deferredKeyword))
    .filter((item) => matchesPrice(item, minPrice, maxPrice));

  const groupedSections = categories
    .filter((category) => activeCategory === "ALL" || category === activeCategory)
    .map((category) => ({
      category,
      items: filteredItems.filter((item) => item.category === category)
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="space-y-5">
      <section className="rise-in rounded-[30px] border border-[#e6d9bf] bg-white/84 p-4 shadow-[0_18px_45px_rgba(102,88,64,0.08)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_160px_160px]">
          <label className="flex items-center rounded-[20px] border border-[#eadcc2] bg-[#fffaf2] px-4 py-3 text-sm text-slate-500">
            <select
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value as "ALL" | ProductCategory)}
              className="w-full bg-transparent text-[#2b241d] outline-none"
            >
              <option value="ALL">全部类型</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {productCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 items-center gap-3 rounded-[20px] border border-[#eadcc2] bg-[#fffaf2] px-4 py-3 text-sm text-slate-500">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索商品名称、店铺或类型"
              className="w-full min-w-0 bg-transparent text-[#2b241d] outline-none placeholder:text-slate-400"
            />
          </label>

          <label className="flex items-center gap-3 rounded-[20px] border border-[#eadcc2] bg-[#fffaf2] px-4 py-3 text-sm text-slate-500">
            <span>¥</span>
            <input
              inputMode="decimal"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="最低价"
              className="w-full bg-transparent text-[#2b241d] outline-none placeholder:text-slate-400"
            />
          </label>

          <label className="flex items-center gap-3 rounded-[20px] border border-[#eadcc2] bg-[#fffaf2] px-4 py-3 text-sm text-slate-500">
            <span>¥</span>
            <input
              inputMode="decimal"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="最高价"
              className="w-full bg-transparent text-[#2b241d] outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
      </section>

      {groupedSections.length === 0 ? (
        <section className="rise-in rounded-[30px] border border-dashed border-[#d8cfbf] bg-[#fffaf2] px-5 py-14 text-center text-slate-500 shadow-[0_18px_45px_rgba(102,88,64,0.06)] sm:px-6">
          当前筛选条件下没有可展示的商品。
        </section>
      ) : (
        <div className="space-y-5">
          {groupedSections.map((section, index) => {
            const theme = categoryThemes[section.category];

            return (
              <section
                key={section.category}
                className={`rise-in overflow-hidden rounded-[30px] border shadow-[0_18px_45px_rgba(102,88,64,0.08)] ${theme.panel}`}
                style={{ animationDelay: `${index * 0.04}s` }}
              >
                <div className="flex items-center justify-between border-b border-[#e8dcc8] px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                    <h2 className="font-serif text-[1.55rem] text-[#2b241d]">{productCategoryLabels[section.category]}</h2>
                  </div>
                  <div className="text-sm text-slate-500">{section.items.length}</div>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-2 sm:p-6">
                  {section.items.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const InStockProductsBoard = ProductListBoard;

function ProductCard({ item }: { item: ProductFeedItem }) {
  const dimmed = isDimmedProduct(item);
  const priceLabel = item.price > 0 ? `¥${item.price}` : "--";
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <h3
          className={`overflow-hidden text-lg font-semibold leading-7 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${
            dimmed ? "text-slate-400" : "text-[#2b241d]"
          }`}
        >
          {item.rawName}
        </h3>

        <div className={`mt-4 text-xs ${dimmed ? "text-slate-400" : "text-slate-500"}`}>{item.shopName}</div>
      </div>

      <div className={`shrink-0 text-right text-[2rem] font-semibold leading-none ${dimmed ? "text-slate-400" : "text-[#2b241d]"}`}>
        {priceLabel}
      </div>
    </>
  );

  if (item.shopUrl) {
    return (
      <a
        href={item.shopUrl}
        target="_blank"
        rel="noreferrer"
        className={`flex min-h-[118px] items-start justify-between gap-4 rounded-[24px] border px-5 py-4 shadow-[0_12px_28px_rgba(102,88,64,0.06)] transition duration-200 hover:-translate-y-0.5 ${
          dimmed
            ? "border-[#ddd5c7] bg-[linear-gradient(180deg,#f4efe7_0%,#eee8de_100%)]"
            : "border-[#d8cfbf] bg-[linear-gradient(180deg,#ffffff_0%,#fbf5ea_100%)] hover:border-[#cdbca0]"
        }`}
      >
        {content}
      </a>
    );
  }

  return (
    <article
      className={`flex min-h-[118px] items-start justify-between gap-4 rounded-[24px] border px-5 py-4 shadow-[0_12px_28px_rgba(102,88,64,0.06)] ${
        dimmed
          ? "border-[#ddd5c7] bg-[linear-gradient(180deg,#f4efe7_0%,#eee8de_100%)]"
          : "border-[#d8cfbf] bg-[linear-gradient(180deg,#ffffff_0%,#fbf5ea_100%)]"
      }`}
    >
      {content}
    </article>
  );
}

function matchesKeyword(item: ProductFeedItem, keyword: string) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return true;
  }

  return normalizeText(
    [item.rawName, item.specLabel, item.shopName, productCategoryLabels[item.category], item.inventoryText].join(" ")
  ).includes(normalizedKeyword);
}

function matchesPrice(item: ProductFeedItem, minPrice: string, maxPrice: string) {
  const min = readPrice(minPrice);
  const max = readPrice(maxPrice);

  if (min === null && max === null) {
    return true;
  }

  if (!Number.isFinite(item.price) || item.price <= 0) {
    return false;
  }

  if (min !== null && item.price < min) {
    return false;
  }

  if (max !== null && item.price > max) {
    return false;
  }

  return true;
}

function readPrice(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isDimmedProduct(item: ProductFeedItem) {
  return isDimmedProductFeedItem(item);
}
