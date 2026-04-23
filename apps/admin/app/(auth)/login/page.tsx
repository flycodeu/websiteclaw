import { adminConfig } from "@/lib/admin-config";
import { getAllowedEmails, sanitizeNextPath } from "@/lib/auth";

interface LoginPageProps {
  searchParams: Promise<{
    next?: string;
    error?: string;
    email?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const presetEmail = params.email ?? "";
  const hasWhitelist = adminConfig.hasEmailWhitelist;
  const fallbackEmail = !hasWhitelist ? getAllowedEmails()[0] ?? "" : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/92 p-8 shadow-[0_24px_70px_rgba(30,64,175,0.08)]">
        <div className="rounded-full bg-[#edf4ff] px-4 py-2 text-center text-sm text-[#2d63d7]">管理员登录</div>
        <h1 className="mt-6 font-serif text-4xl text-ink">进入后台</h1>

        {params.error === "forbidden" ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            当前邮箱不在白名单中。
          </div>
        ) : null}

        {!hasWhitelist ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            未配置 `ADMIN_ALLOWED_EMAILS`，生产环境将无法登录。
          </div>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="text-sm text-slate-500">邮箱</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={presetEmail || fallbackEmail}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-[#8ab6ff] focus:bg-white"
              placeholder="admin@example.com"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-full bg-[linear-gradient(135deg,#1b63ff,#5ca8ff)] px-5 py-3 text-sm font-medium text-white shadow-[0_16px_32px_rgba(27,99,255,0.22)]"
          >
            登录
          </button>
        </form>
      </section>
    </main>
  );
}
