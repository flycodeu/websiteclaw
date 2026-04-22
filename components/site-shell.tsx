"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BarChart3, Database, PanelsTopLeft, Radar, ShieldCheck } from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: PanelsTopLeft },
  { href: "/shops", label: "商铺", icon: Radar },
  { href: "/compare", label: "比价", icon: BarChart3 },
  { href: "/stability", label: "稳定度", icon: ShieldCheck }
] satisfies Array<{ href: Route; label: string; icon: ComponentType<{ className?: string }> }>;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    return <AdminShell pathname={pathname}>{children}</AdminShell>;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-ink">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-sm font-semibold text-white">
              SC
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight">Shop Claw</p>
              <p className="text-sm text-slate-500">商铺商品监控平台</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                    active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-right">
            <div className="text-xs text-slate-400">最近同步</div>
            <div className="text-sm font-medium">2026-04-22 19:40</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

function AdminShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const adminNav = [
    { href: "/admin", label: "仪表盘" },
    { href: "/admin/sources", label: "数据源" },
    { href: "/admin/tasks", label: "任务中心" },
    { href: "/admin/review/review_001", label: "审核页" }
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight">Shop Claw Admin</p>
              <p className="text-sm text-slate-500">独立管理后台</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-2 md:flex">
              {adminNav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href as Route}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      active ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600">
              返回前台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
