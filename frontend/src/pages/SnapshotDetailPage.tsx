import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { ManualSession, ProductItem, Snapshot } from "../api/types";
import { StatusPill } from "../components/StatusPill";

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["success", "synced", "completed", "uploaded"].includes(status)) {
    return "good";
  }
  if (["waiting_manual", "challenge_detected", "resuming"].includes(status)) {
    return "warn";
  }
  if (["failed", "sync_failed", "cancelled"].includes(status)) {
    return "bad";
  }
  return "neutral";
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readProducts(value: unknown): ProductItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ProductItem => Boolean(item) && typeof item === "object") as ProductItem[];
}

function syncStatusLabel(status: string): string {
  if (status === "synced") {
    return "已同步飞书";
  }
  if (status === "not_synced") {
    return "未启用同步";
  }
  if (status === "sync_failed") {
    return "同步失败";
  }
  return status;
}

function screenshotUploadLabel(status: string): string {
  if (status === "uploaded") {
    return "已上传";
  }
  if (status === "not_synced") {
    return "未启用同步";
  }
  if (status === "not_requested") {
    return "未请求";
  }
  if (status === "capture_failed") {
    return "截图失败";
  }
  return status;
}

export function SnapshotDetailPage() {
  const { snapshotId } = useParams();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manualSession, setManualSession] = useState<ManualSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldPoll = useMemo(
    () => snapshot && ["pending", "running", "parsing", "syncing", "resuming"].includes(snapshot.status),
    [snapshot],
  );
  const extractedBundle = readObject(snapshot?.extracted_json);
  const ruleExtracted = readObject(extractedBundle?.rule_extracted);
  const aiAnalysis = readObject(extractedBundle?.ai_analysis);
  const finalExtracted = readObject(extractedBundle?.final_extracted);
  const syncResult = readObject(extractedBundle?.sync_result);
  const products = readProducts(finalExtracted?.products);

  async function loadSnapshot() {
    if (!snapshotId) {
      return;
    }
    try {
      const result = await api.getSnapshot(Number(snapshotId));
      setSnapshot(result);
      if (["waiting_manual", "challenge_detected", "resuming"].includes(result.status)) {
        try {
          const session = await api.getManualSession(result.id);
          setManualSession(session);
        } catch {
          setManualSession(null);
        }
      } else {
        setManualSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载快照失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, [snapshotId]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [shouldPoll]);

  async function startManualSession() {
    if (!snapshot) {
      return;
    }
    setActionBusy(true);
    setError(null);
    try {
      const session = await api.startManualSession(snapshot.id);
      setManualSession(session);
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法开启人工接管");
    } finally {
      setActionBusy(false);
    }
  }

  async function resumeManualSession() {
    if (!manualSession) {
      return;
    }
    setActionBusy(true);
    setError(null);
    try {
      await api.resumeManualSession(manualSession.session_id);
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "继续抓取失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelManualSession() {
    if (!manualSession) {
      return;
    }
    setActionBusy(true);
    setError(null);
    try {
      await api.cancelManualSession(manualSession.session_id);
      setManualSession(null);
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消人工接管失败");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h2>抓取快照详情</h2>
        </div>
        <Link className="button subtle" to="/sites">
          返回站点列表
        </Link>
      </header>

      {loading ? <div className="panel">正在加载快照详情…</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {snapshot ? (
        <div className="detail-layout">
          <section className="panel detail-panel">
            <div className="detail-header">
              <div>
                <h3>{snapshot.title || "未命名页面"}</h3>
                <p>{snapshot.final_url || snapshot.source_url}</p>
              </div>
              <div className="status-stack">
                <StatusPill tone={statusTone(snapshot.status)}>{snapshot.status}</StatusPill>
                <StatusPill tone={statusTone(snapshot.sync_status)}>{syncStatusLabel(snapshot.sync_status)}</StatusPill>
                <StatusPill tone={statusTone(snapshot.ai_status)}>{snapshot.ai_status}</StatusPill>
              </div>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">来源地址</span>
                <p>{snapshot.source_url}</p>
              </div>
              <div>
                <span className="detail-label">最终地址</span>
                <p>{snapshot.final_url || "未记录"}</p>
              </div>
              <div>
                <span className="detail-label">抓取时间</span>
                <p>{snapshot.crawled_at ? new Date(snapshot.crawled_at).toLocaleString() : "处理中"}</p>
              </div>
              <div>
                <span className="detail-label">飞书记录 ID</span>
                <p>{snapshot.feishu_record_id || (snapshot.sync_status === "not_synced" ? "未启用同步" : "尚未写入")}</p>
              </div>
              <div>
                <span className="detail-label">截图上传状态</span>
                <p>{screenshotUploadLabel(snapshot.screenshot_upload_status)}</p>
              </div>
              <div>
                <span className="detail-label">AI 分析摘要</span>
                <p>{snapshot.ai_summary || "尚未生成"}</p>
              </div>
              <div>
                <span className="detail-label">商品数量</span>
                <p>{products.length ? `${products.length} 个商品` : "未识别到商品"}</p>
              </div>
              <div>
                <span className="detail-label">飞书同步明细</span>
                <p>
                  {syncResult
                    ? `已同步 ${String(syncResult.synced_count ?? 0)}，新增 ${String(syncResult.created_count ?? 0)}，更新 ${String(syncResult.updated_count ?? 0)}`
                    : "未同步"}
                </p>
              </div>
            </div>

            {snapshot.challenge_reason ? (
              <div className="banner warning">
                检测到挑战页：{snapshot.challenge_reason}
                {!manualSession ? (
                  <button className="button primary inline-button" onClick={() => void startManualSession()} disabled={actionBusy}>
                    {actionBusy ? "处理中…" : "开始人工接管"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {manualSession ? (
              <div className="manual-box">
                <p>{manualSession.instruction}</p>
                <div className="meta-strip">
                  <span>Session: {manualSession.session_id}</span>
                  <span>过期: {new Date(manualSession.expires_at).toLocaleString()}</span>
                </div>
                <div className="action-row">
                  <button className="button primary" onClick={() => void resumeManualSession()} disabled={actionBusy}>
                    {actionBusy ? "处理中…" : "完成验证并继续"}
                  </button>
                  <button className="button subtle" onClick={() => void cancelManualSession()} disabled={actionBusy}>
                    取消接管
                  </button>
                </div>
              </div>
            ) : null}

            {snapshot.error_message ? <div className="banner error">{snapshot.error_message}</div> : null}
            {snapshot.ai_error_message ? <div className="banner warning">AI 分析异常：{snapshot.ai_error_message}</div> : null}
          </section>

          <section className="panel detail-panel">
            <h3>商品列表预览</h3>
            {products.length ? (
              <div className="product-table">
                <div className="product-row product-head">
                  <span>商品名称</span>
                  <span>价格</span>
                  <span>库存</span>
                  <span>质保</span>
                  <span>链接</span>
                </div>
                {products.map((product) => (
                  <div className="product-row" key={product.product_key || `${product.name}-${product.price}`}>
                    <span>{product.name}</span>
                    <span>{product.price || "-"}</span>
                    <span>{product.stock || "-"}</span>
                    <span>{product.warranty || "未知"}</span>
                    <span>
                      {product.product_url ? (
                        <a href={product.product_url} target="_blank" rel="noreferrer">
                          查看链接
                        </a>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="banner warning">当前快照还没有识别出商品列表，可尝试补充选择器规则或开启 AI 分析。</div>
            )}
          </section>

          <section className="panel detail-panel">
            <h3>AI 分析结果</h3>
            <pre className="json-view">{JSON.stringify(aiAnalysis ?? {}, null, 2)}</pre>
          </section>

          <section className="panel detail-panel">
            <h3>规则提取结果</h3>
            <pre className="json-view">{JSON.stringify(ruleExtracted ?? {}, null, 2)}</pre>
          </section>

          <section className="panel detail-panel">
            <h3>现场文件</h3>
            <div className="detail-grid">
              <div>
                <span className="detail-label">HTML 路径</span>
                <p>{snapshot.html_path || "未保存"}</p>
              </div>
              <div>
                <span className="detail-label">截图路径</span>
                <p>{snapshot.screenshot_path || "未保存"}</p>
              </div>
            </div>
            <h4>可见文本摘录</h4>
            <pre className="text-view">{snapshot.visible_text || "无文本内容"}</pre>
          </section>
        </div>
      ) : null}
    </section>
  );
}
