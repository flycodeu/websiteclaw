import Link from "next/link";
import {
  crawlModeLabels,
  formatDateLabel,
  reviewStatusLabels,
  taskStatusLabels,
  verificationMethodLabels
} from "@shop-claw/shared/labels";
import { getPlatformState } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const state = await getPlatformState();
  const waitingTasks = state.tasks.filter((task) => task.status === "WAITING_HUMAN").slice(0, 3);
  const reviewingTasks = state.tasks.filter((task) => task.status === "REVIEWING").slice(0, 3);
  const latestSources = state.sources.slice(0, 4);
  const latestReviews = state.reviews.slice(0, 3);
  const dashboardMetrics = [
    {
      label: "已监控商铺",
      value: `${state.published.shops.length}`.padStart(2, "0"),
      detail: `${state.sources.filter((source) => source.enabled).length} 个数据源处于启用状态`
    },
    {
      label: "今日有效商品",
      value: `${state.published.shops.reduce((sum, shop) => sum + shop.productCount, 0)}`,
      detail: `已发布快照中共有 ${state.published.snapshots.length} 份商品快照`
    },
    {
      label: "待处理任务",
      value: `${state.tasks.filter((task) => task.status === "WAITING_HUMAN" || task.status === "REVIEWING").length}`,
      detail: `${state.tasks.filter((task) => task.status === "WAITING_HUMAN").length} 条待验证，${state.tasks.filter((task) => task.status === "REVIEWING").length} 条待审核`
    },
    {
      label: "发布成功率",
      value: state.tasks.length > 0 ? `${Math.round((state.tasks.filter((task) => task.status === "PUBLISHED").length / state.tasks.length) * 100)}%` : "0%",
      detail: `${state.tasks.filter((task) => task.status === "PUBLISHED").length} 条任务已完成审核发布`
    }
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <div key={metric.label} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-panel">
            <div className="text-sm text-slate-500">{metric.label}</div>
            <div className="mt-3 text-4xl font-semibold text-ink">{metric.value}</div>
            <div className="mt-2 text-sm text-slate-500">{metric.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">当前处理队列</h2>
              <p className="mt-2 text-sm text-slate-500">验证、审核和发布都在这里衔接。</p>
            </div>
            <Link href="/tasks" className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600">
              查看全部任务
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] bg-shell p-5">
              <div className="text-sm text-slate-500">{taskStatusLabels.WAITING_HUMAN}</div>
              <div className="mt-2 text-3xl font-semibold">{waitingTasks.length}</div>
              <div className="mt-4 space-y-3">
                {waitingTasks.length > 0 ? (
                  waitingTasks.map((task) => (
                    <div key={task.id} className="rounded-[18px] bg-white px-4 py-3">
                      <div className="font-medium text-ink">{task.sourceName}</div>
                      <div className="mt-1 text-sm text-slate-500">{task.nextAction}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] bg-white px-4 py-6 text-sm text-slate-500">当前没有待人工验证任务。</div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] bg-shell p-5">
              <div className="text-sm text-slate-500">{taskStatusLabels.REVIEWING}</div>
              <div className="mt-2 text-3xl font-semibold">{reviewingTasks.length}</div>
              <div className="mt-4 space-y-3">
                {reviewingTasks.length > 0 ? (
                  reviewingTasks.map((task) => (
                    <div key={task.id} className="rounded-[18px] bg-white px-4 py-3">
                      <div className="font-medium text-ink">{task.sourceName}</div>
                      <div className="mt-1 text-sm text-slate-500">{task.logSummary}</div>
                      {task.reviewId ? (
                        <Link href={`/review/${task.reviewId}`} className="mt-3 inline-flex text-sm text-[#2567eb]">
                          进入审核
                        </Link>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] bg-white px-4 py-6 text-sm text-slate-500">当前没有待审核任务。</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">执行概况</h2>
              <p className="mt-2 text-sm text-slate-500">聚合查看最近抓取、待处理验证和审核结果。</p>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-shell p-5">
            <div className="text-sm text-slate-500">最近抓取</div>
            <div className="mt-2 text-2xl font-semibold">
              {state.tasks.length > 0 ? formatDateLabel(state.tasks[0].updatedAt) : "暂无任务"}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              当前共有 {state.tasks.length} 条任务，{state.tasks.filter((task) => task.status === "CRAWLING").length} 条正在执行
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-shell p-5">
            <div className="text-sm text-slate-500">最近结果</div>
            <div className="mt-2 text-2xl font-semibold">{formatDateLabel(state.published.publishedAt)}</div>
            <div className="mt-2 text-sm text-slate-500">当前已沉淀 {state.published.shops.length} 家商铺结果</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/sources" className="rounded-full bg-ink px-4 py-3 text-sm text-white">
              管理数据源
            </Link>
            <Link href="/tasks" className="rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-700">
              查看任务
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">数据源概览</h2>
            </div>
            <Link href="/sources" className="text-sm text-[#2567eb]">
              前往数据源
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {latestSources.length > 0 ? (
              latestSources.map((source) => (
                <article key={source.sourceId} className="rounded-[22px] border border-slate-200 bg-shell p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">{source.sourceName}</h3>
                      <div className="mt-2 text-sm text-slate-500">{source.sourceUrl}</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                      {crawlModeLabels[source.crawlMode]}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <div>验证方式：{verificationMethodLabels[source.verificationMethod]}</div>
                    <div>最近执行：{source.lastRunAt ? formatDateLabel(source.lastRunAt) : "尚未执行"}</div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-shell px-4 py-10 text-center text-slate-500">
                当前没有数据源。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl">最近审核</h2>
            </div>
            <Link href="/tasks" className="text-sm text-[#2567eb]">
              返回任务流
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {latestReviews.length > 0 ? (
              latestReviews.map((review) => (
                <article key={review.id} className="rounded-[22px] border border-slate-200 bg-shell p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">{review.sourceName}</h3>
                      <div className="mt-2 text-sm text-slate-500">{review.extractedSummary}</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                      {reviewStatusLabels[review.status]}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                    <div>{formatDateLabel(review.snapshotDate)}</div>
                    <Link href={`/review/${review.id}`} className="text-[#2567eb]">
                      打开审核
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-shell px-4 py-10 text-center text-slate-500">
                当前没有审核记录。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
