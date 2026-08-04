/** 与「圆周旅迹」品牌色对齐：天蓝主色 + 纯白背景 */
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
