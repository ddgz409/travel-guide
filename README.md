# 旅行攻略生成器 🧭

AI 自动生成旅行攻略的 Web 应用。用户输入目的地、日期、人数与偏好，系统聚合高德地图真实景点数据，结合智谱 GLM 生成按天行程、地图路线与预算估算。支持注册登录、保存/编辑/导出 PDF/分享。

## ✨ 功能

- **按天行程生成** — AI 根据日期与偏好，规划每天上午/下午/晚上安排，路线合理不绕路
- **地图路线展示** — 景点位置在地图上标注，连线显示每日路线与交通方式
- **预算估算** — 自动估算交通/住宿/门票/餐饮费用，按天与分类汇总
- **保存 / 编辑 / 导出** — 攻略存云端，跨设备同步，可编辑、导出 PDF、生成分享链接

## 🏗️ 架构

```
┌──────────────┐   REST API   ┌──────────────┐   高德API / 智谱GLM
│  前端 Next.js │ ──────────▶ │ 后端 FastAPI │ ─────────────────▶
│  React 18     │              │  Python 3.11 │
└──────────────┘              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │  SQLite (MVP) │
                              └──────────────┘
```

**生成引擎流程**（后端编排式）：
1. 高德地理编码 → 目的地坐标
2. 高德 POI 检索 → 景点/餐饮/住宿候选池
3. 构造 Prompt → 智谱 GLM 生成 JSON 行程
4. 解析校验（防编造：景点名必须在候选池或高德可搜到）
5. 高德路线规划回填交通信息
6. 计算预算 + 持久化

## 📂 目录结构

```
app/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/          # 路由 (auth, trips)
│   │   ├── core/         # 配置、数据库、安全、依赖
│   │   ├── models/       # SQLAlchemy 模型 (4 表)
│   │   ├── schemas/      # Pydantic 模型
│   │   ├── services/     # 生成引擎、高德/智谱客户端、PDF 导出
│   │   └── main.py       # 应用入口
│   ├── requirements.txt
│   └── .env.example
├── frontend/             # Next.js 前端
│   ├── app/              # 页面路由
│   ├── components/       # 组件 (导航栏、地图)
│   ├── lib/              # API 客户端、类型、Provider
│   ├── stores/           # Zustand 状态
│   └── .env.example
└── README.md
```

## 🚀 快速开始

### 前置要求

- Python 3.11+（已验证 3.14）
- Node.js 18+（已验证 24）
- 高德开放平台 API Key — [申请地址](https://lbs.amap.com/)
- 智谱开放平台 API Key — [申请地址](https://open.bigmodel.cn/)

### 1. 后端

```bash
cd backend

# 创建虚拟环境并安装依赖
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 AMAP_API_KEY 和 ZHIPU_API_KEY

# 启动（自动建表）
uvicorn app.main:app --reload --port 8000
```

后端启动后访问 http://127.0.0.1:8000/docs 查看 API 文档。

### 2. 前端

```bash
cd frontend
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 NEXT_PUBLIC_AMAP_JS_KEY（高德 JS API key，用于地图）

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

> 注：Windows 上若 `npm run dev`（Turbopack）报错，项目已默认用 `--webpack` 模式。如需 Turbopack 可用 `npm run dev:turbo`。

### 3. 使用

1. 注册账号
2. 点击"生成攻略"，填写目的地/日期/人数/偏好
3. 等待 AI 生成（页面自动轮询状态）
4. 查看按天行程、地图路线、预算
5. 可导出 PDF、生成分享链接、重新生成某天

## 🔧 配置说明

### 后端 `.env`

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 数据库连接串，默认 SQLite |
| `JWT_SECRET_KEY` | JWT 签名密钥，生产环境务必修改 |
| `AMAP_API_KEY` | 高德 Web 服务 API Key |
| `ZHIPU_API_KEY` | 智谱 GLM API Key |
| `ZHIPU_MODEL` | GLM 模型名，默认 glm-4 |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔 |

### 前端 `.env.local`

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_BASE` | 后端 API 地址 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 高德 JS API Key（地图展示用） |

## 🛠️ 技术栈

- **后端**：FastAPI · SQLAlchemy · SQLite · JWT · reportlab
- **前端**：Next.js 14 · React 18 · TypeScript · Tailwind CSS v4 · Zustand · TanStack Query · 高德地图 JS SDK
- **AI/数据**：智谱 GLM-4 · 高德地图 API

## 📝 设计决策

- **SQLite 而非 PostgreSQL**：MVP 零安装，未来切 PG 只需改 `DATABASE_URL`
- **bcrypt 直接调用而非 passlib**：避免 passlib 与新版 bcrypt 兼容问题
- **reportlab 而非 weasyprint**：纯 Python 无系统依赖，Windows 友好
- **FastAPI BackgroundTasks 而非 Celery**：MVP 流量小，异步任务够用
- **防编造校验**：LLM 输出的景点名必须在候选池或高德可搜到，避免幻觉

## ⚠️ 已知限制

- 小红书/携程参考依赖公开页爬取，反爬或改版时可能为空（生成仍继续）
- 携程酒店每次生成现爬并软排序（新店/华住/地铁/好评）；失败则降级高德并提示「酒店数据未更新」
- 地图展示需前端配置高德 JS API Key
- 未配置真实 API Key 时，生成会返回 failed（预期行为）
- 无实时协作、社交、多语言功能（MVP 范围外）
