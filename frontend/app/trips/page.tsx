"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { tripsApi } from "@/lib/api";
import { coverForCity } from "@/lib/cover";
import type { TripListItem, TripStatus } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

const STATUS_BADGE: Record<TripStatus, { label: string; cls: string }> = {
  generating: { label: "生成中", cls: "bg-amber-100 text-amber-800" },
  ready: { label: "已完成", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "失败", cls: "bg-red-100 text-red-700" },
};

function coverFor(dest: string) {
  return coverForCity(dest);
}

export default function TripsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const canFetch = !!user && !authLoading;
  const { data: trips, isLoading, isError, error } = useQuery<TripListItem[]>({
    queryKey: ["trips"],
    queryFn: () => tripsApi.list(),
    retry: 1,
    enabled: canFetch,
  });

  const del = useMutation({
    mutationFn: (id: string) => tripsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });

  const showLoginGate = (!user && (!authLoading || waited));

  if (!showLoginGate && (authLoading || isLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] py-24">
        加载中…
      </div>
    );
  }

  if (showLoginGate) {
    return (
      <div className="flex-1 site-container py-16 text-center">
        <h1 className="font-display text-[28px] font-semibold text-[var(--ink)] mb-2">
          我的攻略
        </h1>
        <p className="text-[var(--muted)] mb-6">登录后可查看和管理你的行程攻略</p>
        <div className="flex justify-center gap-3">
          <Link href="/login" className="btn-brand rounded-full px-6 py-2.5 text-sm">
            去登录
          </Link>
          <Link
            href="/generate"
            className="rounded-full border border-[var(--line)] bg-white px-6 py-2.5 text-sm font-semibold hover:border-[var(--brand)]"
          >
            先去生成
          </Link>
        </div>
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "加载失败";
    return (
      <div className="flex-1 site-container py-16 text-center">
        <h1 className="font-display text-[28px] font-semibold text-[var(--ink)] mb-2">
          我的攻略
        </h1>
        <p className="text-[var(--muted)] mb-6">{msg}</p>
        <Link href="/login" className="btn-brand rounded-full px-6 py-2.5 text-sm">
          重新登录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 site-container py-10">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-[var(--ink)]">
            我的攻略
          </h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            像收藏夹一样管理你的行程
          </p>
        </div>
        <button
          onClick={() => router.push("/generate")}
          className="btn-brand rounded-full px-5 py-2.5 text-sm"
        >
          + 新建攻略
        </button>
      </div>

      {!trips || trips.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-[var(--line)]">
          <p className="text-[var(--muted)] mb-5">还没有攻略，先去生成一份吧</p>
          <Link
            href="/generate"
            className="inline-flex btn-brand rounded-full px-5 py-2.5 font-semibold"
          >
            生成攻略
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((t) => {
            const badge = STATUS_BADGE[t.status];
            return (
              <div
                key={t.id}
                className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden hover:shadow-[var(--shadow)] transition-shadow group"
              >
                <Link href={`/trips/${t.id}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverFor(t.destination)}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span
                      className={`absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-[16px] text-[var(--ink)] group-hover:text-[var(--brand)] transition-colors line-clamp-1">
                      {t.title}
                    </h3>
                    <p className="text-[13px] text-[var(--muted)] mt-1.5">
                      {t.destination} · {t.start_date} 至 {t.end_date} ·{" "}
                      {t.travelers}人
                    </p>
                    {t.budget_total != null && t.status === "ready" && (
                      <p className="text-[13px] font-semibold text-[var(--brand)] mt-2">
                        预算约 ¥{Math.round(t.budget_total).toLocaleString()}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex justify-end px-4 py-2.5 border-t border-[var(--line)]">
                  <button
                    onClick={() => {
                      if (confirm("确定删除这份攻略吗？")) del.mutate(t.id);
                    }}
                    className="text-xs text-[var(--muted)] hover:text-red-500"
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
