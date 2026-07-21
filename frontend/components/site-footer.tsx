import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-white">
      <div className="site-container py-12 grid sm:grid-cols-3 gap-8 text-[13px] text-[var(--muted)]">
        <div>
          <div className="font-display text-[20px] text-[var(--ink)] mb-2">旅迹</div>
          <p className="leading-relaxed max-w-xs">
            旅游之前，先上旅迹。AI 生成可编辑行程，地图路线与预算一目了然。
          </p>
        </div>
        <div>
          <div className="text-[var(--ink)] font-semibold mb-3">发现</div>
          <ul className="space-y-2">
            <li>
              <Link href="/" className="hover:text-[var(--brand)]">
                热门目的地
              </Link>
            </li>
            <li>
              <Link href="/generate" className="hover:text-[var(--brand)]">
                AI 生成攻略
              </Link>
            </li>
            <li>
              <Link href="/trips" className="hover:text-[var(--brand)]">
                我的攻略
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-[var(--ink)] font-semibold mb-3">关于</div>
          <p className="leading-relaxed">
            灵感参考旅行社区产品形态，数据来自高德与公开百科/天气接口。内容仅供参考。
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--line)] py-4 text-center text-[12px] text-[var(--muted)]">
        © {new Date().getFullYear()} 旅迹 · AI 旅行攻略
      </div>
    </footer>
  );
}
