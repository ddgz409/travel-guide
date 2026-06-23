"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

import { useAuthStore } from "@/stores/auth";

// 受保护路径前缀
const PROTECTED = ["/generate", "/trips"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, init } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    init();
  }, [init]);

  // 未登录访问受保护页则跳登录
  useEffect(() => {
    if (loading) return;
    const isProtected = PROTECTED.some((p) => pathname?.startsWith(p));
    if (isProtected && !user) {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  return <>{children}</>;
}
