import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { Site, Snapshot } from "../api/types";
import { StatusPill } from "../components/StatusPill";

function extractorLabel(value: string): string {
  if (value === "selector_rule") {
    return "选择器";
  }
  return "通用识别";
}

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["success", "synced"].includes(status)) {
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

export function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [expandedSiteId, setExpandedSiteId] = useState<number | null>(null);
  const [snapshotsBySite, setSnapshotsBySite] = useState<Record<number, Snapshot[]>>({});
  const [loading, setLoading] = useState(true);
  const [busySiteId, setBusySiteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSites() {
    setLoading(true);
    setError(null);
    try {
      setSites(await api.listSites());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载站点失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSites();
  }, []);

  async function loadHistory(siteId: number) {
    if (expandedSiteId === siteId) {
      setExpandedSiteId(null);
      return;
    }
    setExpandedSiteId(siteId);
    if (snapshotsBySite[siteId]) {
      return;
    }
    try {
      const snapshots = await api.listSiteSnapshots(siteId);
      setSnapshotsBySite((current) => ({ ...current, [siteId]: snapshots }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载快照失败");
    }
  }

  async function triggerCrawl(siteId: number) {
    setBusySiteId(siteId);
    setError(null);
    try {
      await api.triggerCrawl(siteId);
      await loadHistory(siteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "触发抓取失败");
    } finally {
      setBusySiteId(null);
    }
  }

  async function toggleEnabled(site: Site) {
    setBusySiteId(site.id);
    setError(null);
    try {
      await api.updateSite(site.id, { enabled: !site.enabled });
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新站点状态失败");
    } finally {
      setBusySiteId(null);
    }
  }

  async function deleteSite(site: Site) {
    const confirmed = window.confirm(`确定删除站点“${site.name}”吗？站点、快照、记录和日志都会一起删除。`);
    if (!confirmed) {
      return;
    }

    setBusySiteId(site.id);
    setError(null);
    try {
      await api.deleteSite(site.id);
      setSnapshotsBySite((current) => {
        const next = { ...current };
        delete next[site.id];
        return next;
      });
      if (expandedSiteId === site.id) {
        setExpandedSiteId(null);
      }
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除站点失败");
    } finally {
      setBusySiteId(null);
    }
  }

  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h2>站点配置</h2>
        </div>
        <div className="action-row">
          <button className="button subtle" type="button" onClick={() => void loadSites()} disabled={loading}>
            刷新
          </button>
          <Link className="button primary" to="/sites/new">
            新建站点
          </Link>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="panel site-table">
        {loading ? <div className="record-empty">正在加载站点配置…</div> : null}
        {!loading && sites.length === 0 ? <div className="record-empty">当前还没有站点配置。</div> : null}
        {!loading && sites.length > 0 ? (
          <>
            <div className="site-row site-head">
              <span>站点</span>
              <span>平台</span>
              <span>提取</span>
              <span>状态</span>
              <span>策略</span>
              <span>操作</span>
            </div>
            {sites.map((site) => {
              const history = snapshotsBySite[site.id] ?? [];
              return (
                <div className="site-row-wrap" key={site.id}>
                  <div className="site-row">
                    <span>
                      <strong>{site.name}</strong>
                      <small>{site.url}</small>
                    </span>
                    <span>{site.platform || "未分类"}</span>
                    <span>{extractorLabel(site.extractor_type)}</span>
                    <span>
                      <StatusPill tone={site.enabled ? "good" : "neutral"}>{site.enabled ? "启用中" : "已停用"}</StatusPill>
                    </span>
                    <span className="site-policy">
                      <small>{site.capture_screenshot ? "截图" : "无截图"}</small>
                      <small>{site.ai_enabled ? "AI" : "无 AI"}</small>
                      <small>{site.timeout_seconds}s</small>
                    </span>
                    <span className="site-actions">
                      <button className="button primary compact" onClick={() => void triggerCrawl(site.id)} disabled={busySiteId === site.id}>
                        {busySiteId === site.id ? "处理中…" : "抓取"}
                      </button>
                      <button className="button subtle compact" onClick={() => void loadHistory(site.id)}>
                        {expandedSiteId === site.id ? "收起" : "记录"}
                      </button>
                      <button className="button subtle compact" onClick={() => void toggleEnabled(site)} disabled={busySiteId === site.id}>
                        {site.enabled ? "停用" : "启用"}
                      </button>
                      <Link className="button subtle compact" to={`/sites/${site.id}/edit`}>
                        编辑
                      </Link>
                      <button className="button danger compact" onClick={() => void deleteSite(site)} disabled={busySiteId === site.id}>
                        删除
                      </button>
                    </span>
                  </div>
                  {site.notes?.trim() ? <div className="site-notes">{site.notes}</div> : null}
                  {expandedSiteId === site.id ? (
                    <div className="history-block site-history">
                      {history.length === 0 ? <div className="history-empty">还没有快照记录。</div> : null}
                      {history.map((snapshot) => (
                        <Link to={`/snapshots/${snapshot.id}`} className="history-item" key={snapshot.id}>
                          <div>
                            <strong>#{snapshot.id}</strong>
                            <p>{snapshot.title || snapshot.final_url || "未命名页面"}</p>
                          </div>
                          <div className="history-meta">
                            <StatusPill tone={statusTone(snapshot.status)}>{snapshot.status}</StatusPill>
                            <span>{new Date(snapshot.created_at).toLocaleString()}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </section>
  );
}
