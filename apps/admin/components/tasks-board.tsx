"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
import { CrawlTask, VerificationMethod } from "@shop-claw/shared/types";

interface TasksBoardProps {
  tasks: CrawlTask[];
}

interface ContinueFormState {
  verificationToken: string;
  storageState: string;
  manualContent: string;
}

const columns = [
  {
    title: "待补充验证",
    status: "WAITING_HUMAN",
    shellClass: "bg-[linear-gradient(180deg,#faf4ea_0%,#fffaf1_100%)]",
    badgeClass: "bg-[#fff1d6] text-[#8a6515]"
  },
  {
    title: "待校对",
    status: "REVIEWING",
    shellClass: "bg-[linear-gradient(180deg,#eef4e8_0%,#ffffff_100%)]",
    badgeClass: "bg-[#e8f2df] text-[#355344]"
  },
  {
    title: "失败任务",
    status: "FAILED",
    shellClass: "bg-[linear-gradient(180deg,#fbede7_0%,#ffffff_100%)]",
    badgeClass: "bg-[#f8ddd2] text-[#9a4b33]"
  },
  {
    title: "已发布",
    status: "PUBLISHED",
    shellClass: "bg-[linear-gradient(180deg,#eef2f2_0%,#ffffff_100%)]",
    badgeClass: "bg-[#e5ecec] text-[#465461]"
  }
] as const;

const defaultForm: ContinueFormState = {
  verificationToken: "",
  storageState: "",
  manualContent: ""
};

async function readMessage(response: Response) {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.message || "成功";
}

function verificationLabel(method?: VerificationMethod) {
  if (!method) {
    return "无需验证";
  }

  return verificationMethodLabels[method];
}

export function TasksBoard({ tasks }: TasksBoardProps) {
  const router = useRouter();
  const [continueForms, setContinueForms] = useState<Record<string, ContinueFormState>>({});
  const [statusText, setStatusText] = useState("");
  const [pending, startTransition] = useTransition();

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

  function handleContinue(taskId: string) {
    const payload = getForm(taskId);
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        setStatusText(await readMessage(response));
        setContinueForms((current) => ({
          ...current,
          [taskId]: defaultForm
        }));
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

        setStatusText(await readMessage(response));
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "重新抓取失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      {statusText ? (
        <div className="rounded-[24px] border border-[#d8cfbf] bg-[linear-gradient(135deg,#faf4ea_0%,#eef4e8_100%)] px-5 py-4 text-sm text-slate-700 shadow-[0_14px_32px_rgba(102,88,64,0.08)]">
          {statusText}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-4">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);

          return (
            <section
              key={column.status}
              className={`rounded-[30px] border border-[#d8cfbf] p-5 shadow-[0_18px_38px_rgba(102,88,64,0.07)] ${column.shellClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.16em] text-slate-500">{taskStatusLabels[column.status]}</div>
                  <h2 className="mt-2 text-2xl font-semibold text-[#18222c]">{column.title}</h2>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${column.badgeClass}`}>{columnTasks.length}</div>
              </div>

              <div className="mt-5 space-y-4">
                {columnTasks.map((task) => (
                  <article key={task.id} className="rounded-[22px] border border-[#d8cfbf] bg-white/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-[#18222c]">{task.sourceName}</div>
                        <div className="mt-1 text-xs text-slate-500">{task.id}</div>
                      </div>
                      <div className="rounded-full border border-[#d8cfbf] bg-[#faf7f1] px-3 py-1 text-xs text-slate-500">
                        {formatDateLabel(task.updatedAt)}
                      </div>
                    </div>

                    <div className="mt-4 text-sm leading-6 text-slate-600">{task.logSummary}</div>
                    <div className="mt-3 text-sm text-[#375536]">{task.nextAction}</div>
                    {task.currentUrl ? <div className="mt-2 break-all text-xs text-slate-500">{task.currentUrl}</div> : null}

                    {task.rawFragments.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {task.rawFragments.slice(0, 3).map((fragment) => (
                          <div key={fragment} className="rounded-2xl bg-[#faf8f2] px-3 py-2 text-xs text-slate-500">
                            {fragment}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {task.status === "WAITING_HUMAN" ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-[#d8cfbf] bg-[#faf7f1] px-3 py-2 text-xs text-slate-600">
                          当前验证方式：{verificationLabel(task.verificationMethod)}
                        </div>
                        <textarea
                          value={getForm(task.id).verificationToken}
                          onChange={(event) => updateForm(task.id, { verificationToken: event.target.value })}
                          className="min-h-20 w-full rounded-[18px] border border-[#d8cfbf] bg-white px-3 py-2 text-sm outline-none"
                          placeholder="粘贴 Cookie 或验证令牌"
                        />
                        <textarea
                          value={getForm(task.id).storageState}
                          onChange={(event) => updateForm(task.id, { storageState: event.target.value })}
                          className="min-h-24 w-full rounded-[18px] border border-[#d8cfbf] bg-white px-3 py-2 text-sm outline-none"
                          placeholder="如已导出浏览器 storageState，可粘贴 JSON"
                        />
                        <textarea
                          value={getForm(task.id).manualContent}
                          onChange={(event) => updateForm(task.id, { manualContent: event.target.value })}
                          className="min-h-28 w-full rounded-[18px] border border-[#d8cfbf] bg-white px-3 py-2 text-sm outline-none"
                          placeholder="如果站点无法自动访问，可直接贴入通过验证后的页面文本"
                        />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleContinue(task.id)}
                          className="w-full rounded-full bg-[#355344] px-4 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
                        >
                          {pending ? "处理中..." : "补充后继续抓取"}
                        </button>
                      </div>
                    ) : null}

                    {task.status === "REVIEWING" && task.reviewId ? (
                      <Link
                        href={`/review/${task.reviewId}`}
                        className="mt-4 inline-flex rounded-full bg-[#355344] px-4 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
                      >
                        进入商品校对
                      </Link>
                    ) : null}

                    {task.status === "FAILED" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => retryTask(task.sourceId)}
                        className="mt-4 inline-flex rounded-full border border-[#355344]/15 bg-[#eef4e8] px-4 py-3 text-sm text-[#355344] disabled:opacity-60"
                      >
                        重新抓取
                      </button>
                    ) : null}

                    {task.status === "PUBLISHED" && task.timeline.length > 0 ? (
                      <div className="mt-4 rounded-[18px] border border-[#d8cfbf] bg-[#faf7f1] px-3 py-3 text-xs text-slate-500">
                        {task.timeline.slice(-2).map((item) => (
                          <div key={`${item.at}-${item.title}`} className="not-last:mb-2">
                            <div className="font-medium text-slate-700">{item.title}</div>
                            <div>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
    </div>
  );
}
