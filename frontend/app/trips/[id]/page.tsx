"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { tripsApi } from "@/lib/api";
import type { Day, Item, Trip } from "@/lib/types";
import { TripMap } from "@/components/map/trip-map";

const SLOT_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};
const SLOT_ICON: Record<string, string> = { morning: "☀️", afternoon: "🌤️", evening: "🌙" };
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

function formatTransport(t: Item["transport_to_next"]): string | null {
  if (!t) return null;
  const km = (t.distance_m / 1000).toFixed(1);
  const min = Math.round(t.duration_s / 60);
  const modeLabel: Record<string, string> = {
    walking: "步行", driving: "驾车", transit: "公交",
  };
  return `${modeLabel[t.mode] || t.mode} ${km}km · ${min}分钟`;
}

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const tripId = params.id as string;
  const [activeDay, setActiveDay] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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

  // 重新生成某天
  const regenDay = useMutation({
    mutationFn: (dayIndex: number) => tripsApi.regenerateDay(tripId, dayIndex),
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

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

  // 预算汇总
  const budgetByType: Record<string, number> = {};
  let totalCost = 0;
  days.forEach((d) =>
    d.items.forEach((it) => {
      const c = it.cost || 0;
      totalCost += c;
      budgetByType[it.type] = (budgetByType[it.type] || 0) + c;
    }),
  );
  const totalBudget = trip.budget_total ?? totalCost * trip.travelers;

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      {/* 标题栏 */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{trip.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {trip.destination} · {trip.start_date} 至 {trip.end_date} · {trip.travelers} 人
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportPdf.mutate()}
            disabled={exportPdf.isPending}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {exportPdf.isPending ? "导出中..." : "📄 导出PDF"}
          </button>
          <button
            onClick={() => share.mutate()}
            disabled={share.isPending}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            🔗 分享
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-center justify-between">
          <span>分享链接已复制：{shareUrl}</span>
          <button onClick={() => setShareUrl(null)} className="text-green-600 hover:underline">
            关闭
          </button>
        </div>
      )}

      {days.length === 0 ? (
        <div className="text-center py-20 text-gray-400">暂无行程数据</div>
      ) : (
        <>
          {/* 天数切换 */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDay(i)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    i === activeDay
                      ? "bg-sky-600 text-white"
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
                className="ml-auto px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                title="基于真实数据重新生成这一天"
              >
                {regenDay.isPending ? "重新生成中..." : "🔄 重新生成当天"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左：时间轴 */}
            <div>
              {currentDay?.summary && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
                  📝 {currentDay.summary}
                </div>
              )}
              <div className="space-y-3">
                {dayItems.map((it, idx) => (
                  <div
                    key={it.id}
                    className="bg-white rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">
                            {SLOT_ICON[it.time_slot]} {SLOT_LABEL[it.time_slot]}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {TYPE_LABEL[it.type]}
                          </span>
                          {it.duration_min && (
                            <span className="text-xs text-gray-400">
                              ⏱ {formatDuration(it.duration_min)}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold mt-1">{it.name}</h3>
                        {it.description && (
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                            {it.description}
                          </p>
                        )}
                        {it.cost ? (
                          <p className="text-sm text-orange-600 mt-1">💰 ¥{it.cost}</p>
                        ) : null}
                        {it.transport_to_next && (
                          <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
                            → {formatTransport(it.transport_to_next)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右：地图 */}
            <div className="lg:sticky lg:top-20 self-start">
              <TripMap items={dayItems} height="500px" />
            </div>
          </div>

          {/* 预算汇总 */}
          <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-lg mb-4">💰 预算估算</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {Object.entries(budgetByType).map(([type, cost]) => (
                <div key={type} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">{TYPE_LABEL[type] || type}</div>
                  <div className="font-semibold text-lg">¥{cost.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-gray-600">
                人均 ¥{Math.round(totalCost).toLocaleString()} × {trip.travelers} 人
              </span>
              <span className="text-xl font-bold text-orange-600">
                总计 ¥{Math.round(totalBudget).toLocaleString()}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
