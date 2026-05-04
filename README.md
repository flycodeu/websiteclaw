# Website Claw

商铺监控与公开展示平台，包含：

- `apps/admin`：管理端，负责站点录入、抓取、人工验证、商品校对、发布
- `apps/web`：用户端，负责展示公开店铺和商品信息
- `packages/shared`：共享类型、状态存储、发布流程、标签与响应工具

## 核心能力

- 录入抓取站点并维护商铺分类
- 浏览器抓取商品、价格、库存和可见文本
- 支持验证码、登录态、人工继续验证
- 商品校对后发布为公开静态数据
- 用户端支持店铺列表、商品列表、按条件筛选
- 用户端支持“加载更多”按钮和滚动自动加载

## 商铺分类

平台内置两种商铺类型：

- `小铺`
- `代充`

管理端录入站点时默认是 `小铺`，可手动切换成 `代充`。  
用户端店铺列表和店铺详情会展示当前商铺类型。

## 项目结构

```text
apps/
  admin/   管理端
  web/     用户端
packages/
  shared/  共享逻辑
data/
  platform-state.json   内部状态
  public/               公开静态产物
  runtime/tasks/        抓取运行时文件
```

## 数据流

1. 在管理端新增抓取站点
2. 发起抓取
3. 如命中验证码或登录，进入人工验证
4. 抓取完成后生成商品初稿
5. 在管理端校对商品结构
6. 发布为公开数据
7. 用户端读取 `data/public/` 产物进行展示

## 公开数据文件

发布后会生成：

- `data/public/published-data.json`
- `data/public/published-meta.json`
- `data/public/published-shops.json`
- `data/public/published-products.json`
- `data/public/published-diffs.json`
- `data/public/shops/<shopId>.json`

说明：

- `published-data.json` 是完整公开态
- `published-shops.json` 是店铺摘要列表
- `published-products.json` 是商品轻量索引
- `shops/<shopId>.json` 是单店详情

## 商品生命周期

- 同店商品按 `productKey` 唯一识别
- 价格变化时更新商品，不重复新建
- 保留最近 10 次历史观测
- 连续 1 到 2 次抓取不到时，商品仍保留但会进入离线/缺席状态
- 连续第 3 次抓取不到时，自动从公开列表移除并转入归档
- 后续再次抓到时，可恢复到公开列表

## 本地运行

安装依赖：

```bash
npm install
```

启动管理端：

```bash
npm run dev:admin
```

启动用户端：

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

管理端参考 `apps/admin/.env.example`，常见变量包括：

- `ADMIN_ALLOWED_EMAILS`
- `ADMIN_SESSION_SECRET`
- `AI_ENABLED`
- `AI_PROVIDER`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_TEMPERATURE`
- `AI_THINKING_ENABLED`
- `AI_REASONING_EFFORT`
- `AI_PRICE_CURRENCY`
- `AI_INPUT_PRICE_PER_MILLION`
- `AI_OUTPUT_PRICE_PER_MILLION`
- `AI_CACHE_HIT_INPUT_PRICE_PER_MILLION`
- `AI_SYSTEM_PROMPT`

## 部署建议

推荐：

- 抓取后台运行在本地服务器、云主机或长期在线环境
- 用户端部署到 Vercel
- 每次发布后同步 `data/public/` 产物

不推荐：

- 直接在 Vercel Serverless / Edge 环境里执行抓取并写本地 JSON

原因：

- 文件系统不是稳定持久化存储
- 多实例下本地文件无法天然一致
- 不适合当前这套“抓取 -> 校对 -> 发布静态产物”的工作流

## 用户端说明

当前用户端包含两个主界面：

- 首页商品列表
- 店铺列表页

这两个页面都支持：

- 筛选与搜索
- “继续加载更多”按钮
- 滚动到底部自动加载下一页
- 页面底部 GitHub 链接

项目地址：

- https://github.com/flycodeu/websiteclaw
