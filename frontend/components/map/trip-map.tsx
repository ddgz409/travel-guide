"use client";

import { useEffect, useRef } from "react";

import type { Item, Location } from "@/lib/types";

interface TripMapProps {
  items: Item[];
  height?: string;
}

const SLOT_COLORS: Record<string, string> = {
  morning: "#f59e0b", // 琥珀
  afternoon: "#3b82f6", // 蓝
  evening: "#8b5cf6", // 紫
};

const TYPE_ICONS: Record<string, string> = {
  attraction: "🏞️",
  meal: "🍽️",
  hotel: "🏨",
  transport: "🚗",
};

// 高德地图 JS API 的 window 全局类型（宽松声明）
declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: any;
    __amapLoading?: Promise<any>;
  }
}

const AMAP_JSAPI = "https://webapi.amap.com/maps?v=2.0&key=";

/** 动态加载高德地图 JS API，保证只加载一次。 */
function loadAmap(key: string): Promise<any> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (window.__amapLoading) return window.__amapLoading;

  window.__amapLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${AMAP_JSAPI}${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error("高德地图加载失败"));
    document.head.appendChild(script);
  });
  return window.__amapLoading;
}

export function TripMap({ items, height = "400px" }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY || "";
    if (!key) {
      // 无 key 时显示占位
      return;
    }
    let cancelled = false;

    loadAmap(key)
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;

        // 取有坐标的条目
        const located = items.filter(
          (it) => it.location && it.location.lng && it.location.lat,
        );
        if (located.length === 0) return;

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(containerRef.current, {
            zoom: 12,
            viewMode: "2D",
          });
        }
        const map = mapRef.current;
        map.clearMap();

        const points: [number, number][] = [];
        located.forEach((it, idx) => {
          const loc = it.location as Location;
          const pos: [number, number] = [loc.lng, loc.lat];
          points.push(pos);

          const marker = new AMap.Marker({
            position: pos,
            content: `<div style="background:${SLOT_COLORS[it.time_slot] || "#3b82f6"};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,.3);">${idx + 1}</div>`,
            offset: new AMap.Pixel(-14, -28),
          });
          marker.setLabel({
            offset: new AMap.Pixel(0, -34),
            content: `<span style="background:rgba(255,255,255,.9);padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap;">${TYPE_ICONS[it.type] || ""} ${it.name}</span>`,
            direction: "top",
          });
          map.add(marker);
        });

        // 连线显示路线
        if (points.length > 1) {
          const polyline = new AMap.Polyline({
            path: points,
            strokeColor: "#3b82f6",
            strokeWeight: 3,
            strokeOpacity: 0.7,
            strokeStyle: "dashed",
          });
          map.add(polyline);
        }

        // 自适应视野
        map.setFitView();
      })
      .catch(() => {
        /* 加载失败静默处理，占位会显示 */
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [items]);

  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY || "";
  if (!key) {
    return (
      <div
        className="rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        <div className="text-center">
          <div className="text-3xl mb-2">🗺️</div>
          <div>地图未配置（设置 NEXT_PUBLIC_AMAP_JS_KEY 后显示）</div>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-gray-200" style={{ height }} />;
}
