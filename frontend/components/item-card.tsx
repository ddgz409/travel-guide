"use client";

import { useRef, useState, useCallback } from "react";

import { tripsApi } from "@/lib/api";
import { coverForItem } from "@/lib/cover";
import { RouteBoard } from "@/components/route-board";
import type { Alternative, Item, PoiSearchResult, TransportToNext } from "@/lib/types";

const SLOT_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};
const TYPE_LABEL: Record<string, string> = {
  attraction: "景点",
  meal: "餐饮",
  hotel: "住宿",
  transport: "交通",
};

function formatDuration(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

const ROUTE_STUB: TransportToNext = {
  mode: "transit",
  distance_m: 0,
  duration_s: 0,
  detail: null,
};

interface ItemCardProps {
  item: Item;
  index: number;
  tripId: string;
  city?: string;
  /** 当天后续还有可规划站点时显示路线入口 */
  hasNextRoute?: boolean;
  onToggle: (selected: boolean) => void;
  onSwap: (altIndex: number) => void;
  onReplace: (poi: PoiSearchResult) => void;
  onTransportChange?: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}

export function ItemCard({
  item,
  index,
  tripId,
  city = "",
  hasNextRoute = false,
  onToggle,
  onSwap,
  onReplace,
  onTransportChange,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
  dragOver,
}: ItemCardProps) {
  const [showAlts, setShowAlts] = useState(false);
  const slot = item.time_slot;
  const cover = coverForItem(item.name, item.type, city);
  const [localTransport, setLocalTransport] = useState<TransportToNext | null>(null);
  const showRoute =
    item.selected &&
    hasNextRoute &&
    item.location?.lng != null &&
    item.location?.lat != null;
  const transport =
    localTransport || item.transport_to_next || (showRoute ? ROUTE_STUB : null);

  const [altSearch, setAltSearch] = useState("");
  const [altResults, setAltResults] = useState<PoiSearchResult[]>([]);
  const [altSearching, setAltSearching] = useState(false);
  const altSearchRef = useRef<HTMLDivElement>(null);

  const doAltSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setAltResults([]);
        return;
      }
      setAltSearching(true);
      try {
        const results = await tripsApi.searchPois(q.trim(), city, 6);
        setAltResults(results);
      } catch {
        setAltResults([]);
      } finally {
        setAltSearching(false);
      }
    },
    [city],
  );

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
      <article
        draggable
        onDragStart={onDragStart}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDrop={onDrop}
        className={`deal-card group mb-4 overflow-hidden transition-all duration-300 ${
          dragging ? "opacity-40 scale-[0.98]" : ""
        } ${dragOver ? "ring-2 ring-[var(--brand)]" : ""} ${
          !item.selected ? "opacity-50" : ""
        }`}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="relative sm:w-[200px] h-[140px] sm:h-auto flex-shrink-0 overflow-hidden bg-[var(--brand-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-[13px] font-bold text-white shadow">
              {index + 1}
            </span>
            <span className="absolute bottom-2.5 left-2.5 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
              {SLOT_LABEL[slot] || slot} · {TYPE_LABEL[item.type] || item.type}
            </span>
          </div>

          <div className="flex flex-1 flex-col p-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-[17px] font-semibold text-[var(--ink)] leading-snug truncate">
                  {item.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
                  {item.duration_min ? (
                    <span>约 {formatDuration(item.duration_min)}</span>
                  ) : null}
                  {item.rating ? (
                    <span className="font-semibold text-[var(--brand)]">
                      ★ {item.rating}
                    </span>
                  ) : null}
                  {!item.selected ? (
                    <span className="text-red-500 font-semibold">已取消</span>
                  ) : null}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className={`text-[18px] font-bold ${
                    item.cost ? "text-[var(--brand)]" : "text-[var(--muted)]"
                  } ${!item.selected ? "line-through" : ""}`}
                >
                  {item.cost ? `¥${item.cost}` : "免费"}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">参考人均</div>
              </div>
            </div>

            {item.description ? (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)] line-clamp-2">
                {item.description}
              </p>
            ) : null}

            <div className="mt-auto pt-3 flex items-center gap-2">
              {item.selected ? (
                <>
                  <button
                    onClick={() => {
                      setShowAlts((s) => !s);
                      setAltSearch("");
                      setAltResults([]);
                    }}
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  >
                    换一个
                  </button>
                  <button
                    onClick={() => onToggle(false)}
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] hover:border-red-300 hover:text-red-500"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onToggle(true)}
                  className="rounded-full btn-brand px-3.5 py-1.5 text-[12px]"
                >
                  恢复安排
                </button>
              )}
              <span className="ml-auto text-[11px] text-[var(--muted)] cursor-grab">
                拖拽排序
              </span>
            </div>
          </div>
        </div>
      </article>

      {showAlts && (
        <div
          ref={altSearchRef}
          className="mb-4 rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-soft)] p-3"
        >
          <div className="text-xs font-bold text-[var(--brand-hot)] mb-2">
            选择备选替换
          </div>
          <input
            type="text"
            value={altSearch}
            onChange={(e) => handleAltSearchInput(e.target.value)}
            placeholder={city ? `在${city}搜索景点替换…` : "搜索景点替换…"}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[var(--brand)]"
          />
          {!altSearch && item.alternatives && item.alternatives.length > 0 && (
            <div className="space-y-1.5">
              {item.alternatives.map((alt: Alternative, i: number) => (
                <button
                  key={i}
                  onClick={() => {
                    onSwap(i);
                    setShowAlts(false);
                  }}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-white/80 transition-colors flex justify-between items-center border border-[var(--line)]"
                >
                  <span className="font-medium text-[var(--ink)]">{alt.name}</span>
                  {alt.rating ? (
                    <span className="text-xs text-[var(--brand)] font-bold">
                      ★ {alt.rating}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {altSearching && (
            <div className="text-xs text-[var(--muted)] py-2">搜索中…</div>
          )}
          {!altSearching && altResults.length > 0 && (
            <div className="space-y-1.5">
              {altResults.map((poi: PoiSearchResult) => (
                <button
                  key={poi.poi_id}
                  onClick={() => handleSearchReplace(poi)}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-emerald-50 transition-colors flex justify-between items-center border border-[var(--line)]"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--ink)]">{poi.name}</span>
                    <span className="text-xs text-[var(--muted)] ml-2 truncate">
                      {poi.address}
                    </span>
                  </div>
                  <span className="text-xs text-emerald-600 font-bold ml-2 flex-shrink-0">
                    替换
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showRoute && transport && (
        <RouteBoard
          tripId={tripId}
          itemId={item.id}
          fromName={item.name}
          transport={transport}
          onUpdated={(t) => {
            setLocalTransport(t);
            onTransportChange?.();
          }}
        />
      )}
    </>
  );
}
