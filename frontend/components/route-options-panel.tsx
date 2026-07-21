"use client";

import { coverForRoute } from "@/lib/cover";
import type { RouteOption } from "@/lib/types";

interface RouteOptionsPanelProps {
  destination: string;
  options: RouteOption[];
  selectedId?: string | null;
  switching?: boolean;
  onSelect: (routeId: string) => void;
}

export function RouteOptionsPanel({
  destination,
  options,
  selectedId,
  switching,
  onSelect,
}: RouteOptionsPanelProps) {
  if (!options.length) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[20px] font-semibold text-[var(--ink)]">
            当地玩法 · 可选路线
          </h2>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            一次生成 {options.length} 条风格不同的行程，点选即可切换
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = opt.id === selectedId;
          const cover = coverForRoute(
            destination,
            opt.theme || opt.id,
            opt.highlights,
          );
          const cost = opt.estimated_cost ?? 0;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={switching || active}
              onClick={() => onSelect(opt.id)}
              className={`deal-card text-left overflow-hidden transition-all ${
                active
                  ? "ring-2 ring-[var(--brand)] border-[var(--brand)]"
                  : "hover:border-[var(--brand)]/40"
              } ${switching ? "opacity-60" : ""}`}
            >
              <div className="relative h-[120px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2.5 top-2.5 rounded bg-[var(--brand)] px-2 py-0.5 text-[11px] font-bold text-white">
                  {opt.theme || "路线"}
                </span>
                {active && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--brand)]">
                    使用中
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <h3 className="font-display text-[15px] font-semibold text-[var(--ink)] leading-snug">
                  {opt.title}
                </h3>
                {opt.tagline ? (
                  <p className="mt-1 text-[12px] text-[var(--muted)] line-clamp-2">
                    {opt.tagline}
                  </p>
                ) : null}
                {opt.highlights && opt.highlights.length > 0 ? (
                  <p className="mt-2 text-[12px] text-[var(--ink)]/80 truncate">
                    {opt.highlights.slice(0, 3).join(" · ")}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[16px] font-bold text-[var(--brand)]">
                    {cost > 0 ? `约 ¥${Math.round(cost)}` : "查看详情"}
                  </span>
                  <span className="text-[12px] font-semibold text-[var(--muted)]">
                    {active ? "当前方案" : "选用 →"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
