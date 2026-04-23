"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CrawlMode, DataSource, VerificationMethod } from "@shop-claw/shared/types";
import {
  crawlModeLabels,
  formatBooleanLabel,
  formatDateLabel,
  verificationMethodLabels
} from "@shop-claw/shared/labels";

interface SourcesConsoleProps {
  sources: DataSource[];
}

interface SourceFormState {
  sourceName: string;
  sourceUrl: string;
  entryUrl: string;
  crawlMode: CrawlMode;
  verificationMethod: VerificationMethod;
  waitSelector: string;
  headless: boolean;
  blockAssets: boolean;
}

const emptySourceForm: SourceFormState = {
  sourceName: "",
  sourceUrl: "",
  entryUrl: "",
  crawlMode: "AUTO",
  verificationMethod: "NONE",
  waitSelector: "body",
  headless: true,
  blockAssets: true
};

async function readMessage(response: Response) {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.message || "成功";
}

export function SourcesConsole({ sources }: SourcesConsoleProps) {
  const router = useRouter();
  const [sourceForm, setSourceForm] = useState<SourceFormState>(emptySourceForm);
  const [statusText, setStatusText] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sourceForm)
        });

        setStatusText(await readMessage(response));
        setSourceForm(emptySourceForm);
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "创建失败");
      }
    });
  }

  function triggerCrawl(sourceId: string) {
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/tasks/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId })
        });

        setStatusText(await readMessage(response));
        router.push("/tasks");
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "发起抓取失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl">新增数据源</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-shell px-4 py-2 text-sm text-slate-500">
            已有 {sources.length} 个数据源
          </div>
        </div>

        <form onSubmit={handleCreateSource} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-600">
            名称
            <input
              value={sourceForm.sourceName}
              onChange={(event) => setSourceForm((current) => ({ ...current, sourceName: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
              placeholder="例如：Claude Hub CN"
              required
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            站点链接
            <input
              value={sourceForm.sourceUrl}
              onChange={(event) => setSourceForm((current) => ({ ...current, sourceUrl: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
              placeholder="https://example.com"
              required
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            抓取入口
            <input
              value={sourceForm.entryUrl}
              onChange={(event) => setSourceForm((current) => ({ ...current, entryUrl: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
              placeholder="留空则默认使用站点链接"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            等待元素
            <input
              value={sourceForm.waitSelector}
              onChange={(event) => setSourceForm((current) => ({ ...current, waitSelector: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
              placeholder="body"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            抓取模式
            <select
              value={sourceForm.crawlMode}
              onChange={(event) =>
                setSourceForm((current) => ({ ...current, crawlMode: event.target.value as CrawlMode }))
              }
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
            >
              <option value="AUTO">自动抓取</option>
              <option value="MANUAL_ASSIST">人工辅助</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            验证方式
            <select
              value={sourceForm.verificationMethod}
              onChange={(event) =>
                setSourceForm((current) => ({
                  ...current,
                  verificationMethod: event.target.value as VerificationMethod
                }))
              }
              className="rounded-2xl border border-slate-200 bg-shell px-4 py-3 outline-none"
            >
              <option value="NONE">无需验证</option>
              <option value="CAPTCHA">验证码</option>
              <option value="LOGIN">登录态</option>
              <option value="MANUAL">人工确认</option>
            </select>
          </label>

          <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-shell px-4 py-3 text-sm text-slate-600">
              <input
                checked={sourceForm.headless}
                onChange={(event) => setSourceForm((current) => ({ ...current, headless: event.target.checked }))}
                type="checkbox"
              />
              使用无头模式
            </label>

            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-shell px-4 py-3 text-sm text-slate-600">
              <input
                checked={sourceForm.blockAssets}
                onChange={(event) => setSourceForm((current) => ({ ...current, blockAssets: event.target.checked }))}
                type="checkbox"
              />
              阻止图片和媒体资源
            </label>
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-3">
            {statusText ? <div className="text-sm text-slate-500">{statusText}</div> : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-ink px-5 py-3 text-sm text-white disabled:opacity-60"
            >
              {pending ? "处理中..." : "创建数据源"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[30px] border border-white/80 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl">已接入数据源</h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {sources.length > 0 ? (
            sources.map((source) => (
              <article
                key={source.sourceId}
                className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-ink">{source.sourceName}</h3>
                    <div className="mt-2 break-all text-sm text-slate-500">{source.sourceUrl}</div>
                    {source.entryUrl !== source.sourceUrl ? (
                      <div className="mt-1 break-all text-xs text-slate-400">入口：{source.entryUrl}</div>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      source.enabled ? "bg-[#eaf6ef] text-[#206845]" : "bg-[#f2f3f5] text-slate-500"
                    }`}
                  >
                    {formatBooleanLabel(source.enabled)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <div>抓取模式：{crawlModeLabels[source.crawlMode]}</div>
                  <div>验证方式：{verificationMethodLabels[source.verificationMethod]}</div>
                  <div>等待元素：{source.waitSelector}</div>
                  <div>浏览器模式：{source.headless ? "无头" : "可见窗口"}</div>
                  <div>资源拦截：{source.blockAssets ? "已启用" : "未启用"}</div>
                  <div>最近执行：{source.lastRunAt ? formatDateLabel(source.lastRunAt) : "尚未执行"}</div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">{source.sourceId}</div>
                  <button
                    type="button"
                    disabled={pending || !source.enabled}
                    onClick={() => triggerCrawl(source.sourceId)}
                    className="rounded-full bg-ink px-5 py-3 text-sm text-white disabled:opacity-50"
                  >
                    立即抓取
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-shell p-8 text-center text-slate-500">
              还没有数据源，请先在上方创建。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
