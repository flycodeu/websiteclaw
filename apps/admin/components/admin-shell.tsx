"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, LayoutDashboard, ListTodo, LogOut } from "lucide-react";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/sources", label: "数据源", icon: Database },
  { href: "/tasks", label: "任务中心", icon: ListTodo }
] satisfies Array<{ href: Route; label: string; icon: React.ComponentType<{ className?: string }> }>;

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-ink">
      <header className="border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#173e8f,#4288ff)] text-white shadow-[0_12px_26px_rgba(23,62,143,0.18)]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight">商铺监控管理台</p>
              <p className="text-sm text-slate-500">{email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-2 md:flex">
              {navItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      active
                        ? "bg-[linear-gradient(135deg,#e8f1ff,#dcecff)] text-[#1855d8] shadow-[inset_0_0_0_1px_rgba(24,85,216,0.12)]"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600"
              >
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
