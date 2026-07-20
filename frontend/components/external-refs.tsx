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
