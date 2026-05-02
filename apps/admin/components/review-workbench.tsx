"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeTypeLabels,
  formatDateOnlyLabel,
  formatWarrantyLabel,
  productCategoryLabels,
  productStatusLabels,
  reviewStatusLabels,
  stockStatusLabels
} from "@shop-claw/shared/labels";
import {
  ProductCategory,
  ProductItem,
  ProductStatus,
  ReviewRecord,
  StockStatus
} from "@shop-claw/shared/types";

interface ReviewWorkbenchProps {
  review: ReviewRecord;
}

async function readMessage(response: Response) {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.message || "成功";
}

function normalizeToken(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildProductKey(category: ProductCategory, specLabel: string) {
  return `${category}__${normalizeToken(specLabel || "DEFAULT") || "DEFAULT"}`;
}

function createEmptyProduct(): ProductItem {
  return {
    productKey: "OTHER__DEFAULT",
    rawName: "",
    category: "OTHER",
    specLabel: "DEFAULT",
    price: 0,
    currency: "CNY",
    stockStatus: "IN_STOCK",
    status: "ON_SALE",
    inventoryText: "",
    warrantySupported: null,
    isDetected: true,
    updatedAt: new Date().toISOString(),
    sourceLine: ""
  };
}

export function ReviewWorkbench({ review }: ReviewWorkbenchProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(review.summary);
  const [conclusion, setConclusion] = useState(review.conclusion);
  const [flagsText, setFlagsText] = useState(review.flags.join("\n"));
  const [products, setProducts] = useState<ProductItem[]>(review.products);
  const [statusText, setStatusText] = useState("");
  const [pending, startTransition] = useTransition();

  function updateProduct(index: number, patch: Partial<ProductItem>) {
    setProducts((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const next = {
          ...item,
          ...patch
        };

        if (patch.category || patch.specLabel) {
          next.productKey = buildProductKey(next.category, next.specLabel);
        }

        return next;
      })
    );
  }

  function addProduct() {
    setProducts((current) => [...current, createEmptyProduct()]);
  }

  function removeProduct(index: number) {
    setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function buildPayload() {
    return {
      summary,
      conclusion,
      flags: flagsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      products: products.map((item) => ({
        ...item,
        productKey: buildProductKey(item.category, item.specLabel),
        price: Number(item.price),
        updatedAt: new Date().toISOString()
      }))
    };
  }

  function handleSave() {
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/review/${review.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });

        setStatusText(await readMessage(response));
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function handlePublish() {
    setStatusText("");

    startTransition(async () => {
      try {
        const saveResponse = await fetch(`/api/review/${review.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });
        await readMessage(saveResponse);

        const publishResponse = await fetch(`/api/review/${review.id}/publish`, {
          method: "POST"
        });

        setStatusText(await readMessage(publishResponse));
        router.push("/tasks");
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  function handlePublishAndContinue() {
    setStatusText("");

    startTransition(async () => {
      try {
        const saveResponse = await fetch(`/api/review/${review.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });
        await readMessage(saveResponse);

        const publishResponse = await fetch(`/api/review/${review.id}/publish-next`, {
          method: "POST"
        });

        setStatusText(await readMessage(publishResponse));
        router.push("/tasks");
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "发布并继续下一站失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      {statusText ? (
        <div className="rounded-[24px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#faf4ea_0%,#eef4e8_100%)] px-5 py-4 text-sm text-slate-700 shadow-[0_14px_32px_rgba(102,88,64,0.08)]">
          {statusText}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] 2xl:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.18fr)_minmax(300px,0.82fr)]">
        <section className="min-w-0 rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf5ec_0%,#f7f1e6_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] text-slate-500">抓取片段</div>
              <h2 className="mt-2 font-serif text-3xl text-[#18222c]">{review.sourceName}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {formatDateOnlyLabel(review.snapshotDate)}
                {typeof review.crawlVersion === "number" ? ` · 版本 V${review.crawlVersion}` : ""}
              </p>
            </div>
            <div className="rounded-full border border-[#d8cfbf] bg-white/88 px-4 py-2 text-sm text-slate-600">
              {reviewStatusLabels[review.status]}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[#d8cfbf] bg-white/88 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">本次摘要</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{summary || "暂无摘要"}</div>
          </div>

          <div className="mt-5 space-y-4">
            {review.rawFragments.map((fragment, index) => (
              <pre
                key={`fragment-${index}-${fragment.slice(0, 24)}`}
                className="overflow-x-auto whitespace-pre-wrap break-words rounded-[22px] border border-[#d8cfbf] bg-[#fbf8f1] p-4 text-sm text-[#42505c] shadow-[inset_0_0_0_1px_rgba(216,207,191,0.22)]"
              >
                {fragment}
              </pre>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf4ea_0%,#f7f1e6_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] text-slate-500">商品结构校对</div>
              <h2 className="mt-2 font-serif text-3xl text-[#18222c]">修正分类、规格、价格、库存和质保</h2>
            </div>
            <button
              type="button"
              onClick={addProduct}
              className="rounded-full bg-[#355344] px-4 py-2 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
            >
              新增商品
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-700">
              本次摘要
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="min-h-24 w-full rounded-[22px] border border-[#d8cfbf] bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              本次结论
              <textarea
                value={conclusion}
                onChange={(event) => setConclusion(event.target.value)}
                className="min-h-24 w-full rounded-[22px] border border-[#d8cfbf] bg-white px-4 py-3 outline-none"
              />
            </label>
          </div>

          <div className="mt-6 space-y-4">
            {products.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#d8cfbf] bg-white/88 px-4 py-8 text-sm text-slate-500">
                当前未生成可信商品，请根据左侧抓取片段手动新增并补全商品。
              </div>
            ) : null}

            {products.map((product, index) => (
              <article key={`${product.productKey}-${index}`} className="min-w-0 rounded-[24px] border border-[#d8cfbf] bg-white/92 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    商品名称
                    <input
                      value={product.rawName}
                      onChange={(event) => updateProduct(index, { rawName: event.target.value })}
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    分类
                    <select
                      value={product.category}
                      onChange={(event) =>
                        updateProduct(index, { category: event.target.value as ProductCategory })
                      }
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    >
                      {Object.entries(productCategoryLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    规格标识
                    <input
                      value={product.specLabel}
                      onChange={(event) => updateProduct(index, { specLabel: event.target.value })}
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    价格
                    <input
                      type="number"
                      value={product.price}
                      onChange={(event) => updateProduct(index, { price: Number(event.target.value) })}
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    库存状态
                    <select
                      value={product.stockStatus}
                      onChange={(event) =>
                        updateProduct(index, {
                          stockStatus: event.target.value as StockStatus
                        })
                      }
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    >
                      <option value="IN_STOCK">有货</option>
                      <option value="LOW_STOCK">库存紧张</option>
                      <option value="OUT_OF_STOCK">无货</option>
                    </select>
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    商品状态
                    <select
                      value={product.status}
                      onChange={(event) =>
                        updateProduct(index, {
                          status: event.target.value as ProductStatus
                        })
                      }
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    >
                      <option value="ON_SALE">在售</option>
                      <option value="LOW_STOCK">低库存</option>
                      <option value="OFFLINE">未上架</option>
                    </select>
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    库存文本
                    <input
                      value={product.inventoryText}
                      onChange={(event) => updateProduct(index, { inventoryText: event.target.value })}
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="min-w-0 grid gap-2 text-sm text-slate-700">
                    质保
                    <select
                      value={
                        product.warrantySupported === null ? "unknown" : product.warrantySupported ? "yes" : "no"
                      }
                      onChange={(event) =>
                        updateProduct(index, {
                          warrantySupported:
                            event.target.value === "unknown" ? null : event.target.value === "yes"
                        })
                      }
                      className="w-full min-w-0 rounded-2xl border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                    >
                      <option value="unknown">待确认</option>
                      <option value="yes">支持质保</option>
                      <option value="no">不支持质保</option>
                    </select>
                  </label>
                </div>

                <label className="mt-4 grid gap-2 text-sm text-slate-700">
                  来源片段
                  <textarea
                    value={product.sourceLine ?? ""}
                    onChange={(event) => updateProduct(index, { sourceLine: event.target.value })}
                    className="min-h-20 w-full rounded-[20px] border border-[#d8cfbf] bg-[#faf8f2] px-4 py-3 outline-none"
                  />
                </label>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="min-w-0 break-words">
                    分类：{productCategoryLabels[product.category]} · 库存：{stockStatusLabels[product.stockStatus]} · 状态：
                    {productStatusLabels[product.status]} · 质保：{formatWarrantyLabel(product.warrantySupported)}
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-3">
                    <span className="max-w-full break-all rounded-full border border-[#d8cfbf] bg-[#faf8f2] px-3 py-1">
                      {buildProductKey(product.category, product.specLabel)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeProduct(index)}
                      className="rounded-full border border-[#d8cfbf] px-3 py-2 text-xs text-slate-600"
                    >
                      删除商品
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="min-w-0 xl:col-span-2 2xl:col-span-1 rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf5ec_0%,#eef4e8_100%)] p-6 text-[#18222c] shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="text-sm uppercase tracking-[0.18em] text-[#566271]">发布预览</div>
          <h2 className="mt-2 font-serif text-3xl text-[#18222c]">差异预览与异常项</h2>

          <div className="mt-5 space-y-4">
            {review.previousDiff.length > 0 ? (
              review.previousDiff.map((change, index) => (
                <article
                  key={`diff-${index}-${change.type}-${change.productKey ?? "note"}-${change.note.slice(0, 24)}`}
                  className="rounded-[22px] border border-[#d8cfbf] bg-white/88 p-4"
                >
                  <div className="text-sm font-medium text-[#355344]">{changeTypeLabels[change.type]}</div>
                  <div className="mt-2 text-sm text-slate-600">{change.note}</div>
                </article>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[#d8cfbf] bg-white/88 px-4 py-8 text-center text-sm text-slate-500">
                暂无上一版差异
              </div>
            )}
          </div>

          <div className="mt-6 rounded-[24px] border border-[#d8cfbf] bg-white/88 p-4">
            <div className="text-sm font-medium text-[#18222c]">异常项</div>
            <textarea
              value={flagsText}
              onChange={(event) => setFlagsText(event.target.value)}
              className="mt-3 min-h-32 w-full rounded-[20px] border border-[#d8cfbf] bg-white px-4 py-3 text-sm text-[#18222c] outline-none"
            />
          </div>

          <div className="mt-6 rounded-[24px] border border-[#d8cfbf] bg-white/88 p-4 text-sm text-slate-600">
            <div>日期：{formatDateOnlyLabel(review.snapshotDate)}</div>
            <div className="mt-2">商品数：{products.length}</div>
            <div className="mt-2">状态：{reviewStatusLabels[review.status]}</div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-full border border-[#355344]/15 bg-white/92 px-4 py-3 text-sm text-[#355344] disabled:opacity-60"
            >
              {pending ? "处理中..." : "保存校对"}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={pending}
              className="rounded-full bg-[#355344] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
            >
              {pending ? "发布中..." : "发布公开数据"}
            </button>
            {review.batchId ? (
              <button
                type="button"
                onClick={handlePublishAndContinue}
                disabled={pending}
                className="rounded-full bg-[#18222c] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(24,34,44,0.18)] disabled:opacity-60"
              >
                {pending ? "处理中..." : "发布并继续下一站"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
