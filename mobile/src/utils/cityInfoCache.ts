/** 城市探索搜索结果本地缓存（AsyncStorage） */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CityInfo } from "@travel-guide/shared";

// v3：城市信息结构升级（美食改菜名、景点/人文全量），弃用旧版稀疏缓存
const PREFIX = "city_info:v3:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { at: number; data: CityInfo };

function key(city: string) {
  return PREFIX + city.trim();
}

export async function getCachedCityInfo(city: string): Promise<CityInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(key(city));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (Date.now() - entry.at > TTL_MS) {
      await AsyncStorage.removeItem(key(city));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedCityInfo(city: string, data: CityInfo): Promise<void> {
  try {
    const entry: Entry = { at: Date.now(), data };
    await AsyncStorage.setItem(key(city), JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}
