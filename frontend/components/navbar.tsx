"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth";

export function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-5 flex items-center" style={{ height: 60 }}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 mr-8">
          <span className="text-2xl">🐝</span>
          <span className="text-[20px] font-bold text-[#ff9d00]">旅行攻略</span>
        </Link>

        {/* 菜单 */}
        <nav className="flex items-center gap-1 text-[15px]">
          <Link
            href="/"
            className={`px-4 py-2 transition-colors ${pathname === "/" ? "text-[#ff9d00] font-medium" : "text-[#333] hover:text-[#ff9d00]"}`}
          >
            首页
          </Link>
          <Link
            href="/generate"
            className={`px-4 py-2 transition-colors ${pathname === "/generate" ? "text-[#ff9d00] font-medium" : "text-[#333] hover:text-[#ff9d00]"}`}
          >
            生成攻略
          </Link>
          {user && (
            <Link
              href="/trips"
              className={`px-4 py-2 transition-colors ${pathname.startsWith("/trips") ? "text-[#ff9d00] font-medium" : "text-[#333] hover:text-[#ff9d00]"}`}
            >
              我的攻略
            </Link>
          )}
        </nav>

        {/* 右侧用户区 */}
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="text-[#666] hidden sm:inline">{user.username}</span>
              <button
                onClick={handleLogout}
                className="text-[#999] hover:text-[#ff9d00] transition-colors"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <span className="text-[#999] text-[13px] hidden sm:inline">游客模式</span>
              <Link href="/login" className="text-[#666] hover:text-[#ff9d00] transition-colors">
                登录
              </Link>
              <Link
                href="/register"
                className="bg-[#ff9d00] text-white px-4 py-1.5 rounded hover:bg-[#ff8a00] transition-colors text-[13px]"
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
