"use client";

import { useRef, useState, useCallback } from "react";

import { tripsApi } from "@/lib/api";
import type { Alternative, Item, PoiSearchResult } from "@/lib/types";

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

function formatTransport(t: Item["transport_to_next"]): string | null {
  if (!t) return null;
  const km = (t.distance_m / 1000).toFixed(1);
  const min = Math.round(t.duration_s / 60);
  const modeLabel: Record<string, string> = {
    walking: "步行", driving: "驾车", transit: "公交",
  };
  return `${modeLabel[t.mode] || t.mode} ${km}km · ${min}分钟`;
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

interface ItemCardProps {
  item: Item;
  index: number;
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
  item, index, onToggle, onSwap, onReplace,
  onDragStart, onDragOver, onDrop, dragging, dragOver,
}: ItemCardProps) {
  const [showAlts, setShowAlts] = useState(false);
  const slot = item.time_slot;
  const transport = formatTransport(item.transport_to_next);

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

        <div className={`flex-1 bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm ${!item.selected ? "opacity-45" : ""}`}>
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
                    className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-sky-50 hover:border-sky-300 text-sm flex items-center justify-center transition-colors"
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
        <div ref={altSearchRef} className="ml-[52px] mb-3.5 bg-sky-50 border border-sky-200 rounded-xl p-3">
          <div className="text-xs font-bold text-sky-800 mb-2">选择备选景点替换：</div>

          {/* 搜索输入框 */}
          <input
            type="text"
            value={altSearch}
            onChange={(e) => handleAltSearchInput(e.target.value)}
            placeholder="搜索任意景点替换..."
            className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm mb-2 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />

          {/* 预设备选列表 */}
          {!altSearch && item.alternatives && item.alternatives.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-gray-400 mb-1">系统推荐备选：</div>
              {item.alternatives.map((alt: Alternative, i: number) => (
                <button
                  key={i}
                  onClick={() => { onSwap(i); setShowAlts(false); }}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-sky-100 transition-colors flex justify-between items-center"
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
        <div className="text-xs text-gray-400 pl-[52px] pb-1">🚶 {transport}</div>
      )}
    </>
  );
}
