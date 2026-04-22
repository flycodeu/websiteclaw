"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { PanelsTopLeft, Radar } from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: PanelsTopLeft },
  { href: "/shops", label: "商铺", icon: Radar }
] satisfies Array<{ href: Route; label: string; icon: ComponentType<{ className?: string }> }>;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#1b63ff,#6ab6ff)] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(27,99,255,0.24)]">
              SC
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight">Shop Claw</p>
              <p className="text-sm text-slate-500">商铺商品监控</p>
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
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition duration-200 ${
                    active
                      ? "bg-[linear-gradient(135deg,#e8f1ff,#dcecff)] text-[#1855d8] shadow-[inset_0_0_0_1px_rgba(24,85,216,0.12)]"
                      : "text-slate-600 hover:bg-white hover:text-[#1855d8]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-full border border-white/70 bg-white/78 px-4 py-2 text-right shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="text-xs text-slate-400">最近同步</div>
            <div className="text-sm font-medium">2026-04-22 19:40</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
