import { overviewMetrics, tasks } from "@/lib/mock-data";

export default function AdminDashboardPage() {
  const grouped = {
    WAITING_HUMAN: tasks.filter((task) => task.status === "WAITING_HUMAN"),
    REVIEWING: tasks.filter((task) => task.status === "REVIEWING"),
    FAILED: tasks.filter((task) => task.status === "FAILED")
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map((metric) => (
          <div key={metric.label} className="rounded-[28px] border border-white/80 bg-white p-6 shadow-panel">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">{metric.label}</div>
            <div className="mt-3 text-4xl font-semibold text-ink">{metric.value}</div>
            <div className="mt-2 text-sm text-slate-500">{metric.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {Object.entries(grouped).map(([status, items]) => (
          <div key={status} className="rounded-[30px] border border-white/80 bg-white p-5 shadow-panel">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{status}</div>
            <div className="mt-3 text-2xl font-semibold">{items.length}</div>
            <div className="mt-4 space-y-3">
              {items.map((task) => (
                <div key={task.id} className="rounded-[22px] bg-shell p-4">
                  <div className="font-medium">{task.sourceName}</div>
                  <div className="mt-1 text-sm text-slate-500">{task.logSummary}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">{task.nextAction}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
