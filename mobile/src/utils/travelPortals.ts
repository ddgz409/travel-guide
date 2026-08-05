/** 旅行平台 App 深链跳转 */

import { Linking } from "react-native";

export type TravelMode = "flight" | "train" | "car" | "bike" | "walk";
export type PortalId = "ctrip" | "qunar" | "fliggy" | "12306";

export type PortalConfig = {
  id: PortalId;
  name: string;
  emoji: string;
  color: string;
  appUrl: (from: string, to: string, mode: TravelMode) => string;
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

/** 平台列表：全部使用 App 深链 */
export const PORTALS: PortalConfig[] = [
  {
    id: "ctrip",
    name: "携程",
    emoji: "✈️",
    color: "#1A6DB5",
    modes: ["flight", "train", "car"],
    appUrl: () => "ctrip://wireless/",
  },
  {
    id: "qunar",
    name: "去哪儿",
    emoji: "✈️",
    color: "#FF6B35",
    modes: ["flight", "train", "car"],
    appUrl: () => "qunaraphone://",
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
  _from: string,
  _to: string,
  _mode: TravelMode,
): Promise<void> {
  const app = portal.appUrl(_from, _to, _mode);
  try {
    await Linking.openURL(app);
  } catch {
    /* App 未安装时静默忽略 */
  }
}
