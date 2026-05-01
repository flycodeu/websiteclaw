"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { LayoutGrid, ScanSearch } from "lucide-react";
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
      <header className="sticky top-0 z-30 border-b border-[color:var(--line-strong)] bg-[rgba(250,246,239,0.88)] backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <Link href="/" className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,#fff8eb_0%,#edf4ea_100%)] font-serif text-xl text-[color:var(--ink)] shadow-[0_12px_30px_rgba(53,44,30,0.08)] sm:h-14 sm:w-14 sm:rounded-[22px] sm:text-2xl">
                  货
                </div>
                <div className="min-w-0">
                  <div className="truncate font-serif text-[1.35rem] text-[color:var(--ink)] sm:text-2xl">Shop Claw</div>
                </div>
              </Link>

              <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 pr-1 lg:pb-0">
                {navItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href as Route}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition ${
                        active
                          ? "border border-[#1c4336] bg-[#1c4336] text-white shadow-[0_10px_24px_rgba(28,67,54,0.18)]"
                          : "border border-[color:var(--line-strong)] bg-white/74 text-[color:var(--muted)] hover:border-[#c8bba6] hover:text-[color:var(--ink)]"
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

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line-strong)] bg-white/74 px-4 py-3 shadow-[0_10px_24px_rgba(53,44,30,0.05)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</div>
      <div className="mt-1.5 break-words font-mono text-sm font-semibold text-[color:var(--ink)]">{value}</div>
    </div>
  );
}
