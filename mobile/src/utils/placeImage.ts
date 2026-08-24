/** 地点图片：后端优先高德 POI 实景图；经后端代理加载 autonavi CDN */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, apiBase } from "../api/client";

export type PlaceCategory = "spots" | "foods" | "humanities";

const memCache = new Map<string, string[]>();
const STORAGE_PREFIX = "place_img:amap:v3:";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function normalizeImageUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

/** 高德 CDN 走自家后端代理，避免 App 直连失败 */
export function resolveImageUrl(url: string): string {
  const u = normalizeImageUrl(url);
  if (u.startsWith("/static/")) {
    // 后端 /static 挂在根路径（无 /api/v1 前缀），需剥离 apiBase 的版本前缀
    const origin = apiBase.replace(/\/api\/v\d+\/?$/, "");
    const encoded = encodeURI(u);
    return `${origin}${encoded}`;
  }
  if (/autonavi\.com|\.amap\.com/i.test(u) && !u.includes("/destinations/img")) {
    return `${apiBase}/destinations/img?url=${encodeURIComponent(u)}`;
  }
  return u;
}

function cacheKey(
  city: string,
  name: string,
  limit: number,
  category?: PlaceCategory,
  poiId?: string,
) {
  return `${city.trim()}|${name.trim()}|${limit}|${category || ""}|${poiId || ""}`;
}

async function loadDiskCache(key: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const { at, urls } = JSON.parse(raw) as { at: number; urls: string[] };
    if (Date.now() - at > TTL_MS) return null;
    const cleaned = urls.map(normalizeImageUrl).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

async function saveDiskCache(key: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await AsyncStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ at: Date.now(), urls }),
    );
  } catch {
    /* ignore */
  }
}

function fromProvided(
  image?: string,
  images?: string[],
  limit = 3,
): string[] | null {
  const list = (images && images.length > 0 ? images : image ? [image] : [])
    .map(normalizeImageUrl)
    .filter(Boolean);
  if (list.length === 0) return null;
  return list.slice(0, limit);
}

function finalizeUrls(urls: string[]): string[] {
  return urls.map(resolveImageUrl).filter(Boolean);
}

/** 按城市 + 名称拉取最多 limit 张封面图（高德优先） */
export async function fetchPlaceImages(
  city: string,
  name: string,
  limit = 3,
  category?: PlaceCategory,
  provided?: { image?: string; images?: string[] },
  poiId?: string,
): Promise<string[]> {
  const providedUrls = fromProvided(provided?.image, provided?.images, limit);
  if (providedUrls && providedUrls.length >= limit) {
    return finalizeUrls(providedUrls.slice(0, limit));
  }

  const key = cacheKey(city, name, limit, category, poiId);
  if (memCache.has(key)) return memCache.get(key)!;

  const disk = await loadDiskCache(key);
  if (disk && disk.length > 0) {
    const resolved = finalizeUrls(disk);
    memCache.set(key, resolved);
    return resolved;
  }

  if (providedUrls && providedUrls.length > 0) {
    const resolved = finalizeUrls(providedUrls);
    memCache.set(key, resolved);
    void saveDiskCache(key, providedUrls);
    return resolved;
  }

  try {
    const result = await api.destinations.placeImages(
      city,
      name,
      category || "",
      limit,
      poiId || "",
    );
    const raw = (result.images || [])
      .map((u) => normalizeImageUrl(String(u || "")))
      .filter(Boolean);
    if (raw.length > 0) {
      const urls = finalizeUrls(raw);
      memCache.set(key, urls);
      void saveDiskCache(key, raw);
      return urls;
    }
  } catch {
    /* 网络失败时返回空，由 UI 显示占位 */
  }

  return [];
}

export async function fetchPlaceImage(
  city: string,
  name: string,
  category?: PlaceCategory,
  provided?: { image?: string; images?: string[] },
  poiId?: string,
): Promise<string | null> {
  const providedOne = fromProvided(provided?.image, provided?.images, 1);
  if (providedOne?.[0]) return resolveImageUrl(providedOne[0]);

  const imgs = await fetchPlaceImages(city, name, 1, category, provided, poiId);
  return imgs[0] ?? null;
}
