"use client";

import type { HotelCandidate, HotelFetchStatus } from "@/lib/types";

export function HotelCandidatesPanel({
  status,
  candidates,
}: {
  status?: HotelFetchStatus | null;
  candidates?: HotelCandidate[] | null;
}) {
  const list = candidates ?? [];
  const stale = status === "amap_only";

  return (
    <section className="border border-gray-200 rounded-lg p-4 bg-white mb-6">
      <h3 className="font-semibold text-sm mb-2">酒店优选（靠近景点 · 交通最短）</h3>
      <p className="text-xs text-gray-500 mb-2">
        已按到主要景点的距离排序，列表越靠前越好；行程会优先选用最近的一家。
      </p>
      {stale ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2 mb-3">
          酒店数据未更新，已使用地图住宿数据并按距离重排
        </p>
      ) : null}
      {!list.length ? (
        <p className="text-sm text-gray-400">暂无酒店候选</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 8).map((h, idx) => (
            <li key={h.url || h.name} className="text-sm">
              <span className="text-xs text-gray-400 mr-1">#{idx + 1}</span>
              {h.url ? (
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-orange-600 hover:underline"
                >
                  {h.name}
                </a>
              ) : (
                <span className="font-medium">{h.name}</span>
              )}
              {typeof h.avg_dist_m === "number" ? (
                <span className="text-xs text-emerald-600 ml-2">
                  距景点约 {(h.avg_dist_m / 1000).toFixed(1)} km
                </span>
              ) : null}
              {h.tags?.length ? (
                <p className="text-xs text-gray-400 mt-0.5">{h.tags.join(" · ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
