# 商铺监控平台

一个 monorepo，两套前端：

- `apps/admin`：管理端，负责数据源维护、浏览器抓取、人工验证、AI 分析、审核发布
- `apps/web`：用户端，读取管理端沉淀后的商铺、商品和差异结果

## 当前实现

- 管理端已移除 mock 抓取，改为 Playwright 真实浏览器抓取
- 支持新增数据源、发起抓取、登录/验证码后人工续跑、AI 结构化、审核后发布
- AI 配置改为本地环境变量，不再通过界面修改
- 抓取运行态文件会保存在 `data/runtime/`，不会进入仓库

## 数据文件

- 平台状态：`data/platform-state.json`
- 抓取运行态：`data/runtime/tasks/<taskId>/`

说明：

- `data/platform-state.json` 保存数据源、任务、审核记录和发布结果
- `data/runtime/` 保存浏览器抓取过程中的 HTML、文本、截图、storageState 等临时文件

## 环境变量

管理端参考 [apps/admin/.env.example](D:\FlyLabs\websiteclaw\apps\admin\.env.example)：

- 登录鉴权：`ADMIN_ALLOWED_EMAILS`、`ADMIN_SESSION_SECRET`
- AI：`AI_ENABLED`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TEMPERATURE`、`AI_SYSTEM_PROMPT`

## 工作流

1. 在管理端新增数据源
2. 发起浏览器抓取
3. 如果命中登录、验证码或验证页，任务进入待人工验证
4. 提交 Cookie、storageState 或整理后的页面文本继续抓取
5. AI 输出结构化商品结果
6. 在审核页修正商品、风险提示和分析结论
7. 发布结果，更新商铺、商品和差异数据

## 运行

```bash
npm install
npm run dev:admin
```

用户端本地查看：

```bash
npm run dev:web
```

类型检查：

```bash
npm run typecheck
```
