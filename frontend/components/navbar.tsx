"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth";

const LINKS = [
  { href: "/", label: "首页" },
  { href: "/generate", label: "去旅行" },
  { href: "/trips", label: "我的攻略", auth: true },
  { href: "/settings", label: "设置", auth: true },
];

export function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--line)]">
      <div className="site-container flex items-center h-[62px] gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0 mr-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white text-sm font-bold">
            迹
          </span>
          <span className="font-display text-[22px] font-semibold text-[var(--ink)] tracking-wide">
            旅迹
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-[15px]">
          {LINKS.filter((l) => !l.auth || user).map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3.5 py-2 rounded-md transition-colors ${
                  active
                    ? "text-[var(--brand)] font-semibold"
                    : "text-[var(--ink)]/80 hover:text-[var(--brand)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link
            href="/generate"
            className="hidden sm:inline-flex btn-brand rounded-full px-4 py-1.5 text-[13px]"
          >
            写攻略 / AI 生成
          </Link>
          {user ? (
            <>
              <span className="text-[var(--muted)] hidden sm:inline max-w-[100px] truncate">
                {user.username}
              </span>
              <button
                onClick={handleLogout}
                className="text-[var(--muted)] hover:text-[var(--brand)]"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[var(--ink)]/80 hover:text-[var(--brand)]"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="btn-brand rounded-full px-4 py-1.5 text-[13px]"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
