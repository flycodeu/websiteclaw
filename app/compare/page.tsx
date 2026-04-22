import { ArrowDownRight, BadgeCheck, Layers3, ShieldCheck, TrendingDown } from "lucide-react";
import { compareGroups } from "@/lib/mock-data";

export default function ComparePage() {
  const marketLowest = Math.min(...compareGroups.flatMap((group) => group.offers.map((offer) => offer.price)));
  const totalOffers = compareGroups.reduce((sum, group) => sum + group.offers.length, 0);

  return (
    <div className="space-y-5">
      <section className="float-in rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,244,255,0.92))] p-4 shadow-[0_24px_70px_rgba(30,64,175,0.08)]">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <CompareMetric
              icon={<TrendingDown className="h-4 w-4 text-[#2e67ea]" />}
              label="全站最低价"
              value={`¥${marketLowest}`}
            />
            <CompareMetric
              icon={<BadgeCheck className="h-4 w-4 text-[#2e67ea]" />}
              label="标准品类"
              value={`${compareGroups.length}`}
            />
            <CompareMetric
              icon={<ShieldCheck className="h-4 w-4 text-[#2e67ea]" />}
              label="可比报价"
              value={`${totalOffers}`}
            />
            <CompareMetric icon={<Layers3 className="h-4 w-4 text-[#2e67ea]" />} label="品类" value={`${compareGroups.length}`} />
            <CompareMetric icon={<BadgeCheck className="h-4 w-4 text-[#2e67ea]" />} label="库存正常" value={`${compareGroups.flatMap((group) => group.offers).filter((offer) => offer.stockStatus === "IN_STOCK").length}`} />
            <CompareMetric icon={<ArrowDownRight className="h-4 w-4 text-[#2e67ea]" />} label="最低价商铺" value={`${new Set(compareGroups.map((group) => group.offers[0]?.shopName).filter(Boolean)).size}`} />
        </div>
      </section>

      <div className="grid gap-4">
        {compareGroups.map((group) => (
          <section
            key={group.normalizedType}
            className="float-in rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_46px_rgba(15,23,42,0.05)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-[1.8rem]">{group.normalizedType}</h2>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#edf4ff] px-3 py-1.5 text-xs text-[#406dba]">
                <ArrowDownRight className="h-3.5 w-3.5" />
                {group.offers[0] ? group.offers[0].shopName : "暂无报价"}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.offers.map((offer, index) => (
                <article
                  key={`${group.normalizedType}-${offer.shopId}`}
                  className={`rounded-[22px] border p-4 transition duration-200 hover:-translate-y-0.5 ${
                    index === 0
                      ? "border-[#bad3ff] bg-[linear-gradient(135deg,#eef5ff,#e3efff)] shadow-[0_18px_34px_rgba(59,130,246,0.12)]"
                      : "border-[#dde7f7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400">{index === 0 ? "最低价" : "候选报价"}</div>
                      <h3 className="mt-1 text-lg font-semibold text-ink">{offer.shopName}</h3>
                    </div>
                    <div className="rounded-full border border-white/70 bg-white/72 px-3 py-1 text-[11px] text-[#416bb7]">
                      {offer.stockStatus}
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[11px] text-slate-400">报价</div>
                      <div className="mt-1 text-[1.9rem] font-semibold leading-none text-[#1f63eb]">
                        ¥{offer.price}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">稳定度</div>
                      <div className="mt-1 text-lg font-semibold text-ink">{offer.stabilityScore}</div>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#2f67ec,#88c3ff)]"
                      style={{ width: `${Math.min(offer.stabilityScore, 100)}%` }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CompareMetric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#dce8fb] bg-white/84 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="rounded-full bg-[#edf4ff] p-2">{icon}</div>
      </div>
      <div className="mt-2 text-[1.55rem] font-semibold leading-none text-ink">{value}</div>
    </div>
  );
}
