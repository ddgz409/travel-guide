"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { tripsApi } from "@/lib/api";
import type { Day, Item, Trip } from "@/lib/types";
import { TripMap } from "@/components/map/trip-map";
import { ExternalRefsPanel } from "@/components/external-refs";
import { HotelCandidatesPanel } from "@/components/hotel-candidates";

const SLOT_LABEL: Record<string, string> = {
  morning: "上午", afternoon: "下午", evening: "晚上",
};
const SLOT_ICON: Record<string, string> = { morning: "☀️", afternoon: "🌤️", evening: "🌙" };
const TYPE_LABEL: Record<string, string> = {
  attraction: "景点", meal: "餐饮", hotel: "住宿", transport: "交通",
};

function formatDuration(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const { data: trip, isLoading, error } = useQuery<Trip>({
    queryKey: ["share", token],
    queryFn: () => tripsApi.getShared(token),
  });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  if (error || !trip) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-500">
        <div className="text-5xl mb-4">🔍</div>
        <p>分享链接无效或攻略不存在</p>
        <Link href="/" className="mt-4 text-#ff8a00 hover:underline">返回首页</Link>
      </div>
    );
  }

  const days = trip.days || [];
  const totalCost = days.reduce(
    (sum, d) => sum + d.items.reduce((s, it) => s + (it.cost || 0), 0),
    0,
  );

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
      <div className="mb-6">
        <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
          📤 分享的攻略
        </span>
        <h1 className="text-2xl font-bold mt-2">{trip.title}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {trip.destination} · {trip.start_date} 至 {trip.end_date} · {trip.travelers} 人
        </p>
      </div>

      <HotelCandidatesPanel
        status={trip.hotel_fetch_status}
        candidates={trip.hotel_candidates}
      />
      <ExternalRefsPanel refs={trip.external_refs} />

      <div className="space-y-6">
        {days.map((day: Day) => (
          <div key={day.id} className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-1">
              Day {day.day_index} <span className="text-gray-400 text-sm font-normal">· {day.date.slice(5)}</span>
            </h2>
            {day.summary && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-2 mb-3">
                📝 {day.summary}
              </p>
            )}
            <TripMap
              items={day.items.filter((it) => it.selected)}
              tripId={trip.id}
              dayId={day.id}
              height="300px"
            />
            <div className="space-y-2 mt-3">
              {day.items.map((it: Item, idx: number) => (
                <div key={it.id} className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-orange-50 text-#ff8a00 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-gray-400 mr-1">
                      {SLOT_ICON[it.time_slot]} {SLOT_LABEL[it.time_slot]}
                    </span>
                    <span className="font-medium">{it.name}</span>
                    <span className="text-xs text-gray-400 ml-1">
                      {TYPE_LABEL[it.type]}
                    </span>
                    {it.duration_min && (
                      <span className="text-xs text-gray-400 ml-2">
                        ⏱ {formatDuration(it.duration_min)}
                      </span>
                    )}
                    {it.cost ? <span className="text-orange-600 ml-2">¥{it.cost}</span> : null}
                    {it.description && (
                      <p className="text-gray-600 mt-1">{it.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5 text-center">
        <span className="text-gray-600">预估总费用</span>
        <span className="text-2xl font-bold text-orange-600 ml-2">
          ¥{Math.round(trip.budget_total ?? totalCost * trip.travelers).toLocaleString()}
        </span>
      </div>

      <div className="text-center mt-8 pb-8">
        <Link href="/" className="text-#ff8a00 hover:underline text-sm">
          我也要生成旅行攻略 →
        </Link>
      </div>
    </div>
  );
}
