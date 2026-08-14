import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "travel_guide_footprint_search:v1";
const LIMIT = 16;

export type FootprintHistoryItem = {
  name: string;
  address?: string;
  city?: string;
  lng?: number;
  lat?: number;
};

async function read(): Promise<FootprintHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FootprintHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listFootprintHistory(): Promise<FootprintHistoryItem[]> {
  return read();
}

export async function pushFootprintHistory(
  item: FootprintHistoryItem,
): Promise<void> {
  const name = item.name.trim();
  if (!name) return;
  const prev = await read();
  const next = [
    item,
    ...prev.filter(
      (x) => !(x.name === name && (x.address || "") === (item.address || "")),
    ),
  ].slice(0, LIMIT);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function clearFootprintHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
