/** 与「知径」品牌色对齐：天蓝主色 + 纯白背景 */
export const colors = {
  bg: "#FFFFFF",
  ink: "#1a1a1a",
  muted: "#9E9E9E",
  brand: "#4FC3F7",
  brandHot: "#29B6F6",
  brandSoft: "#E1F5FE",
  line: "#F0F0F0",
  card: "#ffffff",
  danger: "#c62828",
  ready: "#2e7d32",
  generating: "#ef6c00",
  failed: "#c62828",
};

/** 大卡片用：柔和马卡龙色 */
export const pastels = [
  "#E8E4F8", // 淡紫
  "#D7EAF8", // 淡蓝
  "#E4F0D8", // 淡绿
  "#F8E8D8", // 杏色
  "#F5E0EC", // 藕粉
] as const;

/** 快捷入口等稍暖一点的彩色 */
export const accentPastels = ["#E1F5FE", "#E8E4F8", "#D7EAF8"] as const;

/** 卡片轻阴影 */
export const cardShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** 标准圆角 → 超椭圆视觉半径（iOS borderCurve: continuous） */
const SQUIRCLE_RADIUS: Record<number, number> = {
  1: 10,
  2: 12,
  3: 14,
  4: 14,
  5: 16,
  6: 16,
  8: 18,
  10: 20,
  11: 20,
  12: 22,
  14: 24,
  16: 26,
  17: 26,
  18: 28,
  20: 30,
  21: 30,
  22: 32,
  24: 34,
  28: 36,
  32: 40,
  44: 48,
  52: 56,
};

/** 生成超椭圆圆角样式（胶囊形传 999+ 保持不变） */
export function squircle(radius: number): {
  borderRadius: number;
  borderCurve?: "continuous";
} {
  if (radius >= 999) return { borderRadius: radius };
  const borderRadius = SQUIRCLE_RADIUS[radius] ?? Math.max(radius + 8, 16);
  return { borderRadius, borderCurve: "continuous" };
}

/** 预设语义化圆角 */
export const radii = {
  xs: squircle(4),
  sm: squircle(8),
  md: squircle(12),
  lg: squircle(16),
  xl: squircle(20),
  xxl: squircle(24),
  pill: { borderRadius: 999 },
} as const;
