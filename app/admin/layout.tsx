export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-panel">
        <h1 className="font-serif text-4xl">管理端工作台</h1>
        <p className="mt-2 text-sm text-slate-500">该后台已与前台视觉和入口分离，仅保留业务操作视图。</p>
      </section>
      {children}
    </div>
  );
}
