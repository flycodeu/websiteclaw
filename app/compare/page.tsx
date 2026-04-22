import { compareGroups } from "@/lib/mock-data";

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-panel">
        <h1 className="mt-3 font-serif text-4xl">标准商品比价</h1>
        <p className="mt-4 max-w-3xl text-slate-600">
          所有价格都基于标准商品类型聚合，后续接入真实发布 JSON 后可以直接替换当前数据源。
        </p>
      </section>

      <div className="grid gap-5">
        {compareGroups.map((group) => (
          <section key={group.normalizedType} className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="mt-2 font-serif text-3xl">{group.normalizedType}</h2>
              </div>
              <p className="max-w-xl text-sm text-slate-500">{group.trend}</p>
            </div>

            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">商铺</th>
                    <th className="px-5 py-4 font-medium">价格</th>
                    <th className="px-5 py-4 font-medium">库存</th>
                    <th className="px-5 py-4 font-medium">稳定度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {group.offers.map((offer) => (
                    <tr key={`${group.normalizedType}-${offer.shopId}`}>
                      <td className="px-5 py-4 font-medium text-ink">{offer.shopName}</td>
                      <td className="px-5 py-4 text-signal">
                        ¥{offer.price} {offer.currency}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{offer.stockStatus}</td>
                      <td className="px-5 py-4 text-slate-600">{offer.stabilityScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
