"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { LayoutGrid, Package, ScanSearch } from "lucide-react";
import { formatDateLabel } from "@shop-claw/shared/labels";

const navItems = [
  { href: "/", label: "总览", icon: LayoutGrid },
  { href: "/shops", label: "店铺监控", icon: ScanSearch },
  { href: "/products", label: "有货商品", icon: Package }
] satisfies Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }>;

export function SiteShell({ children, latestSyncAt }: { children: React.ReactNode; latestSyncAt: string }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-30 border-b border-[#d9cfbf] bg-[rgba(250,245,236,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d8cfbf] bg-[linear-gradient(180deg,#f7f1e6_0%,#eef4e8_100%)] text-sm font-semibold text-[#355344] shadow-[0_12px_28px_rgba(102,88,64,0.08)]">
              监
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight text-[#18222c]">商铺监控面板</p>
              <p className="text-sm text-slate-600">公开数据</p>
            </div>
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
            <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href as Route}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      active
                        ? "border border-[#cfdcc7] bg-[#edf6e2] text-[#264233]"
                        : "border border-[#d8cfbf] bg-white/80 text-slate-700 hover:border-[#cdbca0] hover:bg-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="rounded-full border border-[#d8cfbf] bg-white/84 px-4 py-2 text-right shadow-[0_10px_24px_rgba(102,88,64,0.06)]">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">最近同步</div>
              <div className="text-sm font-medium text-[#18222c]">{formatDateLabel(latestSyncAt)}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
