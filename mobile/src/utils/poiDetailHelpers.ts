import type { Alternative, CityFood, CitySpot, Item } from "@travel-guide/shared";
import { api } from "../api/client";
import type { ExploreCategory } from "../screens/CityDetail/helpers";
import { getCachedCityInfo, setCachedCityInfo } from "./cityInfoCache";

export type PoiSheetData = {
  name: string;
  desc: string;
  lng?: number;
  lat?: number;
  address?: string;
  image?: string;
  images?: string[];
  category: ExploreCategory;
  tripItemId?: string;
  selected?: boolean;
  alternatives?: Alternative[] | null;
};

function normName(s: string): string {
  return s.trim().replace(/\s/g, "");
}

function findCityPoi(
  list: CitySpot[] | CityFood[] | undefined,
  name: string,
): CitySpot | CityFood | null {
  if (!list?.length) return null;
  const n = normName(name);
  const exact = list.find((x) => normName(x.name) === n);
  if (exact) return exact;
  const fuzzy = list.find(
    (x) =>
      normName(x.name).includes(n) || n.includes(normName(x.name)),
  );
  return fuzzy ?? null;
}

function isThinDesc(desc: string): boolean {
  const d = desc.trim();
  if (!d) return true;
  if (d.length < 12) return true;
  return /热门必去|本地特色|值得一游/.test(d);
}

export function tripItemCategory(item: Item): ExploreCategory {
  if (item.type === "meal") return "foods";
  if (item.type === "hotel") return "hotels";
  return "spots";
}

export function poiSheetFromTripItem(item: Item): PoiSheetData {
  return {
    name: item.name,
    desc: item.description?.trim() || "",
    lng: item.location?.lng ?? undefined,
    lat: item.location?.lat ?? undefined,
    address: item.location?.address ?? undefined,
    category: tripItemCategory(item),
    tripItemId: item.id,
    selected: item.selected,
    alternatives: item.alternatives,
  };
}

export function poiSheetFromMarker(
  payload: { name: string; lng: number; lat: number },
  tripItem: Item | null | undefined,
  fallbackCategory: ExploreCategory,
): PoiSheetData {
  if (tripItem) return poiSheetFromTripItem(tripItem);
  return {
    name: payload.name,
    desc: "",
    lng: payload.lng,
    lat: payload.lat,
    category: fallbackCategory,
  };
}

export async function enrichPoiSheetData(
  base: PoiSheetData,
  city: string,
): Promise<PoiSheetData> {
  const c = city.trim();
  if (!c) return base;

  let merged: PoiSheetData = { ...base };
  let cached = await getCachedCityInfo(c);
  const needFreshInfo = !cached || isThinDesc(merged.desc);

  if (needFreshInfo) {
    try {
      const fresh = await api.destinations.info(c);
      await setCachedCityInfo(c, fresh);
      cached = fresh;
    } catch {
      /* keep cache */
    }
  }

  if (cached) {
    const list =
      merged.category === "foods"
        ? cached.foods
        : merged.category === "hotels"
          ? undefined
          : cached.spots;
    const hit = list ? findCityPoi(list, base.name) : null;
    if (hit) {
      merged = {
        ...merged,
        desc: isThinDesc(merged.desc) ? hit.desc || merged.desc : merged.desc,
        image: hit.image ?? merged.image,
        images: hit.images ?? merged.images,
        lng: merged.lng ?? hit.lng ?? undefined,
        lat: merged.lat ?? hit.lat ?? undefined,
        address: merged.address || hit.address,
      };
    }
  }

  if (!merged.image && !(merged.images?.length)) {
    try {
      const kind =
        merged.category === "foods"
          ? "foods"
          : merged.category === "hotels"
            ? ""
            : "spots";
      const res = await api.destinations.placeImages(c, base.name, kind, 3);
      if (res.images?.length) merged = { ...merged, images: res.images };
      if (res.image) merged = { ...merged, image: res.image };
    } catch {
      /* gallery falls back in PlaceGallery */
    }
  }

  return merged;
}
