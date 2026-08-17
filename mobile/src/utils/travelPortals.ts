/** 旅行平台 App 深链跳转 */

import { Linking, Platform } from "react-native";
import {
  ctripAppUrl,
  openPortalDeepLink,
  qunarAppUrl,
} from "./poiPortals";

export type TravelMode = "flight" | "train" | "car" | "bike" | "walk";
export type PortalId = "ctrip" | "qunar" | "fliggy" | "12306";

export type PortalConfig = {
  id: PortalId;
  name: string;
  emoji: string;
  color: string;
  modes: TravelMode[];
  /** 携程/去哪儿：H5 页（再包进 App 深链） */
  webUrl?: (from: string, to: string, mode: TravelMode) => string;
  /** 其他平台：直接 scheme */
  appUrl?: (from: string, to: string, mode: TravelMode) => string;
};

/** 所有支持的出行方式列表 */
export const TRAVEL_MODES: Array<{ key: TravelMode; label: string; emoji: string }> = [
  { key: "flight", label: "飞机", emoji: "✈️" },
  { key: "train", label: "火车", emoji: "🚆" },
  { key: "car", label: "汽车", emoji: "🚗" },
  { key: "bike", label: "自行车", emoji: "🚲" },
  { key: "walk", label: "行人", emoji: "🚶" },
];

function enc(s: string): string {
  return encodeURIComponent(s.trim());
}

function ctripTravelWeb(from: string, to: string, mode: TravelMode): string {
  const f = enc(from);
  const t = enc(to);
  if (mode === "train") {
    return `https://m.ctrip.com/webapp/train/list?from=${f}&to=${t}`;
  }
  if (mode === "flight") {
    return `https://m.ctrip.com/webapp/flight/list/?triptype=1&dcityname=${f}&acityname=${t}`;
  }
  return `https://m.ctrip.com/webapp/bus/list?from=${f}&to=${t}`;
}

function qunarTravelWeb(from: string, to: string, mode: TravelMode): string {
  const f = enc(from);
  const t = enc(to);
  if (mode === "train") {
    return `https://touch.qunar.com/h5/train/search?from=${f}&to=${t}`;
  }
  if (mode === "flight") {
    return `https://touch.qunar.com/h5/flight/search?depCity=${f}&arrCity=${t}`;
  }
  return `https://touch.qunar.com/h5/bus/search?from=${f}&to=${t}`;
}

/** 平台列表：携程/去哪儿优先 App 内打开对应 H5 搜索页 */
export const PORTALS: PortalConfig[] = [
  {
    id: "ctrip",
    name: "携程",
    emoji: "✈️",
    color: "#1A6DB5",
    modes: ["flight", "train", "car"],
    webUrl: ctripTravelWeb,
  },
  {
    id: "qunar",
    name: "去哪儿",
    emoji: "✈️",
    color: "#FF6B35",
    modes: ["flight", "train", "car"],
    webUrl: qunarTravelWeb,
  },
  {
    id: "fliggy",
    name: "飞猪",
    emoji: "✈️",
    color: "#FF0036",
    modes: ["flight", "train", "car"],
    appUrl: () => "fliggy://",
  },
  {
    id: "12306",
    name: "12306",
    emoji: "🚄",
    color: "#C62828",
    modes: ["train"],
    appUrl: () => "cn.12306://",
  },
];

export async function openPortal(
  portal: PortalConfig,
  from: string,
  to: string,
  mode: TravelMode,
): Promise<void> {
  if (portal.webUrl) {
    const web = portal.webUrl(from, to, mode);
    const app =
      portal.id === "ctrip"
        ? ctripAppUrl(web)
        : portal.id === "qunar"
          ? qunarAppUrl(web)
          : web;
    await openPortalDeepLink(web, app);
    return;
  }

  const app = portal.appUrl?.(from, to, mode);
  if (!app) return;
  try {
    await Linking.openURL(app);
  } catch {
    /* App 未安装时静默忽略 */
  }
}

/** iOS 需 qunariphone scheme */
export function qunarAppScheme(): string {
  return Platform.OS === "ios" ? "qunariphone" : "qunaraphone";
}
