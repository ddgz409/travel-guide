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
    <nav className="border-b border-gray-200/80 bg-white/85 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 h-15 flex items-center justify-between" style={{ height: 60 }}>
        <Link href="/" className="flex items-center gap-2 font-extrabold text-lg">
          <span className="text-2xl">🧭</span>
          <span className="bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text text-transparent">
            旅行攻略
          </span>
        </Link>

        <div className="flex items-center gap-5 text-sm font-semibold">
          {user ? (
            <>
              <Link
                href="/generate"
                className={`hover:text-sky-600 transition-colors ${pathname === "/generate" ? "text-sky-600" : "text-gray-700"}`}
              >
                生成攻略
              </Link>
              <Link
                href="/trips"
                className={`hover:text-sky-600 transition-colors ${pathname.startsWith("/trips") ? "text-sky-600" : "text-gray-700"}`}
              >
                我的攻略
              </Link>
              <span className="text-gray-700 hidden sm:inline">{user.nickname}</span>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-red-500 transition-colors font-medium"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-700 hover:text-sky-600 transition-colors">
                登录
              </Link>
              <Link
                href="/register"
                className="bg-sky-500 text-white px-4 py-2 rounded-xl hover:bg-sky-600 transition-colors shadow-sm"
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
