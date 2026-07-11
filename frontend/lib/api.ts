// 后端 API 客户端：封装所有请求，自动携带 JWT

import type {
  GenerateRequest,
  PoiSearchResult,
  Token,
  Trip,
  TripListItem,
  TripPreferences,
  User,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api/v1";

const TOKEN_KEY = "travel_guide_token";

/** 读取本地存储的 JWT。 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** 保存 / 清除 JWT。 */
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** 自定义错误，携带后端 detail。 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 核心请求函数：自动加 token、处理 JSON 与错误。 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // 401 处理：有 token 说明是过期，无 token 说明是登录失败
  if (res.status === 401) {
    if (token) {
      setToken(null);
      throw new ApiError("登录已过期，请重新登录", 401);
    }
    // 无 token 的 401（如登录/注册失败），按普通错误处理，走下方 !res.ok 分支
  }

  if (!res.ok) {
    let detail = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new ApiError(detail, res.status);
  }

  // 204 无内容
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------- 认证 ----------------

export const authApi = {
  register: (username: string, password: string) =>
    request<Token>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<User>("/auth/me"),
};

// ---------------- 攻略 ----------------

export const tripsApi = {
  /** 搜索景点（供搜索框使用）。 */
  searchPois: (q: string, city: string = "", limit: number = 8) =>
    request<PoiSearchResult[]>(
      `/trips/pois/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&limit=${limit}`
    ),

  generate: (payload: GenerateRequest) =>
    request<Trip>("/trips/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  list: () => request<TripListItem[]>("/trips"),

  get: (id: string) => request<Trip>(`/trips/${id}`),

  update: (id: string, data: { title?: string; preferences?: TripPreferences }) =>
    request<Trip>(`/trips/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateItem: (
    tripId: string,
    itemId: string,
    data: { name?: string; description?: string; duration_min?: number; cost?: number; time_slot?: string; selected?: boolean; poi_id?: string; location?: Record<string, unknown>; rating?: number },
  ) =>
    request<Trip>(`/trips/${tripId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** 切换条目勾选状态（自选编辑：取消/恢复）。 */
  toggleItem: (tripId: string, itemId: string, selected: boolean) =>
    request<Trip>(`/trips/${tripId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify({ selected }),
    }),

  /** 换备选 POI（"换一个"）。altIndex 为备选列表中的序号。 */
  swapItem: (tripId: string, itemId: string, altIndex: number) =>
    request<Trip>(`/trips/${tripId}/items/${itemId}/swap?alt_index=${altIndex}`, {
      method: "POST",
    }),

  /** 批量重排序（拖拽排序）。 */
  reorderItems: (tripId: string, dayId: string, items: { item_id: string; new_seq: number }[]) =>
    request<Trip>(`/trips/${tripId}/days/${dayId}/reorder`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  regenerateDay: (tripId: string, dayIndex: number) =>
    request<Trip>(`/trips/${tripId}/regenerate-day/${dayIndex}`, { method: "POST" }),

  createShare: (tripId: string) =>
    request<Trip>(`/trips/${tripId}/share`, { method: "POST" }),

  getShared: (token: string) => request<Trip>(`/trips/share/${token}`),

  remove: (tripId: string) =>
    request<void>(`/trips/${tripId}`, { method: "DELETE" }),

  /** 导出 PDF：返回 blob 供前端下载。 */
  exportPdf: async (tripId: string): Promise<Blob> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/trips/${tripId}/export`, { headers });
    if (!res.ok) {
      throw new ApiError(`导出失败 (${res.status})`, res.status);
    }
    return res.blob();
  },
};
