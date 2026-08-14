/** 跨端 API 客户端：Web / React Native 注入 token 存储与 API Base */

import type {
  ChatLlmOverride,
  ChatMessage,
  CityInfo,
  CityInfoStreamEvent,
  PlaceImagesResult,
  DayRoutesResult,
  GenerateRequest,
  GenerateProgressEvent,
  OptimizePlanQueryRequest,
  OptimizePlanQueryResponse,
  AndroidUpdateInfo,
  LlmSettings,
  LlmSettingsUpdate,
  PoiSearchResult,
  QuickRecommendResponse,
  ValidateDestinationResult,
  RegeoResult,
  Token,
  Trip,
  TripListItem,
  TripPreferences,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface TokenStore {
  getToken: () => string | null | Promise<string | null>;
  setToken: (token: string | null) => void | Promise<void>;
}

export interface CreateApiClientOptions {
  apiBase: string;
  tokenStore: TokenStore;
  defaultTimeoutMs?: number;
}

function makeTimeoutSignal(ms: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      return AbortSignal.timeout(ms);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function createApiClient(opts: CreateApiClientOptions) {
  const { apiBase, tokenStore, defaultTimeoutMs = 20000 } = opts;

  async function request<T>(
    path: string,
    options: RequestInit & { timeoutMs?: number } = {},
  ): Promise<T> {
    const token = await tokenStore.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const { timeoutMs = defaultTimeoutMs, ...fetchOpts } = options;
    let res: Response;
    try {
      res = await fetch(`${apiBase}${path}`, {
        ...fetchOpts,
        headers,
        signal: fetchOpts.signal ?? makeTimeoutSignal(timeoutMs),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ApiError("请求超时，请稍后重试", 408);
      }
      throw new ApiError("无法连接服务器，请确认后端已启动", 0);
    }

    if (res.status === 401 && token) {
      await tokenStore.setToken(null);
      throw new ApiError("登录已过期，请重新登录", 401);
    }

    if (!res.ok) {
      let detail = `请求失败 (${res.status})`;
      try {
        const data = await res.json();
        if (data.detail) {
          detail =
            typeof data.detail === "string"
              ? data.detail
              : JSON.stringify(data.detail);
        }
      } catch {
        /* ignore */
      }
      throw new ApiError(detail, res.status);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    request,
    app: {
      androidUpdate: () =>
        request<AndroidUpdateInfo>("/app/android-update"),
    },
    auth: {
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
      getLlmSettings: () => request<LlmSettings>("/auth/me/llm"),
      updateLlmSettings: (payload: LlmSettingsUpdate) =>
        request<LlmSettings>("/auth/me/llm", {
          method: "PUT",
          body: JSON.stringify(payload),
        }),
    },
    trips: {
      searchPois: (
        q: string,
        city = "",
        limit = 8,
        broad = false,
        coords?: { lng: number; lat: number } | null,
      ) => {
        let url = `/trips/pois/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&limit=${limit}${broad ? "&broad=1" : ""}`;
        if (coords?.lng != null && coords?.lat != null) {
          url += `&lng=${coords.lng}&lat=${coords.lat}`;
        }
        return request<PoiSearchResult[]>(url);
      },
      suggestLandmarks: (city: string) =>
        request<{ city: string; landmarks: string[] }>(
          `/trips/pois/suggest?city=${encodeURIComponent(city)}`,
        ),
      list: () => request<TripListItem[]>("/trips"),
      get: (id: string) => request<Trip>(`/trips/${id}`),
      generate: (payload: GenerateRequest) =>
        request<Trip>("/trips/generate", {
          method: "POST",
          body: JSON.stringify(payload),
          timeoutMs: 60000,
        }),
      guestGenerate: (payload: GenerateRequest) =>
        request<Trip>("/trips/guest-generate", {
          method: "POST",
          body: JSON.stringify(payload),
          timeoutMs: 60000,
        }),
      update: (
        id: string,
        data: { title?: string; preferences?: TripPreferences },
      ) =>
        request<Trip>(`/trips/${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      updateItem: (
        tripId: string,
        itemId: string,
        data: Record<string, unknown>,
      ) =>
        request<Trip>(`/trips/${tripId}/items/${itemId}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      toggleItem: (tripId: string, itemId: string, selected: boolean) =>
        request<Trip>(`/trips/${tripId}/items/${itemId}`, {
          method: "PUT",
          body: JSON.stringify({ selected }),
        }),
      swapItem: (tripId: string, itemId: string, altIndex: number) =>
        request<Trip>(
          `/trips/${tripId}/items/${itemId}/swap?alt_index=${altIndex}`,
          { method: "POST" },
        ),
      reorderItems: (
        tripId: string,
        dayId: string,
        items: { item_id: string; new_seq: number }[],
      ) =>
        request<Trip>(`/trips/${tripId}/days/${dayId}/reorder`, {
          method: "PUT",
          body: JSON.stringify({ items }),
        }),
      quickRecommend: (destination: string) =>
        request<QuickRecommendResponse>("/trips/quick-recommend", {
          method: "POST",
          body: JSON.stringify({ destination }),
          timeoutMs: 15000,
        }),
      validateDestination: async (destination: string) => {
        const trimmed = destination.trim();
        const optimistic = (): ValidateDestinationResult => ({
          valid: trimmed.length >= 2,
          message: trimmed.length >= 2 ? "" : "请输入目的地",
          resolved_name: trimmed.length >= 2 ? trimmed : null,
          suggestions: [],
        });
        try {
          return await request<ValidateDestinationResult>(
            "/trips/validate-destination",
            {
              method: "POST",
              body: JSON.stringify({ destination: trimmed }),
              timeoutMs: 12000,
            },
          );
        } catch (e) {
          if (!(e instanceof ApiError) || (e.status !== 405 && e.status !== 404)) {
            throw e;
          }
          try {
            return await request<ValidateDestinationResult>(
              `/trips/validate-destination?destination=${encodeURIComponent(trimmed)}`,
              { timeoutMs: 12000 },
            );
          } catch {
            // 旧版后端无独立校验接口；生成时仍会校验地名
            return optimistic();
          }
        }
      },
      getDayRoutes: (tripId: string, dayId: string, mode: string) =>
        request<DayRoutesResult>(
          `/trips/${tripId}/map-routes/${dayId}?mode=${encodeURIComponent(mode)}`,
          { timeoutMs: 90000 },
        ),
      getItemRoute: (tripId: string, itemId: string, mode?: string) =>
        request<Record<string, unknown>>(
          `/trips/${tripId}/items/${itemId}/route${
            mode ? `?mode=${encodeURIComponent(mode)}` : ""
          }`,
        ),
      updateItemRoute: (
        tripId: string,
        itemId: string,
        payload: { mode: string; scheme_index?: number },
      ) =>
        request<Record<string, unknown>>(
          `/trips/${tripId}/items/${itemId}/route`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        ),
      regenerateDay: (tripId: string, dayIndex: number) =>
        request<Trip>(`/trips/${tripId}/regenerate-day/${dayIndex}`, {
          method: "POST",
        }),
      selectRoute: (tripId: string, routeId: string) =>
        request<Trip>(
          `/trips/${tripId}/select-route/${encodeURIComponent(routeId)}`,
          { method: "POST" },
        ),
      createShare: (tripId: string, mode: "read" | "collab" = "read") =>
        request<Trip>(`/trips/${tripId}/share`, {
          method: "POST",
          body: JSON.stringify({ mode }),
        }),
      getShared: (token: string) =>
        request<Trip>(`/trips/share/${token}`),
      joinShare: (token: string) =>
        request<Trip>(`/trips/share/${token}/join`, { method: "POST" }),
      remove: (tripId: string) =>
        request<void>(`/trips/${tripId}`, { method: "DELETE" }),
      exportPdf: async (tripId: string): Promise<ArrayBuffer> => {
        const token = await tokenStore.getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${apiBase}/trips/${tripId}/export`, {
          headers,
          signal: makeTimeoutSignal(60000),
        });
        if (!res.ok) throw new ApiError(`导出失败 (${res.status})`, res.status);
        return res.arrayBuffer();
      },
      generateStream: async (tripId: string): Promise<Response> => {
        const token = await tokenStore.getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${apiBase}/trips/${tripId}/generate-stream`, {
          headers,
        });
      },
      generateProgress: (tripId: string) =>
        request<GenerateProgressEvent>(`/trips/${tripId}/progress`, {
          timeoutMs: 8000,
        }),
    },
    chat: {
      /**
       * 流式聊天：返回原始 Response（SSE 流），前端用 reader 逐块读。
       * 不走通用 request<T> 封装，因为返回的不是 JSON 而是 text/event-stream。
       */
      stream: async (
        messages: ChatMessage[],
        llm?: ChatLlmOverride | null,
        tripId?: string | null,
      ): Promise<Response> => {
        const token = await tokenStore.getToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${apiBase}/chat/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages,
            llm: llm || null,
            trip_id: tripId || null,
          }),
        });
      },
      optimizePlanQuery: (
        payload: OptimizePlanQueryRequest,
        llm?: ChatLlmOverride | null,
      ) =>
        request<OptimizePlanQueryResponse>("/chat/optimize-plan-query", {
          method: "POST",
          body: JSON.stringify({ ...payload, llm: llm ?? null }),
          timeoutMs: 45000,
        }),
    },
    destinations: {
      info: (city: string) =>
        request<CityInfo>(
          `/destinations/info?city=${encodeURIComponent(city)}`,
          { timeoutMs: 90000 },
        ),
      /** 流式搜索城市真实信息（SSE），返回 URL 与鉴权头供 readSSE 使用 */
      infoStream: async (city: string) => {
        const token = await tokenStore.getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return {
          url:
            `${apiBase}/destinations/info-stream?city=` +
            `${encodeURIComponent(city)}`,
          headers,
        };
      },
      regeo: (lng: number, lat: number) =>
        request<RegeoResult>(
          `/destinations/regeo?lng=${lng}&lat=${lat}`,
        ),
      placeImages: (
        city: string,
        name: string,
        kind: "" | "foods" | "spots" = "",
        limit = 3,
      ) =>
        request<PlaceImagesResult>(
          `/destinations/place-images?city=${encodeURIComponent(city)}` +
            `&name=${encodeURIComponent(name)}` +
            `&kind=${encodeURIComponent(kind)}` +
            `&limit=${limit}`,
          { timeoutMs: 35000 },
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
