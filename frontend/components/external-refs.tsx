"use client";

import type { ExternalRefs, ExternalTip } from "@/lib/types";

function TipList({ tips, empty }: { tips: ExternalTip[]; empty: string }) {
  if (!tips?.length) {
    return <p className="text-sm text-gray-400">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {tips.map((t) => (
        <li key={t.url} className="text-sm">
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-orange-600 hover:underline"
          >
            {t.title}
          </a>
          {t.snippet ? (
            <p className="text-gray-500 mt-0.5 line-clamp-2">{t.snippet}</p>
          ) : null}
          {t.meta && (t.meta.rating || t.meta.price || t.meta.likes) ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {[t.meta.rating && `评分 ${t.meta.rating}`, t.meta.price && `参考价 ${t.meta.price}`, t.meta.likes && `热度 ${t.meta.likes}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ExternalRefsPanel({ refs }: { refs?: ExternalRefs | null }) {
  const xhs = refs?.xiaohongshu ?? [];
  const ctrip = refs?.ctrip ?? [];
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <section className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="font-semibold text-sm mb-3">小红书参考</h3>
        <TipList tips={xhs} empty="暂无参考" />
      </section>
      <section className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="font-semibold text-sm mb-3">携程参考</h3>
        <TipList tips={ctrip} empty="暂无参考" />
      </section>
    </div>
  );
}
