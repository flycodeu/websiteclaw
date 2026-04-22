"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BarChart3, PanelsTopLeft, Radar, ShieldCheck, Workflow } from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: PanelsTopLeft },
  { href: "/shops", label: "商铺", icon: Radar },
  { href: "/compare", label: "比价", icon: BarChart3 },
  { href: "/stability", label: "稳定度", icon: ShieldCheck },
  { href: "/admin", label: "管理端", icon: Workflow }
] satisfies Array<{ href: Route; label: string; icon: ComponentType<{ className?: string }> }>;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-shell text-ink">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,_rgba(23,104,255,0.16),_transparent_45%),radial-gradient(circle_at_top_right,_rgba(193,216,235,0.55),_transparent_35%)]" />
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-sm font-semibold text-white shadow-glow">
              SC
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight">Shop Claw</p>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">monitoring platform</p>
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
                    active ? "bg-ink text-white shadow-panel" : "text-slate-600 hover:bg-mist"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-right shadow-sm">
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Latest Sync</div>
            <div className="text-sm font-medium">2026-04-22 19:40 CST</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
