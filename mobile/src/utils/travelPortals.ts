/** 旅行平台 App 跳转 + 网页兜底 */

import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

export type TravelMode = "flight" | "train" | "car" | "bike" | "walk";
export type PortalId = "ctrip" | "qunar" | "fliggy" | "12306";

export type PortalConfig = {
  id: PortalId;
  name: string;
  emoji: string;
  color: string;
  appUrl: (from: string, to: string, mode: TravelMode) => string | null;
  webUrl: (from: string, to: string, mode: TravelMode) => string;
  /** 哪些出行方式有票（12306 只有火车） */
  modes: TravelMode[];
};

/** 所有支持的出行方式列表 */
export const TRAVEL_MODES: Array<{ key: TravelMode; label: string; emoji: string }> = [
  { key: "flight", label: "飞机", emoji: "✈️" },
  { key: "train", label: "火车", emoji: "🚆" },
  { key: "car", label: "汽车", emoji: "🚗" },
  { key: "bike", label: "自行车", emoji: "🚲" },
  { key: "walk", label: "行人", emoji: "🚶" },
];

function enc(s: string) {
  return encodeURIComponent(s || "");
}

/** 平台列表 */
export const PORTALS: PortalConfig[] = [
  {
    id: "ctrip",
    name: "携程",
    emoji: "✈️",
    color: "#1A6DB5",
    modes: ["flight", "train", "car"],
    appUrl: () => "ctrip://wireless/",
    webUrl: (_from, _to, mode) =>
      mode === "train"
        ? `https://m.ctrip.com/webapp/train/`
        : `https://m.ctrip.com/webapp/flight/`,
  },
  {
    id: "qunar",
    name: "去哪儿",
    emoji: "✈️",
    color: "#FF6B35",
    modes: ["flight", "train", "car"],
    appUrl: () => "qunaraphone://",
    webUrl: (_from, _to, mode) =>
      mode === "train"
        ? `https://touch.qunar.com/train/`
        : `https://touch.qunar.com/flight/`,
  },
  {
    id: "fliggy",
    name: "飞猪",
    emoji: "✈️",
    color: "#FF0036",
    modes: ["flight", "train", "car"],
    appUrl: () => "fliggy://",
    webUrl: (_from, _to, mode) =>
      mode === "train"
        ? `https://h5.m.fliggy.com/train/search`
        : `https://h5.m.fliggy.com/flight/search`,
  },
  {
    id: "12306",
    name: "12306",
    emoji: "🚄",
    color: "#C62828",
    modes: ["train"],
    appUrl: () => "cn.12306://",
    webUrl: (from, to, _mode) =>
      `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${enc(from)}&ts=${enc(to)}`,
  },
];

export async function openPortal(
  portal: PortalConfig,
  from: string,
  to: string,
  mode: TravelMode,
): Promise<void> {
  const app = portal.appUrl(from, to, mode);
  const web = portal.webUrl(from, to, mode);

  if (app) {
    try {
      const canOpen = await Linking.canOpenURL(app);
      if (canOpen) {
        await Linking.openURL(app);
        return;
      }
    } catch { /* fallthrough */ }
  }

  try {
    await Linking.openURL(web);
  } catch {
    await WebBrowser.openBrowserAsync(web);
  }
}
