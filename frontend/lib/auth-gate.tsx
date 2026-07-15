"use client";

import { useEffect, type ReactNode } from "react";

import { useAuthStore } from "@/stores/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  // 游客模式：不拦截任何页面，登录用户额外有"我的攻略"列表
  return <>{children}</>;
}
