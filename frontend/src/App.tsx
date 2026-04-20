import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { LogsPage } from "./pages/LogsPage";
import { RecordCenterPage } from "./pages/RecordCenterPage";
import { SharedRecordPage } from "./pages/SharedRecordPage";
import { SiteEditorPage } from "./pages/SiteEditorPage";
import { SitesPage } from "./pages/SitesPage";
import { SnapshotDetailPage } from "./pages/SnapshotDetailPage";
import { SystemSettingsPage } from "./pages/SystemSettingsPage";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "websiteclaw-theme";

const links = [
  { to: "/records", label: "记录中心" },
  { to: "/sites", label: "站点" },
  { to: "/settings", label: "系统设置" },
  { to: "/logs", label: "执行日志" },
];

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-shell">
          <div className="brand-block">
            <p className="eyebrow">WebsiteClaw</p>
            <h1>采集工作台</h1>
          </div>

          <div className="theme-panel" aria-label="主题切换">
            <p className="theme-label">界面主题</p>
            <div className="theme-switch">
              <button
                type="button"
                className={`theme-option${theme === "light" ? " is-active" : ""}`}
                onClick={() => setTheme("light")}
                aria-pressed={theme === "light"}
              >
                浅色
              </button>
              <button
                type="button"
                className={`theme-option${theme === "dark" ? " is-active" : ""}`}
                onClick={() => setTheme("dark")}
                aria-pressed={theme === "dark"}
              >
                深色
              </button>
            </div>
          </div>

          <nav className="nav-stack">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <main className="content-shell">
        <div className="content-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/records" replace />} />
            <Route path="/records" element={<RecordCenterPage />} />
            <Route path="/shared/records/:shareToken" element={<SharedRecordPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/sites/new" element={<SiteEditorPage mode="create" />} />
            <Route path="/sites/:siteId/edit" element={<SiteEditorPage mode="edit" />} />
            <Route path="/settings" element={<SystemSettingsPage />} />
            <Route path="/snapshots/:snapshotId" element={<SnapshotDetailPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
