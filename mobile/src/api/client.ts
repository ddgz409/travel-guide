import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiClient } from "@travel-guide/shared";
import { getApiBase } from "./config";

const TOKEN_KEY = "travel_guide_token";

/**
 * 与 Web 共用同一 FastAPI。
 * 优先级：EXPO_PUBLIC_API_BASE -> app.config extra.apiBase -> 生产服务器兜底。
 * 注意：不要回退到 127.0.0.1 / 10.0.2.2，否则真机会连不上后端。
 */
export const apiBase = getApiBase().replace(/\/$/, "");

/** http://host:8000 —— 用于 /health */
export const serverOrigin = apiBase.replace(/\/api\/v1\/?$/, "");

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export const api = createApiClient({
  apiBase,
  tokenStore: {
    getToken: getStoredToken,
    setToken: setStoredToken,
  },
});

export async function checkApiHealth(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const res = await fetch(`${serverOrigin}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, message: `后端异常 (${res.status})` };
    }
    return { ok: true, message: "API 已连接" };
  } catch {
    return {
      ok: false,
      message: `连不上后端：${serverOrigin}`,
    };
  }
}
