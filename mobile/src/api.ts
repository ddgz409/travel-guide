import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createApiClient } from "@travel-guide/shared";

const TOKEN_KEY = "travel_guide_token";

/**
 * 与 Web 共用同一 FastAPI。
 * - Expo Web / iOS 模拟器：127.0.0.1
 * - Android 模拟器：10.0.2.2（指向电脑本机）
 * - 真机：必须设 EXPO_PUBLIC_API_BASE=http://<电脑局域网IP>:8000/api/v1
 */
function defaultApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_BASE) {
    return process.env.EXPO_PUBLIC_API_BASE.replace(/\/$/, "");
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000/api/v1";
  }
  // ios / web
  return "http://127.0.0.1:8000/api/v1";
}

export const apiBase = defaultApiBase();

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
