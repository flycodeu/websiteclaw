import { Activity, ShieldCheck, Signal, TrendingUp } from "lucide-react";
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
    <div className="space-y-5">
      <section className="float-in rounded-[30px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,244,255,0.92))] p-6 shadow-[0_24px_70px_rgba(30,64,175,0.08)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d5e5ff] bg-white/82 px-3 py-1.5 text-xs text-[#3a6ada]">
              <ShieldCheck className="h-3.5 w-3.5" />
              稳定度模型
            </div>
            <h1 className="mt-4 font-serif text-[2.7rem] leading-[1.08] text-ink">稳定度评分</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StabilityMetric icon={<TrendingUp className="h-4 w-4 text-[#2e67ea]" />} label="最高分" value="91" />
            <StabilityMetric icon={<Signal className="h-4 w-4 text-[#2e67ea]" />} label="稳定商铺" value="2" />
            <StabilityMetric icon={<Activity className="h-4 w-4 text-[#2e67ea]" />} label="观察对象" value="1" />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section className="float-in rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_46px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[1.9rem]">评分构成</h2>
            <div className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-xs text-[#3968be]">100 分制</div>
          </div>

          <div className="mt-4 space-y-3">
            <ScoreBand label="90 - 100" note="非常稳定" tone="strong" />
            <ScoreBand label="75 - 89" note="较稳定" tone="good" />
            <ScoreBand label="60 - 74" note="中等" tone="mid" />
            <ScoreBand label="0 - 59" note="风险较高" tone="weak" />
          </div>

          <div className="mt-5 space-y-3">
            {dimensions.map((item) => (
              <div key={item.label} className="rounded-[20px] border border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-ink">{item.label}</div>
                  <div className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs text-[#3569c5]">{item.weight}</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-500">{item.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="float-in rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_46px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[1.9rem]">本期排名</h2>
            <div className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-xs text-[#3968be]">按稳定度排序</div>
          </div>

          <div className="mt-4 space-y-3">
            {stabilityRankings.map((entry, index) => (
              <div
                key={entry.shopId}
                className={`rounded-[22px] border p-4 transition duration-200 hover:-translate-y-0.5 ${
                  index === 0
                    ? "border-[#bad3ff] bg-[linear-gradient(135deg,#eef5ff,#e3efff)] shadow-[0_18px_34px_rgba(59,130,246,0.12)]"
                    : "border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)]"
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-400">第 {entry.rank} 名</div>
                    <div className="mt-1 text-2xl font-semibold text-ink">{entry.shopName}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">{entry.description}</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="text-[2.6rem] font-semibold leading-none text-[#2567eb]">{entry.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{entry.metricLabel}</div>
                  </div>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/80">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#2f67ec,#88c3ff)]"
                    style={{ width: `${Math.min(entry.value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StabilityMetric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#dce8fb] bg-white/84 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="rounded-full bg-[#edf4ff] p-2">{icon}</div>
      </div>
      <div className="mt-3 text-[1.8rem] font-semibold leading-none text-ink">{value}</div>
    </div>
  );
}

function ScoreBand({
  label,
  note,
  tone
}: {
  label: string;
  note: string;
  tone: "strong" | "good" | "mid" | "weak";
}) {
  const styles = {
    strong: "border-[#b7d4ff] bg-[#eef5ff] text-[#235fdc]",
    good: "border-[#cfe1ff] bg-[#f4f8ff] text-[#3b6ec8]",
    mid: "border-[#d7e2f0] bg-[#f8fbff] text-[#6078a4]",
    weak: "border-[#e3e8f2] bg-[#fbfcfe] text-[#8190a9]"
  };

  return (
    <div className={`flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm ${styles[tone]}`}>
      <span className="font-medium">{label}</span>
      <span>{note}</span>
    </div>
  );
}
