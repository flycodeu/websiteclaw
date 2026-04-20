import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { SitePayload } from "../api/types";

const defaultForm: SitePayload = {
  name: "",
  url: "",
  platform: "",
  enabled: true,
  timeout_seconds: 45,
  capture_screenshot: true,
  extractor_type: "generic_text",
  extractor_rules: {},
  ai_enabled: false,
  notes: "",
};

type Props = {
  mode: "create" | "edit";
};

export function SiteEditorPage({ mode }: Props) {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<SitePayload>(defaultForm);
  const [rulesText, setRulesText] = useState("{}");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !siteId) {
      return;
    }

    async function loadSite() {
      setLoading(true);
      setError(null);
      try {
        const sites = await api.listSites();
        const site = sites.find((item) => item.id === Number(siteId));
        if (!site) {
          throw new Error("站点不存在");
        }
        setForm({
          name: site.name,
          url: site.url,
          platform: site.platform,
          enabled: site.enabled,
          timeout_seconds: site.timeout_seconds,
          capture_screenshot: site.capture_screenshot,
          extractor_type: site.extractor_type,
          extractor_rules: site.extractor_rules,
          ai_enabled: site.ai_enabled,
          notes: site.notes ?? "",
        });
        setRulesText(JSON.stringify(site.extractor_rules, null, 2));
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载站点失败");
      } finally {
        setLoading(false);
      }
    }

    void loadSite();
  }, [mode, siteId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        extractor_rules: rulesText.trim() ? (JSON.parse(rulesText) as Record<string, string>) : {},
      };
      if (mode === "create") {
        await api.createSite(payload);
      } else if (siteId) {
        await api.updateSite(Number(siteId), payload);
      }
      navigate("/sites");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存站点失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h2>{mode === "create" ? "新建站点" : "编辑站点"}</h2>
        </div>
        <Link className="button subtle" to="/sites">
          返回列表
        </Link>
      </header>

      {loading ? <div className="panel">正在加载站点配置…</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {!loading ? (
        <form className="editor-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>站点名称</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </label>

          <label>
            <span>目标地址</span>
            <input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} type="url" required />
          </label>

          <div className="form-row">
            <label>
              <span>平台</span>
              <input
                value={form.platform}
                onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
                placeholder="例如：链动小铺"
              />
            </label>
            <label>
              <span>商品提取方式</span>
              <select
                value={form.extractor_type}
                onChange={(event) => setForm((current) => ({ ...current, extractor_type: event.target.value }))}
              >
                <option value="generic_text">通用商品识别</option>
                <option value="selector_rule">选择器规则</option>
              </select>
            </label>
            <label>
              <span>超时时间</span>
              <input
                value={form.timeout_seconds}
                type="number"
                min={5}
                max={300}
                onChange={(event) =>
                  setForm((current) => ({ ...current, timeout_seconds: Number(event.target.value) || 45 }))
                }
              />
            </label>
          </div>

          <div className="toggle-row">
            <label className="toggle-chip">
              <input
                checked={form.enabled}
                type="checkbox"
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>启用站点</span>
            </label>
            <label className="toggle-chip">
              <input
                checked={form.capture_screenshot}
                type="checkbox"
                onChange={(event) => setForm((current) => ({ ...current, capture_screenshot: event.target.checked }))}
              />
              <span>保存截图</span>
            </label>
          </div>

          <label>
            <span>选择器规则 JSON</span>
            <textarea
              value={rulesText}
              onChange={(event) => setRulesText(event.target.value)}
              rows={10}
              placeholder={'{"category": ".tab.active", "product_card": ".goods-item", "name": ".goods-name", "price": ".goods-price", "stock": ".stock-tag", "warranty": ".warranty-tag", "link": "a"}'}
            />
          </label>
          <div className="helper-text">默认先用通用识别，识别不稳时再补选择器。</div>

          <section className="panel form-section">
            <div className="panel-heading">
              <span className="section-title">AI 分析</span>
              <span className="helper-text">AI 配置统一读取 `.env`，这里仅控制当前站点是否启用分析。</span>
            </div>
            <div className="toggle-row">
              <label className="toggle-chip">
                <input
                  checked={form.ai_enabled}
                  type="checkbox"
                  onChange={(event) => setForm((current) => ({ ...current, ai_enabled: event.target.checked }))}
                />
                <span>抓取后自动进行 AI 分析</span>
              </label>
            </div>
          </section>

          <label>
            <span>备注</span>
            <textarea value={form.notes} rows={4} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>

          <div className="action-row">
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "保存中…" : mode === "create" ? "创建站点" : "保存修改"}
            </button>
            <Link className="button subtle" to="/sites">
              取消
            </Link>
          </div>
        </form>
      ) : null}
    </section>
  );
}
