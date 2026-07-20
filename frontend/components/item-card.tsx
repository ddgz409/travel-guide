"use client";

import { useRef, useState, useCallback } from "react";

import { tripsApi } from "@/lib/api";
import type { Alternative, Item, PoiSearchResult, RouteStep } from "@/lib/types";

const SLOT_LABEL: Record<string, string> = {
  morning: "上午", afternoon: "下午", evening: "晚上",
};
const SLOT_ICON: Record<string, string> = { morning: "☀️", afternoon: "🌤️", evening: "🌙" };
const SLOT_BADGE: Record<string, string> = {
  morning: "bg-amber-100 text-amber-700",
  afternoon: "bg-blue-100 text-blue-700",
  evening: "bg-violet-100 text-violet-700",
};
const SLOT_NUM: Record<string, string> = {
  morning: "bg-amber-100 text-amber-800",
  afternoon: "bg-blue-100 text-blue-800",
  evening: "bg-violet-100 text-violet-800",
};
const TYPE_LABEL: Record<string, string> = {
  attraction: "景点", meal: "餐饮", hotel: "住宿", transport: "交通",
};
const TYPE_ICON: Record<string, string> = {
  attraction: "🏞️", meal: "🍽️", hotel: "🏨", transport: "🚗",
};

function formatDuration(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

function formatTransport(t: Item["transport_to_next"]): { summary: string; hasDetail: boolean } | null {
  if (!t) return null;
  const km = (t.distance_m / 1000).toFixed(1);
  const min = Math.round(t.duration_s / 60);
  const modeLabel: Record<string, string> = {
    walking: "🚶 步行", driving: "🚗 驾车", transit: "🚇 地铁/公交",
  };
  // 有换乘详情时，提取线路名
  if (t.detail && t.detail.length > 0) {
    const busLines = t.detail.filter((s) => s.type === "bus" && s.line_name);
    if (busLines.length > 0) {
      // 提取线路简称（如"地铁1号线八通线(环球度假区--苹果园)" -> "地铁1号线"）
      const names = busLines.map((b) => {
        const name = b.line_name || "";
        // 取括号前的部分，或前8个字
        const short = name.split("(")[0].split("（")[0];
        return short.length > 8 ? short.slice(0, 8) : short;
      });
      const timeStr = t.arrival_time ? `${t.departure_time || ""}-${t.arrival_time} · ` : "";
      return { summary: `${timeStr}${names.join("→")} · ${min}分钟`, hasDetail: true };
    }
  }
  const timeStr = t.arrival_time ? `${t.departure_time || ""}-${t.arrival_time} · ` : "";
  return { summary: `${timeStr}${modeLabel[t.mode] || t.mode} ${km}km · ${min}分钟`, hasDetail: false };
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

interface ItemCardProps {
  item: Item;
  index: number;
  tripId: string;
  onToggle: (selected: boolean) => void;
  onSwap: (altIndex: number) => void;
  onReplace: (poi: PoiSearchResult) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}

export function ItemCard({
  item, index, tripId, onToggle, onSwap, onReplace,
  onDragStart, onDragOver, onDrop, dragging, dragOver,
}: ItemCardProps) {
  const [showAlts, setShowAlts] = useState(false);
  const slot = item.time_slot;
  const transport = formatTransport(item.transport_to_next);

  // ---- 路线详情展开 ----
  const [showRoute, setShowRoute] = useState(false);
  const [routeSteps, setRouteSteps] = useState<RouteStep[] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const handleShowRoute = async () => {
    if (showRoute) {
      setShowRoute(false);
      return;
    }
    // 已有 detail 直接展开
    if (item.transport_to_next?.detail && item.transport_to_next.detail.length > 0) {
      setRouteSteps(item.transport_to_next.detail);
      setShowRoute(true);
      return;
    }
    // 调接口获取
    setRouteLoading(true);
    try {
      const res = await tripsApi.getItemRoute(tripId, item.id);
      const detail = (res as { detail?: RouteStep[] }).detail;
      if (detail && detail.length > 0) {
        setRouteSteps(detail);
        setShowRoute(true);
      }
    } catch {
      // 忽略
    } finally {
      setRouteLoading(false);
    }
  };

  // ---- 搜索备选景点 ----
  const [altSearch, setAltSearch] = useState("");
  const [altResults, setAltResults] = useState<PoiSearchResult[]>([]);
  const [altSearching, setAltSearching] = useState(false);
  const altSearchRef = useRef<HTMLDivElement>(null);

  const doAltSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setAltResults([]); return; }
    setAltSearching(true);
    try {
      const results = await tripsApi.searchPois(q.trim(), "", 6);
      setAltResults(results);
    } catch { setAltResults([]); }
    finally { setAltSearching(false); }
  }, []);

  const handleAltSearchInput = (val: string) => {
    setAltSearch(val);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => doAltSearch(val), 350);
  };

  const handleSearchReplace = (poi: PoiSearchResult) => {
    onReplace(poi);
    setShowAlts(false);
    setAltSearch("");
    setAltResults([]);
  };

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
        onDrop={onDrop}
        className={`flex gap-3.5 mb-3.5 relative transition-opacity ${dragging ? "opacity-40" : ""}`}
      >
        {/* 序号圆点 */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-[15px] flex-shrink-0 z-10 ring-4 ring-gray-50 ${SLOT_NUM[slot]}`}
        >
          {index + 1}
        </div>

        <div className={`flex-1 bg-white border border-gray-200/80 rounded-lg p-4 shadow-sm ${!item.selected ? "opacity-45" : ""}`}>
          {/* 顶部标签 */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SLOT_BADGE[slot]}`}>
              {SLOT_ICON[slot]} {SLOT_LABEL[slot]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
            </span>
            {item.duration_min && (
              <span className="text-xs text-gray-500">⏱ {formatDuration(item.duration_min)}</span>
            )}
            {item.rating && (
              <span className="text-xs text-amber-500 font-bold ml-auto">★ {item.rating}</span>
            )}
            {!item.selected && (
              <span className="text-xs text-red-500 font-bold ml-auto">已取消</span>
            )}
          </div>

          <div className="font-bold text-[16px] mb-1">{item.name}</div>
          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-2">{item.description}</p>
          )}

          <div className="flex justify-between items-center">
            <span className={`text-sm font-bold ${item.cost ? "text-orange-600" : "text-gray-400"} ${!item.selected ? "line-through" : ""}`}>
              {item.cost ? `💰 ¥${item.cost}` : "💰 免费"}
            </span>
            <div className="flex gap-1.5">
              {item.selected ? (
                <>
                  <button
                    onClick={() => { setShowAlts((s) => !s); setAltSearch(""); setAltResults([]); }}
                    className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-#fffaf0 hover:border-#ffcc80 text-sm flex items-center justify-center transition-colors"
                    title="换一个"
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => onToggle(false)}
                    className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-300 text-sm flex items-center justify-center transition-colors"
                    title="取消勾选"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onToggle(true)}
                  className="px-3 h-8 rounded-lg bg-green-100 border border-green-300 text-green-700 text-xs font-semibold hover:bg-green-200 transition-colors"
                  title="恢复勾选"
                >
                  ✓ 恢复
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 备选+搜索弹窗 */}
      {showAlts && (
        <div ref={altSearchRef} className="ml-[52px] mb-3.5 bg-#fffaf0 border border-orange-200 rounded p-3">
          <div className="text-xs font-bold text-orange-800 mb-2">选择备选景点替换：</div>

          {/* 搜索输入框 */}
          <input
            type="text"
            value={altSearch}
            onChange={(e) => handleAltSearchInput(e.target.value)}
            placeholder="搜索任意景点替换..."
            className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm mb-2 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-#ff9d00"
          />

          {/* 预设备选列表 */}
          {!altSearch && item.alternatives && item.alternatives.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-gray-400 mb-1">系统推荐备选：</div>
              {item.alternatives.map((alt: Alternative, i: number) => (
                <button
                  key={i}
                  onClick={() => { onSwap(i); setShowAlts(false); }}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-orange-50 transition-colors flex justify-between items-center"
                >
                  <span className="font-medium">{alt.name}</span>
                  {alt.rating && <span className="text-xs text-amber-500 font-bold">★ {alt.rating}</span>}
                </button>
              ))}
            </div>
          )}

          {/* 搜索结果 */}
          {altSearching && <div className="text-xs text-gray-400 py-2">搜索中...</div>}
          {!altSearching && altResults.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-gray-400 mb-1">搜索结果：</div>
              {altResults.map((poi: PoiSearchResult) => (
                <button
                  key={poi.poi_id}
                  onClick={() => handleSearchReplace(poi)}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-green-100 transition-colors flex justify-between items-center"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{poi.name}</span>
                    <span className="text-xs text-gray-400 ml-2 truncate">{poi.address}</span>
                  </div>
                  <span className="text-xs text-green-600 font-bold ml-2 flex-shrink-0">+ 替换</span>
                </button>
              ))}
            </div>
          )}
          {!altSearching && altSearch && altResults.length === 0 && (
            <div className="text-xs text-gray-400 py-2">未找到，换个关键词试试</div>
          )}
        </div>
      )}

      {transport && item.selected && (
        <div className="pl-[52px] pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{transport.summary}</span>
            {transport.hasDetail && (
              <button
                onClick={handleShowRoute}
                className="text-xs text-[#ff9d00] hover:text-[#ff8a00] font-medium"
              >
                {routeLoading ? "加载中..." : showRoute ? "收起" : "查看路线"}
              </button>
            )}
          </div>
          {/* 路线详情展开 */}
          {showRoute && routeSteps && (
            <div className="mt-2 bg-[#fffaf0] border border-orange-100 rounded-lg p-3 space-y-2">
              {routeSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {step.type === "walk" ? (
                    <>
                      <span className="text-gray-400 mt-0.5">🚶</span>
                      <div>
                        <span className="text-gray-500">{step.instruction || `步行${step.distance_m || 0}米`}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="mt-0.5">{step.line_type?.includes("地铁") ? "🚇" : "🚌"}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-[#333]">{step.line_name}</div>
                        <div className="text-gray-500 mt-0.5">
                          {step.departure_stop} → {step.arrival_stop}
                          {step.via_stops != null && step.via_stops > 0 && `（${step.via_stops}站）`}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {item.transport_to_next?.arrival_time && (
                <div className="pt-2 border-t border-orange-100 text-xs text-[#ff9d00] font-semibold">
                  预计 {item.transport_to_next.departure_time || ""} 出发 → {item.transport_to_next.arrival_time} 到达
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
