# 小红书 / 携程参考爬取接入设计

**日期：** 2026-07-20  
**状态：** 待实现  
**范围：** 生成引擎补充站内搜索爬取；结果落库并在详情/分享页展示

## 背景

旅行攻略生成器已有高德 POI、智谱 GLM，以及通用 Bing 网页搜索（`web_search.py`）。用户希望再接入小红书与携程的公开内容，用于：

1. 生成时作为 LLM 口碑/热门参考
2. 攻略详情页与分享页展示「小红书参考」「携程参考」区块

两平台无可用的公开第三方开放 API，采用**直接爬取公开搜索页**；失败时允许 Bing `site:` 降级。

## 目标与非目标

### 目标

- 生成流程并行爬取小红书、携程搜索结果，结构化为统一 `ExternalTip`
- 结果写入 `Trip.external_refs`，同时拼进 LLM Prompt
- 详情页 / 分享页展示两区块；列表不返回该字段
- 单平台失败：最多重试 2 次后软降级，不阻断主生成流程

### 非目标

- 独立「刷新爬取」API
- 登录态、Cookie、绕过验证码
- 逆向 App 内部签名接口
- Celery / 独立爬虫队列
- 抓取笔记/酒店详情页全文

## 架构与数据流

```
生成任务启动
    │
    ├─ 高德：地理编码 + POI（现有）
    ├─ 通用网页搜索 web_search（现有，保留）
    ├─ 小红书 client ──┐
    │                  │ 并行，各最多重试 2 次
    └─ 携程 client ────┘
            │
            ▼
    ExternalTip[]（按 source 分组）
            │
    ┌───────┴───────┐
    ▼               ▼
Trip.external_refs  LLM Prompt 参考段
            │
            ▼
详情 / 分享 API → 前端两区块
```

**边界：**

- `xiaohongshu_client` / `ctrip_client`：搜 + 解析 + 重试，不访问 DB
- `generator`：并行调用、落库、拼 Prompt
- 某平台全失败 → 该源为空数组，生成继续

## 数据模型

### ExternalTip

```text
source: "xiaohongshu" | "ctrip"
title: string
snippet: string          # ≤300 字
url: string
meta?: {
  rating?: string
  price?: string
  likes?: string
}
```

### Trip.external_refs

新增 JSON 列（不写入 `preferences`）：

```json
{
  "xiaohongshu": [/* ExternalTip，最多 6 */],
  "ctrip": [/* ExternalTip，最多 6 */]
}
```

**Schema 迁移：** 现有 SQLite 使用 `create_all`，不会自动加列。实现时在启动路径增加轻量兼容（检测列缺失则 `ALTER TABLE trips ADD COLUMN external_refs JSON`），或文档说明本地需重建 DB。默认值：`{"xiaohongshu": [], "ctrip": []}`。

### API

- `TripOut` 增加 `external_refs`
- `GET /trips/{id}`、`GET /trips/share/{token}` 返回该字段
- `TripListItem` **不**包含 `external_refs`
- 不新增独立爬取端点；仅在**完整生成**流程中触发（`generate` / `guest-generate`）。按天重生（`regenerate-day`）不重新爬取，沿用已有 `external_refs`

## 爬虫客户端

### 文件

- `backend/app/services/xiaohongshu_client.py`
- `backend/app/services/ctrip_client.py`
- 可选：`backend/app/services/scrape_utils.py`（UA、重试、剥标签、Bing site 降级）

### 共用策略

- `httpx`，超时约 8s
- 浏览器 UA + `Accept-Language: zh-CN`
- 每平台最多 **2 次重试**（间隔 0.5–1s），仍失败返回 `[]` 并打 warning
- 每平台最多 **6 条**
- 以搜索结果摘要为主，不抓详情页全文
- 只读公开页；按次生成触发；不模拟登录

### 小红书

- 直连：`https://www.xiaohongshu.com/search_result?keyword={目的地}+旅游攻略`
- 解析 HTML 或内嵌 JSON（若存在类似初始状态数据）提取 title / desc / 笔记链接
- 直连结果为空时：Bing `site:xiaohongshu.com {目的地} 旅游攻略`，映射为相同 `ExternalTip`（`source` 仍为 `xiaohongshu`）
- `meta.likes` 有则填

### 携程

- 直连优先：`https://you.ctrip.com/searchsite/{目的地}`（攻略站公开搜索）；若结构不可用则立刻走降级
- 解析标题、短描述、链接；评分/参考价进入 `meta`
- 直连失败或 0 条：Bing `site:ctrip.com {目的地} 旅游攻略` 降级

### Generator 接入

1. POI 候选池之后、调 LLM 之前，线程池并行调用两 client
2. 写入 `trip.external_refs` 并 commit
3. Prompt 增加参考段：每源最多前 4 条「标题 + 摘要」
4. 系统/用户提示补充：可参考口碑与热门说法，**地点名称仍必须来自候选 POI**

## 错误处理

| 情况 | 行为 |
|------|------|
| 单平台超时 / HTTP 非 200 | 重试 ≤2，仍失败 → 该源 `[]` |
| 解析 0 条 | Bing `site:` 降级；仍空 → `[]` |
| 两平台都空 | 生成继续（高德 + web_search + GLM） |
| LLM 失败 | 现有降级不变；已写入的 `external_refs` 保留供详情展示 |

## 前端

- 页面：`frontend/app/trips/[id]/page.tsx`，分享页同等展示
- `ready` 时展示「小红书参考」「携程参考」
- 每条：标题、摘要（截断）、外链（新标签）；有 `meta` 则展示评分/价格/热度
- 空数组：文案「暂无参考」
- `types.ts` / `TripOut` 对齐；样式跟随现有详情页，不另起设计体系

## 验收标准

1. 生成结束后 `Trip.external_refs` 始终含 `xiaohongshu` / `ctrip` 两个 key（可为 `[]`）
2. 详情与分享 API 返回该字段；列表不返回
3. 有数据时 Prompt 含对应参考段
4. 爬虫失败不单独导致进程崩溃；生成仍能结束为 `ready` 或既有 `failed` 路径
5. 详情页空数据显示「暂无参考」；有数据时可打开外链

## 风险与说明

- 小红书反爬强、页面多为前端渲染，直连空结果属预期，依赖 Bing 降级
- 页面改版会导致解析失效，需可维护的正则/选择逻辑并打日志
- README 注明：依赖第三方公开页，结果可能为空
- 合规：仅公开搜索摘要、低频、不绕过防护；使用者需自行评估目标站点服务条款

## 实现顺序建议

1. `ExternalTip` schema + `Trip.external_refs` + 启动时列兼容
2. `scrape_utils` + 两 client（含 Bing 降级）
3. `generator` 并行接入 + Prompt
4. API / 前端类型与详情、分享 UI
5. 手工验收：正常目的地、断网/失败软降级
