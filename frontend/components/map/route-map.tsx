"use client";

import { useEffect, useRef } from "react";

import { getAmapJsKey, loadAmap } from "@/lib/amap";

export interface RouteMapPoint {
  lng: number;
  lat: number;
  name?: string;
}

interface RouteMapProps {
  from?: RouteMapPoint | null;
  to?: RouteMapPoint | null;
  polyline?: number[][] | null;
  mode?: string;
  height?: string;
  className?: string;
}

const MODE_COLOR: Record<string, string> = {
  walking: "#10b981",
  driving: "#f59e0b",
  transit: "#1a66ff",
};

function pinHtml(label: string, color: string) {
  return `<div style="background:${color};color:#fff;min-width:28px;height:28px;padding:0 6px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.25);border:2px solid #fff;">${label}</div>`;
}

export function RouteMap({
  from,
  to,
  polyline,
  mode = "transit",
  height = "200px",
  className = "",
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const key = getAmapJsKey();
  const stroke = MODE_COLOR[mode] || MODE_COLOR.transit;

  useEffect(() => {
    if (!key || !containerRef.current) return;
    if (!from && !to && !(polyline && polyline.length)) return;

    let cancelled = false;

    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(containerRef.current, {
            zoom: 13,
            viewMode: "2D",
            mapStyle: "amap://styles/whitesmoke",
          });
        }
        const map = mapRef.current;
        map.clearMap();

        const path: [number, number][] = [];
        if (polyline?.length) {
          for (const p of polyline) {
            if (Array.isArray(p) && p.length >= 2) {
              path.push([Number(p[0]), Number(p[1])]);
            }
          }
        }

        if (from?.lng && from?.lat) {
          const pos: [number, number] = [from.lng, from.lat];
          map.add(
            new AMap.Marker({
              position: pos,
              content: pinHtml("起", "#1a66ff"),
              offset: new AMap.Pixel(-14, -14),
              title: from.name || "起点",
            }),
          );
          if (!path.length) path.push(pos);
        }

        if (to?.lng && to?.lat) {
          const pos: [number, number] = [to.lng, to.lat];
          map.add(
            new AMap.Marker({
              position: pos,
              content: pinHtml("终", "#ff6d00"),
              offset: new AMap.Pixel(-14, -14),
              title: to.name || "终点",
            }),
          );
          if (path.length <= 1) path.push(pos);
        }

        if (path.length > 1) {
          map.add(
            new AMap.Polyline({
              path,
              strokeColor: stroke,
              strokeWeight: 5,
              strokeOpacity: 0.9,
              lineJoin: "round",
              lineCap: "round",
              showDir: true,
            }),
          );
        }

        map.setFitView(null, false, [36, 36, 36, 36]);
      })
      .catch(() => {
        /* 静默：下方有占位 */
      });

    return () => {
      cancelled = true;
    };
  }, [key, from, to, polyline, mode, stroke]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  if (!key) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--background)] text-[12px] text-[var(--muted)] ${className}`}
        style={{ height }}
      >
        配置 NEXT_PUBLIC_AMAP_JS_KEY 后显示路线地图
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden rounded-xl border border-[#d6e4ff] bg-[#f0f7ff] ${className}`}
      style={{ height }}
    />
  );
}
