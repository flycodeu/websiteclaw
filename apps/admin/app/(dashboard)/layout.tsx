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
        <section className="overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#faf3e8_0%,#f2eadc_56%,#eef4e8_100%)] shadow-[0_20px_44px_rgba(102,88,64,0.08)]">
          <div className="p-6">
            <div>
              <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/85 px-4 py-2 text-sm text-[#566271]">
                管理后台
              </div>
              <h1 className="mt-4 font-serif text-4xl text-[#18222c]">采集与发布控制台</h1>
            </div>
          </div>
        </section>
        {children}
      </div>
    </AdminShell>
  );
}
