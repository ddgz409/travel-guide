/** 经纬度距离计算（GCJ-02 近似球面距离，展示用） */

export type LatLng = { lng: number; lat: number };

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 两点直线距离（米） */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 「距我 X 米/公里」文案 */
export function formatDistanceFromUser(meters: number): string {
  if (meters < 1000) return `距我 ${Math.round(meters)} 米`;
  return `距我 ${(meters / 1000).toFixed(1)} 公里`;
}

export function hasCoords(item: { lng?: number; lat?: number }): boolean {
  return typeof item.lng === "number" && typeof item.lat === "number";
}

export function distanceLabel(
  user: LatLng | null | undefined,
  poi: { lng?: number; lat?: number },
): string | null {
  if (!user || !hasCoords(poi)) return null;
  return formatDistanceFromUser(
    haversineMeters(user, { lng: poi.lng!, lat: poi.lat! }),
  );
}
