# 实施规划

## 当前阶段

当前仓库先聚焦前端主仓 MVP，目标是在没有真实抓取后端的情况下先把用户端、管理端和 API 契约建立起来。

## 已完成

1. 需求文档拆解并抽取核心实体。
2. 搭建 Next.js App Router 项目骨架。
3. 建立用户端页面：首页、商铺列表、比价、稳定度。
4. 建立管理端页面：仪表盘、数据源、任务中心、审核页。
5. 补齐 mock Route Handlers，符合文档中的接口命名。

## 推荐下个迭代

1. 新建 `backend/` 独立服务：
   `app/main.py`
   `modules/crawler`
   `modules/parser`
   `modules/ai`
   `modules/diff`
   `modules/publisher`
2. 将 `lib/mock-data.ts` 替换为 GitHub 发布 JSON 的读取层。
3. 加入管理员权限控制。
4. 将审核页改为真实可编辑表单。
5. 增加快照历史图表和差异汇总页。
