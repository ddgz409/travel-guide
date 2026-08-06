/** 打开系统地图 App 导航到指定地点 */

import { Alert, Linking, Platform } from "react-native";

export type MapNavTarget = {
  name: string;
  lng?: number | null;
  lat?: number | null;
  address?: string;
  city?: string;
};

function hasCoords(t: MapNavTarget): boolean {
  return t.lng != null && t.lat != null && Number.isFinite(t.lng) && Number.isFinite(t.lat);
}

function label(t: MapNavTarget): string {
  return (t.name || t.address || t.city || "目的地").trim();
}

function searchKeyword(t: MapNavTarget): string {
  const addr = (t.address || "").trim();
  if (addr) return addr;
  const city = (t.city || "").trim();
  const name = (t.name || "").trim();
  return city && name ? `${city} ${name}` : name || city;
}

/** 高德地图：导航 / 关键词搜索 */
function amapUrls(t: MapNavTarget): string[] {
  const name = encodeURIComponent(label(t));
  if (hasCoords(t)) {
    const { lng, lat } = t;
    return [
      Platform.OS === "ios"
        ? `iosamap://path?sourceApplication=travel-guide&dlat=${lat}&dlon=${lng}&dname=${name}&dev=0&t=0`
        : `androidamap://route?sourceApplication=travel-guide&dlat=${lat}&dlon=${lng}&dname=${name}&dev=0&t=0`,
      `amapuri://route/plan/?dlat=${lat}&dlon=${lng}&dname=${name}&dev=0&t=0`,
      `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car&coordinate=gaode`,
    ];
  }
  const kw = encodeURIComponent(searchKeyword(t));
  return [
    Platform.OS === "ios"
      ? `iosamap://poi?sourceApplication=travel-guide&keywords=${kw}`
      : `androidamap://poi?sourceApplication=travel-guide&keywords=${kw}`,
    `https://uri.amap.com/search?keyword=${kw}`,
  ];
}

function appleMapsUrl(t: MapNavTarget): string | null {
  if (Platform.OS !== "ios") return null;
  const q = encodeURIComponent(searchKeyword(t));
  if (hasCoords(t)) {
    return `http://maps.apple.com/?daddr=${t.lat},${t.lng}&q=${q}`;
  }
  return `http://maps.apple.com/?q=${q}`;
}

function geoUrl(t: MapNavTarget): string | null {
  if (!hasCoords(t)) return null;
  const q = encodeURIComponent(label(t));
  return `geo:${t.lat},${t.lng}?q=${t.lat},${t.lng}(${q})`;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** 打开高德 POI 详情/搜索（可查看营业时间、电话） */
export async function openAmapPoiLookup(target: MapNavTarget): Promise<void> {
  const name = encodeURIComponent(label(target));
  const kw = encodeURIComponent(searchKeyword(target));
  const urls: string[] = [];

  if (hasCoords(target)) {
    const { lng, lat } = target;
    urls.push(
      Platform.OS === "ios"
        ? `iosamap://viewMap?sourceApplication=travel-guide&poiname=${name}&lat=${lat}&lon=${lng}&dev=0`
        : `androidamap://viewMap?sourceApplication=travel-guide&poiname=${name}&lat=${lat}&lon=${lng}&dev=0`,
    );
  }

  urls.push(
    Platform.OS === "ios"
      ? `iosamap://poi?sourceApplication=travel-guide&keywords=${kw}`
      : `androidamap://poi?sourceApplication=travel-guide&keywords=${kw}`,
    `https://uri.amap.com/search?keyword=${kw}`,
  );

  for (const url of urls) {
    if (await tryOpen(url)) return;
  }

  Alert.alert("无法打开地图", "请安装高德地图后查看详情");
}

export async function openMapNavigation(target: MapNavTarget): Promise<void> {
  const urls = [
    ...amapUrls(target),
    appleMapsUrl(target),
    geoUrl(target),
  ].filter(Boolean) as string[];

  for (const url of urls) {
    if (await tryOpen(url)) return;
  }

  Alert.alert(
    "无法打开地图",
    hasCoords(target)
      ? "请安装高德地图或使用系统地图应用"
      : "暂无坐标，无法发起导航",
  );
}
