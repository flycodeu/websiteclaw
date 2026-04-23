"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeTypeLabels,
  formatDateOnlyLabel,
  productStatusLabels,
  reviewStatusLabels,
  stockStatusLabels
} from "@shop-claw/shared/labels";
import { ProductItem, ProductStatus, ReviewRecord, StockStatus } from "@shop-claw/shared/types";

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

function createEmptyProduct(): ProductItem {
  return {
    rawName: "",
    normalizedType: "",
    price: 0,
    currency: "CNY",
    stockStatus: "IN_STOCK",
    status: "ON_SALE",
    confidence: 0.8,
    updatedAt: new Date().toISOString(),
    sourceLine: ""
  };
}

export function ReviewWorkbench({ review }: ReviewWorkbenchProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(review.extractedSummary);
  const [conclusion, setConclusion] = useState(review.aiConclusion);
  const [riskNotesText, setRiskNotesText] = useState(review.riskNotes.join("\n"));
  const [products, setProducts] = useState<ProductItem[]>(review.products);
  const [statusText, setStatusText] = useState("");
  const [pending, startTransition] = useTransition();

  function updateProduct(index: number, patch: Partial<ProductItem>) {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch
            }
          : item
      )
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
      extractedSummary: summary,
      aiConclusion: conclusion,
      riskNotes: riskNotesText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      products: products.map((item) => ({
        ...item,
        price: Number(item.price),
        confidence: item.confidence ? Number(item.confidence) : undefined,
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

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/80 bg-white px-5 py-4 text-sm text-slate-500 shadow-panel">
        {statusText || "先保存草稿，再发布到静态数据。发布后用户端会读取同一份数据。"}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr_0.95fr]">
        <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">原始抓取片段</h2>
              <p className="mt-2 text-sm text-slate-500">
                {review.sourceName} · {formatDateOnlyLabel(review.snapshotDate)}
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-shell px-4 py-2 text-sm text-slate-600">
              {reviewStatusLabels[review.status]}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {review.rawFragments.map((fragment) => (
              <pre key={fragment} className="overflow-x-auto rounded-[22px] bg-ink p-4 text-sm text-slate-200">
                {fragment}
              </pre>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">AI 提取结果</h2>
              <p className="mt-2 text-sm text-slate-500">可直接修改商品、结论和风险提示。</p>
            </div>
            <button
              type="button"
              onClick={addProduct}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
            >
              新增商品
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-600">
              抽取摘要
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="min-h-24 rounded-[22px] border border-slate-200 bg-shell px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-600">
              分析结论
              <textarea
                value={conclusion}
                onChange={(event) => setConclusion(event.target.value)}
                className="min-h-24 rounded-[22px] border border-slate-200 bg-shell px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-600">
              风险提示
              <textarea
                value={riskNotesText}
                onChange={(event) => setRiskNotesText(event.target.value)}
                className="min-h-28 rounded-[22px] border border-slate-200 bg-shell px-4 py-3 outline-none"
              />
            </label>
          </div>

          <div className="mt-6 space-y-4">
            {products.map((product, index) => (
              <div key={`${product.normalizedType}-${index}`} className="rounded-[24px] border border-slate-200 bg-shell p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-600">
                    商品名称
                    <input
                      value={product.rawName}
                      onChange={(event) => updateProduct(index, { rawName: event.target.value })}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-600">
                    标准类型
                    <input
                      value={product.normalizedType}
                      onChange={(event) => updateProduct(index, { normalizedType: event.target.value })}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-600">
                    价格
                    <input
                      type="number"
                      value={product.price}
                      onChange={(event) => updateProduct(index, { price: Number(event.target.value) })}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-600">
                    置信度
                    <input
                      type="number"
                      step="0.01"
                      value={product.confidence ?? ""}
                      onChange={(event) =>
                        updateProduct(index, {
                          confidence: event.target.value ? Number(event.target.value) : undefined
                        })
                      }
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-600">
                    库存状态
                    <select
                      value={product.stockStatus}
                      onChange={(event) =>
                        updateProduct(index, {
                          stockStatus: event.target.value as StockStatus
                        })
                      }
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    >
                      <option value="IN_STOCK">有货</option>
                      <option value="LOW_STOCK">库存紧张</option>
                      <option value="OUT_OF_STOCK">无货</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-slate-600">
                    商品状态
                    <select
                      value={product.status}
                      onChange={(event) =>
                        updateProduct(index, {
                          status: event.target.value as ProductStatus
                        })
                      }
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    >
                      <option value="ON_SALE">在售</option>
                      <option value="LOW_STOCK">低库存</option>
                      <option value="OFFLINE">已下架</option>
                    </select>
                  </label>
                </div>

                <label className="mt-4 grid gap-2 text-sm text-slate-600">
                  来源片段
                  <textarea
                    value={product.sourceLine ?? ""}
                    onChange={(event) => updateProduct(index, { sourceLine: event.target.value })}
                    className="min-h-20 rounded-[20px] border border-slate-200 bg-white px-4 py-3 outline-none"
                  />
                </label>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <div>
                    库存：{stockStatusLabels[product.stockStatus]} · 状态：{productStatusLabels[product.status]}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProduct(index)}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600"
                  >
                    删除商品
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
          <h2 className="font-serif text-3xl">发布对比</h2>
          <div className="mt-5 space-y-4">
            {review.previousDiff.length > 0 ? (
              review.previousDiff.map((change) => (
                <div key={`${change.type}-${change.note}`} className="rounded-[22px] bg-shell p-4">
                  <div className="font-medium text-ink">{changeTypeLabels[change.type]}</div>
                  <div className="mt-2 text-sm text-slate-500">{change.note}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-shell px-4 py-8 text-center text-sm text-slate-500">
                当前没有历史差异，可直接发布首版快照。
              </div>
            )}
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-shell p-4">
            <div className="text-sm font-medium text-ink">风险提示</div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {riskNotesText
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => (
                  <div key={item} className="rounded-2xl bg-white px-3 py-2">
                    {item}
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-700 disabled:opacity-60"
            >
              {pending ? "处理中..." : "保存草稿"}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={pending}
              className="rounded-full bg-ink px-4 py-3 text-sm text-white disabled:opacity-60"
            >
              {pending ? "发布中..." : "发布到静态数据"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
