"use client";

import { useState } from "react";

import type { Alternative, Item } from "@/lib/types";

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

interface ItemCardProps {
  item: Item;
  index: number;
  onToggle: (selected: boolean) => void;
  onSwap: (altIndex: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}

export function ItemCard({
  item, index, onToggle, onSwap,
  onDragStart, onDragOver, onDrop, dragging, dragOver,
}: ItemCardProps) {
  const [showAlts, setShowAlts] = useState(false);
  const slot = item.time_slot;
  const transport = formatTransport(item.transport_to_next);

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

          {/* 名称 + 描述 */}
          <div className="font-bold text-[16px] mb-1">{item.name}</div>
          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-2">{item.description}</p>
          )}

          {/* 底部：费用 + 操作按钮 */}
          <div className="flex justify-between items-center">
            <span className={`text-sm font-bold ${item.cost ? "text-orange-600" : "text-gray-400"} ${!item.selected ? "line-through" : ""}`}>
              {item.cost ? `💰 ¥${item.cost}` : "💰 免费"}
            </span>
            <div className="flex gap-1.5">
              {item.selected ? (
                <>
                  <button
                    onClick={() => setShowAlts((s) => !s)}
                    disabled={!item.alternatives || item.alternatives.length === 0}
                    className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-sky-50 hover:border-sky-300 text-sm flex items-center justify-center disabled:opacity-30 transition-colors"
                    title="换一个备选"
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

      {/* 备选列表浮层 */}
      {showAlts && item.alternatives && item.alternatives.length > 0 && (
        <div className="ml-[52px] mb-3.5 bg-sky-50 border border-sky-200 rounded-xl p-3">
          <div className="text-xs font-bold text-sky-800 mb-2">选择备选景点替换：</div>
          <div className="space-y-1.5">
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
        </div>
      )}

      {/* 交通信息 */}
      {transport && item.selected && (
        <div className="text-xs text-gray-400 pl-[52px] pb-1">🚶 {transport}</div>
      )}
    </>
  );
}
