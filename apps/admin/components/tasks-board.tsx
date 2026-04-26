"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, FileSearch2, RefreshCcw, Search, ShieldAlert, XCircle } from "lucide-react";
import { formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
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
    return "验证会话进行中";
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
  return status === "WAITING_HUMAN" || status === "FAILED";
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
  const [pointerMode, setPointerMode] = useState<"click" | "drag">("click");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualKey, setManualKey] = useState("Enter");
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

  useEffect(() => {
    setWorkspace(null);
    setWorkspaceMessage("");
    setPreviewNonce(0);
    setPointerMode("click");
    setDragStart(null);
    setManualInput("");
    setManualKey("Enter");

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
          setWorkspaceMessage(error instanceof Error ? error.message : "读取验证工作台失败");
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
        setStatusText(error instanceof Error ? error.message : "人工验证处理失败");
      }
    });
  }

  function readPointerPosition(event: ReactMouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: clampValue((event.clientX - rect.left) / rect.width, 0, 1),
      y: clampValue((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLImageElement>) {
    if (!activeTask || !workspace?.active || pointerMode !== "click") {
      return;
    }

    const point = readPointerPosition(event);
    void handleManualInteraction(activeTask.id, { type: "click", ...point });
  }

  function handlePreviewMouseDown(event: ReactMouseEvent<HTMLImageElement>) {
    if (pointerMode !== "drag") {
      return;
    }

    setDragStart(readPointerPosition(event));
  }

  function handlePreviewMouseUp(event: ReactMouseEvent<HTMLImageElement>) {
    if (!activeTask || !workspace?.active || pointerMode !== "drag" || !dragStart) {
      return;
    }

    const point = readPointerPosition(event);
    setDragStart(null);
    void handleManualInteraction(activeTask.id, {
      type: "drag",
      fromX: dragStart.x,
      fromY: dragStart.y,
      toX: point.x,
      toY: point.y
    });
  }

  async function handleManualInteraction(
    taskId: string,
    payload:
      | { type: "back" | "forward" | "reload" | "wait"; timeoutMs?: number }
      | { type: "scroll"; deltaY: number }
      | { type: "click"; x: number; y: number }
      | { type: "drag"; fromX: number; fromY: number; toX: number; toY: number }
      | { type: "type"; text: string }
      | { type: "press"; key: string }
  ) {
    setStatusText("");
    setWorkspaceMessage("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/verification/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await readResponse(response);
        setStatusText(result.message);
        setPreviewNonce((current) => current + 1);
        await refreshWorkspace(taskId, true).catch(() => undefined);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "人工验证操作失败");
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

  function clearTasks(status: Extract<TaskStatus, "WAITING_HUMAN" | "FAILED">, title: string) {
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

  const screenshotUrl =
    activeTask && workspace?.active
      ? `/api/tasks/${activeTask.id}/verification/screenshot?ts=${encodeURIComponent(String(previewNonce))}`
      : null;
  const currentUrl = workspace?.currentUrl || activeTask?.currentUrl || activeTask?.rawUrl || "";

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
                      onClick={() => clearTasks(column.status as Extract<TaskStatus, "WAITING_HUMAN" | "FAILED">, column.title)}
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
                            进入验证工作台
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
            className="flex max-h-[94vh] w-full max-w-[1420px] flex-col overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee2_62%,#edf4e7_100%)] shadow-[0_24px_80px_rgba(24,34,44,0.18)]"
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

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
              <aside className="min-h-0 overflow-y-auto border-b border-[#e2d8c9] px-5 py-5 xl:border-r xl:border-b-0 sm:px-6">
                <div className="rounded-[22px] border border-[#d8cfbf] bg-white/82 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">当前地址</div>
                      <div className="mt-2 break-all text-sm leading-6 text-slate-700">{currentUrl}</div>
                    </div>
                    {currentUrl ? (
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#d8cfbf] bg-white px-3 py-2 text-xs text-[#355344]"
                      >
                        打开页面
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
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
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">工作台状态</div>
                    <div className={`rounded-full border px-3 py-1 text-xs ${verificationWorkspaceTone(activeTask.pageState)}`}>
                      {verificationWorkspaceLabel(activeTask.pageState)}
                    </div>
                  </div>

                  <div className="mt-3 rounded-[20px] border border-[#e2d8c9] bg-[#faf7f1] px-4 py-4 text-sm leading-6 text-slate-600">
                    启动工作台后，右侧会显示真实浏览器页面的实时截图。可以直接点击截图、拖拽滑块、输入文本并发送按键。
                  </div>

                  {workspace?.stale ? (
                    <div className="mt-3 rounded-[18px] border border-[#efddad] bg-[#fff7e0] px-3 py-3 text-sm leading-6 text-[#7a5f14]">
                      之前的验证会话已经断开。重新启动后会按当前地址恢复工作台。
                    </div>
                  ) : null}
                </div>
              </aside>

              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
                <section className="overflow-hidden rounded-[28px] border border-[#1a3031] bg-[radial-gradient(circle_at_top,#2d4f47_0%,#18222c_68%)] shadow-[0_20px_60px_rgba(24,34,44,0.18)]">
                  <div className="border-b border-white/10 px-5 py-4 text-white sm:px-6">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-white/56">Verification Workspace</div>
                        <h3 className="mt-2 text-2xl font-semibold text-white">人工验证工作台</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">
                          仅在页面真正触发验证或自动抓取异常时启用。完成验证后，任务会继续抓取并自动进入 AI 聚合与商品校对。
                        </p>
                      </div>

                      <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs text-white/72">
                        {workspace?.active ? "会话已连接" : "等待启动"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleVerificationAction(activeTask.id, "start")}
                        className="rounded-full bg-[#f2d48f] px-5 py-3 text-sm font-medium text-[#18222c] shadow-[0_12px_24px_rgba(242,212,143,0.18)] disabled:opacity-60"
                      >
                        {workspace?.active ? "恢复验证工作台" : "启动验证工作台"}
                      </button>
                      <button
                        type="button"
                        disabled={pending || !workspace?.active}
                        onClick={() => setPreviewNonce((current) => current + 1)}
                        className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm text-white disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-2">
                          <RefreshCcw className="h-4 w-4" />
                          刷新截图
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={pending || !workspace?.active}
                        onClick={() => handleVerificationAction(activeTask.id, "complete")}
                        className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm text-white disabled:opacity-50"
                      >
                        完成验证并继续抓取
                      </button>
                      {currentUrl ? (
                        <a
                          href={currentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm text-white"
                        >
                          <span className="inline-flex items-center gap-2">
                            <ExternalLink className="h-4 w-4" />
                            打开当前页面
                          </span>
                        </a>
                      ) : null}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,0.38fr)]">
                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-white/56">操作方式</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={pending || !workspace?.active}
                            onClick={() => {
                              setPointerMode("click");
                              setDragStart(null);
                            }}
                            className={`rounded-full px-4 py-2 text-sm ${
                              pointerMode === "click"
                                ? "border border-[#f2d48f] bg-[#f2d48f] text-[#18222c]"
                                : "border border-white/12 bg-white/10 text-white"
                            } disabled:opacity-50`}
                          >
                            点击模式
                          </button>
                          <button
                            type="button"
                            disabled={pending || !workspace?.active}
                            onClick={() => {
                              setPointerMode("drag");
                              setDragStart(null);
                            }}
                            className={`rounded-full px-4 py-2 text-sm ${
                              pointerMode === "drag"
                                ? "border border-[#f2d48f] bg-[#f2d48f] text-[#18222c]"
                                : "border border-white/12 bg-white/10 text-white"
                            } disabled:opacity-50`}
                          >
                            拖拽模式
                          </button>
                        </div>
                        <div className="mt-3 text-sm leading-6 text-white/70">
                          {pointerMode === "click"
                            ? "点击截图即可在真实页面中点击对应位置。"
                            : dragStart
                              ? "已记录拖拽起点，松开鼠标后会发送拖拽操作。"
                              : "按下并拖动截图可处理滑块或拖拽验证。"}
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-white/56">快捷操作</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ControlButton disabled={pending || !workspace?.active} label="返回" onClick={() => void handleManualInteraction(activeTask.id, { type: "back" })} />
                          <ControlButton disabled={pending || !workspace?.active} label="前进" onClick={() => void handleManualInteraction(activeTask.id, { type: "forward" })} />
                          <ControlButton disabled={pending || !workspace?.active} label="刷新" onClick={() => void handleManualInteraction(activeTask.id, { type: "reload" })} />
                          <ControlButton disabled={pending || !workspace?.active} label="上滚" onClick={() => void handleManualInteraction(activeTask.id, { type: "scroll", deltaY: -620 })} />
                          <ControlButton disabled={pending || !workspace?.active} label="下滚" onClick={() => void handleManualInteraction(activeTask.id, { type: "scroll", deltaY: 620 })} />
                          <ControlButton disabled={pending || !workspace?.active} label="等待 2 秒" onClick={() => void handleManualInteraction(activeTask.id, { type: "wait", timeoutMs: 2000 })} />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,0.38fr)]">
                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-white/56">发送文本</div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <input
                            value={manualInput}
                            onChange={(event) => setManualInput(event.target.value)}
                            placeholder="先点击输入框，再发送文本"
                            className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/36"
                          />
                          <button
                            type="button"
                            disabled={pending || !workspace?.active || !manualInput.trim()}
                            onClick={() => void handleManualInteraction(activeTask.id, { type: "type", text: manualInput.trim() })}
                            className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm text-white disabled:opacity-50"
                          >
                            发送文本
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-white/56">发送按键</div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <select
                            value={manualKey}
                            onChange={(event) => setManualKey(event.target.value)}
                            className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/10 px-4 py-3 text-sm text-white outline-none"
                          >
                            {["Enter", "Tab", "Escape", "Space", "Backspace", "ArrowUp", "ArrowDown"].map((item) => (
                              <option key={item} value={item} className="text-[#18222c]">
                                {item}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={pending || !workspace?.active}
                            onClick={() => void handleManualInteraction(activeTask.id, { type: "press", key: manualKey })}
                            className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm text-white disabled:opacity-50"
                          >
                            发送按键
                          </button>
                        </div>
                      </div>
                    </div>

                    {workspaceMessage ? (
                      <div className="rounded-[20px] border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/78">
                        {workspaceMessage}
                      </div>
                    ) : null}

                    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#0f171f]">
                      {screenshotUrl ? (
                        <div className="relative bg-[#0f171f]">
                          <img
                            src={screenshotUrl}
                            alt={`${activeTask.sourceName} 人工验证截图`}
                            className={`block max-h-[72vh] w-full object-contain ${
                              pointerMode === "drag" ? "cursor-crosshair" : "cursor-pointer"
                            }`}
                            draggable={false}
                            onClick={handlePreviewClick}
                            onMouseDown={handlePreviewMouseDown}
                            onMouseUp={handlePreviewMouseUp}
                            onMouseLeave={() => setDragStart(null)}
                          />

                          <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/12 bg-[#101923]/78 px-3 py-1.5 text-xs text-white/72">
                            {pointerMode === "drag" ? "拖拽模式" : "点击模式"}
                          </div>

                          {dragStart ? (
                            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-[#f2d48f]/60 bg-[#1c2a2d]/84 px-3 py-1.5 text-xs text-[#f7dfab]">
                              已记录拖拽起点
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex h-[72vh] items-center justify-center px-8 text-center text-sm text-white/54">
                          点击“启动验证工作台”后，这里会显示实时页面截图。
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <details className="mt-4 rounded-[24px] border border-[#d8cfbf] bg-white/82 p-5">
                  <summary className="cursor-pointer list-none text-sm font-medium text-[#18222c]">
                    自动读取仍失败时，改用人工整理文本兜底
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    如果站点经过嵌入验证后仍然无法被自动读取，可以直接贴入整理后的页面文本，系统将据此继续生成待校对商品。
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

function ControlButton({ disabled, label, onClick }: { disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
