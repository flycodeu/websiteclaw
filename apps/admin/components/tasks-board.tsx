"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeTypeLabels, formatDateLabel, taskStatusLabels, verificationMethodLabels } from "@shop-claw/shared/labels";
import { CrawlTask, VerificationMethod } from "@shop-claw/shared/types";

interface TasksBoardProps {
  tasks: CrawlTask[];
}

interface ContinueFormState {
  verificationToken: string;
  storageState: string;
  verificationNote: string;
  manualContent: string;
}

const columns = [
  { title: "待人工验证", status: "WAITING_HUMAN" },
  { title: "待审核", status: "REVIEWING" },
  { title: "失败任务", status: "FAILED" },
  { title: "已发布", status: "PUBLISHED" }
] as const;

const defaultForm: ContinueFormState = {
  verificationToken: "",
  storageState: "",
  verificationNote: "",
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
      <div className="rounded-[28px] border border-white/80 bg-white px-5 py-4 text-sm text-slate-500 shadow-panel">
        {statusText || "人工验证支持粘贴 Cookie、storageState JSON，或直接贴入通过验证后的页面文本。"}
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        {columns.map((column) => (
          <section key={column.status} className="rounded-[30px] border border-white/80 bg-white p-5 shadow-panel">
            <div className="text-sm text-slate-500">{taskStatusLabels[column.status]}</div>
            <h2 className="mt-2 text-2xl font-semibold">{column.title}</h2>

            <div className="mt-5 space-y-4">
              {tasks
                .filter((task) => task.status === column.status)
                .map((task) => (
                  <article key={task.id} className="rounded-[22px] bg-shell p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink">{task.sourceName}</div>
                        <div className="mt-1 text-xs text-slate-400">{task.id}</div>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                        {formatDateLabel(task.updatedAt)}
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-slate-600">{task.logSummary}</div>
                    <div className="mt-3 text-sm text-[#3f63b2]">{task.nextAction}</div>
                    {task.currentUrl ? <div className="mt-2 text-xs text-slate-400">{task.currentUrl}</div> : null}

                    {task.rawFragments.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {task.rawFragments.slice(0, 3).map((fragment) => (
                          <div key={fragment} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-500">
                            {fragment}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {task.status === "WAITING_HUMAN" ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          当前验证方式：{verificationLabel(task.verificationMethod)}
                        </div>
                        <textarea
                          value={getForm(task.id).verificationToken}
                          onChange={(event) => updateForm(task.id, { verificationToken: event.target.value })}
                          className="min-h-20 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="粘贴 Cookie 或验证令牌"
                        />
                        <textarea
                          value={getForm(task.id).storageState}
                          onChange={(event) => updateForm(task.id, { storageState: event.target.value })}
                          className="min-h-24 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="如已导出浏览器 storageState，可粘贴 JSON"
                        />
                        <textarea
                          value={getForm(task.id).verificationNote}
                          onChange={(event) => updateForm(task.id, { verificationNote: event.target.value })}
                          className="min-h-20 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder={task.verificationPrompt || "记录验证步骤或注意事项"}
                        />
                        <textarea
                          value={getForm(task.id).manualContent}
                          onChange={(event) => updateForm(task.id, { manualContent: event.target.value })}
                          className="min-h-28 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="如果站点无法自动访问，可直接贴入通过验证后的页面文本"
                        />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleContinue(task.id)}
                          className="w-full rounded-full bg-ink px-4 py-3 text-sm text-white disabled:opacity-60"
                        >
                          {pending ? "处理中..." : "验证后继续抓取"}
                        </button>
                      </div>
                    ) : null}

                    {task.status === "REVIEWING" && task.reviewId ? (
                      <Link
                        href={`/review/${task.reviewId}`}
                        className="mt-4 inline-flex rounded-full bg-ink px-4 py-3 text-sm text-white"
                      >
                        进入审核
                      </Link>
                    ) : null}

                    {task.status === "FAILED" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => retryTask(task.sourceId)}
                        className="mt-4 inline-flex rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-700 disabled:opacity-60"
                      >
                        重新抓取
                      </button>
                    ) : null}

                    {task.status === "PUBLISHED" && task.timeline.length > 0 ? (
                      <div className="mt-4 rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
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

              {tasks.filter((task) => task.status === column.status).length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-300 bg-shell px-4 py-8 text-center text-sm text-slate-500">
                  当前列暂无任务
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
