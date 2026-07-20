"use client";

import type { ExternalRefs, ExternalTip } from "@/lib/types";

function TipList({ tips, empty }: { tips: ExternalTip[]; empty: string }) {
  if (!tips?.length) {
    return (
      <p className="text-sm text-gray-400">
        {empty}
        <span className="block mt-1 text-xs">
          站点反爬较强时可能抓不到公开笔记，可稍后重新生成重试。
        </span>
      </p>
    );
  }
  const isPortal = tips.every((t) => t.meta && (t.meta as { portal?: boolean }).portal);
  return (
    <div>
      {isPortal ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mb-2">
          未能抓取到公开笔记正文，已提供平台搜索入口（可点开查看）
        </p>
      ) : null}
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
    </div>
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
