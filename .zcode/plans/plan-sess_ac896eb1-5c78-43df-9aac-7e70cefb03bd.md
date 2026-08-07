## 实现方案：手机端「热门目的地」Tab+两列网格详情页

### 一、后端（Python / FastAPI）
1. `backend/app/services/amap_client.py`：`POI_TYPES` 增加 `"culture": "140100,140200,140400,140500,140600"`（博物馆/展览馆/美术馆/图书馆/文化馆）。
2. `backend/app/services/destination_service.py`：
   - 新增 `CULTURE_HINTS` 本地兜底（覆盖北京/成都/杭州/大理/西安/厦门/上海/三亚 + 通用兜底），以及 `_local_culture(city)`。
   - `_fallback_from_amap` 并行增加人文 POI 检索（`search_poi_around(POI_TYPES["culture"])`），与 spots 去重；无高德 Key 或超时回退 `CULTURE_HINTS`；返回结构增加 `humanities` 字段（与 spots 同构：name/desc/lng/lat/address）。沿用现有 1h 内存缓存，自动生效。
3. `backend/app/api/destination.py`：`/place-images` 的 `kind` 参数 pattern 从 `^(|foods|spots)$` 扩展为 `^(|foods|spots|humanities)$`。
4. `backend/app/services/xhs_image_client.py`：`_search_keyword` 增加 `kind == "humanities"` 分支（如 `{city} {name} 人文`）。
5. 同步更新 `backend/tests/test_destination_service.py`：`_fallback_from_amap` 现在有 3 次 POI 检索，补上 culture 的 mock 返回并断言 `humanities` 字段。

### 二、共享包（packages/shared，TS 源码直连无需构建）
1. `types.ts`：`CityInfo` 增加 `humanities: CitySpot[]`。
2. `api.ts`：`placeImages` 的 `kind` 参数类型扩展为 `"" | "foods" | "spots" | "humanities"`。

### 三、移动端（React Native / Expo）
1. 类型扩展（低风险，向后兼容）：
   - `mobile/src/utils/placeImage.ts`：`PlaceCategory` 增加 `"humanities"`。
   - `mobile/src/screens/CityDetail/helpers.ts`：`ExploreCategory` 增加 `"humanities"`。
   - `mobile/src/screens/CityDetail/PoiDetailSheet.tsx`：`CAT_LABEL` 增加 `humanities: "人文"`（复用弹层所必需）。
2. 新增页面 `mobile/src/screens/CityGuide/CityGuideScreen.tsx`（+ styles）：
   - 顶部自定义导航栏：返回按钮 + 城市名标题。
   - 三个平级 Tab【景点｜美食｜人文】，默认激活「景点」，同页切换不新开页。
   - 两列网格（FlatList numColumns=2）：圆角矩形卡片，上半 `PlaceImage`（图片等比例 cover 填充）+ 下半名称（单行省略），统一内外边距，行数随数据动态生成。
   - 按 Tab 懒加载状态机（idle/loading/ready/error）：景点进页即请求；美食/人文首次切到才请求 `api.destinations.info(city)`，用本地磁盘缓存 `getCachedCityInfo` 快读，请求完成写回缓存；已加载 Tab 切回不再请求。
   - 骨架屏（复用 CityInfoLoadingView 的 reanimated 微光模式，做成两列卡片骨架）、空数据占位、失败重试。
   - 点卡片 → 复用 `PoiDetailSheet` 弹层（category = 当前 Tab key，含人文）。
3. 导航注册：
   - `mobile/src/navigation/types.ts`：新增 `CityGuide: { city: string }`。
   - `mobile/App.tsx`：lazy import + 注册 `CityGuide` 路由（`headerShown: false`，`slide_from_right`）。
4. `mobile/src/screens/Home/HomeScreen.tsx`：热门目的地卡片 onPress 由 `goGenerate` 改为跳 `CityGuide`（保留双击防抖与 Explore 页现状不动）。

### 四、验证
- 后端：`cd backend && python -m pytest tests/test_destination_service.py tests/test_xhs_image_client.py -q`（并跑全量测试确认无回归）。
- 移动端：`cd mobile && npx tsc --noEmit` 校验类型。

### 不做的事
- 不动旧 CityDetailScreen（地图+底部抽屉）与 Explore 页入口。
- 不做分页/无限滚动（接口单次返回即可，行数动态）。
- 首页「AI 生成」入口与「热门目的地」区块标题链接保持不变。