import { FormEvent, useEffect, useState } from "react";

import { api } from "../api/client";
import type { SystemSettingsPayload } from "../api/types";
import { StatusPill } from "../components/StatusPill";

const defaultForm: SystemSettingsPayload = {
  feishu_enabled: false,
  feishu_app_token: "",
  feishu_main_table_id: "",
  feishu_product_table_id: "",
  feishu_auto_sync: true,
};

function syncTone(enabled: boolean): "good" | "neutral" {
  return enabled ? "good" : "neutral";
}

export function SystemSettingsPage() {
  const [form, setForm] = useState<SystemSettingsPayload>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const settings = await api.getSystemSettings();
        setForm({
          feishu_enabled: settings.feishu_enabled,
          feishu_app_token: settings.feishu_app_token ?? "",
          feishu_main_table_id: settings.feishu_main_table_id ?? "",
          feishu_product_table_id: settings.feishu_product_table_id ?? "",
          feishu_auto_sync: settings.feishu_auto_sync,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载系统设置失败");
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      const result = await api.updateSystemSettings({
        ...form,
        feishu_app_token: form.feishu_app_token?.trim() || "",
        feishu_main_table_id: form.feishu_main_table_id?.trim() || "",
        feishu_product_table_id: form.feishu_product_table_id?.trim() || "",
      });
      setForm({
        feishu_enabled: result.feishu_enabled,
        feishu_app_token: result.feishu_app_token ?? "",
        feishu_main_table_id: result.feishu_main_table_id ?? "",
        feishu_product_table_id: result.feishu_product_table_id ?? "",
        feishu_auto_sync: result.feishu_auto_sync,
      });
      setSavedMessage("系统设置已保存。后续抓取会直接使用这套飞书配置。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存系统设置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h2>系统设置</h2>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}
      {savedMessage ? <div className="banner success">{savedMessage}</div> : null}

      <div className="settings-dashboard">
        <section className="panel settings-summary">
          <div className="settings-stat">
            <span className="detail-label">飞书同步</span>
            <StatusPill tone={syncTone(form.feishu_enabled)}>{form.feishu_enabled ? "已启用" : "未启用"}</StatusPill>
          </div>
          <div className="settings-stat">
            <span className="detail-label">自动同步</span>
            <StatusPill tone={syncTone(form.feishu_enabled && form.feishu_auto_sync)}>
              {form.feishu_enabled && form.feishu_auto_sync ? "开启" : "关闭"}
            </StatusPill>
          </div>
          <div className="settings-note">
            <p>凭证读取 `.env` 中的 `FEISHU_APP_ID / FEISHU_APP_SECRET`。</p>
            <p>这里只维护全局目标表。</p>
          </div>
        </section>

        <form className="editor-form settings-form" onSubmit={(event) => void submit(event)}>
          {loading ? <div className="panel">正在加载系统设置…</div> : null}
          {!loading ? (
            <>
              <section className="settings-section">
                <div className="panel-heading">
                  <span className="section-title">飞书同步</span>
                  <span className="helper-text">留空即可关闭，所有站点共用这一套配置。</span>
                </div>

                <div className="toggle-row">
                  <label className="toggle-chip">
                    <input
                      checked={form.feishu_enabled}
                      type="checkbox"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          feishu_enabled: event.target.checked,
                          feishu_auto_sync: event.target.checked ? current.feishu_auto_sync : false,
                        }))
                      }
                    />
                    <span>启用飞书同步</span>
                  </label>
                  <label className="toggle-chip">
                    <input
                      checked={form.feishu_auto_sync}
                      type="checkbox"
                      disabled={!form.feishu_enabled}
                      onChange={(event) => setForm((current) => ({ ...current, feishu_auto_sync: event.target.checked }))}
                    />
                    <span>抓取成功后自动同步</span>
                  </label>
                </div>

                <label>
                  <span>飞书 App Token</span>
                  <input
                    value={form.feishu_app_token}
                    onChange={(event) => setForm((current) => ({ ...current, feishu_app_token: event.target.value }))}
                    placeholder="bascxxxxxxxx"
                  />
                </label>

                <div className="form-row">
                  <label>
                    <span>主表 Table ID</span>
                    <input
                      value={form.feishu_main_table_id}
                      onChange={(event) => setForm((current) => ({ ...current, feishu_main_table_id: event.target.value }))}
                      placeholder="tblxxxxxxxx"
                    />
                  </label>
                  <label>
                    <span>商品表 Table ID</span>
                    <input
                      value={form.feishu_product_table_id}
                      onChange={(event) => setForm((current) => ({ ...current, feishu_product_table_id: event.target.value }))}
                      placeholder="tblxxxxxxxx"
                    />
                  </label>
                </div>

                <div className="settings-note">
                  <p>不接飞书时直接关闭同步即可，本地记录仍会保留。</p>
                </div>
              </section>

              <div className="action-row">
                <button className="button primary" type="submit" disabled={saving}>
                  {saving ? "保存中…" : "保存系统设置"}
                </button>
              </div>
            </>
          ) : null}
        </form>
      </div>
    </section>
  );
}
