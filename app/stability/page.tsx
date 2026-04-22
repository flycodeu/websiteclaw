import { stabilityRankings } from "@/lib/mock-data";

const dimensions = [
  { label: "连续上架率", weight: "30%", note: "近 N 天同类商品持续存在的比例" },
  { label: "库存稳定率", weight: "25%", note: "库存为正常状态的天数占比" },
  { label: "价格波动率", weight: "20%", note: "波动越小得分越高" },
  { label: "抓取成功率", weight: "15%", note: "抓取与解析成功次数占比" },
  { label: "下架频率", weight: "10%", note: "频繁下架则扣分" }
];

export default function StabilityPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-panel">
        <h1 className="mt-3 font-serif text-4xl">稳定度评分</h1>
        <p className="mt-4 text-slate-600">分数采用 100 分制，用于帮助判断商铺是否适合持续跟踪和采购。</p>

        <div className="mt-6 space-y-4">
          {dimensions.map((item) => (
            <div key={item.label} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{item.label}</div>
                <div className="text-signal">{item.weight}</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">{item.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-panel">
        <h2 className="mt-3 font-serif text-4xl">本期排名</h2>

        <div className="mt-6 space-y-4">
          {stabilityRankings.map((entry) => (
            <div key={entry.shopId} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm text-slate-400">第 {entry.rank} 名</div>
                  <div className="mt-2 text-2xl font-semibold text-ink">{entry.shopName}</div>
                  <div className="mt-2 text-sm text-slate-500">{entry.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-semibold text-signal">{entry.value}</div>
                  <div className="text-sm text-slate-500">{entry.metricLabel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
