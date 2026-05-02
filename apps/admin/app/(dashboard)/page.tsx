import Link from "next/link";
import { changeTypeLabels, formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
import { getPlatformState } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const state = await getPlatformState();
  const hiddenSourceIds = new Set(state.sources.filter((source) => source.visible === false).map((source) => source.sourceId));
  const publicShops = state.published.shops.filter((shop) => !hiddenSourceIds.has(shop.sourceId));
  const visibleProducts = state.published.shopProducts.filter(
    (item) => item.current.isDetected && !hiddenSourceIds.has(item.sourceId)
  );
  const lowStockCount = visibleProducts.filter((item) => item.current.stockStatus === "LOW_STOCK").length;
  const pendingValidation = state.tasks.filter((task) => task.status === "WAITING_HUMAN");
  const pendingReview = state.tasks.filter((task) => task.status === "REVIEWING");
  const latestSources = state.sources.slice(0, 4);
  const latestDiffs = state.published.shopDiffs.filter((diff) => publicShops.some((shop) => shop.shopId === diff.shopId)).slice(0, 4);
  const publishedAtLabel = state.published.publishedAt ? formatDateLabel(state.published.publishedAt) : "暂无发布记录";
  const dashboardMetrics = [
    {
      label: "已发布站点",
      value: `${publicShops.length}`.padStart(2, "0"),
      detail: `${state.sources.filter((source) => source.enabled).length} 个站点启用中`,
      tone: "bg-[linear-gradient(180deg,#faf4ea_0%,#ffffff_100%)]"
    },
    {
      label: "当前商品",
      value: `${visibleProducts.length}`,
      detail: `${lowStockCount} 项库存紧张`,
      tone: "bg-[linear-gradient(180deg,#eef4e8_0%,#ffffff_100%)]"
    },
    {
      label: "待处理任务",
      value: `${pendingValidation.length + pendingReview.length}`,
      detail: `验证 ${pendingValidation.length} · 校对 ${pendingReview.length}`,
      tone: "bg-[linear-gradient(180deg,#fff5e6_0%,#ffffff_100%)]"
    }
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboardMetrics.map((metric) => (
          <article
            key={metric.label}
            className={`rounded-[30px] border border-[#d8cfbf] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)] ${metric.tone}`}
          >
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#566271]">{metric.label}</div>
            <div className="mt-4 text-3xl font-semibold text-[#18222c]">{metric.value}</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{metric.detail}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-[32px] border border-[#d8cfbf] bg-[#f8f3ea] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">处理队列</div>
              <h2 className="mt-2 font-serif text-3xl text-[#18222c]">待办任务</h2>
            </div>
            <Link
              href="/tasks"
              className="inline-flex rounded-full bg-[#355344] px-4 py-2.5 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
            >
              打开任务看板
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[26px] border border-[#ded4c4] bg-white/92 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">{taskStatusLabels.WAITING_HUMAN}</div>
                <div className="rounded-full bg-[#fff1d6] px-3 py-1 text-xs font-medium text-[#8a6515]">
                  {pendingValidation.length}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {pendingValidation.length > 0 ? (
                  pendingValidation.map((task) => (
                    <article key={task.id} className="rounded-[18px] border border-[#e5dccd] bg-[#faf7f1] p-4">
                      <div className="font-medium text-[#18222c]">{task.sourceName}</div>
                      <div className="mt-1 text-sm text-slate-600">{task.nextAction}</div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#ded4c4] bg-[#faf7f1] px-4 py-6 text-sm text-slate-500">
                    暂无补充验证任务
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[26px] border border-[#ded4c4] bg-white/92 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">{taskStatusLabels.REVIEWING}</div>
                <div className="rounded-full bg-[#e9f3df] px-3 py-1 text-xs font-medium text-[#355344]">
                  {pendingReview.length}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {pendingReview.length > 0 ? (
                  pendingReview.map((task) => (
                    <article key={task.id} className="rounded-[18px] border border-[#e5dccd] bg-[#faf7f1] p-4">
                      <div className="font-medium text-[#18222c]">{task.sourceName}</div>
                      <div className="mt-1 text-sm text-slate-600">{task.logSummary}</div>
                      {task.reviewId ? (
                        <Link href={`/review/${task.reviewId}`} className="mt-3 inline-flex text-sm text-[#355344]">
                          进入商品校对
                        </Link>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#ded4c4] bg-[#faf7f1] px-4 py-6 text-sm text-slate-500">
                    暂无校对任务
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-[#d8cfbf] bg-[linear-gradient(160deg,#faf4ea_0%,#eef4e8_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/78 px-4 py-2 text-sm text-[#566271]">
            发布概况
          </div>
          <h2 className="mt-4 font-serif text-3xl text-[#18222c]">{publishedAtLabel}</h2>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[22px] border border-[#d8cfbf] bg-white/88 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#566271]">公开站点</div>
              <div className="mt-2 text-2xl font-semibold text-[#18222c]">{publicShops.length}</div>
            </div>
            <div className="rounded-[22px] border border-[#d8cfbf] bg-white/88 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#566271]">公开商品</div>
              <div className="mt-2 text-2xl font-semibold text-[#18222c]">{visibleProducts.length}</div>
            </div>
            <div className="rounded-[22px] border border-[#d8cfbf] bg-white/88 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#566271]">最近变动</div>
              <div className="mt-2 text-2xl font-semibold text-[#18222c]">{latestDiffs.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[32px] border border-[#d8cfbf] bg-[#f8f3ea] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">站点</div>
              <h2 className="font-serif text-3xl text-[#18222c]">站点接入</h2>
            </div>
            <Link href="/sources" className="text-sm text-[#355344]">
              管理站点
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {latestSources.length > 0 ? (
              latestSources.map((source) => (
                <article key={source.sourceId} className="rounded-[22px] border border-[#ded4c4] bg-white/92 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#18222c]">{source.sourceName}</h3>
                      <div className="mt-2 break-all text-sm text-slate-500">{source.sourceUrl}</div>
                    </div>
                    <div className="rounded-full border border-[#ded4c4] bg-[#faf7f1] px-3 py-1 text-xs text-slate-600">
                      {verificationMethodLabels[source.verificationMethod]}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
                    <div>{source.lastRunAt ? formatDateLabel(source.lastRunAt) : "尚未执行"}</div>
                    <div>{source.enabled ? "启用中" : "已停用"}</div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#ded4c4] bg-white/92 px-4 py-10 text-center text-slate-500">
                当前没有接入站点。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[32px] border border-[#d8cfbf] bg-[#f8f3ea] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#566271]">发布记录</div>
              <h2 className="font-serif text-3xl text-[#18222c]">最新变动</h2>
            </div>
            <Link href="/tasks" className="text-sm text-[#355344]">
              返回任务
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {latestDiffs.length > 0 ? (
              latestDiffs.map((diff) => {
                const shop = state.published.shops.find((item) => item.shopId === diff.shopId);

                return (
                  <article key={`${diff.shopId}-${diff.snapshotDate}`} className="rounded-[22px] border border-[#ded4c4] bg-white/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-[#18222c]">{shop?.name ?? diff.shopId}</h3>
                        <div className="mt-2 text-sm text-slate-500">{diff.summary}</div>
                      </div>
                      <div className="rounded-full border border-[#ded4c4] bg-[#faf7f1] px-3 py-1 text-xs text-slate-600">
                        {formatDateLabel(diff.capturedAt)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {diff.changes.slice(0, 4).map((change) => (
                        <span
                          key={`${change.type}-${change.productKey ?? change.note}`}
                          className="rounded-full border border-[#ded4c4] bg-[#faf7f1] px-3 py-1.5 text-xs text-slate-700"
                        >
                          {changeTypeLabels[change.type]}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#ded4c4] bg-white/92 px-4 py-10 text-center text-slate-500">
                还没有公开变动记录。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
