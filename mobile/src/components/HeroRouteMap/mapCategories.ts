import type {
  CityFood,
  CityInfo,
  CitySpot,
  Item,
  PoiSearchResult,
} from "@travel-guide/shared";
import { api } from "../../api/client";
import { cityCoord, itemCoord } from "../../screens/CityDetail/helpers";
import { getCachedCityInfo } from "../../utils/cityInfoCache";
import type { MapMarker } from "../../utils/amapHtml";

export type TripMapCategory =
  | "attraction"
  | "food"
  | "drink"
  | "shopping"
  | "hotel";

export type MapCategoryFilter = TripMapCategory | "all";

/** 内存中保留的 POI 上限；地图每屏只渲染 VIEWPORT_MARKER_LIMIT 个 */
export const MAX_CATEGORY_MARKERS = 120;
export const VIEWPORT_MARKER_LIMIT = 20;

export const TRIP_MAP_CATEGORIES: {
  id: TripMapCategory;
  label: string;
  icon: string;
  color: string;
  search: string;
}[] = [
  { id: "attraction", label: "景点", icon: "🌳", color: "#4CAF50", search: "景点" },
  { id: "food", label: "美食", icon: "🍴", color: "#FFC107", search: "美食" },
  { id: "drink", label: "饮品", icon: "🥤", color: "#FF9800", search: "咖啡" },
  { id: "shopping", label: "购物", icon: "🛍", color: "#E91E63", search: "购物" },
  { id: "hotel", label: "住宿", icon: "🏨", color: "#2196F3", search: "酒店" },
];

const CATEGORY_SEARCH_QUERIES: Record<TripMapCategory, string[]> = {
  attraction: ["景点", "博物馆"],
  food: ["美食", "餐厅"],
  drink: ["咖啡", "奶茶"],
  shopping: ["购物", "商场"],
  hotel: ["酒店", "民宿"],
};

const SEARCH_LIMIT = 30;

const DRINK_RE =
  /咖啡|奶茶|茶室|茶馆|酒吧|饮品|果汁|酒馆|cocktail|tea|coffee|清吧|柠檬茶/i;
const SHOP_RE = /购物|商场|百货|免税|市集|奥特莱斯|商业街|mall/i;

export function isDrinkItem(text: string): boolean {
  return DRINK_RE.test(text);
}

export function itemMatchesCategory(
  item: Item,
  category: TripMapCategory,
): boolean {
  const text = `${item.name} ${item.description || ""}`;
  switch (category) {
    case "attraction":
      return item.type === "attraction";
    case "hotel":
      return item.type === "hotel";
    case "food":
      return item.type === "meal" && !isDrinkItem(text);
    case "drink":
      return item.type === "meal" && isDrinkItem(text);
    case "shopping":
      return SHOP_RE.test(text);
    default:
      return false;
  }
}

export function categoryMeta(category: TripMapCategory) {
  return TRIP_MAP_CATEGORIES.find((c) => c.id === category)!;
}

function markerKey(m: { name: string; lng: number; lat: number }) {
  return `${m.name}::${m.lng.toFixed(4)},${m.lat.toFixed(4)}`;
}

export function resolveTripItemId(
  items: Item[],
  payload: { name: string; lng: number; lat: number; itemId?: string | null },
): string | null {
  if (payload.itemId) return payload.itemId;
  const norm = (s: string) => s.trim().toLowerCase();
  const name = norm(payload.name);
  const exact = items.find((it) => norm(it.name) === name);
  if (exact) return exact.id;
  const fuzzy = items.find(
    (it) =>
      norm(it.name).includes(name) || name.includes(norm(it.name)),
  );
  if (fuzzy) return fuzzy.id;
  const eps = 0.0008;
  const byCoord = items.find(
    (it) =>
      it.location?.lng != null &&
      it.location.lat != null &&
      Math.abs(it.location.lng - payload.lng) < eps &&
      Math.abs(it.location.lat - payload.lat) < eps,
  );
  return byCoord?.id ?? null;
}

function attachTripItemIds(
  markers: MapMarker[],
  tripItems: Item[],
): MapMarker[] {
  return markers.map((m) => {
    if (m.itemId) return m;
    const id = resolveTripItemId(tripItems, m);
    return id ? { ...m, itemId: id } : m;
  });
}

export function itemToMarker(
  item: Item,
  category: TripMapCategory,
): MapMarker | null {
  if (item.location?.lng == null || item.location.lat == null) return null;
  const meta = categoryMeta(category);
  return {
    lng: item.location.lng,
    lat: item.location.lat,
    name: item.name,
    itemId: item.id,
    color: meta.color,
    icon: meta.icon,
  };
}

export function poiToMarker(
  poi: PoiSearchResult,
  category: TripMapCategory,
): MapMarker | null {
  if (poi.location?.lng == null || poi.location.lat == null) return null;
  const meta = categoryMeta(category);
  return {
    lng: poi.location.lng,
    lat: poi.location.lat,
    name: poi.name,
    color: meta.color,
    icon: meta.icon,
  };
}

function placeToMarker(
  name: string,
  lng: number,
  lat: number,
  category: TripMapCategory,
): MapMarker {
  const meta = categoryMeta(category);
  return { lng, lat, name, color: meta.color, icon: meta.icon };
}

function spotMarkers(spots: CitySpot[], category: TripMapCategory, city: string) {
  const base = cityCoord(city);
  return spots.map((s, i) => {
    const coord =
      s.lng != null && s.lat != null
        ? { lng: s.lng, lat: s.lat }
        : itemCoord(base, s.name, i);
    return placeToMarker(s.name, coord.lng, coord.lat, category);
  });
}

function foodMarkers(
  foods: CityFood[],
  category: TripMapCategory,
  city: string,
) {
  const base = cityCoord(city);
  return foods
    .filter((f) => {
      const text = `${f.name} ${f.desc || ""}`;
      if (category === "drink") return isDrinkItem(text);
      if (category === "food") return !isDrinkItem(text);
      return false;
    })
    .map((f, i) => {
      const coord =
        f.lng != null && f.lat != null
          ? { lng: f.lng, lat: f.lat }
          : itemCoord(base, f.name, i + 3);
      return placeToMarker(f.name, coord.lng, coord.lat, category);
    });
}

function cityInfoToMarkers(info: CityInfo, category: TripMapCategory) {
  const city = info.city;
  switch (category) {
    case "attraction":
      return spotMarkers(info.spots || [], category, city);
    case "food":
    case "drink":
      return foodMarkers(info.foods || [], category, city);
    default:
      return [];
  }
}

export function mergeCategoryMarkers(...groups: MapMarker[][]): MapMarker[] {
  const seen = new Set<string>();
  const out: MapMarker[] = [];
  for (const group of groups) {
    for (const m of group) {
      const key = markerKey(m);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function capMarkers(groups: MapMarker[][], max: number): MapMarker[] {
  const seen = new Set<string>();
  const out: MapMarker[] = [];
  for (const group of groups) {
    for (const m of group) {
      if (out.length >= max) return out;
      const key = markerKey(m);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

export function tripCategoryMarkers(
  tripItems: Item[],
  category: TripMapCategory,
): MapMarker[] {
  const fromTrip = tripItems
    .filter((it) => itemMatchesCategory(it, category))
    .map((it) => itemToMarker(it, category))
    .filter((m): m is MapMarker => m != null);

  const fromAlts = tripItems.flatMap((it) => {
    if (!it.alternatives?.length) return [];
    return it.alternatives
      .filter((a) => a.location?.lng != null && a.location.lat != null)
      .map((a) =>
        placeToMarker(a.name, a.location!.lng, a.location!.lat, category),
      );
  });

  return mergeCategoryMarkers(fromTrip, fromAlts);
}

async function searchAllQueries(
  category: TripMapCategory,
  destination: string,
): Promise<MapMarker[]> {
  const dest = destination.trim();
  if (!dest) return [];
  const queries = CATEGORY_SEARCH_QUERIES[category];
  const lists: PoiSearchResult[][] = [];
  for (const q of queries) {
    try {
      lists.push(await api.trips.searchPois(q, dest, SEARCH_LIMIT, true));
    } catch {
      try {
        lists.push(await api.trips.searchPois(q, dest, SEARCH_LIMIT, false));
      } catch {
        lists.push([]);
      }
    }
  }
  return mergeCategoryMarkers(
    ...lists.map((list) =>
      list
        .map((poi) => poiToMarker(poi, category))
        .filter((m): m is MapMarker => m != null),
    ),
  );
}

export async function fetchCategoryMarkers(
  category: TripMapCategory,
  destination: string,
  tripItems: Item[],
): Promise<MapMarker[]> {
  const fromTrip = tripCategoryMarkers(tripItems, category);

  let cityMarkers: MapMarker[] = [];
  const cached = await getCachedCityInfo(destination);
  if (cached) {
    cityMarkers = cityInfoToMarkers(cached, category);
  }

  const fromSearch = await searchAllQueries(category, destination);

  return attachTripItemIds(
    capMarkers([fromTrip, cityMarkers, fromSearch], MAX_CATEGORY_MARKERS),
    tripItems,
  );
}
