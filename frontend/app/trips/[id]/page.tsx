"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { tripsApi } from "@/lib/api";
import type { Day, Trip, PoiSearchResult } from "@/lib/types";
import { TripMap } from "@/components/map/trip-map";
import { ItemCard } from "@/components/item-card";

const TYPE_LABEL: Record<string, string> = {
  attraction: "景点", meal: "餐饮", hotel: "住宿", transport: "交通",
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

  // 轮询：generating 时每 2 秒刷新，ready/failed 后停止
  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ["trip", tripId],
    queryFn: () => tripsApi.get(tripId),
    refetchInterval: (q) => (q.state.data?.status === "generating" ? 2000 : false),
  });

  // 导出 PDF
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

  // 生成分享链接
  const share = useMutation({
    mutationFn: () => tripsApi.createShare(tripId),
    onSuccess: (t) => {
      const url = `${window.location.origin}/share/${t.share_token}`;
      setShareUrl(url);
      navigator.clipboard?.writeText(url).catch(() => {});
    },
  });

  // 切换勾选
  const toggleItem = useMutation({
    mutationFn: ({ itemId, selected }: { itemId: string; selected: boolean }) =>
      tripsApi.toggleItem(tripId, itemId, selected),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  // 换备选
  const swapItem = useMutation({
    mutationFn: ({ itemId, altIndex }: { itemId: string; altIndex: number }) =>
      tripsApi.swapItem(tripId, itemId, altIndex),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  // 搜索替换（直接替换为任意搜索到的 POI）
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

  // 重新生成某天
  const regenDay = useMutation({
    mutationFn: (dayIndex: number) => tripsApi.regenerateDay(tripId, dayIndex),
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  // 拖拽排序
  const handleDrop = (day: Day, items: Trip["days"][0]["items"], toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved);
    tripsApi.reorderItems(tripId, day.id, reordered.map((it, i) => ({
      item_id: it.id, new_seq: i,
    }))).then(() => qc.invalidateQueries({ queryKey: ["trip", tripId] }));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  if (!trip) return null;

  // 生成中
  if (trip.status === "generating") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="w-16 h-16 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-semibold mb-2">AI 正在为你规划行程...</h2>
        <p className="text-gray-500 text-sm">
          正在检索 {trip.destination} 的景点数据并生成攻略，请稍候
        </p>
      </div>
    );
  }

  // 生成失败
  if (trip.status === "failed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="text-5xl mb-4">😞</div>
        <h2 className="text-xl font-semibold mb-2">攻略生成失败</h2>
        <p className="text-gray-500 text-sm mb-6 max-w-md text-center">
          {trip.error_msg || "生成过程中出现错误"}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/generate")}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700"
          >
            重新创建
          </button>
          <button
            onClick={() => router.push("/trips")}
            className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  // 生成成功
  const days = trip.days || [];
  const currentDay: Day | undefined = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = dayItems.filter((it) => it.selected);

  // 预算汇总（只计算勾选的条目）
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

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-5 py-6">
      {/* 标题栏 */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{trip.title}</h1>
          <p className="text-gray-600 text-sm mt-1">
            📍 {trip.destination} · {trip.start_date} 至 {trip.end_date} · {trip.travelers}人
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportPdf.mutate()}
            disabled={exportPdf.isPending}
            className="px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exportPdf.isPending ? "导出中..." : "📄 导出PDF"}
          </button>
          <button
            onClick={() => share.mutate()}
            disabled={share.isPending}
            className="px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            🔗 分享
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 flex items-center justify-between">
          <span>分享链接已复制：{shareUrl}</span>
          <button onClick={() => setShareUrl(null)} className="text-green-600 hover:underline">关闭</button>
        </div>
      )}

      {/* 编辑提示 */}
      {canceledCount > 0 && (
        <div className="mb-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
          ✏️ 编辑模式：已取消 {canceledCount} 个景点 · 可拖拽卡片调整顺序，点 🔄 换备选
        </div>
      )}

      {days.length === 0 ? (
        <div className="text-center py-20 text-gray-400">暂无行程数据</div>
      ) : (
        <>
          {/* 天数切换 */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {days.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDay(i)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    i === activeDay
                      ? "bg-sky-500 text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:border-sky-400"
                  }`}
                >
                  Day {d.day_index}
                  <span className="ml-1 opacity-70">· {d.date.slice(5)}</span>
                </button>
              ))}
            </div>
            {currentDay && (
              <button
                onClick={() => regenDay.mutate(currentDay.day_index)}
                disabled={regenDay.isPending}
                className="ml-auto px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {regenDay.isPending ? "重新生成中..." : "🔄 重新生成当天"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
            {/* 左：时间轴 */}
            <div>
              {currentDay?.summary && (
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
                  📝 {currentDay.summary}
                </div>
              )}
              <div className="relative pb-4">
                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-200" />
                {dayItems.map((it, idx) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    index={idx}
                    onToggle={(selected) => toggleItem.mutate({ itemId: it.id, selected })}
                    onSwap={(altIndex) => swapItem.mutate({ itemId: it.id, altIndex })}
                    onReplace={(poi) => replaceItem.mutate({ itemId: it.id, poi })}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={() => setDragOverIndex(idx)}
                    onDrop={() => currentDay && handleDrop(currentDay, dayItems, idx)}
                    dragging={dragIndex === idx}
                    dragOver={dragOverIndex === idx}
                  />
                ))}
              </div>
            </div>

            {/* 右：地图（只显示勾选的景点） */}
            <div className="lg:sticky lg:top-20 self-start">
              <TripMap items={selectedItems} height="500px" />
            </div>
          </div>

          {/* 预算汇总 */}
          <div className="mt-8 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm">
            <h2 className="font-bold text-lg mb-4">💰 预算估算</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {Object.entries(budgetByType).map(([type, cost]) => (
                <div key={type} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{TYPE_LABEL[type] || type}</div>
                  <div className="font-extrabold text-lg">¥{cost.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-gray-700">
                人均 ¥{Math.round(totalCost).toLocaleString()} × {trip.travelers}人
              </span>
              <span className="text-2xl font-extrabold text-orange-600">
                总计 ¥{Math.round(totalBudget).toLocaleString()}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
