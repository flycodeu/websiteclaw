# WebsiteClaw MVP

中文 | [English](#english)

一期 MVP，用于自动采集网页内容、在本地保存取证文件，并按需将结构化结果同步到飞书多维表格。

## 中文

### 项目简介

WebsiteClaw 当前实现的是第一阶段 MVP，目标是先打通：

- 站点配置管理
- 手动触发单次抓取
- 原始 HTML、本地截图、提取结果 JSON 留存
- 疑似挑战页检测
- 人工接管浏览器会话后继续抓取
- 按需写入飞书多维表格
- 执行日志追踪

当前已重构为“前后端整合启动”模式：

- 生产使用时，前端构建产物由 FastAPI 直接托管
- 用户只需要启动后端一个进程
- 开发时仍可选择前后端分开运行

### 技术栈

- 后端：FastAPI + SQLAlchemy + Playwright + SQLite
- 前端：React + TypeScript + Vite
- 本地存储：`data/` 目录下保存数据库、HTML、截图和提取 JSON
- 飞书同步（可选）：`tenant_access_token` + 附件上传 + 多维表格新增记录

### 安装前准备

普通用户首次运行前，需要先安装：

- Windows：Python 3、Node.js（自带 npm）
- Linux / WSL：`python3`、Node.js（自带 npm）

建议确认以下命令可用：

- Windows：`python --version`、`npm --version`
- Linux / WSL：`python3 --version`、`npm --version`

如果只是使用系统，不需要手动创建虚拟环境或提前构建前端，直接执行一键启动脚本即可。

### 当前已实现

- 多站点配置管理
- 后台手动触发抓取
- 保存原始 HTML、可见文本、截图和结构化 JSON
- 检测疑似挑战页并暂停
- 启动人工接管浏览器会话
- 人工完成验证后恢复抓取
- 成功快照按需同步到飞书多维表格
- 抓取和人工接管日志记录
- 管理后台浅色 / 深色主题切换
- 基于 `.env` 的统一 AI 分析配置

### 当前未实现

- 定时任务调度
- Hash 变更检测
- 飞书记录更新
- 登录鉴权
- 自动绕过验证码或滑块

### 推荐启动方式

普通用户只需要执行一个启动脚本。首次运行时，脚本会自动完成：

- 复制 `.env.example` 为 `.env`
- 创建或修复根目录 `.venv`
- 安装后端依赖
- 安装 Playwright Chromium
- 安装前端依赖并构建前端
- 如检测到旧的 WebsiteClaw 后端实例，自动停止并替换
- 启动统一的 FastAPI 服务

普通用户启动步骤：

1. 安装 Python 3 和 Node.js/npm
2. 打开项目目录
3. 执行一键启动脚本
4. 等待首次初始化完成
5. 浏览器访问 `http://localhost:8000`

#### Linux / WSL

```bash
bash ./start.sh
```

#### Windows PowerShell

```powershell
.\start.ps1
```

首次启动会更慢，因为需要自动安装依赖和浏览器。

前提条件：

- Windows：已安装 Python 3 和 Node.js/npm
- Linux / WSL：已安装 `python3` 和 Node.js/npm

脚本会自动识别并重建从 Linux / WSL 或 Windows 误复用过来的不兼容 `.venv`。

如果当前端口上已经有旧的 WebsiteClaw 实例在运行，一键启动脚本会自动停止旧实例并拉起新版本。

如果默认端口 `8000` 已被占用，请修改 `.env` 中的 `BACKEND_PORT`。

启动后统一访问 `http://localhost:8000`。

### 开发模式

如果需要前端热更新，可以继续前后端分开运行。

#### Linux / WSL

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

#### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m playwright install chromium
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

注意：不要复用从 Linux / WSL 目录直接拷贝过来的 `.venv`。如果执行 `pip` 或 `python` 时出现 `/usr/bin/python.exe` 或 `/usr/bin/python3`，说明当前虚拟环境不是在 Windows 下创建的，直接删除 `.venv` 后重新执行 `python -m venv .venv`。

另开一个终端：

```powershell
cd frontend
npm install
npm run dev
```

开发模式下前端仍访问 `http://localhost:5173`，Vite 已通过代理把 `/api` 转发到后端，不需要手动改 API 地址。

### 手动初始化命令（开发者 / 排障）

如果你需要自己控制安装过程，或要排查环境问题，可以手动执行以下命令：

1. 复制 `.env.example` 为 `.env`
2. 安装后端依赖
3. 安装前端依赖
4. 启动后端和前端

#### 后端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
python -m backend.app
```

#### 前端

```bash
cd frontend
npm install
npm run build
```

完成构建后由后端统一托管页面。

### 常见问题

- 首次启动时间较长：
  这是正常现象，因为脚本会自动安装 Python 依赖、Playwright Chromium 和前端依赖。
- 端口 `8000` 被占用：
  修改 `.env` 中的 `BACKEND_PORT` 为其他空闲端口，然后重新执行启动脚本。
- `.venv` 无法使用或混用了 WSL / Windows 环境：
  一键启动脚本会自动识别并重建不兼容的 `.venv`。
- 缺少 `python`、`python3` 或 `npm`：
  先安装对应运行环境，再重新执行启动脚本。
- 飞书里没有图片附件：
  先确认本地 `data/screenshots/` 下已经生成截图文件，并确认飞书表中的 `页面截图` 列是附件类型。
- AI 分析没有生效：
  检查站点是否开启 AI 分析，并确认 `.env` 中已填写 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`；失败原因会显示在快照详情和执行日志中。
- 不接飞书能不能用：
  可以。直接在“系统设置”里关闭飞书同步即可，系统仍会完成本地抓取、保存 HTML/截图/JSON，并将记录标记为未启用同步。

### 环境变量说明

主要环境变量位于 `.env.example`：

- `DATABASE_URL`：数据库连接地址，默认使用本地 SQLite
- `DATA_ROOT`：本地数据根目录，用于保存数据库和取证文件
- `CORS_ORIGINS`：允许访问后端 API 的前端来源
- `PLAYWRIGHT_BROWSER`：Playwright 使用的浏览器，默认 `chromium`
- `PLAYWRIGHT_NAVIGATION_TIMEOUT_MS`：页面稳定等待超时
- `PLAYWRIGHT_MANUAL_SESSION_TTL_MINUTES`：人工接管会话有效期
- `FEISHU_APP_ID`：飞书自建应用 App ID
- `FEISHU_APP_SECRET`：飞书自建应用 App Secret
- `FEISHU_BASE_URL`：飞书开放平台基础地址，默认官方地址
- `AI_BASE_URL`：AI 接口地址，默认 `https://api.deepseek.com`
- `AI_MODEL`：AI 模型名称，默认 `deepseek-chat`
- `AI_API_KEY`：AI 服务密钥
- `AI_PROMPT_TEMPLATE`：附加分析要求，可留空

### 飞书接入说明（可选）

只有在你需要把抓取结果写入飞书时，才需要配置这一节。仅本地使用时可以完全跳过。

字段名、列类型和建表方式请看独立文档：[FEISHU_BITABLE_GUIDE.md](D:/FlyLabs/websiteclaw/FEISHU_BITABLE_GUIDE.md)。

要让抓取结果成功写入飞书，需要同时满足两层配置：

1. 服务端环境变量中配置：
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
2. 在后台 `系统设置` 页面填写：
   - `飞书 App Token`
   - `主表 Table ID`
   - `商品表 Table ID`
   - 是否启用飞书同步
   - 是否自动同步

站点配置页不再填写任何飞书参数。飞书现在是全局一次配置，所有站点共用。

当前版本按“主表 + 商品表”同步：

- 主表一行代表一次执行记录
- 商品表一行代表一个商品
- 商品表通过关联字段回链主表

建议飞书准备两张表：

主表建议字段：

- `网站名称`
- `地址`
- `平台`
- `抓取时间`
- `AI分析`
- `稳定性`
- `评价`
- `网站截图`
- `商品数`
- `商品摘要`
- `最终地址`
- `本地记录ID`

商品表建议字段：

- `商品名称`
- `价格`
- `库存`
- `是否质保`
- `商品链接`
- `商品备注`
- `所属执行记录`
- `所属网站`
- `本地商品ID`

其中 `网站截图` 必须使用飞书附件列类型，`所属执行记录` 必须使用关联字段类型。

### AI 分析配置

如果希望抓取后自动交给 DeepSeek 等 AI 服务分析，直接在项目根目录 `.env` 中填写 AI 配置即可，例如：

```env
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=your-real-key
AI_PROMPT_TEMPLATE=
```

站点配置页只负责开启或关闭 AI 分析，不再单独保存每个站点自己的 AI 连接参数。

当前实现使用 OpenAI 兼容接口，适合 DeepSeek 等兼容服务。默认流程如下：

1. 抓取网页
2. 保存 HTML 和截图
3. 执行规则提取
4. 自动进行商品结构化分析
5. 如已启用飞书，会自动同步主表记录和商品明细表

DeepSeek 推荐配置示例：

- `AI Base URL = https://api.deepseek.com`
- `.env` 中配置 `AI_MODEL=deepseek-chat`
- `.env` 中配置 `AI_API_KEY=...`

也兼容填写 `https://api.deepseek.com/v1`。系统会自动按 OpenAI 兼容格式请求 `/chat/completions`，不需要手动填写完整接口路径。

当前默认使用标准文本对话格式进行分析，请求结构等价于：

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "网页分析输入文本"}
  ],
  "stream": false
}
```

### 人工接管与反爬限制

当页面返回疑似挑战页时，系统会将快照状态置为 `waiting_manual`，并保留当前 HTML 与截图。此时可在快照详情页发起人工接管：

- 后端所在机器会打开一个有界面的 Chromium 窗口
- 操作员在该窗口中手动完成验证
- 完成后在后台点击“继续抓取”

当前实现只支持“人工完成验证后继续抓取”，不支持自动绕过滑块、验证码或其他人机校验。

这个流程依赖桌面会话，不适用于纯无头服务器环境。

### Docker

仓库内提供了单服务版 `docker-compose.yml`。镜像构建时会先打包前端，再由后端统一提供页面和 API：

- 启动后统一访问 `http://localhost:8000`
- 页面和 API 由同一个容器提供
- 人工接管浏览器需要本地桌面环境
- 因此人工接管场景不建议完全依赖容器内无界面运行

---

## English

Phase-one MVP for collecting website content, storing local evidence files, and optionally syncing structured results to Feishu Bitable.

### Overview

The current MVP focuses on the first delivery stage and covers:

- Site configuration management
- Manual single-run crawls from the admin UI
- Local persistence of raw HTML, screenshots, and extracted JSON
- Likely challenge-page detection
- Manual browser takeover and crawl resume
- Optional Feishu Bitable record creation
- Execution log tracking

The app is now refactored for unified startup:

- FastAPI serves the built frontend assets directly
- users only need one backend process in production
- split frontend/backend development remains available

### Stack

- Backend: FastAPI + SQLAlchemy + Playwright + SQLite
- Frontend: React + TypeScript + Vite
- Local storage: database, HTML, screenshots, and extracted JSON under `data/`
- Optional Feishu sync: tenant token, attachment upload, and Bitable record creation

### Prerequisites

Before the first run, regular users should install:

- Windows: Python 3 and Node.js/npm
- Linux / WSL: `python3` and Node.js/npm

Recommended checks:

- Windows: `python --version` and `npm --version`
- Linux / WSL: `python3 --version` and `npm --version`

If you only want to use the app, you do not need to create a virtual environment or build the frontend manually. Use the one-click startup script instead.

### Implemented in Phase One

- Multiple site configurations
- Manual crawl trigger from the admin UI
- Raw HTML, visible text, screenshot, and extracted JSON persistence
- Challenge-page detection and pause
- Manual browser takeover flow
- Crawl resume after manual verification
- Optional Feishu Bitable record creation for successful snapshots
- Crawl and manual-session logging
- Light and dark theme switching in the admin UI
- Unified AI list and default AI analysis configuration

### Not Implemented Yet

- Scheduled jobs
- Hash-based change detection
- Feishu record updates
- Login/authentication
- Automatic captcha or slider bypass

### Recommended Startup Mode

For regular users, run a single startup script. On the first run, it will automatically:

- copy `.env.example` to `.env`
- create or repair the root `.venv`
- install backend dependencies
- install Playwright Chromium
- install frontend dependencies and build the frontend
- start the unified FastAPI service

Regular user startup steps:

1. Install Python 3 and Node.js/npm
2. Open the project directory
3. Run the one-click startup script
4. Wait for the first-time initialization to finish
5. Open `http://localhost:8000` in a browser

#### Linux / WSL

```bash
bash ./start.sh
```

#### Windows PowerShell

```powershell
.\start.ps1
```

The first startup will take longer because it installs dependencies and browser binaries automatically.

Prerequisites:

- Windows: Python 3 and Node.js/npm are installed
- Linux / WSL: `python3` and Node.js/npm are installed

The startup scripts automatically detect and recreate an incompatible `.venv` copied across Windows and Linux/WSL.

If port `8000` is already in use, change `BACKEND_PORT` in `.env`.

If an older WebsiteClaw backend instance is already running on the target port, the one-click startup script will stop it and replace it with the new version automatically.

Open `http://localhost:8000`.

### Development Mode

For hot-reload frontend development, keep the services split.

#### Linux / WSL

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

#### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m playwright install chromium
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Note: do not reuse a `.venv` copied from Linux or WSL. If `pip` or `python` reports `/usr/bin/python.exe` or `/usr/bin/python3`, the virtual environment was created outside Windows. Delete `.venv` and recreate it with `python -m venv .venv`.

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

During development, the frontend stays on `http://localhost:5173` and Vite proxies `/api` to the backend automatically.

### Manual Setup Commands (Developers / Troubleshooting)

Use the manual commands below if you need full control over installation or are troubleshooting the environment:

1. Copy `.env.example` to `.env`
2. Install backend dependencies
3. Install frontend dependencies
4. Start backend and frontend

#### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
python -m backend.app
```

#### Frontend

```bash
cd frontend
npm install
npm run build
```

After the build, the backend serves the frontend directly.

### Common Issues

- First startup is slow:
  This is expected because the script installs Python packages, Playwright Chromium, and frontend dependencies automatically.
- Port `8000` is already in use:
  Change `BACKEND_PORT` in `.env` to a free port, then rerun the startup script.
- Screenshots do not show up in Feishu:
  Confirm screenshot files exist under `data/screenshots/` and make sure the `页面截图` column in Feishu is an attachment field.
- AI analysis does not run:
  Check whether AI analysis is enabled for the site and confirm `.env` contains `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`. The failure reason will appear in snapshot details and task logs.
- Can I use it without Feishu:
  Yes. Turn Feishu sync off in the `系统设置` page and crawls will still complete locally.
- `.venv` is broken or copied across Windows and WSL/Linux:
  The one-click startup scripts automatically detect and recreate an incompatible `.venv`.
- `python`, `python3`, or `npm` is missing:
  Install the missing runtime first, then rerun the startup script.

### Environment Variables

Key variables are listed in `.env.example`:

- `DATABASE_URL`: database connection string, SQLite by default
- `DATA_ROOT`: root directory for database and local evidence files
- `CORS_ORIGINS`: allowed frontend origins for the backend API
- `PLAYWRIGHT_BROWSER`: browser used by Playwright, default `chromium`
- `PLAYWRIGHT_NAVIGATION_TIMEOUT_MS`: timeout for waiting on page stabilization
- `PLAYWRIGHT_MANUAL_SESSION_TTL_MINUTES`: manual takeover session lifetime
- `FEISHU_APP_ID`: Feishu custom app ID
- `FEISHU_APP_SECRET`: Feishu custom app secret
- `FEISHU_BASE_URL`: Feishu Open Platform base URL
- `AI_BASE_URL`: AI endpoint base URL, default `https://api.deepseek.com`
- `AI_MODEL`: AI model name, default `deepseek-chat`
- `AI_API_KEY`: AI service key
- `AI_PROMPT_TEMPLATE`: optional extra analysis prompt

### Feishu Setup (Optional)

Only configure this section if you want crawl results written into Feishu. For local-only usage, you can skip it entirely.

Successful Feishu syncing now uses a global configuration:

1. Server-side environment variables:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
2. Global settings in the `系统设置` page:
   - `Feishu App Token`
   - `Main Table ID`
   - `Product Table ID`
   - sync enable switch
   - auto-sync switch

Site forms no longer contain Feishu fields.

The current version syncs into two tables:

- one main table row per execution record
- one product table row per product
- the product table links back to the main table

The screenshot field must be an attachment field and the `所属执行记录` field must be a record link field.

### AI Analysis Setup

To analyze pages with DeepSeek or another compatible AI service after each crawl, put the AI settings directly in the project root `.env`.

The real secret key should be stored in the project root `.env`, for example:

```env
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=your-real-key
AI_PROMPT_TEMPLATE=
```

The site configuration page now only enables or disables AI analysis for that site. It no longer stores per-site AI connection settings.

The implementation uses an OpenAI-compatible interface, which works for DeepSeek and similar providers. The default flow is:

1. Crawl the page
2. Save HTML and screenshot locally
3. Run rule-based extraction
4. Run AI analysis automatically
5. If Feishu is enabled, sync the execution record and the product detail table automatically

Recommended DeepSeek example:

- `AI Base URL = https://api.deepseek.com`
- `.env` contains `AI_MODEL=deepseek-chat`
- `.env` contains `AI_API_KEY=...`

`https://api.deepseek.com/v1` is also accepted. The system automatically calls the OpenAI-compatible `/chat/completions` endpoint, so users should not enter the full endpoint path manually.

The default request format is standard text chat and is equivalent to:

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "web page analysis input text"}
  ],
  "stream": false
}
```

### Manual Takeover and Anti-Bot Limits

When the crawler detects a likely challenge page, the snapshot is marked as `waiting_manual` and the current HTML and screenshot are preserved. Operators can then start a manual takeover from the snapshot detail page:

- A headed Chromium window opens on the backend host
- The operator completes the verification manually
- The crawl resumes after clicking the resume action in the UI

This implementation supports manual continuation only. It does not automate bypassing sliders, captchas, or other anti-bot checks.

This flow requires a local desktop session and is not suitable for headless-only server environments.

### Docker

The repository now includes a single-service `docker-compose.yml`. The image builds the frontend first, then FastAPI serves both the UI and the API:

- Open `http://localhost:8000` after startup
- One container serves both the frontend and backend
- Manual browser takeover requires a desktop environment
- The manual takeover flow should not rely on a fully headless container-only deployment
