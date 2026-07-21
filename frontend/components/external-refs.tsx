"use client";

import type { ExternalRefs, ExternalTip } from "@/lib/types";

function openTip(t: ExternalTip, e: React.MouseEvent) {
  e.preventDefault();
  const web = t.url;
  const app = t.meta?.app_url;
  const keyword = t.meta?.keyword || t.title;
  const isXhs =
    t.source === "xiaohongshu" || /xiaohongshu\.com/i.test(web || "");

  if (isXhs && app) {
    // 先尝试唤起 App；仍留在浏览器再打开网页
    window.location.href = app;
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.open(
          web ||
            `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
    }, 1200);
    return;
  }

  if (web) window.open(web, "_blank", "noopener,noreferrer");
}

function TipList({ tips, empty }: { tips: ExternalTip[]; empty: string }) {
  if (!tips?.length) {
    return (
      <p className="text-sm text-gray-400">
        {empty}
        <span className="block mt-1 text-xs">
          可点链接打开小红书 App 或网页搜索。
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
            onClick={(e) => openTip(t, e)}
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
