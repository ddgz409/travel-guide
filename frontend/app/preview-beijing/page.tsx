import Link from "next/link";
import fallbackTrip from "./trip.json";

type Item = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  time_slot?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_min?: number | null;
  cost?: number | null;
  rating?: number | null;
  selected?: boolean;
  seq?: number;
  transport_to_next?: {
    mode?: string;
    distance_m?: number;
    duration_s?: number;
  } | null;
};

type Day = {
  id: string;
  day_index: number;
  date: string;
  summary?: string | null;
  items: Item[];
};

type Trip = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget_total?: number | null;
  status: string;
  share_token?: string | null;
  days: Day[];
};

const TYPE_LABEL: Record<string, string> = {
  attraction: "景点",
  meal: "餐饮",
  hotel: "住宿",
  transport: "交通",
};

const SLOT_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

async function loadTrip(id: string): Promise<Trip | null> {
  const base =
    process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api/v1";
  try {
    const res = await fetch(`${base}/trips/${id}`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function BeijingPreviewPage() {
  const tripId = "6cb30e62-531f-476d-8cb1-56e35a437e86";
  const live = await loadTrip(tripId);
  const trip = (live ?? (fallbackTrip as Trip)) as Trip;
  const fromFallback = !live;

  const days = [...(trip.days || [])].sort((a, b) => a.day_index - b.day_index);

  return (
    <div className="flex-1 pb-16">
      <section className="relative h-[240px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/covers/beijing_hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink)]/85 via-[var(--ink)]/45 to-transparent" />
        <div className="relative site-container h-full flex flex-col justify-end pb-8 text-white">
          <div className="text-[12px] text-white/70 mb-2">
            <Link href="/" className="hover:text-white">
              首页
            </Link>
            <span className="mx-1.5">/</span>
            <span>北京三日游</span>
          </div>
          <h1 className="font-display text-[32px] sm:text-[40px] font-semibold">
            {trip.title || "北京3日游"}
          </h1>
          <p className="text-white/85 text-[14px] mt-2">
            {trip.start_date} 至 {trip.end_date} · {trip.travelers} 人
            {trip.budget_total != null && (
              <> · 预算约 ¥{Math.round(trip.budget_total).toLocaleString()}</>
            )}
          </p>
          {fromFallback && (
            <p className="text-[12px] text-white/60 mt-1">
              已使用本地行程数据（接口暂不可用）
            </p>
          )}
        </div>
      </section>

      <div className="site-container -mt-5 relative z-10">
        <div className="bg-white rounded-2xl border border-[var(--line)] shadow-[var(--shadow)] px-4 py-3 mb-6 flex flex-wrap gap-2">
          {days.map((d) => (
            <a
              key={d.id}
              href={`#day-${d.day_index}`}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-[var(--background)] text-[var(--ink)] hover:bg-[var(--brand)] hover:text-white transition-colors"
            >
              Day {d.day_index}
              <span className="opacity-60 ml-1">{d.date.slice(5)}</span>
            </a>
          ))}
          <Link
            href={`/trips/${trip.id}`}
            className="ml-auto px-4 py-2 rounded-full text-[13px] font-semibold text-[var(--brand)] hover:underline"
          >
            打开完整编辑页 →
          </Link>
        </div>

        <div className="space-y-8">
          {days.map((day) => (
            <section
              key={day.id}
              id={`day-${day.day_index}`}
              className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-4 border-b border-[var(--line)] bg-[var(--background)]/60">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-display text-[22px] font-semibold text-[var(--ink)]">
                    Day {day.day_index}
                  </h2>
                  <span className="text-[13px] text-[var(--muted)]">{day.date}</span>
                </div>
                {day.summary && (
                  <p className="text-[14px] text-[var(--ink)]/75 mt-2 leading-relaxed">
                    {day.summary}
                  </p>
                )}
              </div>

              <ol className="divide-y divide-[var(--line)]">
                {(day.items || [])
                  .filter((it) => it.selected !== false)
                  .map((it, idx) => (
                    <li key={it.id} className="px-5 sm:px-6 py-4 flex gap-4">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] text-[13px] font-bold flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--background)] text-[var(--muted)]">
                            {TYPE_LABEL[it.type] || it.type}
                          </span>
                          {it.time_slot && (
                            <span className="text-[11px] text-[var(--muted)]">
                              {SLOT_LABEL[it.time_slot] || it.time_slot}
                            </span>
                          )}
                          {(it.start_time || it.end_time) && (
                            <span className="text-[11px] text-[var(--muted)]">
                              {[it.start_time, it.end_time]
                                .filter(Boolean)
                                .join(" – ")}
                            </span>
                          )}
                          {it.rating != null && (
                            <span className="text-[11px] text-[var(--brand)] font-semibold">
                              ★ {it.rating}
                            </span>
                          )}
                        </div>
                        <h3 className="text-[16px] font-semibold text-[var(--ink)]">
                          {it.name}
                        </h3>
                        {it.description && (
                          <p className="text-[13px] text-[var(--muted)] mt-1 leading-relaxed">
                            {it.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[var(--muted)]">
                          {it.duration_min != null && (
                            <span>约 {it.duration_min} 分钟</span>
                          )}
                          {it.cost != null && it.cost > 0 && (
                            <span>约 ¥{it.cost}</span>
                          )}
                          {it.transport_to_next && (
                            <span>
                              下一段{" "}
                              {it.transport_to_next.mode || "出行"}
                              {it.transport_to_next.distance_m
                                ? ` · ${Math.round(it.transport_to_next.distance_m / 100) / 10} km`
                                : ""}
                              {it.transport_to_next.duration_s
                                ? ` · ${Math.round(it.transport_to_next.duration_s / 60)} 分`
                                : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>

        {trip.budget_total != null && (
          <div className="mt-8 rounded-2xl bg-[var(--ink)] text-white px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[13px] text-white/60">行程预算估算</div>
              <div className="font-display text-[28px] font-semibold mt-1">
                ¥{Math.round(trip.budget_total).toLocaleString()}
              </div>
            </div>
            <Link
              href={`/generate?dest=${encodeURIComponent(trip.destination)}`}
              className="btn-brand rounded-full px-5 py-2.5 text-[14px]"
            >
              再生成一份
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
