"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { tripsApi } from "@/lib/api";
import type { TripListItem, TripStatus } from "@/lib/types";

const STATUS_BADGE: Record<TripStatus, { label: string; cls: string }> = {
  generating: { label: "生成中", cls: "bg-amber-100 text-amber-700" },
  ready: { label: "已完成", cls: "bg-green-100 text-green-700" },
  failed: { label: "失败", cls: "bg-red-100 text-red-700" },
};

export default function TripsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: trips, isLoading } = useQuery<TripListItem[]>({
    queryKey: ["trips"],
    queryFn: () => tripsApi.list(),
  });

  const del = useMutation({
    mutationFn: (id: string) => tripsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-5 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">我的攻略</h1>
        <button
          onClick={() => router.push("/generate")}
          className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-5 py-2.5 rounded text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
        >
          + 新建攻略
        </button>
      </div>

      {!trips || trips.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200/80 shadow-sm">
          <div className="text-5xl mb-4">🧳</div>
          <p className="text-gray-600 mb-5">还没有攻略，开始你的第一次旅行规划吧</p>
          <Link
            href="/generate"
            className="inline-block bg-orange-400 text-white px-5 py-2.5 rounded font-semibold hover:bg-orange-500"
          >
            生成攻略
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trips.map((t) => {
            const badge = STATUS_BADGE[t.status];
            const colors = ["#fef3c7,#fde68a", "#dbeafe,#bfdbfe", "#fce7f3,#fbcfe8", "#d1fae5,#a7f3d0", "#ede9fe,#ddd6fe", "#ffedd5,#fed7aa"];
            const gradient = colors[Math.abs(t.title.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % colors.length];
            return (
              <div
                key={t.id}
                className="bg-white rounded-lg border border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group"
              >
                <Link href={`/trips/${t.id}`} className="block">
                  <div className="h-28 flex items-center justify-center text-[42px]" style={{ background: `linear-gradient(135deg, ${gradient})` }}>
                    {t.destination.includes("北京") ? "🏯" : t.destination.includes("成都") ? "🐼" : t.destination.includes("大理") ? "🌊" : t.destination.includes("西安") ? "⛰️" : t.destination.includes("厦门") ? "🏝️" : t.destination.includes("上海") ? "🏙️" : t.destination.includes("东京") ? "🗼" : "🧭"}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-[16px] group-hover:text-#ff8a00 transition-colors">{t.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      📍 {t.destination} · {t.start_date} 至 {t.end_date} · {t.travelers}人
                    </p>
                    {t.budget_total != null && t.status === "ready" && (
                      <p className="text-sm font-bold text-orange-600">💰 预算 ¥{Math.round(t.budget_total).toLocaleString()}</p>
                    )}
                  </div>
                </Link>
                <div className="flex justify-end px-5 py-3 border-t border-gray-100">
                  <button
                    onClick={() => { if (confirm("确定删除这份攻略吗？")) del.mutate(t.id); }}
                    className="text-xs text-gray-400 hover:text-red-500 font-medium"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
