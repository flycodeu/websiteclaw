# 商铺监控平台

一个 monorepo，分成抓取后台和公开前台两部分：

- `apps/admin`：站点录入、浏览器抓取、人工验证、商品校对、公开发布
- `apps/web`：面向用户的公开监控界面
- `packages/shared`：类型、状态存储、发布流程、通用标签和响应包装

## 当前架构

- 抓取和发布发生在本地或后台运行环境
- 发布后会生成一组静态公开数据文件
- `apps/web` 只读取这些静态文件，不负责写入
- 这适合部署到 Vercel，因为 Vercel 只做只读展示

重点说明：

- 不建议把“抓取结果写本地 JSON”这件事直接放到 Vercel 运行时
- 当前方案是“本地生成公开产物，再部署或同步到 Vercel”

## 商品生命周期规则

- 每个商品按 `productKey` 作为同店唯一标识
- 同一商品价格变化时，不新建商品，只更新当前版本
- 每个商品保留最近 10 次观测历史
- 每个商品会派生价格历史摘要和最近一次涨跌方向
- 如果同店同商品连续 1 到 2 次抓取不到：
  - 仍保留在公开列表
  - 状态会变成离线/缺席
- 如果同店同商品连续第 3 次抓取不到：
  - 自动从公开列表删除
  - 转入归档历史
- 如果归档商品后续再次抓到：
  - 会恢复到公开列表
  - 历史记录继续沿用

## 公开数据文件

发布后会在 `data/public/` 下生成这些文件：

- `published-data.json`：完整公开发布态，供内部程序读取
- `published-meta.json`：发布时间、店铺数、商品数、分类统计
- `published-shops.json`：店铺摘要列表
- `published-products.json`：轻量商品索引，不带完整历史
- `published-diffs.json`：最近发布差异列表
- `shops/<shopId>.json`：单店详情、商品历史、快照和差异

## 前端读取策略

### `apps/web`

- 首页：
  - 首屏只读轻量商品索引
  - 搜索、分类、价格过滤走服务端 API 分页
- 店铺页：
  - 首屏只加载店铺摘要
  - 点击店铺后再按需读取 `shops/<shopId>.json`

这样做的目的：

- 降低首屏传输体积
- 避免在浏览器里一次性处理全量历史数据
- 减少在 Vercel 上的页面切换卡顿

## 数据文件说明

- 内部状态：`data/platform-state.json`
- 公开数据：`data/public/*`
- 抓取运行态：`data/runtime/tasks/<taskId>/`

说明：

- `platform-state.json` 保存源站、任务、校对记录和完整发布态
- `data/public/` 只保存前台读取所需的静态产物
- `data/runtime/` 保存抓取过程中的 HTML、文本、截图、storageState 等运行文件

## 工作流

1. 在管理端新增站点
2. 发起抓取
3. 如果命中验证码、登录或验证页，进入人工验证流程
4. 抓取完成后生成商品初稿
5. 在校对页确认分类、规格、价格、库存和质保
6. 发布到公开数据
7. 将最新静态产物部署或同步到 Vercel

## 运行

安装依赖：

```bash
npm install
```

启动管理端：

```bash
npm run dev:admin
```

启动公开前端：

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

## 环境变量

管理端参考 `apps/admin/.env.example`：

- 登录鉴权：`ADMIN_ALLOWED_EMAILS`、`ADMIN_SESSION_SECRET`
- AI：`AI_ENABLED`、`AI_PROVIDER`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`
- AI 推理和计费：`AI_TEMPERATURE`、`AI_THINKING_ENABLED`、`AI_REASONING_EFFORT`
- AI 成本：`AI_PRICE_CURRENCY`、`AI_INPUT_PRICE_PER_MILLION`、`AI_OUTPUT_PRICE_PER_MILLION`、`AI_CACHE_HIT_INPUT_PRICE_PER_MILLION`
- 系统提示词：`AI_SYSTEM_PROMPT`

## 部署建议

### 推荐方式

- 抓取后台运行在本地服务器、云主机或你自己的长期进程环境
- 公开前端部署到 Vercel
- 每次发布后，把 `data/public/` 的静态产物一起部署或同步

### 不推荐方式

- 在 Vercel Serverless/Edge 里直接执行抓取并写本地 JSON

原因：

- Vercel 运行时文件系统不是可靠持久化存储
- 多实例下本地文件不会天然一致
- 运行时写入不适合当前这套抓取发布模型

## 已完成的关键改造

- 商品连续 3 次缺失后自动删除
- 商品价格变化只更新当前版本并保留历史
- 发布时生成多份静态公开产物
- 前端改成轻索引首屏 + 单店详情按需加载
- 用户端界面重做并减少切换卡顿
