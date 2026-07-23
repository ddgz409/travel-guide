/** TransportRouteSheet 专用格式化工具与常量 */

export type Mode = "transit" | "walking" | "driving";

export const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "transit", label: "公交地铁" },
  { id: "walking", label: "步行" },
  { id: "driving", label: "驾车" },
];

import { Dimensions } from "react-native";

export const SCREEN_W = Dimensions.get("window").width;
export const DISMISS_X = Math.min(120, SCREEN_W * 0.28);

export function modeLabel(mode: string): string {
  if (mode === "walking") return "步行";
  if (mode === "driving") return "驾车";
  return "公交地铁";
}

export function fmtMin(s: number): string {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m}分钟`;
  return `${Math.floor(m / 60)}小时${m % 60}分`;
}

export function fmtKm(m: number): string {
  if (m < 1000) return `${m}米`;
  return `${(m / 1000).toFixed(1)}公里`;
}
