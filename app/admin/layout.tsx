import type { Route } from "next";
import Link from "next/link";

const adminNav = [
  { href: "/admin", label: "仪表盘" },
  { href: "/admin/sources", label: "数据源" },
  { href: "/admin/tasks", label: "任务中心" },
  { href: "/admin/review/review_001", label: "审核页" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin Console</p>
            <h1 className="mt-2 font-serif text-4xl">管理端工作台</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="rounded-full bg-shell px-4 py-2 text-sm text-slate-600 transition hover:bg-mist"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}
