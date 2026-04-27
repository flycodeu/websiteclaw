"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Database, LayoutDashboard, ListTodo, LogOut } from "lucide-react";

const navItems = [
  { href: "/", label: "概览", icon: LayoutDashboard },
  { href: "/sources", label: "站点", icon: Database },
  { href: "/tasks", label: "任务", icon: ListTodo },
  { href: "/billing", label: "计费", icon: Banknote }
] satisfies Array<{ href: Route; label: string; icon: React.ComponentType<{ className?: string }> }>;

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isVerificationPage = pathname.startsWith("/tasks/") && pathname.endsWith("/verification");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(164,188,96,0.18),transparent_20%),radial-gradient(circle_at_top_right,rgba(245,214,145,0.28),transparent_24%),linear-gradient(180deg,#faf6ee_0%,#efe7da_100%)] text-[#18222c]">
      <header className="sticky top-0 z-30 border-b border-[#d8cfbf] bg-[#faf6ee]/92 backdrop-blur-xl shadow-[0_12px_34px_rgba(102,88,64,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d8cfbf] bg-white text-[#355344] shadow-[0_10px_24px_rgba(80,94,69,0.08)]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight text-[#18222c]">商铺采集控制台</p>
              <p className="text-sm text-slate-600">{email}</p>
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
                        ? "bg-[#355344] text-[#f8f4ec] shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
                        : "border border-[#d8cfbf] bg-white/90 text-[#4b5a66] hover:border-[#a6b790] hover:bg-[#eef4e8] hover:text-[#18222c]"
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
                className="inline-flex items-center gap-2 rounded-full border border-[#d8cfbf] bg-white/90 px-4 py-2 text-sm text-[#4b5a66] transition hover:border-[#a6b790] hover:bg-[#eef4e8] hover:text-[#18222c]"
              >
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className={isVerificationPage ? "px-6 py-6" : "mx-auto max-w-7xl px-6 py-8"}>{children}</main>
    </div>
  );
}
