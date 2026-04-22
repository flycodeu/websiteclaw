import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const email = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!email && process.env.DEV_BYPASS_AUTH !== "true") {
    redirect("/login");
  }

  return (
    <AdminShell email={email ?? "local-dev"}>
      <div className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-panel">
          <h1 className="font-serif text-4xl">管理端工作台</h1>
          <p className="mt-2 text-sm text-slate-500">内部操作台仅对登录管理员开放。</p>
        </section>
        {children}
      </div>
    </AdminShell>
  );
}
