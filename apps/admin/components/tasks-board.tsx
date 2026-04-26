"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileSearch2, Search, ShieldAlert, XCircle } from "lucide-react";
import { formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
import {
  MANUAL_VERIFICATION_CHROME_COMMAND,
  buildManualVerificationChromeSetupHint
} from "@shop-claw/shared/manual-verification";
import { CrawlTask, TaskStatus, VerificationMethod } from "@shop-claw/shared/types";

interface TasksBoardProps {
  tasks: CrawlTask[];
}

interface ContinueFormState {
  manualContent: string;
}

interface VerificationWorkspaceState {
  active: boolean;
  stale?: boolean;
  currentUrl: string;
  embedUrl: string;
  lastUpdatedAt: string;
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
const manualVerificationSetupHint = buildManualVerificationChromeSetupHint();

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
    return "人工验证进行中";
  }

  if (pageState === "RESUMED") {
    return "已恢复抓取";
  }

  return "等待启动";
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

function isClearableStatus(status: TaskStatus) {
  return status === "WAITING_HUMAN" || status === "REVIEWING" || status === "FAILED";
}

export function TasksBoard({ tasks }: TasksBoardProps) {
  const router = useRouter();
  const [continueForms, setContinueForms] = useState<Record<string, ContinueFormState>>({});
  const [statusText, setStatusText] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<VerificationWorkspaceState | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
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

  const activeTask =
    filteredTasks.find((task) => task.id === activeTaskId) ?? tasks.find((task) => task.id === activeTaskId) ?? null;

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

  useEffect(() => {
    setWorkspace(null);
    setWorkspaceMessage("");
    setPreviewNonce(0);

    if (!activeTask || activeTask.status !== "WAITING_HUMAN") {
      return;
    }

    const currentTaskId = activeTask.id;
    let cancelled = false;

    async function loadWorkspace(silent = false) {
      try {
        const response = await fetch(`/api/tasks/${currentTaskId}/verification/session`, {
          cache: "no-store"
        });
        const result = await readResponse<VerificationWorkspaceState>(response);

        if (!cancelled) {
          setWorkspace(result.data ?? null);

          if (!silent) {
            setWorkspaceMessage("");
          }
        }
      } catch (error) {
        if (!cancelled && !silent) {
          setWorkspaceMessage(error instanceof Error ? error.message : "读取人工验证状态失败");
        }
      }
    }

    void loadWorkspace();
    const timer = window.setInterval(() => {
      void loadWorkspace(true);
    }, 1_500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTask]);

  useEffect(() => {
    if (!activeTask || activeTask.status !== "WAITING_HUMAN" || !workspace?.active) {
      return;
    }

    const timer = window.setInterval(() => {
      setPreviewNonce((current) => current + 1);
    }, 2_500);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTask, workspace?.active]);

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

  async function refreshWorkspace(taskId: string, silent = false) {
    const response = await fetch(`/api/tasks/${taskId}/verification/session`, {
      cache: "no-store"
    });
    const result = await readResponse<VerificationWorkspaceState>(response);
    setWorkspace(result.data ?? null);

    if (!silent) {
      setWorkspaceMessage("");
    }
  }

  function handleVerificationAction(taskId: string, action: "start" | "complete") {
    setStatusText("");
    setWorkspaceMessage("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/verification/${action}`, {
          method: "POST"
        });
        const result = await readResponse<CrawlTask>(response);
        setStatusText(result.message);

        if (action === "start") {
          await refreshWorkspace(taskId, true).catch(() => undefined);
          setPreviewNonce((current) => current + 1);
        }

        if (action === "complete" && result.data?.status && result.data.status !== "WAITING_HUMAN") {
          setActiveTaskId(null);
        }

        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "人工验证处理失败";
        setStatusText(message);

        if (action === "start") {
          setWorkspaceMessage(message);
        }
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
          body: JSON.stringify({ manualContent: payload.manualContent })
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

  function clearTasks(status: Extract<TaskStatus, "WAITING_HUMAN" | "REVIEWING" | "FAILED">, title: string) {
    if (!window.confirm(`确认清空“${title}”中的全部任务吗？`)) {
      return;
    }

    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/tasks/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        });
        const result = await readResponse<{ status: TaskStatus; clearedCount: number }>(response);

        if (activeTask?.status === status) {
          setActiveTaskId(null);
        }

        setStatusText(result.message);
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "清空任务失败");
      }
    });
  }

  const currentUrl = workspace?.currentUrl || activeTask?.currentUrl || activeTask?.rawUrl || "";
  const screenshotUrl =
    activeTask && workspace?.active && !workspace?.embedUrl
      ? `/api/tasks/${activeTask.id}/verification/screenshot?ts=${encodeURIComponent(String(previewNonce))}`
      : null;

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
                <div className="flex items-center gap-2">
                  {isClearableStatus(column.status) ? (
                    <button
                      type="button"
                      disabled={pending || columnTasks.length === 0}
                      onClick={() =>
                        clearTasks(column.status as Extract<TaskStatus, "WAITING_HUMAN" | "REVIEWING" | "FAILED">, column.title)
                      }
                      className="rounded-full border border-[#d8cfbf] bg-white/92 px-3 py-1.5 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      清空
                    </button>
                  ) : null}
                  <div className={`rounded-full px-3 py-1 text-xs font-medium ${column.badgeClass}`}>{columnTasks.length}</div>
                </div>
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
                            进入人工验证
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
            className="flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee2_62%,#edf4e7_100%)] shadow-[0_24px_80px_rgba(24,34,44,0.18)]"
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

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
              <aside className="min-h-0 overflow-y-auto border-b border-[#e2d8c9] px-5 py-5 xl:border-r xl:border-b-0 sm:px-6">
                <div className="rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">当前地址</div>
                  <div className="mt-2 break-all text-sm leading-6 text-slate-700">{currentUrl}</div>
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
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">验证状态</div>
                    <div className={`rounded-full border px-3 py-1 text-xs ${verificationWorkspaceTone(activeTask.pageState)}`}>
                      {verificationWorkspaceLabel(activeTask.pageState)}
                    </div>
                  </div>

                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    {workspace?.embedUrl
                      ? "当前任务已切换到内嵌人工验证工作台。请直接在右侧页面中完成验证码、登录或页面放行。"
                      : workspace?.active
                        ? "当前 Chrome 验证会话已连接。请直接在该 Chrome 窗口中完成验证码、登录或页面放行。"
                      : `尚未连接可调试的 Chrome 会话。${manualVerificationSetupHint}`}
                  </div>

                  {workspace?.lastUpdatedAt ? (
                    <div className="mt-3 text-xs text-slate-500">最近状态更新：{formatDateLabel(workspace.lastUpdatedAt)}</div>
                  ) : null}

                  {workspace?.stale ? (
                    <div className="mt-3 rounded-[18px] border border-[#efddad] bg-[#fff7e0] px-3 py-3 text-sm leading-6 text-[#7a5f14]">
                      之前的人工验证会话已断开，请重新启动人工验证；如果验证已经完成，也可以直接点击下方“完成验证并继续抓取”，系统会尝试恢复当前会话并继续读取页面。
                    </div>
                  ) : null}

                  {workspaceMessage ? (
                    <div className="mt-3 rounded-[18px] border border-[#d8cfbf] bg-[#faf7f1] px-3 py-3 text-sm leading-6 text-slate-600">
                      {workspaceMessage}
                    </div>
                  ) : null}
                </div>
              </aside>

              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
                <section className="rounded-[28px] border border-[#d8cfbf] bg-white/84 p-5 shadow-[0_16px_34px_rgba(102,88,64,0.08)]">
                  <div className="inline-flex rounded-full border border-[#d8cfbf] bg-[#faf7f1] px-3 py-1 text-xs text-slate-500">
                    Manual Verification
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold text-[#18222c]">处理人工验证</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {workspace?.embedUrl
                      ? "右侧验证页可直接交互，完成验证码、登录或页面放行后，点击“完成验证并继续抓取”即可继续；当前地址会随页面跳转自动同步。"
                      : "连接当前验证会话后，请在对应页面中完成验证码、登录或页面放行；完成后返回这里点击“完成验证并继续抓取”。"}
                  </p>

                  {workspace?.embedUrl ? (
                    <div className="mt-4 rounded-[22px] border border-[#d8cfbf] bg-[#f6f1e7] p-4 text-sm leading-6 text-slate-700">
                      当前任务正在使用内嵌人工验证页。若页面再次跳转，左侧“当前地址”会自动更新，并作为后续继续抓取的目标地址。
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-[22px] border border-[#d8cfbf] bg-[#f6f1e7] p-4 text-sm leading-6 text-slate-700">
                        <div>{manualVerificationSetupHint}</div>
                        <code className="mt-3 block rounded-[16px] bg-[#18222c] px-4 py-3 font-mono text-xs text-[#f5efe3]">
                          {MANUAL_VERIFICATION_CHROME_COMMAND}
                        </code>
                      </div>

                      <div className="mt-5 grid gap-3 rounded-[22px] border border-[#e2d8c9] bg-[#faf7f1] p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#355344] text-xs text-white">1</div>
                          <div className="text-sm leading-6 text-slate-700">关闭现有 Chrome 窗口，并按上面的命令重新启动一个可调试的 Chrome。</div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#355344] text-xs text-white">2</div>
                          <div className="text-sm leading-6 text-slate-700">点击“启动人工验证”，让系统附着到当前验证会话。</div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#355344] text-xs text-white">3</div>
                          <div className="text-sm leading-6 text-slate-700">完成验证并确认页面放行后，返回后台点击“完成验证并继续抓取”。</div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleVerificationAction(activeTask.id, "start")}
                      className="rounded-full bg-[#355344] px-5 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
                    >
                      {workspace?.embedUrl ? "刷新人工验证页面" : workspace?.active ? "重新聚焦当前 Chrome" : "启动人工验证"}
                    </button>
                    <button
                      type="button"
                      disabled={pending || (!workspace?.active && activeTask.pageState !== "VERIFYING")}
                      onClick={() => handleVerificationAction(activeTask.id, "complete")}
                      className="rounded-full border border-[#355344]/15 bg-[#eef4e8] px-5 py-3 text-sm text-[#355344] disabled:opacity-50"
                    >
                      完成验证并继续抓取
                    </button>
                  </div>
                </section>

                <section className="mt-4 overflow-hidden rounded-[28px] border border-[#1a3031] bg-[radial-gradient(circle_at_top,#2d4f47_0%,#18222c_68%)] shadow-[0_20px_60px_rgba(24,34,44,0.18)]">
                  <div className="border-b border-white/10 px-5 py-4 text-white sm:px-6">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/56">Live Preview</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      {workspace?.embedUrl ? "人工验证页面" : "当前验证页预览"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/72">
                      {workspace?.embedUrl
                        ? "可以直接在下方页面中完成验证；页面跳转后左侧当前地址会自动同步。"
                        : "这里会显示当前验证页的实时预览；如需操作，请在已连接的验证会话中完成。"}
                    </p>
                  </div>

                  <div className="bg-[#0d151d] p-4 sm:p-5">
                    {workspace?.embedUrl ? (
                      <iframe
                        src={workspace.embedUrl}
                        title="人工验证页面"
                        className="h-[72vh] w-full rounded-[20px] border border-white/10 bg-white"
                      />
                    ) : screenshotUrl ? (
                      <img
                        key={screenshotUrl}
                        src={screenshotUrl}
                        alt="当前验证页预览"
                        className="max-h-[72vh] w-full rounded-[20px] border border-white/10 bg-[#111a23] object-contain"
                      />
                    ) : (
                      <div className="flex h-[58vh] items-center justify-center rounded-[20px] border border-dashed border-white/12 px-8 text-center text-sm text-white/54">
                        点击“启动人工验证”后，这里会显示当前验证页的实时预览。
                      </div>
                    )}
                  </div>
                </section>

                <details className="mt-4 rounded-[24px] border border-[#d8cfbf] bg-white/82 p-5">
                  <summary className="cursor-pointer list-none text-sm font-medium text-[#18222c]">
                    自动读取仍失败时，改用人工整理文本兜底
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    如果站点完成人工验证后仍然无法被自动读取，可以直接贴入整理后的页面文本，系统将据此继续生成待校对商品。
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
