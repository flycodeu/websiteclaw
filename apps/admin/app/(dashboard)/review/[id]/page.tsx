import { notFound } from "next/navigation";
import { getReview } from "@shop-claw/shared/mock-data";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = getReview(id);

  if (!review) {
    notFound();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr_0.9fr]">
      <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Raw Context</div>
        <h2 className="mt-2 font-serif text-3xl">原始抓取片段</h2>
        <div className="mt-5 space-y-4">
          {review.rawFragments.map((fragment) => (
            <pre key={fragment} className="overflow-x-auto rounded-[22px] bg-ink p-4 text-sm text-slate-200">
              {fragment}
            </pre>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Structured Result</div>
        <h2 className="mt-2 font-serif text-3xl">AI 提取结果</h2>
        <p className="mt-3 text-sm text-slate-500">{review.extractedSummary}</p>

        <div className="mt-5 space-y-4">
          {review.products.map((product) => (
            <div key={`${product.normalizedType}-${product.price}`} className="rounded-[22px] bg-shell p-4">
              <div className="font-medium text-ink">{product.rawName}</div>
              <div className="mt-2 text-sm text-slate-500">{product.normalizedType}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div>价格: ¥{product.price}</div>
                <div>库存: {product.stockStatus}</div>
                <div>状态: {product.status}</div>
                <div>置信度: {product.confidence ?? "--"}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Diff Review</div>
        <h2 className="mt-2 font-serif text-3xl">历史差异</h2>
        <div className="mt-5 space-y-4">
          {review.previousDiff.map((change) => (
            <div key={`${change.type}-${change.note}`} className="rounded-[22px] bg-shell p-4">
              <div className="font-medium text-ink">{change.type}</div>
              <div className="mt-2 text-sm text-slate-500">{change.note}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-600">
            保存草稿
          </button>
          <button type="button" className="rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-600">
            重新提取
          </button>
          <button type="button" className="rounded-full bg-ink px-4 py-3 text-sm text-white">
            发布结果
          </button>
        </div>
      </section>
    </div>
  );
}
