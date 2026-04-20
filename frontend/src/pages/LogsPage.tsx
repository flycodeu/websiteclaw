import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { TaskLog } from "../api/types";
import { StatusPill } from "../components/StatusPill";

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["success", "synced", "active"].includes(status)) {
    return "good";
  }
  if (["waiting_manual", "challenge_detected", "pending", "running"].includes(status)) {
    return "warn";
  }
  if (["failed", "cancelled", "sync_failed"].includes(status)) {
    return "bad";
  }
  return "neutral";
}

export function LogsPage() {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      setLogs(await api.listTaskLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载日志失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h2>执行日志</h2>
        </div>
        <button className="button subtle" type="button" onClick={() => void loadLogs()} disabled={loading}>
          刷新
        </button>
      </header>

      {error ? <div className="banner error">{error}</div> : null}
      {loading ? <div className="panel">正在加载日志…</div> : null}

      {!loading ? (
        <div className="panel">
          <div className="log-table">
            <div className="log-row log-head">
              <span>时间</span>
              <span>类型</span>
              <span>状态</span>
              <span>耗时</span>
              <span>信息</span>
              <span>快照</span>
            </div>
            {logs.map((log) => (
              <div className="log-row" key={log.id}>
                <span>{new Date(log.created_at).toLocaleString()}</span>
                <span>{log.task_type}</span>
                <span>
                  <StatusPill tone={statusTone(log.status)}>{log.status}</StatusPill>
                </span>
                <span>{log.duration_ms ? `${log.duration_ms} ms` : "-"}</span>
                <span>{log.message || "-"}</span>
                <span>{log.snapshot_id ? <Link to={`/snapshots/${log.snapshot_id}`}>#{log.snapshot_id}</Link> : "-"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
