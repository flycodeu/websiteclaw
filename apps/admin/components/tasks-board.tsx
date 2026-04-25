"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileSearch2, Search, ShieldAlert, XCircle } from "lucide-react";
import { formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
import { CrawlTask, VerificationMethod } from "@shop-claw/shared/types";

interface TasksBoardProps {
  tasks: CrawlTask[];
}

interface ContinueFormState {
  manualContent: string;
}

const columns = [
  {
    title: "待补充验证",
    status: "WAITING_HUMAN",
    shellClass: "bg-[linear-gradient(180deg,#faf4ea_0%,#fffaf1_100%)]",
    badgeClass: "bg-[#fff1d6] text-[#8a6515]",
    icon: ShieldAlert
  },
  {
    title: "待校对",
    status: "REVIEWING",
    shellClass: "bg-[linear-gradient(180deg,#eef4e8_0%,#ffffff_100%)]",
    badgeClass: "bg-[#e8f2df] text-[#355344]",
    icon: FileSearch2
  },
  {
    title: "失败任务",
    status: "FAILED",
    shellClass: "bg-[linear-gradient(180deg,#fbede7_0%,#ffffff_100%)]",
    badgeClass: "bg-[#f8ddd2] text-[#9a4b33]",
    icon: XCircle
  },
  {
    title: "已发布",
    status: "PUBLISHED",
    shellClass: "bg-[linear-gradient(180deg,#eef2f2_0%,#ffffff_100%)]",
    badgeClass: "bg-[#e5ecec] text-[#465461]",
    icon: CheckCircle2
  }
] as const;

const defaultForm: ContinueFormState = {
  manualContent: ""
};

async function readResponse<T>(response: Response) {
  const payload = (await response.json()) as { message?: string; data?: T };

  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return {
    data: payload.data,
    message: payload.message || "成功"
  };
}

function verificationLabel(method?: VerificationMethod) {
  if (!method) {
    return "无需验证";
  }

  return verificationMethodLabels[method];
}

function verificationWorkspaceLabel(pageState?: CrawlTask["pageState"]) {
  if (pageState === "VERIFYING") {
    return "验证窗口已开启";
  }

  if (pageState === "RESUMED") {
    return "已恢复抓取";
  }

  return "等待启动验证";
}

function verificationWorkspaceTone(pageState?: CrawlTask["pageState"]) {
  if (pageState === "VERIFYING") {
    return "border-[#d4e3c4] bg-[#edf6e2] text-[#355535]";
  }

  if (pageState === "RESUMED") {
    return "border-[#d8cfbf] bg-white/88 text-[#355344]";
  }

  return "border-[#efddad] bg-[#fff7e0] text-[#8b6510]";
}

export function TasksBoard({ tasks }: TasksBoardProps) {
  const router = useRouter();
  const [continueForms, setContinueForms] = useState<Record<string, ContinueFormState>>({});
  const [statusText, setStatusText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return tasks.filter((task) => {
      if (!normalizedKeyword) {
        return true;
      }

      return (
        task.sourceName.toLowerCase().includes(normalizedKeyword) ||
        task.id.toLowerCase().includes(normalizedKeyword) ||
        task.currentUrl?.toLowerCase().includes(normalizedKeyword) ||
        task.logSummary.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [keyword, tasks]);

  const activeTask = filteredTasks.find((task) => task.id === activeTaskId) ?? tasks.find((task) => task.id === activeTaskId) ?? null;

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTaskId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTaskId]);

  function getForm(taskId: string) {
    return continueForms[taskId] ?? defaultForm;
  }

  function updateForm(taskId: string, patch: Partial<ContinueFormState>) {
    setContinueForms((current) => ({
      ...current,
      [taskId]: {
        ...getForm(taskId),
        ...patch
      }
    }));
  }

  function handleVerificationAction(taskId: string, action: "start" | "complete") {
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/verification/${action}`, {
          method: "POST"
        });
        const result = await readResponse<CrawlTask>(response);

        setStatusText(result.message);

        if (action === "complete" && result.data?.status && result.data.status !== "WAITING_HUMAN") {
          setActiveTaskId(null);
        }

        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "人工验证处理失败");
      }
    });
  }

  function handleContinue(taskId: string) {
    const payload = getForm(taskId);

    if (!payload.manualContent.trim()) {
      setStatusText("请先补充整理后的页面文本。");
      return;
    }

    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await readResponse<CrawlTask>(response);

        setStatusText(result.message);
        setContinueForms((current) => ({
          ...current,
          [taskId]: defaultForm
        }));
        setActiveTaskId(null);
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "继续执行失败");
      }
    });
  }

  function retryTask(sourceId: string) {
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/tasks/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId })
        });
        const result = await readResponse<CrawlTask>(response);

        setStatusText(result.message);
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "重新抓取失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      {statusText ? (
        <div className="rounded-[24px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#faf4ea_0%,#eef4e8_100%)] px-5 py-4 text-sm text-slate-700 shadow-[0_14px_32px_rgba(102,88,64,0.08)]">
          {statusText}
        </div>
      ) : null}

      <section className="rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf4ea_0%,#f7f1e6_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white px-4 py-2 text-sm text-slate-600">
              任务工作台
            </div>
            <h2 className="mt-4 font-serif text-3xl text-[#18222c]">采集与发布任务</h2>
          </div>

          <label className="flex min-w-0 items-center gap-2 rounded-[20px] border border-[#d8cfbf] bg-white/88 px-4 py-3 text-sm text-slate-500 shadow-[0_10px_24px_rgba(102,88,64,0.06)] xl:w-[320px]">
            <Search className="h-4 w-4" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索任务、站点或链接"
              className="w-full min-w-0 bg-transparent text-[#18222c] outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => {
            const count = filteredTasks.filter((task) => task.status === column.status).length;
            const Icon = column.icon;
            return (
              <div key={column.status} className="rounded-[22px] border border-[#d8cfbf] bg-white/84 p-4 shadow-[0_10px_24px_rgba(102,88,64,0.05)]">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Icon className="h-4 w-4 text-[#355344]" />
                  {column.title}
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#18222c]">{count}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {columns.map((column) => {
          const columnTasks = filteredTasks.filter((task) => task.status === column.status);
          const Icon = column.icon;

          return (
            <section
              key={column.status}
              className={`rounded-[30px] border border-[#d8cfbf] p-5 shadow-[0_18px_38px_rgba(102,88,64,0.07)] ${column.shellClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d8cfbf] bg-white/92 text-[#355344]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm uppercase tracking-[0.16em] text-slate-500">{taskStatusLabels[column.status]}</div>
                    <h2 className="mt-1 text-2xl font-semibold text-[#18222c]">{column.title}</h2>
                  </div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${column.badgeClass}`}>{columnTasks.length}</div>
              </div>

              <div className="mt-5 grid gap-3">
                {columnTasks.map((task) => (
                  <article key={task.id} className="rounded-[22px] border border-[#d8cfbf] bg-white/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[#18222c]">{task.sourceName}</div>
                        <div className="mt-1 text-xs text-slate-500">{task.id}</div>
                      </div>
                      <div className="rounded-full border border-[#d8cfbf] bg-[#faf7f1] px-3 py-1 text-xs text-slate-500">
                        {formatDateLabel(task.updatedAt)}
                      </div>
                    </div>

                    <div className="mt-3 text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                      {task.logSummary}
                    </div>
                    <div className="mt-2 text-sm text-[#375536] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] overflow-hidden">
                      {task.nextAction}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {task.verificationMethod ? <TaskTag label={verificationLabel(task.verificationMethod)} /> : null}
                        {task.aiUsage ? <TaskTag label={`${formatTokenCount(task.aiUsage.totalTokens)} tokens`} /> : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {task.status === "WAITING_HUMAN" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setActiveTaskId(task.id)}
                            className="rounded-full bg-[#355344] px-4 py-2.5 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
                          >
                            进入验证工作区
                          </button>
                        ) : null}

                        {task.status === "REVIEWING" && task.reviewId ? (
                          <Link
                            href={`/review/${task.reviewId}`}
                            className="rounded-full bg-[#355344] px-4 py-2.5 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
                          >
                            进入校对
                          </Link>
                        ) : null}

                        {task.status === "FAILED" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => retryTask(task.sourceId)}
                            className="rounded-full border border-[#355344]/15 bg-[#eef4e8] px-4 py-2.5 text-sm text-[#355344] disabled:opacity-60"
                          >
                            重新抓取
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}

                {columnTasks.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-[#d8cfbf] bg-white/92 px-4 py-8 text-center text-sm text-slate-500">
                    暂无任务
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {activeTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#18222c]/14 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={() => setActiveTaskId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee2_62%,#edf4e7_100%)] shadow-[0_24px_80px_rgba(24,34,44,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e2d8c9] px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/84 px-3 py-1 text-xs text-slate-500">
                  {verificationLabel(activeTask.verificationMethod)}
                </div>
                <h2 className="mt-3 break-words font-serif text-[2rem] leading-tight text-[#18222c]">{activeTask.sourceName}</h2>
                <div className="mt-2 text-sm text-slate-500">{formatDateLabel(activeTask.updatedAt)}</div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTaskId(null)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8cfbf] bg-white/88 text-slate-600 shadow-[0_10px_20px_rgba(102,88,64,0.06)]"
              >
                ×
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
              <aside className="min-h-0 overflow-y-auto border-b border-[#e2d8c9] px-5 py-5 xl:border-r xl:border-b-0 sm:px-6">
                <div className="rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">当前地址</div>
                  <div className="mt-2 break-all text-sm leading-6 text-slate-700">{activeTask.currentUrl || activeTask.rawUrl}</div>
                </div>

                <div className="mt-4 rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">任务摘要</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{activeTask.logSummary}</div>
                  <div className="mt-3 text-sm text-[#355344]">{activeTask.nextAction}</div>
                  {activeTask.verificationPrompt ? (
                    <div className="mt-3 rounded-[18px] border border-[#efddad] bg-[#fff7e0] px-3 py-3 text-sm leading-6 text-[#7a5f14]">
                      {activeTask.verificationPrompt}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">页面快照</div>
                    <div className={`rounded-full border px-3 py-1 text-xs ${verificationWorkspaceTone(activeTask.pageState)}`}>
                      {verificationWorkspaceLabel(activeTask.pageState)}
                    </div>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-[20px] border border-[#e2d8c9] bg-[#faf7f1]">
                    {activeTask.artifacts?.screenshotPath ? (
                      <img
                        src={`/api/tasks/${activeTask.id}/screenshot?ts=${encodeURIComponent(activeTask.updatedAt)}`}
                        alt={`${activeTask.sourceName} 页面快照`}
                        className="h-auto w-full"
                      />
                    ) : (
                      <div className="px-4 py-12 text-center text-sm text-slate-500">当前暂无页面截图。</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">抓取片段</div>
                  <div className="mt-3 space-y-3">
                    {activeTask.rawFragments.length > 0 ? (
                      activeTask.rawFragments.slice(0, 8).map((fragment) => (
                        <div key={fragment} className="rounded-[18px] border border-[#e2d8c9] bg-[#faf7f1] px-3 py-3 text-sm text-slate-600">
                          {fragment}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#e2d8c9] bg-[#faf7f1] px-4 py-6 text-sm text-slate-500">
                        暂无抓取片段
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="rounded-[24px] border border-[#d8cfbf] bg-white/84 p-5 shadow-[0_12px_28px_rgba(102,88,64,0.06)]">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">人工验证工作区</div>
                      <h3 className="mt-2 text-2xl font-semibold text-[#18222c]">不再要求手填 Cookie 或 storageState</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        点击“启动人工验证”后，系统会打开同会话浏览器窗口。你在窗口里完成验证码、登录或人机校验后，回到这里点击“完成验证并继续抓取”，系统会直接从该会话提取页面内容并继续分析。
                      </p>
                    </div>

                    <div className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${verificationWorkspaceTone(activeTask.pageState)}`}>
                      {verificationWorkspaceLabel(activeTask.pageState)}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-[#e2d8c9] bg-[#faf7f1] px-4 py-4 text-sm leading-6 text-slate-600">
                    当前流程会优先复用同一 Playwright 会话完成验证并继续抓取。只有在站点仍然无法自动读取时，才建议使用下方的人工整理文本兜底。
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleVerificationAction(activeTask.id, "start")}
                      className="rounded-full bg-[#355344] px-5 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
                    >
                      {activeTask.pageState === "VERIFYING" ? "重新聚焦验证窗口" : "启动人工验证"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleVerificationAction(activeTask.id, "complete")}
                      className="rounded-full border border-[#355344]/15 bg-[#eef4e8] px-5 py-3 text-sm text-[#355344] disabled:opacity-60"
                    >
                      完成验证并继续抓取
                    </button>
                  </div>
                </div>

                <details className="mt-4 rounded-[24px] border border-[#d8cfbf] bg-white/82 p-5">
                  <summary className="cursor-pointer list-none text-sm font-medium text-[#18222c]">
                    无法自动抓取时，改用人工整理文本
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    如果站点经过人工验证后仍无法被自动读取，可以直接贴入整理后的页面文本，系统将据此继续生成待校对商品。
                  </p>

                  <label className="mt-4 grid gap-2 text-sm text-slate-700">
                    人工补充文本
                    <textarea
                      value={getForm(activeTask.id).manualContent}
                      onChange={(event) => updateForm(activeTask.id, { manualContent: event.target.value })}
                      className="min-h-40 w-full rounded-[20px] border border-[#d8cfbf] bg-white px-4 py-3 outline-none"
                      placeholder="贴入通过验证后的页面文本"
                    />
                  </label>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={pending || !getForm(activeTask.id).manualContent.trim()}
                      onClick={() => handleContinue(activeTask.id)}
                      className="rounded-full border border-[#d8cfbf] bg-white/88 px-5 py-3 text-sm text-slate-700 disabled:opacity-60"
                    >
                      {pending ? "处理中..." : "使用人工整理文本继续"}
                    </button>
                  </div>
                </details>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTaskId(null)}
                    className="rounded-full border border-[#d8cfbf] bg-white/88 px-4 py-3 text-sm text-slate-700"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TaskTag({ label }: { label: string }) {
  return <span className="rounded-full border border-[#d8cfbf] bg-[#faf7f1] px-3 py-1.5 text-xs text-slate-600">{label}</span>;
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
