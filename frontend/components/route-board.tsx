"use client";

import { useEffect, useState } from "react";

import { RouteMap } from "@/components/map/route-map";
import { tripsApi } from "@/lib/api";
import type { RouteStep, TransportToNext } from "@/lib/types";

type Mode = "transit" | "walking" | "driving";

interface RouteScheme {
  distance_m: number;
  duration_s: number;
  cost?: number;
  walking_distance_m?: number;
  detail: RouteStep[];
  polyline?: number[][];
}

interface RouteBoardProps {
  tripId: string;
  itemId: string;
  fromName: string;
  transport: TransportToNext;
  onUpdated?: (t: TransportToNext) => void;
}

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "transit", label: "公交地铁" },
  { id: "walking", label: "步行" },
  { id: "driving", label: "驾车" },
];

const LINE_COLORS = [
  "#c23a30",
  "#006098",
  "#f9a825",
  "#00833e",
  "#8b5cf6",
  "#d46c08",
  "#e91e8c",
  "#009688",
];

function lineColor(name: string): string {
  const m = name.match(/(\d+)/);
  if (m) return LINE_COLORS[parseInt(m[1], 10) % LINE_COLORS.length];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 17) % LINE_COLORS.length;
  return LINE_COLORS[h];
}

function shortLine(name: string): string {
  const n = name || "";
  const m = n.match(/(地铁\d+号线|[\u4e00-\u9fa5]+线|\d+路)/);
  if (m) return m[1];
  return n.split("(")[0].slice(0, 10);
}

function fmtMin(s: number): string {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m}分钟`;
  return `${Math.floor(m / 60)}小时${m % 60}分`;
}

function fmtKm(m: number): string {
  if (m < 1000) return `${m}米`;
  return `${(m / 1000).toFixed(1)}公里`;
}

function TransitDiagram({ steps }: { steps: RouteStep[] }) {
  if (!steps.length) {
    return <p className="text-[13px] text-[var(--muted)] py-4 text-center">暂无详细路段</p>;
  }
  return (
    <div className="relative pl-1">
      {steps.map((step, i) => {
        const isWalk = step.type === "walk" || step.type === "drive";
        const color = isWalk ? "#9ca3af" : lineColor(step.line_name || "");
        const last = i === steps.length - 1;
        return (
          <div key={i} className="flex gap-3 min-h-[56px]">
            <div className="flex flex-col items-center w-5 flex-shrink-0">
              <span
                className="mt-1.5 h-3 w-3 rounded-full border-2 bg-white z-[1]"
                style={{ borderColor: color }}
              />
              {!last && (
                <span
                  className="flex-1 w-[3px] my-0.5 rounded-full"
                  style={{ background: color, opacity: isWalk ? 0.35 : 0.85 }}
                />
              )}
            </div>
            <div className={`flex-1 pb-4 ${last ? "" : ""}`}>
              {isWalk ? (
                <div className="text-[13px] text-[var(--muted)] leading-snug">
                  <span className="inline-flex items-center gap-1 font-medium text-[var(--ink)]">
                    {step.type === "drive" ? "驾车" : "步行"}
                    {step.distance_m ? (
                      <span className="text-[var(--muted)] font-normal">
                        · {fmtKm(step.distance_m)}
                      </span>
                    ) : null}
                  </span>
                  {step.instruction ? (
                    <p className="mt-0.5 text-[12px]">{step.instruction}</p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span
                      className="inline-flex rounded px-2 py-0.5 text-[12px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {shortLine(step.line_name || "公交")}
                    </span>
                    {step.line_type ? (
                      <span className="text-[11px] text-[var(--muted)]">{step.line_type}</span>
                    ) : null}
                    {step.via_stops != null && step.via_stops > 0 ? (
                      <span className="text-[11px] text-[var(--muted)]">
                        {step.via_stops} 站
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                    <span className="font-semibold truncate max-w-[42%]">
                      {step.departure_stop || "上车站"}
                    </span>
                    <span className="text-[var(--muted)] flex-shrink-0">→</span>
                    <span className="font-semibold truncate max-w-[42%]">
                      {step.arrival_stop || "下车站"}
                    </span>
                  </div>
                  {/* 可视化线路条 */}
                  <div
                    className="mt-2 h-2 rounded-full relative overflow-hidden"
                    style={{ background: `${color}22` }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 right-0 rounded-full"
                      style={{
                        background: `repeating-linear-gradient(90deg, ${color} 0 10px, ${color}99 10px 14px)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChipPreview({ steps }: { steps: RouteStep[] }) {
  const buses = steps.filter((s) => s.type === "bus");
  if (buses.length === 0) {
    return <span className="text-[12px] text-[var(--muted)]">查看路段指引</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {buses.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-[var(--muted)]">→</span>}
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
            style={{ background: lineColor(b.line_name || "") }}
          >
            {shortLine(b.line_name || "公交")}
          </span>
        </span>
      ))}
    </div>
  );
}

export function RouteBoard({
  tripId,
  itemId,
  fromName,
  transport,
  onUpdated,
}: RouteBoardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>((transport.mode as Mode) || "transit");
  const [data, setData] = useState<TransportToNext & { schemes?: RouteScheme[]; to_name?: string }>(
    transport,
  );
  const [schemeIndex, setSchemeIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const min = Math.round((data.duration_s || 0) / 60);
  const modeLabel =
    data.mode === "walking" ? "步行" : data.mode === "driving" ? "驾车" : "公交地铁";

  const load = async (m: Mode, force = false) => {
    setLoading(true);
    setError(null);
    try {
      let res: Record<string, unknown>;
      if (force || m !== (data.mode as Mode) || !data.detail?.length) {
        res = await tripsApi.updateItemRoute(tripId, itemId, { mode: m, scheme_index: 0 });
      } else {
        res = await tripsApi.getItemRoute(tripId, itemId, m);
      }
      const next = res as TransportToNext & { schemes?: RouteScheme[]; to_name?: string };
      setData(next);
      setSchemeIndex(0);
      setMode((next.mode as Mode) || m);
      onUpdated?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "路线加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!data.detail?.length || !data.polyline?.length) load(mode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyScheme = async (idx: number) => {
    const preview = schemes[idx];
    if (preview) {
      setSchemeIndex(idx);
      setData((prev) => ({
        ...prev,
        distance_m: preview.distance_m,
        duration_s: preview.duration_s,
        detail: preview.detail,
        polyline: preview.polyline || prev.polyline,
        scheme_index: idx,
      }));
    }
    setLoading(true);
    setError(null);
    try {
      const res = await tripsApi.updateItemRoute(tripId, itemId, {
        mode: "transit",
        scheme_index: idx,
      });
      const next = res as TransportToNext & { schemes?: RouteScheme[]; to_name?: string };
      setData(next);
      setSchemeIndex(idx);
      onUpdated?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换方案失败");
    } finally {
      setLoading(false);
    }
  };

  const steps = (data.detail || []) as RouteStep[];
  const schemes = (data.schemes || []) as RouteScheme[];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 w-full text-left rounded-xl border border-[#d6e4ff] bg-gradient-to-r from-[#f0f7ff] to-white px-3.5 py-3 shadow-sm hover:border-[#3370ff] transition-colors group"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1a66ff]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1a66ff] text-white text-[12px]">
              {data.mode === "walking" ? "步" : data.mode === "driving" ? "车" : "交"}
            </span>
            约 {min || "?"} 分钟 · {fmtKm(data.distance_m || 0)} · {modeLabel}
          </div>
          <span className="text-[12px] font-semibold text-[#1a66ff] group-hover:underline">
            查看线路图 ›
          </span>
        </div>
        <ChipPreview steps={steps} />
        <p className="mt-1.5 text-[11px] text-[var(--muted)] truncate">
          从「{fromName}」前往下一站
        </p>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full sm:max-w-[520px] max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
              <div>
                <h3 className="font-semibold text-[16px] text-[var(--ink)]">路线规划</h3>
                <p className="text-[12px] text-[var(--muted)] mt-0.5 truncate max-w-[320px]">
                  {fromName}
                  {data.to_name ? ` → ${data.to_name}` : " → 下一站"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full bg-[var(--background)] text-[var(--muted)] hover:text-[var(--ink)]"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1 px-3 pt-3">
              {MODE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setMode(t.id);
                    load(t.id, true);
                  }}
                  className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors ${
                    mode === t.id
                      ? "bg-[#1a66ff] text-white"
                      : "bg-[var(--background)] text-[var(--ink)] hover:bg-[#e8f0ff]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 地图固定在上方，切换方式/方案时同步更新 */}
            {(data.from_location || data.to_location || data.polyline?.length) && (
              <div className="px-3 pt-3 relative">
                <RouteMap
                  from={data.from_location}
                  to={data.to_location}
                  polyline={
                    (mode === "transit" &&
                      schemes[schemeIndex]?.polyline) ||
                    data.polyline ||
                    null
                  }
                  mode={mode}
                  height="220px"
                />
                {loading && (
                  <div className="absolute inset-3 rounded-xl bg-white/55 flex items-center justify-center text-[12px] text-[#1a66ff] font-semibold">
                    更新路线中…
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loading && (
                <div className="py-10 text-center text-[13px] text-[var(--muted)]">
                  正在规划路线…
                </div>
              )}
              {error && (
                <div className="mb-3 rounded-lg bg-red-50 text-red-600 text-[13px] px-3 py-2">
                  {error}
                </div>
              )}

              {!loading && mode === "transit" && schemes.length > 1 && (
                <div className="mb-4 space-y-2">
                  <p className="text-[12px] font-semibold text-[var(--muted)] mb-1">
                    可选方案 · 点选切换
                  </p>
                  {schemes.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyScheme(i)}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                        schemeIndex === i
                          ? "border-[#1a66ff] bg-[#f0f7ff]"
                          : "border-[var(--line)] hover:border-[#1a66ff]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-semibold text-[var(--ink)]">
                          方案 {i + 1} · {fmtMin(s.duration_s)}
                        </span>
                        <span className="text-[var(--muted)]">{fmtKm(s.distance_m)}</span>
                      </div>
                      <div className="mt-1.5">
                        <ChipPreview steps={s.detail || []} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!loading && (
                <>
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="text-[22px] font-bold text-[#1a66ff]">
                      {fmtMin(data.duration_s || 0)}
                    </span>
                    <span className="text-[13px] text-[var(--muted)]">
                      {fmtKm(data.distance_m || 0)}
                    </span>
                    {mode === "transit" ? (
                      <span className="text-[11px] text-[#1a66ff] ml-auto">地图 · 蓝色线路</span>
                    ) : mode === "walking" ? (
                      <span className="text-[11px] text-emerald-600 ml-auto">地图 · 步行线</span>
                    ) : (
                      <span className="text-[11px] text-amber-600 ml-auto">地图 · 驾车线</span>
                    )}
                  </div>
                  <TransitDiagram steps={steps} />
                </>
              )}
            </div>

            <div className="border-t border-[var(--line)] px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-full bg-[#1a66ff] text-white py-2.5 text-[14px] font-semibold"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
