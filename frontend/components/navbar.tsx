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
    <nav className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-2xl">🧭</span>
          <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
            旅行攻略生成器
          </span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link
                href="/generate"
                className={`hover:text-sky-600 ${pathname === "/generate" ? "text-sky-600 font-medium" : ""}`}
              >
                生成攻略
              </Link>
              <Link
                href="/trips"
                className={`hover:text-sky-600 ${pathname.startsWith("/trips") ? "text-sky-600 font-medium" : ""}`}
              >
                我的攻略
              </Link>
              <span className="text-gray-500 hidden sm:inline">{user.nickname}</span>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-500"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-sky-600">
                登录
              </Link>
              <Link
                href="/register"
                className="bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
