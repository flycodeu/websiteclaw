# Shop Claw

基于 `dev_doc_shop_platform.docx` 搭建的商铺商品监控与分析平台 MVP 骨架。

## 当前已落地

- Next.js App Router 主仓结构
- 用户端页面：首页、商铺列表、比价、稳定度
- 管理端页面：仪表盘、数据源、任务中心、审核页
- 文档定义的数据模型与标准 API 返回结构
- 本地 mock 数据，方便先做前端和接口联调

## 推荐下一步

1. 安装依赖并启动前端。
2. 将 `lib/mock-data.ts` 替换为 GitHub JSON 仓库读取逻辑。
3. 新建独立 `backend/` 服务，承接 FastAPI + Playwright + AI 结构化任务。
4. 将管理端接口改为真实任务触发与审核发布流程。

## 运行

```bash
npm install
npm run dev
```

## 建议目录

```text
app/
  admin/
  api/
  compare/
  shops/
  stability/
components/
lib/
```
