"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { tripsApi } from "@/lib/api";
import { getAmapJsKey, loadAmap } from "@/lib/amap";
import type { Item, Location } from "@/lib/types";

type RouteMode = "transit" | "walking" | "driving";

interface RouteSegment {
  from_item_id: string;
  to_item_id: string;
  from_name: string;
  to_name: string;
  mode: string;
  distance_m: number;
  duration_s: number;
  polyline: number[][];
  fallback?: boolean;
}

interface TripMapProps {
  items: Item[];
  tripId?: string;
  dayId?: string;
  height?: string;
}

const MODE_TABS: { id: RouteMode; label: string }[] = [
  { id: "transit", label: "公交地铁" },
  { id: "walking", label: "步行" },
  { id: "driving", label: "自驾" },
];

const MODE_COLOR: Record<RouteMode, string> = {
  transit: "#1a66ff",
  walking: "#10b981",
  driving: "#f59e0b",
};

function fmtMin(s: number): string {
  const m = Math.max(0, Math.round(s / 60));
  if (m < 60) return `${m}分钟`;
  return `${Math.floor(m / 60)}小时${m % 60}分`;
}

function fmtKm(m: number): string {
  if (m < 1000) return `${m}米`;
  return `${(m / 1000).toFixed(1)}公里`;
}

function pinHtml(n: number) {
  return `<div style="background:#ff6d00;color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,109,0,.45);"><span style="transform:rotate(45deg);font-size:12px;font-weight:700;">${n}</span></div>`;
}

export function TripMap({ items, tripId, dayId, height = "400px" }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const key = getAmapJsKey();

  const [mode, setMode] = useState<RouteMode>("transit");
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [totals, setTotals] = useState({
    duration_s: 0,
    distance_m: 0,
    stops: 0,
    segments: 0,
  });

  const canPlan = Boolean(tripId && dayId);
  const itemKey = useMemo(() => items.map((i) => i.id).join(","), [items]);

  // 拉取真实规划折线（失败不阻断地图标注）
  useEffect(() => {
    if (!canPlan || !tripId || !dayId) {
      setSegments([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tripsApi
      .getDayRoutes(tripId, dayId, mode)
      .then((res) => {
        if (cancelled) return;
        setSegments(res.segments || []);
        setTotals({
          duration_s: res.total_duration_s || 0,
          distance_m: res.total_distance_m || 0,
          stops: res.stop_count || items.length,
          segments: res.segment_count || (res.segments || []).length,
        });
        if (!(res.segments || []).length) {
          setError("暂无可用路线（点位过近或该方式不可达）");
        } else {
          setError(null);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setSegments([]);
        setTotals({ duration_s: 0, distance_m: 0, stops: 0, segments: 0 });
        const msg = e instanceof Error ? e.message : "路线规划失败";
        setError(
          msg.includes("Not Found") || msg.includes("404")
            ? "路线接口未就绪，请刷新页面重试"
            : msg,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canPlan, tripId, dayId, mode, itemKey, items.length]);

  // 渲染地图：始终画景点标注；有折线再画路线
  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;

        const located = items.filter(
          (it) => it.location && Number(it.location.lng) && Number(it.location.lat),
        );

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(containerRef.current, {
            zoom: 12,
            viewMode: "2D",
            center:
              located.length > 0
                ? [located[0].location!.lng, located[0].location!.lat]
                : [116.397428, 39.90923],
          });
        }
        const map = mapRef.current;
        map.clearMap();
        setMapError(null);

        if (located.length === 0) {
          setMapError("当日没有带坐标的景点");
          return;
        }

        located.forEach((it, idx) => {
          const loc = it.location as Location;
          const pos: [number, number] = [Number(loc.lng), Number(loc.lat)];
          const marker = new AMap.Marker({
            position: pos,
            content: pinHtml(idx + 1),
            offset: new AMap.Pixel(-15, -30),
            zIndex: 120,
          });
          marker.setLabel({
            offset: new AMap.Pixel(0, -36),
            content: `<span style="background:rgba(255,255,255,.96);padding:3px 8px;border-radius:999px;font-size:12px;font-weight:600;color:#1a1a1a;border:1px solid #ebe6df;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.08);">${it.name.length > 10 ? it.name.slice(0, 10) + "…" : it.name}</span>`,
            direction: "top",
          });
          map.add(marker);
        });

        const stroke = MODE_COLOR[mode];
        // 逐段绘制全天路线；降级段用对应方式颜色，保证全程连贯
        for (const seg of segments) {
          const path: [number, number][] = [];
          for (const p of seg.polyline || []) {
            if (Array.isArray(p) && p.length >= 2) {
              path.push([Number(p[0]), Number(p[1])]);
            }
          }
          if (path.length < 2) continue;
          const segMode = (seg.mode as RouteMode) in MODE_COLOR ? (seg.mode as RouteMode) : mode;
          const color =
            seg.mode === "direct" ? "#9ca3af" : MODE_COLOR[segMode] || stroke;
          map.add(
            new AMap.Polyline({
              path,
              strokeColor: color,
              strokeWeight: seg.fallback || seg.mode === "direct" ? 4 : 5,
              strokeOpacity: seg.mode === "direct" ? 0.45 : 0.92,
              strokeStyle: seg.mode === "direct" ? "dashed" : "solid",
              lineJoin: "round",
              lineCap: "round",
              showDir: seg.mode !== "direct",
              zIndex: 50,
            }),
          );
        }

        map.setFitView(undefined, false, [56, 56, 56, 56], 16);
      })
      .catch((e) => {
        if (!cancelled) {
          setMapError(e instanceof Error ? e.message : "高德地图加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, segments, mode, key]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
    };
  }, []);

  if (!key) {
    return (
      <div
        className="rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        <div className="text-center px-4">
          <div className="text-3xl mb-2">🗺️</div>
          <div>地图未配置（设置 NEXT_PUBLIC_AMAP_JS_KEY 后显示）</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {canPlan && (
        <div className="absolute left-3 right-3 top-3 z-[5] flex flex-col gap-2 pointer-events-none">
          <div className="flex gap-1 rounded-full bg-white/95 p-1 shadow-md border border-[var(--line)] pointer-events-auto w-fit max-w-full">
            {MODE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={loading}
                onClick={() => setMode(t.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  mode === t.id
                    ? "text-white"
                    : "text-[var(--ink)] hover:bg-[var(--background)]"
                }`}
                style={mode === t.id ? { background: MODE_COLOR[t.id] } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
          {(loading || totals.segments > 0 || error) && (
            <div
              className={`pointer-events-none self-start rounded-full px-3 py-1 text-[11px] font-medium shadow border ${
                error
                  ? "bg-red-50 text-red-600 border-red-100"
                  : "bg-white/95 text-[var(--ink)] border-[var(--line)]"
              }`}
            >
              {loading
                ? `正在规划全天 ${items.length} 站路线…`
                : error
                  ? error
                  : `${totals.stops} 站 · ${totals.segments} 段 · 约 ${fmtMin(totals.duration_s)} · ${fmtKm(totals.distance_m)}`}
            </div>
          )}
        </div>
      )}
      {mapError && (
        <div className="absolute inset-x-3 bottom-3 z-[5] rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          {mapError}
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full bg-[#e8eef5]"
        style={{ height }}
      />
    </div>
  );
}
