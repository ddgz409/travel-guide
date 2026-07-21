# 旅迹 App（Expo）

与 Web 共用 FastAPI；功能对齐：首页、生成（预算/交通/必去景点）、行程详情（编辑/分享/PDF/地图/预算/酒店）、我的攻略、LLM 设置、游客模式。

## 开发

```bash
# 后端
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# App
cd mobile
npm install
npm run android   # 或 npm start / npm run web
```

真机在 `.env` 设置：`EXPO_PUBLIC_API_BASE=http://<电脑局域网IP>:8000/api/v1`

## 与 Web 差异

| 能力 | App |
|------|-----|
| 地图 | 原生 MapView；Expo Web 预览显示点位列表 |
| 拖拽排序 | 暂未做（可用换一站 / 取消安排） |
| 分享链接 | 复制 + 系统分享；可打开站内 Share 页 |
