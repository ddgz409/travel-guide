/** 城市/景点打卡记录（本地 AsyncStorage，离线可用） */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  resolvePrefectureFromText,
  resolvePrefectureId,
} from "../assets/cityToPrefecture";
import type { ExploreCategory } from "../screens/CityDetail/helpers";

const KEY = "travel_guide_checkins:v2";
const LEGACY_KEY = "travel_guide_checkins:v1";

export type CheckInRecord = {
  id: string;
  city: string;
  name: string;
  category: ExploreCategory;
  prefectureId: string;
  checkedAt: string;
  lng?: number;
  lat?: number;
  address?: string;
};

type Store = { items: CheckInRecord[] };

function makeId(city: string, name: string): string {
  return `${city.trim()}::${name.trim()}`;
}

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Store;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function migrateLegacyIfNeeded(): Promise<void> {
  const current = await readStore();
  if (current.items.length > 0) return;
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as { items?: Array<Record<string, unknown>> };
    const items: CheckInRecord[] = [];
    for (const row of legacy.items || []) {
      const city = String(row.city || "").trim();
      const name = String(row.name || "").trim();
      if (!city || !name) continue;
      const prefectureId = resolvePrefectureId(city);
      if (!prefectureId) continue;
      items.push({
        id: makeId(city, name),
        city,
        name,
        category: (row.category as ExploreCategory) || "spots",
        prefectureId,
        checkedAt: String(row.checkedAt || new Date().toISOString()),
        lng: row.lng as number | undefined,
        lat: row.lat as number | undefined,
        address: row.address as string | undefined,
      });
    }
    if (items.length > 0) {
      await AsyncStorage.setItem(KEY, JSON.stringify({ items }));
    }
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>();

export function subscribeCheckIns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitCheckIns() {
  listeners.forEach((fn) => fn());
}

async function writeStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
  emitCheckIns();
}

export async function listCheckIns(): Promise<CheckInRecord[]> {
  await migrateLegacyIfNeeded();
  const store = await readStore();
  return [...store.items].sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
  );
}

export async function getCheckedPrefectureIds(): Promise<string[]> {
  const items = await listCheckIns();
  return [...new Set(items.map((x) => x.prefectureId).filter(Boolean))];
}

export async function isCheckedIn(city: string, name: string): Promise<boolean> {
  await migrateLegacyIfNeeded();
  const id = makeId(city, name);
  const store = await readStore();
  return store.items.some((x) => x.id === id);
}

export type AddCheckInInput = {
  city: string;
  name: string;
  category: ExploreCategory;
  lng?: number;
  lat?: number;
  address?: string;
};

export async function addCheckIn(input: AddCheckInInput): Promise<CheckInRecord> {
  const name = input.name.trim();
  let city = input.city.trim();
  let prefectureId = resolvePrefectureId(city);
  if (!prefectureId) {
    const hit = resolvePrefectureFromText(
      `${city} ${input.address || ""} ${name}`,
    );
    if (hit) {
      prefectureId = hit.id;
      city = hit.city;
    }
  }
  if (!prefectureId) {
    throw new Error(`无法识别「${city || name}」所属地级市，暂无法打卡`);
  }

  const record: CheckInRecord = {
    id: makeId(city, name),
    city,
    name,
    category: input.category,
    prefectureId,
    checkedAt: new Date().toISOString(),
    lng: input.lng,
    lat: input.lat,
    address: input.address,
  };

  await migrateLegacyIfNeeded();
  const store = await readStore();
  const idx = store.items.findIndex((x) => x.id === record.id);
  if (idx >= 0) {
    store.items[idx] = record;
  } else {
    store.items.unshift(record);
  }
  await writeStore(store);
  return record;
}

export async function removeCheckIn(city: string, name: string): Promise<void> {
  await migrateLegacyIfNeeded();
  const id = makeId(city, name);
  const store = await readStore();
  store.items = store.items.filter((x) => x.id !== id);
  await writeStore(store);
}
