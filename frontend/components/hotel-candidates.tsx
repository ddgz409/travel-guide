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
      <h3 className="font-semibold text-sm mb-2">携程酒店优选</h3>
      {stale ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2 mb-3">
          酒店数据未更新，已使用地图住宿数据
        </p>
      ) : null}
      {!list.length ? (
        <p className="text-sm text-gray-400">暂无携程酒店候选</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 8).map((h) => (
            <li key={h.url || h.name} className="text-sm">
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
