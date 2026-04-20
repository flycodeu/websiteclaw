import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type {
  ExecutionProductPayload,
  ExecutionProductUpdatePayload,
  ExecutionRecord,
  ExecutionRecordUpdatePayload,
} from "../api/types";
import { StatusPill } from "../components/StatusPill";

type Filters = {
  platform: string;
  status: string;
  manual_review_status: string;
  accessible: "" | "true" | "false";
  query: string;
};

type ModalMode = "view" | "edit" | null;

type AIAnalysisProduct = {
  name: string;
  price: string;
  stock: string;
  warranty: string;
  product_url: string;
  tags: string[];
};

type AIAnalysisReport = {
  category: string;
  summary: string;
  stabilityLevel: string;
  stabilitySummary: string;
  reviewRecommendation: string;
  notes: string[];
  products: AIAnalysisProduct[];
};

const defaultFilters: Filters = {
  platform: "",
  status: "",
  manual_review_status: "",
  accessible: "",
  query: "",
};

const defaultProductForm: ExecutionProductPayload = {
  name: "",
  price_text: "",
  price_normalized: "",
  stock_text: "",
  stock_normalized: "",
  warranty: "否",
  product_url: "",
  tags: [],
  notes: "",
};

function parseTagInput(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter((item, index, list) => item && list.indexOf(item) === index);
}

function stringifyTags(value?: string[] | null): string {
  if (!value?.length) {
    return "";
  }
  return value.join(", ");
}

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["captured", "success", "auto_captured", "completed_manually", "stable", "synced"].includes(status)) {
    return "good";
  }
  if (["waiting_manual", "needs_manual_verification", "needs_manual_completion", "watch"].includes(status)) {
    return "warn";
  }
  if (["failed", "risk", "sync_failed"].includes(status)) {
    return "bad";
  }
  return "neutral";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    captured: "已采集",
    waiting_manual: "待人工验证",
    needs_manual_completion: "待人工补录",
    failed: "失败",
    auto_captured: "自动完成",
    needs_manual_verification: "待人工验证",
    completed_manually: "人工已完成",
    stable: "稳定",
    watch: "需观察",
    risk: "风险",
    synced: "已同步",
    not_enabled: "未启用",
    sync_failed: "同步失败",
    unknown: "未知",
  };
  return labels[status] ?? status;
}

function accessibilityTone(value?: boolean | null): "neutral" | "good" | "bad" {
  if (value === true) {
    return "good";
  }
  if (value === false) {
    return "bad";
  }
  return "neutral";
}

function accessibilityLabel(value?: boolean | null): string {
  if (value === true) {
    return "可访问";
  }
  if (value === false) {
    return "不可访问";
  }
  return "未知";
}

function warrantyValue(value?: string | null): string {
  return value === "是" ? "是" : "否";
}

function screenshotUrl(recordId: number): string {
  return `/api/records/${recordId}/screenshot`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter((item, index, list) => item && list.indexOf(item) === index);
}

function normalizeAnalysisProducts(value: unknown): AIAnalysisProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const product = item as Record<string, unknown>;
      const name = normalizeText(product.name);
      if (!name) {
        return null;
      }

      return {
        name,
        price: normalizeText(product.price),
        stock: normalizeText(product.stock),
        warranty: warrantyValue(normalizeText(product.warranty)),
        product_url: normalizeText(product.product_url),
        tags: normalizeStringList(product.tags),
      };
    })
    .filter((item): item is AIAnalysisProduct => Boolean(item));
}

function buildAIAnalysisReport(record: ExecutionRecord | null): AIAnalysisReport | null {
  if (!record?.ai_analysis || typeof record.ai_analysis !== "object") {
    return null;
  }

  const source = record.ai_analysis as Record<string, unknown>;
  return {
    category: normalizeText(source.category),
    summary: normalizeText(source.summary) || normalizeText(record.ai_summary),
    stabilityLevel: normalizeText(source.stability_level) || record.stability_level || "unknown",
    stabilitySummary: normalizeText(source.stability_summary) || normalizeText(record.stability_summary),
    reviewRecommendation: normalizeText(source.review_recommendation),
    notes: normalizeStringList(source.notes),
    products: normalizeAnalysisProducts(source.products),
  };
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function compactText(value?: string | null, fallback = "-"): string {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function compactSummary(value?: string | null, fallback = "未生成摘要"): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }
  return normalized;
}

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function productPrice(product: { price_normalized?: string | null; price_text?: string | null }): string {
  return compactText(product.price_normalized || product.price_text);
}

function productStock(product: { stock_normalized?: string | null; stock_text?: string | null }): string {
  return compactText(product.stock_normalized || product.stock_text);
}

export function RecordCenterPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [expandedRecordIds, setExpandedRecordIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<ExecutionRecordUpdatePayload>({});
  const [newProductForm, setNewProductForm] = useState<ExecutionProductPayload>(defaultProductForm);
  const [productDrafts, setProductDrafts] = useState<Record<number, ExecutionProductUpdatePayload>>({});
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalRecordId, setModalRecordId] = useState<number | null>(null);
  const [modalRecord, setModalRecord] = useState<ExecutionRecord | null>(null);

  const platformOptions = useMemo(
    () => Array.from(new Set(records.map((record) => record.platform).filter(Boolean))).sort(),
    [records],
  );

  const analysisReport = useMemo(() => buildAIAnalysisReport(modalRecord), [modalRecord]);

  const stats = useMemo(() => {
    const total = records.length;
    const accessible = records.filter((record) => record.is_accessible === true).length;
    const pending = records.filter((record) =>
      ["waiting_manual", "needs_manual_verification", "needs_manual_completion"].includes(record.status) ||
      ["needs_manual_verification", "needs_manual_completion"].includes(record.manual_review_status),
    ).length;
    const products = records.reduce((sum, record) => sum + record.product_count, 0);
    return { total, accessible, pending, products };
  }, [records]);

  const isModalOpen = modalMode !== null;
  const isEditMode = modalMode === "edit";

  async function loadRecordDetail(recordId: number) {
    setDetailLoading(true);
    setError(null);
    try {
      const record = await api.getRecord(recordId);
      setModalRecord(record);
      setReviewForm({
        status: record.status,
        manual_review_status: record.manual_review_status,
        review: record.review ?? "",
      });
      setProductDrafts(
        Object.fromEntries(
          record.products.map((product) => [
            product.id,
            {
              name: product.name,
              price_text: product.price_text ?? "",
              price_normalized: product.price_normalized ?? "",
              stock_text: product.stock_text ?? "",
              stock_normalized: product.stock_normalized ?? "",
              warranty: warrantyValue(product.warranty),
              product_url: product.product_url ?? "",
              notes: product.notes ?? "",
              tags: product.tags,
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载记录详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadRecords(nextModalRecordId?: number | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listRecords({
        platform: filters.platform || undefined,
        status: filters.status || undefined,
        manual_review_status: filters.manual_review_status || undefined,
        accessible: filters.accessible || undefined,
        query: filters.query || undefined,
      });
      setRecords(result);

      const targetId =
        nextModalRecordId ??
        (modalRecordId && result.some((record) => record.id === modalRecordId) ? modalRecordId : null);

      if (targetId && isModalOpen) {
        await loadRecordDetail(targetId);
      } else if (isModalOpen && modalRecordId && !result.some((record) => record.id === modalRecordId)) {
        closeModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载记录失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  function closeModal() {
    setModalMode(null);
    setModalRecordId(null);
    setModalRecord(null);
    setReviewForm({});
    setProductDrafts({});
    setShowCreateProductForm(false);
    setNewProductForm(defaultProductForm);
  }

  async function openRecordModal(recordId: number, mode: Exclude<ModalMode, null>) {
    setModalMode(mode);
    setModalRecordId(recordId);
    setShowCreateProductForm(false);
    await loadRecordDetail(recordId);
  }

  async function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await loadRecords(isModalOpen ? modalRecordId : undefined);
  }

  function toggleExpanded(recordId: number) {
    setExpandedRecordIds((current) =>
      current.includes(recordId) ? current.filter((item) => item !== recordId) : [...current, recordId],
    );
  }

  async function saveRecord() {
    if (!modalRecord) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateRecord(modalRecord.id, reviewForm);
      await loadRecords(modalRecord.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct(productId: number) {
    setSaving(true);
    setError(null);
    try {
      await api.updateProduct(productId, {
        ...productDrafts[productId],
        warranty: warrantyValue(productDrafts[productId]?.warranty),
      });
      if (modalRecordId) {
        await loadRecords(modalRecordId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存商品失败");
    } finally {
      setSaving(false);
    }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalRecord) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addRecordProduct(modalRecord.id, {
        ...newProductForm,
        warranty: warrantyValue(newProductForm.warranty),
        tags: newProductForm.tags ?? [],
      });
      setNewProductForm(defaultProductForm);
      setShowCreateProductForm(false);
      await loadRecords(modalRecord.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增商品失败");
    } finally {
      setSaving(false);
    }
  }

  async function exportRecords() {
    setExporting(true);
    setError(null);
    try {
      const csvText = await api.exportRecordsCsv();
      downloadCsv("records-export.csv", csvText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function deleteRecord(recordId: number, siteName: string) {
    const confirmed = window.confirm(`确定删除记录“${siteName}”吗？`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.deleteRecord(recordId);
      if (modalRecordId === recordId) {
        closeModal();
      }
      await loadRecords(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearAllRecords() {
    const confirmed = window.confirm("确定清空全部记录吗？该操作不会删除站点配置。");
    if (!confirmed) {
      return;
    }

    setClearing(true);
    setError(null);
    try {
      await api.clearRecords();
      closeModal();
      await loadRecords(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空记录失败");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="record-center-page">
      <header className="page-header record-center-header">
        <div>
          <h2>记录中心</h2>
          <p className="record-center-subtitle">
            <span>{stats.total} 条记录</span>
            <span>{stats.accessible} 条可访问</span>
            <span>{stats.pending} 条待处理</span>
            <span>{stats.products} 个商品</span>
          </p>
        </div>
        <div className="action-row">
          <button className="button subtle" type="button" onClick={() => void loadRecords(isModalOpen ? modalRecordId : undefined)} disabled={loading || detailLoading}>
            刷新
          </button>
          <button className="button subtle" type="button" onClick={() => void clearAllRecords()} disabled={clearing || loading}>
            {clearing ? "清空中…" : "清空记录"}
          </button>
          <button className="button primary" type="button" onClick={() => void exportRecords()} disabled={exporting}>
            {exporting ? "导出中…" : "导出数据"}
          </button>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      <form className="panel record-toolbar" onSubmit={(event) => void applyFilters(event)}>
        <label className="record-toolbar-field record-toolbar-search">
          <span>搜索</span>
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="搜索地址、名称、AI 摘要"
          />
        </label>
        <label className="record-toolbar-field">
          <span>平台</span>
          <select value={filters.platform} onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))}>
            <option value="">全部平台</option>
            {platformOptions.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>
        <label className="record-toolbar-field">
          <span>记录状态</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">全部状态</option>
            <option value="captured">已采集</option>
            <option value="waiting_manual">待人工验证</option>
            <option value="needs_manual_completion">待人工补录</option>
            <option value="failed">失败</option>
          </select>
        </label>
        <label className="record-toolbar-field">
          <span>人工校验</span>
          <select
            value={filters.manual_review_status}
            onChange={(event) => setFilters((current) => ({ ...current, manual_review_status: event.target.value }))}
          >
            <option value="">全部状态</option>
            <option value="auto_captured">自动完成</option>
            <option value="needs_manual_verification">待人工验证</option>
            <option value="needs_manual_completion">待人工补录</option>
            <option value="completed_manually">人工已完成</option>
          </select>
        </label>
        <label className="record-toolbar-field">
          <span>可访问</span>
          <select
            value={filters.accessible}
            onChange={(event) => setFilters((current) => ({ ...current, accessible: event.target.value as Filters["accessible"] }))}
          >
            <option value="">全部</option>
            <option value="true">可访问</option>
            <option value="false">不可访问</option>
          </select>
        </label>
        <div className="record-toolbar-actions">
          <button className="button primary" type="submit" disabled={loading}>
            筛选
          </button>
        </div>
      </form>

      <section className="panel record-grid-panel">
        <div className="record-grid-header">
          <div>
            <span className="section-title">执行列表</span>
            <span className="helper-text">列表内直接展示完整信息，详情与修改进入弹窗。</span>
          </div>
          <span className="record-grid-count">{records.length} 条</span>
        </div>

        <div className="record-grid-scroll">
          <div className="record-grid-table">
            <div className="record-grid-head">
              <span>地址</span>
              <span>名称</span>
              <span>AI 核心摘要</span>
              <span>可访问</span>
              <span>采集时间</span>
              <span>商品列表</span>
              <span>截图</span>
              <span>操作</span>
            </div>

            {loading ? <div className="record-empty">正在加载记录…</div> : null}
            {!loading && records.length === 0 ? <div className="record-empty">当前还没有执行记录。</div> : null}

            {records.map((record) => {
              const isExpanded = expandedRecordIds.includes(record.id);
              const previewProducts = isExpanded ? record.products : record.products.slice(0, 2);

              return (
                <article key={record.id} className={`record-grid-row${modalRecordId === record.id ? " is-active" : ""}`}>
                  <div className="record-grid-row-main">
                    <div className="record-grid-cell record-grid-url" title={record.final_url || record.site_url}>
                      {record.final_url || record.site_url}
                    </div>

                    <div className="record-grid-cell record-grid-name">
                      <strong>{record.site_name}</strong>
                      <small>{record.platform || "未分类"}</small>
                    </div>

                    <div className="record-grid-cell">
                      <p className="record-grid-summary" title={compactSummary(record.ai_summary, record.products_summary || "未生成摘要")}>
                        {compactSummary(record.ai_summary, record.products_summary || "未生成摘要")}
                      </p>
                    </div>

                    <div className="record-grid-cell">
                      <StatusPill tone={accessibilityTone(record.is_accessible)}>{accessibilityLabel(record.is_accessible)}</StatusPill>
                    </div>

                    <div className="record-grid-cell">{formatDateTime(record.captured_at)}</div>

                    <div className="record-grid-cell">
                      <div className="record-product-mini-table">
                        <div className="record-product-mini-head">
                          <span>名称</span>
                          <span>价格</span>
                          <span>库存</span>
                          <span>是否质保</span>
                          <span>备注</span>
                        </div>
                        {previewProducts.length > 0 ? (
                          previewProducts.map((product) => (
                            <div className="record-product-mini-row" key={product.id}>
                              <span title={product.name}>{product.name}</span>
                              <span>{productPrice(product)}</span>
                              <span>{productStock(product)}</span>
                              <span>{warrantyValue(product.warranty)}</span>
                              <span title={product.notes || ""}>{compactText(product.notes)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="record-product-mini-empty">无商品</div>
                        )}
                        {record.products.length > 2 ? (
                          <button className="record-row-link" type="button" onClick={() => toggleExpanded(record.id)}>
                            {isExpanded ? "收起商品" : `展开剩余 ${record.products.length - 2} 项`}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="record-grid-cell">
                      {record.screenshot_path ? (
                        <div className="record-shot-static">
                          <img src={screenshotUrl(record.id)} alt={`${record.site_name} 截图`} />
                        </div>
                      ) : (
                        <span className="record-shot-empty">无截图</span>
                      )}
                    </div>

                    <div className="record-grid-cell">
                      <div className="record-grid-actions">
                        <button className="button subtle compact" type="button" onClick={() => void openRecordModal(record.id, "view")}>
                          查看
                        </button>
                        <button className="button subtle compact" type="button" onClick={() => void openRecordModal(record.id, "edit")}>
                          修改
                        </button>
                        <button className="button danger compact" type="button" onClick={() => void deleteRecord(record.id, record.site_name)} disabled={saving}>
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {isModalOpen ? (
        <div className="record-modal-backdrop" onClick={closeModal}>
          <div className="panel record-modal" onClick={(event) => event.stopPropagation()}>
            <header className="record-modal-header">
              <div className="record-modal-title">
                <span className="detail-label">{isEditMode ? "修改记录" : "查看记录"}</span>
                <h3>{modalRecord?.site_name || "记录详情"}</h3>
                <p>{modalRecord ? modalRecord.final_url || modalRecord.site_url : "正在加载…"}</p>
              </div>
              <div className="action-row">
                {modalRecord?.snapshot_id ? (
                  <Link className="button subtle compact" to={`/snapshots/${modalRecord.snapshot_id}`}>
                    快照
                  </Link>
                ) : null}
                {modalRecord?.screenshot_path ? (
                  <button className="button subtle compact" type="button" onClick={() => window.open(screenshotUrl(modalRecord.id), "_blank", "noopener,noreferrer")}>
                    查看截图
                  </button>
                ) : null}
                {modalRecord && !isEditMode ? (
                  <button className="button subtle compact" type="button" onClick={() => setModalMode("edit")}>
                    切换修改
                  </button>
                ) : null}
                {modalRecord && isEditMode ? (
                  <button className="button primary compact" type="button" onClick={() => void saveRecord()} disabled={saving}>
                    {saving ? "保存中…" : "保存记录"}
                  </button>
                ) : null}
                <button className="button subtle compact" type="button" onClick={closeModal}>
                  关闭
                </button>
              </div>
            </header>

            <div className="record-modal-body">
              {detailLoading ? <div className="record-empty">正在加载详情…</div> : null}

              {modalRecord ? (
                <>
                  <section className="record-modal-strip">
                    <span>{formatDateTime(modalRecord.captured_at)}</span>
                    <span>{accessibilityLabel(modalRecord.is_accessible)}</span>
                    <span>{statusLabel(modalRecord.status)}</span>
                    <span>{statusLabel(modalRecord.manual_review_status)}</span>
                    <span>{modalRecord.product_count} 个商品</span>
                  </section>

                  <section className="record-modal-section">
                    <div className="record-section-head">
                      <div>
                        <span className="section-title">基本信息</span>
                        <span className="helper-text">地址、摘要和截图都集中在这里。</span>
                      </div>
                    </div>

                    <div className="record-modal-grid">
                      <article className="record-modal-card">
                        <span>网站地址</span>
                        <strong>{modalRecord.site_url}</strong>
                      </article>
                      <article className="record-modal-card">
                        <span>最终地址</span>
                        <strong>{compactText(modalRecord.final_url)}</strong>
                      </article>
                      <article className="record-modal-card">
                        <span>AI 核心摘要</span>
                        <p>{compactSummary(modalRecord.ai_summary, "未生成 AI 摘要。")}</p>
                      </article>
                      <article className="record-modal-card">
                        <span>商品摘要</span>
                        <p>{compactSummary(modalRecord.products_summary, "未识别到商品。")}</p>
                      </article>
                    </div>

                    <div className="record-modal-evidence">
                      {modalRecord.screenshot_path ? (
                        <button
                          className="record-modal-shot"
                          type="button"
                          onClick={() => window.open(screenshotUrl(modalRecord.id), "_blank", "noopener,noreferrer")}
                        >
                          <img src={screenshotUrl(modalRecord.id)} alt={`${modalRecord.site_name} 截图`} />
                        </button>
                      ) : (
                        <div className="record-shot-placeholder">没有截图</div>
                      )}
                    </div>
                  </section>

                  <section className="record-modal-section">
                    <div className="record-section-head">
                      <div>
                        <span className="section-title">记录处理</span>
                        <span className="helper-text">{isEditMode ? "编辑当前记录状态与备注。" : "当前记录状态只读展示。"}</span>
                      </div>
                    </div>

                    {isEditMode ? (
                      <div className="record-review-grid">
                        <label>
                          <span>记录状态</span>
                          <select
                            value={reviewForm.status ?? ""}
                            onChange={(event) => setReviewForm((current) => ({ ...current, status: event.target.value }))}
                          >
                            <option value="captured">已采集</option>
                            <option value="waiting_manual">待人工验证</option>
                            <option value="needs_manual_completion">待人工补录</option>
                            <option value="failed">失败</option>
                          </select>
                        </label>
                        <label>
                          <span>人工校验状态</span>
                          <select
                            value={reviewForm.manual_review_status ?? ""}
                            onChange={(event) => setReviewForm((current) => ({ ...current, manual_review_status: event.target.value }))}
                          >
                            <option value="auto_captured">自动完成</option>
                            <option value="needs_manual_verification">待人工验证</option>
                            <option value="needs_manual_completion">待人工补录</option>
                            <option value="completed_manually">人工已完成</option>
                          </select>
                        </label>
                        <label className="record-review-note">
                          <span>备注</span>
                          <textarea
                            rows={4}
                            value={reviewForm.review ?? ""}
                            onChange={(event) => setReviewForm((current) => ({ ...current, review: event.target.value }))}
                            placeholder="简要记录人工结论"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="record-modal-grid">
                        <article className="record-modal-card">
                          <span>记录状态</span>
                          <strong>{statusLabel(modalRecord.status)}</strong>
                        </article>
                        <article className="record-modal-card">
                          <span>人工校验</span>
                          <strong>{statusLabel(modalRecord.manual_review_status)}</strong>
                        </article>
                        <article className="record-modal-card record-modal-card-wide">
                          <span>备注</span>
                          <p>{compactText(modalRecord.review, "暂无备注")}</p>
                        </article>
                      </div>
                    )}
                  </section>

                  <section className="record-modal-section">
                    <div className="record-section-head">
                      <div>
                        <span className="section-title">商品列表</span>
                        <span className="helper-text">{modalRecord.products.length} 个商品</span>
                      </div>
                      {isEditMode ? (
                        <button className="button subtle compact" type="button" onClick={() => setShowCreateProductForm((current) => !current)}>
                          {showCreateProductForm ? "收起新增" : "新增商品"}
                        </button>
                      ) : null}
                    </div>

                    {isEditMode && showCreateProductForm ? (
                      <form className="record-add-product" onSubmit={(event) => void addProduct(event)}>
                        <div className="record-product-editor-grid">
                          <label className="record-span-2">
                            <span>名称</span>
                            <input
                              value={newProductForm.name}
                              onChange={(event) => setNewProductForm((current) => ({ ...current, name: event.target.value }))}
                              required
                            />
                          </label>
                          <label>
                            <span>价格</span>
                            <input
                              value={newProductForm.price_normalized}
                              onChange={(event) =>
                                setNewProductForm((current) => ({
                                  ...current,
                                  price_normalized: event.target.value,
                                  price_text: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>库存</span>
                            <input
                              value={newProductForm.stock_normalized}
                              onChange={(event) =>
                                setNewProductForm((current) => ({
                                  ...current,
                                  stock_normalized: event.target.value,
                                  stock_text: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>是否质保</span>
                            <select
                              value={warrantyValue(newProductForm.warranty)}
                              onChange={(event) => setNewProductForm((current) => ({ ...current, warranty: event.target.value }))}
                            >
                              <option value="否">否</option>
                              <option value="是">是</option>
                            </select>
                          </label>
                          <label>
                            <span>标签</span>
                            <input
                              value={stringifyTags(newProductForm.tags)}
                              onChange={(event) => setNewProductForm((current) => ({ ...current, tags: parseTagInput(event.target.value) }))}
                            />
                          </label>
                          <label className="record-span-2">
                            <span>链接</span>
                            <input
                              value={newProductForm.product_url}
                              onChange={(event) => setNewProductForm((current) => ({ ...current, product_url: event.target.value }))}
                            />
                          </label>
                          <label className="record-span-2">
                            <span>备注</span>
                            <input
                              value={newProductForm.notes}
                              onChange={(event) => setNewProductForm((current) => ({ ...current, notes: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="record-add-product-actions">
                          <button className="button primary compact" type="submit" disabled={saving}>
                            {saving ? "新增中…" : "保存商品"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {isEditMode ? (
                      <div className="record-editor-table">
                        <div className="record-editor-head">
                          <span>名称</span>
                          <span>价格</span>
                          <span>库存</span>
                          <span>是否质保</span>
                          <span>链接</span>
                          <span>备注</span>
                          <span>操作</span>
                        </div>

                        {modalRecord.products.length === 0 ? <div className="record-empty compact-empty">当前没有商品记录。</div> : null}

                        {modalRecord.products.map((product) => (
                          <div className="record-editor-row" key={product.id}>
                            <input
                              value={productDrafts[product.id]?.name ?? ""}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: { ...current[product.id], name: event.target.value },
                                }))
                              }
                            />
                            <input
                              value={productDrafts[product.id]?.price_normalized ?? ""}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: {
                                    ...current[product.id],
                                    price_normalized: event.target.value,
                                    price_text: event.target.value,
                                  },
                                }))
                              }
                            />
                            <input
                              value={productDrafts[product.id]?.stock_normalized ?? ""}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: {
                                    ...current[product.id],
                                    stock_normalized: event.target.value,
                                    stock_text: event.target.value,
                                  },
                                }))
                              }
                            />
                            <select
                              value={warrantyValue(productDrafts[product.id]?.warranty)}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: { ...current[product.id], warranty: event.target.value },
                                }))
                              }
                            >
                              <option value="否">否</option>
                              <option value="是">是</option>
                            </select>
                            <input
                              value={productDrafts[product.id]?.product_url ?? ""}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: { ...current[product.id], product_url: event.target.value },
                                }))
                              }
                            />
                            <input
                              value={productDrafts[product.id]?.notes ?? ""}
                              onChange={(event) =>
                                setProductDrafts((current) => ({
                                  ...current,
                                  [product.id]: { ...current[product.id], notes: event.target.value },
                                }))
                              }
                            />
                            <button className="button subtle compact" type="button" onClick={() => void saveProduct(product.id)} disabled={saving}>
                              保存
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="record-view-table">
                        <div className="record-view-head">
                          <span>名称</span>
                          <span>价格</span>
                          <span>库存</span>
                          <span>是否质保</span>
                          <span>备注</span>
                        </div>
                        {modalRecord.products.length === 0 ? <div className="record-empty compact-empty">当前没有商品记录。</div> : null}
                        {modalRecord.products.map((product) => (
                          <div className="record-view-row" key={product.id}>
                            <span title={product.name}>{product.name}</span>
                            <span>{productPrice(product)}</span>
                            <span>{productStock(product)}</span>
                            <span>{warrantyValue(product.warranty)}</span>
                            <span title={product.notes || ""}>{compactText(product.notes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="record-modal-section">
                    <div className="record-section-head">
                      <div>
                        <span className="section-title">AI 研判</span>
                        <span className="helper-text">{compactSummary(modalRecord.ai_summary, "尚未生成 AI 摘要")}</span>
                      </div>
                    </div>

                    <div className="record-modal-grid">
                      <article className="record-modal-card">
                        <span>稳定性</span>
                        <p>{compactSummary(modalRecord.stability_summary, statusLabel(modalRecord.stability_level))}</p>
                      </article>
                      <article className="record-modal-card">
                        <span>同步状态</span>
                        <p>{statusLabel(modalRecord.feishu_sync_status)}</p>
                      </article>
                      <article className="record-modal-card record-modal-card-wide">
                        <span>AI 核心摘要</span>
                        <p>{compactSummary(modalRecord.ai_summary, "暂无 AI 摘要。")}</p>
                      </article>
                    </div>

                    {analysisReport?.notes.length ? (
                      <div className="record-ai-notes-panel">
                        <span className="detail-label">观察项</span>
                        <ul className="record-ai-notes">
                          {analysisReport.notes.map((note, index) => (
                            <li key={`${note}-${index}`}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
