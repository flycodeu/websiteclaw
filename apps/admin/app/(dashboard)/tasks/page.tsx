import { tasks } from "@shop-claw/shared/mock-data";

const columns = [
  { title: "待人工处理", status: "WAITING_HUMAN" },
  { title: "待审核", status: "REVIEWING" },
  { title: "失败任务", status: "FAILED" },
  { title: "已发布", status: "PUBLISHED" }
] as const;

export default function TasksPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-4">
      {columns.map((column) => (
        <section key={column.status} className="rounded-[30px] border border-white/80 bg-white p-5 shadow-panel">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{column.status}</div>
          <h2 className="mt-2 text-2xl font-semibold">{column.title}</h2>

          <div className="mt-5 space-y-4">
            {tasks
              .filter((task) => task.status === column.status)
              .map((task) => (
                <article key={task.id} className="rounded-[22px] bg-shell p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{task.sourceName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{task.id}</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{task.updatedAt.slice(11, 16)}</div>
                  </div>
                  <div className="mt-4 text-sm text-slate-500">{task.logSummary}</div>
                  <div className="mt-4 text-xs uppercase tracking-[0.2em] text-signal">{task.nextAction}</div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
