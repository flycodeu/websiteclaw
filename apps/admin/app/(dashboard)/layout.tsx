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
    <AdminShell email={email ?? "本地模式"}>{children}</AdminShell>
  );
}
