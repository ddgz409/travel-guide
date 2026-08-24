/** 攻略交通偏好 → 高德路线规划模式 */
export type RouteMode = "transit" | "walking" | "driving";

/**
 * 把生成页选择的交通方式（公共交通/自驾/步行/混合）映射为
 * getDayRoutes 的请求模式；未知值回退公交。
 * 混合出行地图默认展示公交（可在段详情里手动切换）。
 */
export function routeModeForTransport(transport?: string | null): RouteMode {
  switch ((transport || "").trim()) {
    case "自驾":
      return "driving";
    case "步行":
      return "walking";
    default:
      return "transit";
  }
}

/** 从最小化的 trip 结构取偏好模式（避免整包 Trip 类型依赖） */
export function routeModeForTrip(trip?: {
  preferences?: { transport?: string } | null;
} | null): RouteMode {
  return routeModeForTransport(trip?.preferences?.transport);
}
