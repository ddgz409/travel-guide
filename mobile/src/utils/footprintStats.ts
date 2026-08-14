import type { CheckInRecord } from "./checkInStore";
import { cityCenterFor } from "../data/cityCenters";

export type ContinentId = "NA" | "SA" | "EU" | "AF" | "AS" | "OC" | "AN";

export type FootprintStats = {
  countryCount: number;
  cityCount: number;
  placeCount: number;
  topSeason: string | null;
  farthest: CheckInRecord | null;
  northernmost: CheckInRecord | null;
  southernmost: CheckInRecord | null;
  latest: CheckInRecord | null;
  continentCount: number;
  visitedContinents: ContinentId[];
  topCategory: { label: string; count: number } | null;
};

const CAT_LABEL: Record<string, string> = {
  spots: "景点",
  foods: "吃喝",
  humanities: "人文",
};

const HOME = { lng: 116.4074, lat: 39.9042 };

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineKm(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function coordOf(item: CheckInRecord) {
  if (item.lng != null && item.lat != null) {
    return { lng: item.lng, lat: item.lat };
  }
  const c = cityCenterFor(item.city);
  return c ? { lng: c.lng, lat: c.lat } : null;
}

/** 根据经纬度判断大洲，供点阵地图实时高亮 */
export function continentFromLngLat(lat: number, lng: number): ContinentId {
  if (lat <= -60) return "AN";
  if (lng <= -25 && lng >= -180) {
    if (lat >= 12.5) return "NA";
    if (lat >= 7 && lng <= -77) return "NA";
    return "SA";
  }
  if (lat < -10 && lng >= 110 && lng <= 180) return "OC";
  if (lat <= 0 && lng >= 130 && lng <= 180) return "OC";
  if (lng >= -20 && lng <= 52 && lat >= -35 && lat <= 37.5) {
    if (lng < 0 && lat < 36) return "AF";
    if (lat < 32) return "AF";
    if (lat < 36 && lng >= 11 && lng <= 51) return "AF";
  }
  if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 42) return "EU";
  return "AS";
}

function continentOfRecord(item: CheckInRecord): ContinentId | null {
  const coord = coordOf(item);
  if (coord) return continentFromLngLat(coord.lat, coord.lng);
  if (/[\u4e00-\u9fff]/.test(item.city || item.name || "")) return "AS";
  return null;
}

function seasonOf(iso: string) {
  const m = new Date(iso).getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

export function formatCheckDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

export function buildFootprintStats(items: CheckInRecord[]): FootprintStats {
  if (items.length === 0) {
    return {
      countryCount: 0,
      cityCount: 0,
      placeCount: 0,
      topSeason: null,
      farthest: null,
      northernmost: null,
      southernmost: null,
      latest: null,
      continentCount: 0,
      visitedContinents: [],
      topCategory: null,
    };
  }

  const cities = new Set(items.map((x) => x.city.trim()).filter(Boolean));
  const seasons: Record<string, number> = { 春: 0, 夏: 0, 秋: 0, 冬: 0 };
  const cats: Record<string, number> = {};
  const continents = new Set<ContinentId>();
  let farthest = items[0];
  let farthestKm = -1;
  let northernmost = items[0];
  let southernmost = items[0];
  let maxLat = -90;
  let minLat = 90;

  for (const it of items) {
    seasons[seasonOf(it.checkedAt)] += 1;
    cats[it.category] = (cats[it.category] || 0) + 1;
    const continent = continentOfRecord(it);
    if (continent && continent !== "AN") continents.add(continent);
    const coord = coordOf(it);
    if (coord) {
      const km = haversineKm(HOME, coord);
      if (km > farthestKm) {
        farthestKm = km;
        farthest = it;
      }
      if (coord.lat > maxLat) {
        maxLat = coord.lat;
        northernmost = it;
      }
      if (coord.lat < minLat) {
        minLat = coord.lat;
        southernmost = it;
      }
    }
  }

  const topSeason =
    Object.entries(seasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topCatEntry = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const visitedContinents = [...continents];

  return {
    countryCount: 1,
    cityCount: cities.size,
    placeCount: items.length,
    topSeason,
    farthest,
    northernmost,
    southernmost,
    latest: items[0],
    continentCount: visitedContinents.length,
    visitedContinents,
    topCategory: topCatEntry
      ? {
          label: CAT_LABEL[topCatEntry[0]] || topCatEntry[0],
          count: topCatEntry[1],
        }
      : null,
  };
}
