"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Globe2, Pencil, Play, Plus, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { CrawlBatchState, CrawlMode, DataSource, ShopSummary, VerificationMethod } from "@shop-claw/shared/types";
import { formatDateLabel } from "@shop-claw/shared/labels";

interface SourcesConsoleProps {
  sources: DataSource[];
  publishedShops: ShopSummary[];
  crawlBatch: CrawlBatchState | null;
}

interface SourceFormState {
  sourceName: string;
  sourceUrl: string;
  entryUrl: string;
  crawlMode: CrawlMode;
  verificationMethod: VerificationMethod;
  verificationPrompt: string;
  waitSelector: string;
  headless: boolean;
  blockAssets: boolean;
  enabled: boolean;
  visible: boolean;
}

const emptySourceForm: SourceFormState = {
  sourceName: "",
  sourceUrl: "",
  entryUrl: "",
  crawlMode: "AUTO",
  verificationMethod: "NONE",
  verificationPrompt: "",
  waitSelector: "body",
  headless: true,
  blockAssets: true,
  enabled: true,
  visible: true
};

async function readMessage(response: Response) {
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.message || "成功";
}

function buildSourceForm(source?: DataSource | null): SourceFormState {
  if (!source) {
    return emptySourceForm;
  }

  return {
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    entryUrl: source.entryUrl,
    crawlMode: source.crawlMode,
    verificationMethod: source.verificationMethod,
    verificationPrompt: source.verificationPrompt,
    waitSelector: source.waitSelector,
    headless: source.headless,
    blockAssets: source.blockAssets,
    enabled: source.enabled,
    visible: source.visible
  };
}

export function SourcesConsole({ sources, publishedShops, crawlBatch }: SourcesConsoleProps) {
  const router = useRouter();
  const [sourceForm, setSourceForm] = useState<SourceFormState>(emptySourceForm);
  const [statusText, setStatusText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredSources = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return [...sources]
      .filter((source) => {
        if (!normalizedKeyword) {
          return true;
        }

        return (
          source.sourceName.toLowerCase().includes(normalizedKeyword) ||
          source.sourceUrl.toLowerCase().includes(normalizedKeyword) ||
          source.entryUrl.toLowerCase().includes(normalizedKeyword)
        );
      })
      .sort((left, right) => {
        const leftStamp = Date.parse(left.lastRunAt || left.updatedAt || left.createdAt);
        const rightStamp = Date.parse(right.lastRunAt || right.updatedAt || right.createdAt);
        return rightStamp - leftStamp;
      });
  }, [keyword, sources]);
  const publishedShopBySourceId = useMemo(
    () => new Map(publishedShops.map((shop) => [shop.sourceId, shop] as const)),
    [publishedShops]
  );
  const batchSourceIds = useMemo(
    () => filteredSources.filter((source) => source.enabled).map((source) => source.sourceId),
    [filteredSources]
  );

  const enabledCount = sources.filter((source) => source.enabled).length;
  const verificationCount = sources.filter((source) => source.verificationMethod !== "NONE").length;
  const crawledCount = sources.filter((source) => Boolean(source.lastRunAt)).length;
  const batchTotal = crawlBatch?.sourceIds.length ?? 0;
  const batchCompleted = crawlBatch?.completedSourceIds.length ?? 0;
  const activeModal = isCreateOpen ? "create" : editingSource ? "edit" : null;

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeModal]);

  function closeModal() {
    setIsCreateOpen(false);
    setEditingSource(null);
    setSourceForm(emptySourceForm);
  }

  function openCreateModal() {
    setEditingSource(null);
    setSourceForm(emptySourceForm);
    setIsCreateOpen(true);
  }

  function openEditModal(source: DataSource) {
    setIsCreateOpen(false);
    setEditingSource(source);
    setSourceForm(buildSourceForm(source));
  }

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
        closeModal();
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "创建失败");
      }
    });
  }

  function handleUpdateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingSource) {
      return;
    }

    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/sources/${editingSource.sourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sourceForm)
        });

        setStatusText(await readMessage(response));
        closeModal();
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "更新失败");
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

  function triggerBatchCrawl() {
    if (batchSourceIds.length === 0) {
      setStatusText("当前列表里没有可批量抓取的启用站点。");
      return;
    }

    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/tasks/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceIds: batchSourceIds,
            startBatch: true
          })
        });

        setStatusText(await readMessage(response));
        router.push("/tasks");
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "发起批量抓取失败");
      }
    });
  }

  function toggleVisibility(source: DataSource) {
    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/sources/${source.sourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible: !source.visible })
        });

        setStatusText(await readMessage(response));
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "更新站点展示状态失败");
      }
    });
  }

  function removeSource(source: DataSource) {
    if (!window.confirm(`确认删除站点“${source.sourceName}”及其全部关联任务、校对和发布数据吗？`)) {
      return;
    }

    setStatusText("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/sources/${source.sourceId}`, {
          method: "DELETE"
        });

        setStatusText(await readMessage(response));
        router.refresh();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "删除站点失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      {statusText ? (
        <div className="rounded-[24px] border border-[#d8cfbf] bg-white/88 px-5 py-4 text-sm text-slate-700 shadow-[0_14px_32px_rgba(102,88,64,0.08)]">
          {statusText}
        </div>
      ) : null}

      <section className="rounded-[30px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#faf4ea_0%,#f7f1e6_100%)] p-6 shadow-[0_18px_38px_rgba(102,88,64,0.07)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white px-4 py-2 text-sm text-slate-600">
              站点工作台
            </div>
            <h2 className="mt-4 font-serif text-3xl text-[#18222c]">采集与发布站点</h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex min-w-0 items-center gap-2 rounded-[20px] border border-[#d8cfbf] bg-white/88 px-4 py-3 text-sm text-slate-500 shadow-[0_10px_24px_rgba(102,88,64,0.06)] sm:w-[320px]">
              <Search className="h-4 w-4" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索站点名称或链接"
                className="w-full min-w-0 bg-transparent text-[#18222c] outline-none placeholder:text-slate-400"
              />
            </label>

            <button
              type="button"
              disabled={pending || Boolean(crawlBatch)}
              onClick={triggerBatchCrawl}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#355344]/18 bg-white/88 px-5 py-3 text-sm text-[#355344] shadow-[0_10px_24px_rgba(53,83,68,0.08)] disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {crawlBatch ? `批次进行中 V${crawlBatch.version}` : `批量抓取当前列表（${batchSourceIds.length}）`}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#355344] px-5 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)]"
            >
              <Plus className="h-4 w-4" />
              新增站点
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ConsoleStat icon={<Globe2 className="h-4 w-4" />} label="全部站点" value={`${sources.length}`} />
          <ConsoleStat icon={<ShieldCheck className="h-4 w-4" />} label="启用中" value={`${enabledCount}`} />
          <ConsoleStat icon={<Sparkles className="h-4 w-4" />} label="需验证" value={`${verificationCount}`} />
          <ConsoleStat icon={<Play className="h-4 w-4" />} label="已执行" value={`${crawledCount}`} />
        </div>

        {crawlBatch ? (
          <div className="mt-5 rounded-[24px] border border-[#d4e3c4] bg-[#edf6e2] px-5 py-4 text-sm text-[#355535] shadow-[0_12px_24px_rgba(53,83,68,0.08)]">
            当前批次 V{crawlBatch.version} 正在进行，已完成 {batchCompleted}/{batchTotal}
            {crawlBatch.currentSourceId
              ? `，当前或下一站：${publishedShopBySourceId.get(crawlBatch.currentSourceId)?.name ?? sources.find((item) => item.sourceId === crawlBatch.currentSourceId)?.sourceName ?? crawlBatch.currentSourceId}`
              : "。"}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {filteredSources.length > 0 ? (
          filteredSources.map((source) => {
            const publishedShop = publishedShopBySourceId.get(source.sourceId);
            const versionLabel = publishedShop ? `V${publishedShop.currentVersion}` : "未发布";
            const lastRunLabel = source.lastRunAt ? formatDateLabel(source.lastRunAt) : "尚未执行";

            return (
              <article
                key={source.sourceId}
                className="flex h-full flex-col rounded-[28px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#ffffff_0%,#faf4ea_100%)] p-5 shadow-[0_18px_36px_rgba(102,88,64,0.07)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-xl font-semibold text-[#18222c]">{source.sourceName}</h3>
                    <div className="mt-2 text-sm leading-6 text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                      {source.sourceUrl}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <InfoTag label={source.enabled ? "启用中" : "已停用"} tone={source.enabled ? "success" : "muted"} />
                    <InfoTag label={source.visible ? "展示中" : "已隐藏"} tone={source.visible ? "default" : "muted"} />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <MetaTile label="最近时间" value={lastRunLabel} />
                  <MetaTile label="当前版本" value={versionLabel} />
                  <MetaTile label="是否展示" value={source.visible ? "是" : "否"} />
                  <MetaTile label="是否启用" value={source.enabled ? "是" : "否"} />
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openEditModal(source)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d8cfbf] bg-white/88 px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    编辑
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggleVisibility(source)}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm disabled:opacity-50 ${
                      source.visible
                        ? "border border-[#d4e3c4] bg-[#edf6e2] text-[#355535]"
                        : "border border-[#d8cfbf] bg-[#f5efe5] text-slate-600"
                    }`}
                  >
                    {source.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {source.visible ? "隐藏" : "展示"}
                  </button>

                  <button
                    type="button"
                    disabled={pending || !source.enabled || Boolean(crawlBatch)}
                    onClick={() => triggerCrawl(source.sourceId)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#355344] px-4 py-2.5 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    {crawlBatch ? "批次进行中" : "立即抓取"}
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removeSource(source)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#c98d78]/40 bg-[#fff3ee] px-4 py-2.5 text-sm text-[#9a4b33] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="col-span-full rounded-[24px] border border-dashed border-[#d8cfbf] bg-white p-8 text-center text-slate-500">
            当前没有匹配的站点。
          </div>
        )}
      </section>

      {activeModal ? (
        <SourceDialog
          mode={editingSource ? "edit" : "create"}
          pending={pending}
          form={sourceForm}
          onChange={setSourceForm}
          onClose={closeModal}
          onSubmit={editingSource ? handleUpdateSource : handleCreateSource}
        />
      ) : null}
    </div>
  );
}

function SourceDialog({
  mode,
  pending,
  form,
  onChange,
  onClose,
  onSubmit
}: {
  mode: "create" | "edit";
  pending: boolean;
  form: SourceFormState;
  onChange: React.Dispatch<React.SetStateAction<SourceFormState>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const isEdit = mode === "edit";

  return (
    <>
      <button
        type="button"
        aria-label="关闭站点弹窗"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[#18222c]/14 backdrop-blur-[2px]"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <section
          role="dialog"
          aria-modal="true"
          className="flex max-h-[90vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[34px] border border-[#d8cfbf] bg-[linear-gradient(180deg,#fbf7f0_0%,#f5eee2_62%,#edf4e7_100%)] shadow-[0_24px_80px_rgba(24,34,44,0.18)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#e2d8c9] px-5 py-5 sm:px-6">
            <div>
              <div className="inline-flex rounded-full border border-[#d8cfbf] bg-white/84 px-3 py-1 text-xs text-slate-500">
                {isEdit ? "站点编辑" : "新站点录入"}
              </div>
              <h2 className="mt-3 font-serif text-[2rem] leading-tight text-[#18222c]">
                {isEdit ? "编辑抓取站点" : "新增抓取站点"}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8cfbf] bg-white/88 text-slate-600 shadow-[0_10px_20px_rgba(102,88,64,0.06)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-700">
                站点名称
                <input
                  value={form.sourceName}
                  onChange={(event) => onChange((current) => ({ ...current, sourceName: event.target.value }))}
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                  placeholder="例如：Claude Hub CN"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-700">
                站点链接
                <input
                  value={form.sourceUrl}
                  onChange={(event) => onChange((current) => ({ ...current, sourceUrl: event.target.value }))}
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                  placeholder="https://example.com"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-700">
                抓取入口
                <input
                  value={form.entryUrl}
                  onChange={(event) => onChange((current) => ({ ...current, entryUrl: event.target.value }))}
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                  placeholder="留空则默认使用站点链接"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-700">
                等待元素
                <input
                  value={form.waitSelector}
                  onChange={(event) => onChange((current) => ({ ...current, waitSelector: event.target.value }))}
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                  placeholder="body"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-700">
                抓取模式
                <select
                  value={form.crawlMode}
                  onChange={(event) => onChange((current) => ({ ...current, crawlMode: event.target.value as CrawlMode }))}
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                >
                  <option value="AUTO">自动抓取</option>
                  <option value="MANUAL_ASSIST">人工辅助</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-700">
                验证方式
                <select
                  value={form.verificationMethod}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      verificationMethod: event.target.value as VerificationMethod
                    }))
                  }
                  className="rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                >
                  <option value="NONE">无需验证</option>
                  <option value="CAPTCHA">验证码</option>
                  <option value="LOGIN">登录态</option>
                  <option value="MANUAL">人工确认</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-700 md:col-span-2">
                验证说明
                <textarea
                  value={form.verificationPrompt}
                  onChange={(event) => onChange((current) => ({ ...current, verificationPrompt: event.target.value }))}
                  className="min-h-[120px] rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 outline-none transition focus:border-[#4f7259]"
                  placeholder="例如：该站点需要先登录后再采集，登录成功后从商品列表页继续。"
                />
              </label>

              <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                <label className="inline-flex items-center gap-3 rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={form.enabled}
                    onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))}
                    type="checkbox"
                  />
                  启用抓取
                </label>

                <label className="inline-flex items-center gap-3 rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={form.visible}
                    onChange={(event) => onChange((current) => ({ ...current, visible: event.target.checked }))}
                    type="checkbox"
                  />
                  前台展示
                </label>

                <label className="inline-flex items-center gap-3 rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={form.headless}
                    onChange={(event) => onChange((current) => ({ ...current, headless: event.target.checked }))}
                    type="checkbox"
                  />
                  使用无头模式
                </label>

                <label className="inline-flex items-center gap-3 rounded-2xl border border-[#d8cfbf] bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={form.blockAssets}
                    onChange={(event) => onChange((current) => ({ ...current, blockAssets: event.target.checked }))}
                    type="checkbox"
                  />
                  阻止图片和媒体资源
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[#d8cfbf] bg-white/88 px-4 py-3 text-sm text-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-[#355344] px-5 py-3 text-sm text-white shadow-[0_12px_24px_rgba(53,83,68,0.18)] disabled:opacity-60"
                >
                  {pending ? "处理中..." : isEdit ? "保存修改" : "创建站点"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}

function ConsoleStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#d8cfbf] bg-white/84 p-4 shadow-[0_10px_24px_rgba(102,88,64,0.05)]">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="text-[#355344]">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#18222c]">{value}</div>
    </div>
  );
}

function InfoTag({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "muted" }) {
  const toneClassName =
    tone === "success"
      ? "border-[#d4e3c4] bg-[#edf6e2] text-[#355535]"
      : tone === "muted"
        ? "border-[#ddd3c3] bg-[#f5efe5] text-slate-600"
        : "border-[#d8cfbf] bg-[#faf5eb] text-slate-600";

  return <span className={`rounded-full border px-3 py-1.5 text-xs ${toneClassName}`}>{label}</span>;
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#e4dacb] bg-[#faf5eb] p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm text-[#18222c]">{value}</div>
    </div>
  );
}
