/** 地点图片：后端从小红书笔记抓取真实封面，带内存/磁盘缓存 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

export type PlaceCategory = "spots" | "foods" | "humanities";

const memCache = new Map<string, string[]>();
const STORAGE_PREFIX = "place_img:xhs:v1:";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function cacheKey(city: string, name: string, limit: number, category?: PlaceCategory) {
  return `${city.trim()}|${name.trim()}|${limit}|${category || ""}`;
}

async function loadDiskCache(key: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const { at, urls } = JSON.parse(raw) as { at: number; urls: string[] };
    if (Date.now() - at > TTL_MS) return null;
    return urls.length > 0 ? urls : null;
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
  if (images && images.length > 0) return images.slice(0, limit);
  if (image) return [image];
  return null;
}

/** 按城市 + 名称拉取最多 limit 张小红书封面图 */
export async function fetchPlaceImages(
  city: string,
  name: string,
  limit = 3,
  category?: PlaceCategory,
  provided?: { image?: string; images?: string[] },
): Promise<string[]> {
  const providedUrls = fromProvided(provided?.image, provided?.images, limit);
  if (providedUrls && providedUrls.length >= limit) {
    return providedUrls.slice(0, limit);
  }

  const key = cacheKey(city, name, limit, category);
  if (memCache.has(key)) return memCache.get(key)!;

  const disk = await loadDiskCache(key);
  if (disk && disk.length > 0) {
    memCache.set(key, disk);
    return disk;
  }

  if (providedUrls && providedUrls.length > 0) {
    memCache.set(key, providedUrls);
    void saveDiskCache(key, providedUrls);
    return providedUrls;
  }

  try {
    const result = await api.destinations.placeImages(
      city,
      name,
      category || "",
      limit,
    );
    const urls = (result.images || []).filter(Boolean);
    if (urls.length > 0) {
      memCache.set(key, urls);
      void saveDiskCache(key, urls);
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
): Promise<string | null> {
  const providedOne = fromProvided(provided?.image, provided?.images, 1);
  if (providedOne?.[0]) return providedOne[0];

  const imgs = await fetchPlaceImages(city, name, 1, category, provided);
  return imgs[0] ?? null;
}
