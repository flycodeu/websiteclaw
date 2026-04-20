import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api/client";
import type { ExecutionRecord } from "../api/types";
import { StatusPill } from "../components/StatusPill";

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["captured", "completed_manually", "stable"].includes(status)) {
    return "good";
  }
  if (["waiting_manual", "needs_manual_verification", "needs_manual_completion", "watch"].includes(status)) {
    return "warn";
  }
  if (["failed", "risk"].includes(status)) {
    return "bad";
  }
  return "neutral";
}

function screenshotUrl(recordId: number): string {
  return `/api/records/${recordId}/screenshot`;
}

export function SharedRecordPage() {
  const { shareToken } = useParams();
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRecord() {
      if (!shareToken) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setRecord(await api.getSharedRecord(shareToken));
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载分享记录失败");
      } finally {
        setLoading(false);
      }
    }

    void loadRecord();
  }, [shareToken]);

  return (
    <section className="page-grid shared-page">
      <header className="page-header">
        <div>
          <h2>分享记录</h2>
        </div>
      </header>

      {loading ? <div className="panel">正在加载分享记录…</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {record ? (
        <div className="detail-layout">
          <section className="panel detail-panel">
            <div className="detail-header">
              <div>
                <h3>{record.site_name}</h3>
                <p>{record.final_url || record.site_url}</p>
              </div>
              <div className="status-stack">
                <StatusPill tone={statusTone(record.status)}>{record.status}</StatusPill>
                <StatusPill tone={statusTone(record.manual_review_status)}>{record.manual_review_status}</StatusPill>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <span className="detail-label">平台</span>
                <p>{record.platform || "未分类平台"}</p>
              </div>
              <div>
                <span className="detail-label">抓取时间</span>
                <p>{record.captured_at ? new Date(record.captured_at).toLocaleString() : "-"}</p>
              </div>
              <div>
                <span className="detail-label">稳定性</span>
                <p>{record.stability_summary || record.stability_level}</p>
              </div>
              <div>
                <span className="detail-label">评价</span>
                <p>{record.review || "暂无评价"}</p>
              </div>
            </div>
            {record.screenshot_path ? (
              <div className="screenshot-panel">
                <img src={screenshotUrl(record.id)} alt={`${record.site_name} 截图`} className="record-screenshot" />
              </div>
            ) : null}
          </section>

          <section className="panel detail-panel">
            <h3>AI分析</h3>
            <p>{record.ai_summary || "暂无 AI 分析。"}</p>
          </section>

          <section className="panel detail-panel">
            <h3>商品列表</h3>
            <div className="product-table">
              <div className="product-row product-head">
                <span>商品名称</span>
                <span>价格</span>
                <span>库存</span>
                <span>质保</span>
                <span>链接</span>
              </div>
              {record.products.map((product) => (
                <div className="product-row" key={product.id}>
                  <span>{product.name}</span>
                  <span>{product.price_normalized || product.price_text || "-"}</span>
                  <span>{product.stock_normalized || product.stock_text || "-"}</span>
                  <span>{product.warranty}</span>
                  <span>{product.product_url ? <a href={product.product_url}>{product.product_url}</a> : "-"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
