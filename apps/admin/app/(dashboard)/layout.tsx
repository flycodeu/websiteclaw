import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { adminConfig } from "@/lib/admin-config";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const email = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!email && !adminConfig.bypassAuth) {
    redirect("/login");
  }

  return (
    <AdminShell email={email ?? "本地模式"}>
      <div className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-serif text-4xl">抓取、验证、分析、发布</h1>
              <p className="mt-2 text-sm text-slate-500">管理端用于维护数据源、执行浏览器抓取、处理验证并审核结果。</p>
            </div>
            <div className="grid gap-2 rounded-[24px] border border-slate-200 bg-shell px-5 py-4 text-sm text-slate-600">
              <div>浏览器抓取支持登录、验证码和人工续跑</div>
              <div>审核后会更新商铺、商品和差异结果</div>
            </div>
          </div>
        </section>
        {children}
      </div>
    </AdminShell>
  );
}
