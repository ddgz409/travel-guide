"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { tripsApi } from "@/lib/api";
import { heroForDestination } from "@/lib/cover";
import type { Day, Trip, PoiSearchResult, RouteOption } from "@/lib/types";
import { TripMap } from "@/components/map/trip-map";
import { ItemCard } from "@/components/item-card";
import { ExternalRefsPanel } from "@/components/external-refs";
import { HotelCandidatesPanel } from "@/components/hotel-candidates";
import { RouteOptionsPanel } from "@/components/route-options-panel";

const TYPE_LABEL: Record<string, string> = {
  attraction: "景点",
  meal: "餐饮",
  hotel: "住宿",
  transport: "交通",
};

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const tripId = params.id as string;
  const [activeDay, setActiveDay] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ["trip", tripId],
    queryFn: () => tripsApi.get(tripId),
    refetchInterval: (q) => (q.state.data?.status === "generating" ? 2000 : false),
  });

  const exportPdf = useMutation({
    mutationFn: () => tripsApi.exportPdf(tripId),
    onSuccess: async (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${trip?.title || "攻略"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const share = useMutation({
    mutationFn: () => tripsApi.createShare(tripId),
    onSuccess: (t) => {
      const url = `${window.location.origin}/share/${t.share_token}`;
      setShareUrl(url);
      navigator.clipboard?.writeText(url).catch(() => {});
    },
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, selected }: { itemId: string; selected: boolean }) =>
      tripsApi.toggleItem(tripId, itemId, selected),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  const swapItem = useMutation({
    mutationFn: ({ itemId, altIndex }: { itemId: string; altIndex: number }) =>
      tripsApi.swapItem(tripId, itemId, altIndex),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  const replaceItem = useMutation({
    mutationFn: ({ itemId, poi }: { itemId: string; poi: PoiSearchResult }) =>
      tripsApi.updateItem(tripId, itemId, {
        name: poi.name,
        poi_id: poi.poi_id,
        location: (poi.location as unknown as Record<string, unknown>) || undefined,
        rating: poi.rating ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  const regenDay = useMutation({
    mutationFn: (dayIndex: number) => tripsApi.regenerateDay(tripId, dayIndex),
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  const selectRoute = useMutation({
    mutationFn: (routeId: string) => tripsApi.selectRoute(tripId, routeId),
    onSuccess: () => {
      setActiveDay(0);
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    },
  });

  const handleDrop = (day: Day, items: Trip["days"][0]["items"], toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved);
    tripsApi
      .reorderItems(
        tripId,
        day.id,
        reordered.map((it, i) => ({ item_id: it.id, new_seq: i })),
      )
      .then(() => qc.invalidateQueries({ queryKey: ["trip", tripId] }));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] py-24">
        加载中…
      </div>
    );
  }

  if (!trip) return null;

  if (trip.status === "generating") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="w-16 h-16 border-4 border-[var(--brand-soft)] border-t-[var(--brand)] rounded-full animate-spin mb-6" />
        <h2 className="font-display text-xl font-semibold text-[var(--ink)] mb-2">
          AI 正在规划多条路线…
        </h2>
        <p className="text-[var(--muted)] text-sm">
          正在检索 {trip.destination} 的热门景点，一次生成经典 / 人文 / 美食等可选玩法
        </p>
      </div>
    );
  }

  if (trip.status === "failed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <h2 className="font-display text-xl font-semibold text-[var(--ink)] mb-2">
          攻略生成失败
        </h2>
        <p className="text-[var(--muted)] text-sm mb-6 max-w-md text-center">
          {trip.error_msg || "生成过程中出现错误"}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/generate")}
            className="btn-brand rounded-full px-5 py-2"
          >
            重新创建
          </button>
          <button
            onClick={() => router.push("/trips")}
            className="rounded-full border border-[var(--line)] px-5 py-2 hover:bg-white"
          >
            返回列表
          </button>
        </div>
        <div className="w-full max-w-6xl mt-8 px-5">
          <HotelCandidatesPanel
            status={trip.hotel_fetch_status}
            candidates={trip.hotel_candidates}
          />
          <ExternalRefsPanel refs={trip.external_refs} />
        </div>
      </div>
    );
  }

  const days = trip.days || [];
  const currentDay: Day | undefined = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = dayItems.filter((it) => it.selected);

  const budgetByType: Record<string, number> = {};
  let totalCost = 0;
  days.forEach((d) =>
    d.items.forEach((it) => {
      if (!it.selected) return;
      const c = it.cost || 0;
      totalCost += c;
      budgetByType[it.type] = (budgetByType[it.type] || 0) + c;
    }),
  );
  const totalBudget = trip.budget_total ?? totalCost * trip.travelers;
  const canceledCount = dayItems.filter((it) => !it.selected).length;
  const hero = heroForDestination(trip.destination);
  const routeOptions = (trip.preferences?.route_options || []) as RouteOption[];
  const selectedRouteId =
    (trip.preferences?.selected_route_id as string | undefined) ||
    routeOptions[0]?.id;

  return (
    <div className="flex-1 pb-16">
      <section className="relative h-[260px] sm:h-[300px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15" />
        <div className="relative site-container h-full flex flex-col justify-end pb-8 text-white">
          <p className="text-[12px] text-white/70 mb-2">
            当地玩法 · {trip.destination}
          </p>
          <h1 className="font-display text-[28px] sm:text-[36px] font-semibold leading-tight !text-white">
            {trip.title}
          </h1>
          <p className="mt-2 text-[13px] sm:text-[14px] text-white/85">
            {trip.start_date} 至 {trip.end_date} · {trip.travelers} 人
            {trip.budget_total != null && (
              <> · 预算约 ¥{Math.round(trip.budget_total).toLocaleString()}</>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => exportPdf.mutate()}
              disabled={exportPdf.isPending}
              className="rounded-full bg-white/15 backdrop-blur px-4 py-2 text-[13px] font-semibold hover:bg-white/25 disabled:opacity-50"
            >
              {exportPdf.isPending ? "导出中…" : "导出 PDF"}
            </button>
            <button
              onClick={() => share.mutate()}
              disabled={share.isPending}
              className="rounded-full bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold hover:bg-[var(--brand-hot)] disabled:opacity-50"
            >
              分享攻略
            </button>
          </div>
        </div>
      </section>

      <div className="site-container -mt-5 relative z-10">
        {shareUrl && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 flex items-center justify-between">
            <span>分享链接已复制：{shareUrl}</span>
            <button onClick={() => setShareUrl(null)} className="hover:underline">
              关闭
            </button>
          </div>
        )}

        <RouteOptionsPanel
          destination={trip.destination}
          options={routeOptions}
          selectedId={selectedRouteId}
          switching={selectRoute.isPending}
          onSelect={(id) => selectRoute.mutate(id)}
        />

        {canceledCount > 0 && (
          <div className="mb-4 bg-[var(--brand-soft)] border border-[var(--brand)]/20 rounded-xl p-3 text-sm text-[var(--brand-hot)]">
            编辑模式：已取消 {canceledCount} 个安排 · 可拖拽调整顺序
          </div>
        )}

        {days.length === 0 ? (
          <div className="text-center py-20 text-[var(--muted)] bg-white rounded-2xl border border-[var(--line)]">
            暂无行程数据
          </div>
        ) : (
          <>
            <div className="deal-toolbar mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 py-3 shadow-[var(--shadow)]">
              <div className="flex gap-1.5 flex-wrap">
                {days.map((d, i) => (
                  <button
                    key={d.id}
                    onClick={() => setActiveDay(i)}
                    className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${
                      i === activeDay
                        ? "bg-[var(--brand)] text-white shadow-sm"
                        : "bg-[var(--background)] text-[var(--ink)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
                    }`}
                  >
                    Day {d.day_index}
                    <span className="ml-1 opacity-70">{d.date.slice(5)}</span>
                  </button>
                ))}
              </div>
              {currentDay && (
                <button
                  onClick={() => regenDay.mutate(currentDay.day_index)}
                  disabled={regenDay.isPending}
                  className="ml-auto rounded-full border border-[var(--line)] px-3.5 py-2 text-[12px] font-semibold text-[var(--ink)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50"
                >
                  {regenDay.isPending ? "重新生成中…" : "重新生成当天"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
              <div className="min-w-0">
                {currentDay?.summary && (
                  <div className="mb-5 rounded-2xl border border-[var(--line)] bg-white px-5 py-4 shadow-[var(--shadow)]">
                    <div className="text-[12px] font-semibold text-[var(--brand)] mb-1">
                      当日亮点
                    </div>
                    <p className="text-[14px] text-[var(--ink)] leading-relaxed">
                      {currentDay.summary}
                    </p>
                  </div>
                )}

                <div className="mb-3 flex items-end justify-between">
                  <h2 className="font-display text-[20px] font-semibold text-[var(--ink)]">
                    精选行程
                  </h2>
                  <span className="text-[12px] text-[var(--muted)]">
                    {selectedItems.length} 个安排
                  </span>
                </div>

                {dayItems.map((it, idx) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    index={idx}
                    tripId={tripId}
                    city={trip.destination}
                    onToggle={(selected) =>
                      toggleItem.mutate({ itemId: it.id, selected })
                    }
                    onSwap={(altIndex) =>
                      swapItem.mutate({ itemId: it.id, altIndex })
                    }
                    onReplace={(poi) =>
                      replaceItem.mutate({ itemId: it.id, poi })
                    }
                    onTransportChange={() =>
                      qc.invalidateQueries({ queryKey: ["trip", tripId] })
                    }
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={() => setDragOverIndex(idx)}
                    onDrop={() => currentDay && handleDrop(currentDay, dayItems, idx)}
                    dragging={dragIndex === idx}
                    dragOver={dragOverIndex === idx}
                  />
                ))}
              </div>

              <aside className="lg:sticky lg:top-[72px] space-y-4">
                <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow)]">
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                    <span className="font-semibold text-[var(--ink)] text-[14px]">
                      当日路线地图
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      {selectedItems.length} 个点位
                    </span>
                  </div>
                  <TripMap
                    items={selectedItems}
                    tripId={tripId}
                    dayId={currentDay?.id}
                    height="420px"
                  />
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow)]">
                  <h3 className="font-display text-[16px] font-semibold text-[var(--ink)] mb-3">
                    预算估算
                  </h3>
                  <div className="space-y-2 mb-4">
                    {Object.entries(budgetByType).map(([type, cost]) => (
                      <div
                        key={type}
                        className="flex items-center justify-between text-[13px]"
                      >
                        <span className="text-[var(--muted)]">
                          {TYPE_LABEL[type] || type}
                        </span>
                        <span className="font-semibold text-[var(--ink)]">
                          ¥{cost.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--line)] pt-3">
                    <span className="text-[12px] text-[var(--muted)]">
                      人均 ¥{Math.round(totalCost).toLocaleString()} × {trip.travelers}
                    </span>
                    <span className="text-[22px] font-bold text-[var(--brand)]">
                      ¥{Math.round(totalBudget).toLocaleString()}
                    </span>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-10 space-y-4">
              <HotelCandidatesPanel
                status={trip.hotel_fetch_status}
                candidates={trip.hotel_candidates}
              />
              <ExternalRefsPanel refs={trip.external_refs} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
