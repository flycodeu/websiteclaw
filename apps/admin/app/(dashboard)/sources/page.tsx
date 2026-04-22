import { sources } from "@shop-claw/shared/mock-data";

export default function SourcesPage() {
  return (
    <section className="rounded-[32px] border border-white/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sources</p>
          <h2 className="mt-2 font-serif text-3xl">数据源管理</h2>
        </div>
        <button type="button" className="w-fit rounded-full bg-ink px-5 py-3 text-sm text-white">
          新增数据源
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-shell text-left text-slate-500">
            <tr>
              <th className="px-5 py-4 font-medium">名称</th>
              <th className="px-5 py-4 font-medium">链接</th>
              <th className="px-5 py-4 font-medium">模式</th>
              <th className="px-5 py-4 font-medium">启用</th>
              <th className="px-5 py-4 font-medium">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sources.map((source) => (
              <tr key={source.sourceId}>
                <td className="px-5 py-4 font-medium text-ink">{source.sourceName}</td>
                <td className="px-5 py-4 text-slate-500">{source.sourceUrl}</td>
                <td className="px-5 py-4 text-slate-500">{source.crawlMode}</td>
                <td className="px-5 py-4 text-slate-500">{source.enabled ? "true" : "false"}</td>
                <td className="px-5 py-4 text-slate-500">{source.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
