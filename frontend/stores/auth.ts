// 认证状态管理（Zustand）

import { create } from "zustand";

import { authApi, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean; // 初始化时拉取用户信息
  error: string | null;
  /** 应用启动时调用：若有 token 则拉取用户。 */
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  init: async () => {
    const token = getToken();
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const token = await authApi.login(username, password);
      setToken(token.access_token);
      set({ user: token.user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "登录失败" });
      throw e;
    }
  },

  register: async (username, password) => {
    set({ error: null });
    try {
      const token = await authApi.register(username, password);
      setToken(token.access_token);
      set({ user: token.user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "注册失败" });
      throw e;
    }
  },

  logout: () => {
    setToken(null);
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
