"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { LayoutGrid, ScanSearch, Store } from "lucide-react";
import { formatDateLabel } from "@shop-claw/shared/labels";
import { PublishedMeta } from "@shop-claw/shared/types";

const navItems = [
  { href: "/", label: "总览", icon: LayoutGrid },
  { href: "/shops", label: "店铺列表", icon: ScanSearch }
] satisfies Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }>;

export function SiteShell({
  children,
  latestSyncAt,
  meta
}: {
  children: React.ReactNode;
  latestSyncAt: string;
  meta: PublishedMeta;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-[color:var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200/60 bg-white/75 backdrop-blur-xl transition-all">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <Link href="/" className="flex min-w-0 items-center gap-3 sm:gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 shadow-sm text-zinc-800 sm:h-14 sm:w-14 sm:rounded-[22px]">
                  <Store className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-sans font-bold tracking-tight text-xl text-zinc-900 sm:text-2xl">Shop Claw</div>
                </div>
              </Link>

              <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 pr-1 lg:pb-0 sm:ml-4">
                {navItems.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href as Route}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "bg-zinc-900 text-white shadow-md"
                          : "bg-white/50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeaderStat label="同步时间" value={formatDateLabel(latestSyncAt)} />
              <HeaderStat label="公开店铺" value={`${meta.shopCount}`} />
              <HeaderStat label="公开商品" value={`${meta.liveProductCount}`} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 rise-in">{children}</main>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-zinc-200 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-md transition-all hover:bg-white/80">
      <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 font-medium">{label}</div>
      <div className="mt-1 break-words font-mono text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
