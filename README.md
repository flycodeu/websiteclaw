# 商铺监控平台

一个 monorepo，两套前端：

- `apps/admin`：后台控制台，负责站点录入、浏览器抓取、验证补充、商品校对和公开发布
- `apps/web`：用户端监控面板，展示店铺、商品和最近 10 次历史

## 当前实现

- 管理端使用 Playwright 执行真实浏览器抓取
- 支持新增站点、发起抓取、登录/验证码后人工续跑
- AI 配置来自本地环境变量，不通过界面维护
- 发布时同时更新内部状态文件和公开数据文件
- 每个商品保留最近 10 次观测记录
- 每个店铺保留最近 10 次快照和差异记录
- 用户端店铺列表桌面端一行展示 3 张卡片

## 数据文件

- 内部状态：`data/platform-state.json`
- 公开数据：`data/public/published-shops.json`
- 抓取运行态：`data/runtime/tasks/<taskId>/`

说明：

- `data/platform-state.json` 保存站点、任务、校对记录和当前发布态
- `data/public/published-shops.json` 只保存用户端需要读取的公开数据
- `data/runtime/` 保存浏览器抓取过程中的 HTML、文本、截图、storageState 等临时文件

## 环境变量

管理端参考 [apps/admin/.env.example](D:\FlyLabs\websiteclaw\apps\admin\.env.example)：

- 登录鉴权：`ADMIN_ALLOWED_EMAILS`、`ADMIN_SESSION_SECRET`
- AI：`AI_ENABLED`、`AI_PROVIDER`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TEMPERATURE`、`AI_THINKING_ENABLED`、`AI_REASONING_EFFORT`、`AI_PRICE_CURRENCY`、`AI_INPUT_PRICE_PER_MILLION`、`AI_OUTPUT_PRICE_PER_MILLION`、`AI_CACHE_HIT_INPUT_PRICE_PER_MILLION`、`AI_SYSTEM_PROMPT`

## 工作流

1. 在管理端新增站点
2. 发起浏览器抓取
3. 如果命中登录、验证码或验证页，任务进入待补充验证
4. 提交 Cookie、storageState 或整理后的页面文本继续抓取
5. 系统生成商品结构初稿
6. 在校对页修正分类、规格、价格、库存和质保字段
7. 发布结果

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

构建：

```bash
npm run build
```
