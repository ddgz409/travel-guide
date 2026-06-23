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
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的攻略</h1>
        <button
          onClick={() => router.push("/generate")}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700"
        >
          + 新建攻略
        </button>
      </div>

      {!trips || trips.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="text-5xl mb-4">🧳</div>
          <p className="text-gray-500 mb-4">还没有攻略，开始你的第一次旅行规划吧</p>
          <Link
            href="/generate"
            className="inline-block bg-sky-600 text-white px-5 py-2 rounded-lg hover:bg-sky-700"
          >
            生成攻略
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trips.map((t) => {
            const badge = STATUS_BADGE[t.status];
            return (
              <div
                key={t.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
              >
                <Link href={`/trips/${t.id}`} className="block">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg group-hover:text-sky-600">
                      {t.title}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    📍 {t.destination} · {t.start_date} 至 {t.end_date} · {t.travelers}人
                  </p>
                  {t.budget_total != null && t.status === "ready" && (
                    <p className="text-sm text-orange-600">
                      💰 预算 ¥{Math.round(t.budget_total).toLocaleString()}
                    </p>
                  )}
                </Link>
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => {
                      if (confirm("确定删除这份攻略吗？")) del.mutate(t.id);
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
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
