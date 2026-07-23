/** 与 Web「旅迹」品牌色对齐 */
export const colors = {
  bg: "#F7F2EB",
  ink: "#1a1a1a",
  muted: "#8B735F",
  brand: "#ff6d00",
  brandHot: "#e85d00",
  brandSoft: "#fff1e6",
  line: "#EDE4D8",
  card: "#ffffff",
  danger: "#c62828",
  ready: "#2e7d32",
  generating: "#ef6c00",
  failed: "#c62828",
};

/** 大卡片用：原来的柔和彩色 */
export const pastels = [
  "#E8E4F8", // 淡紫
  "#D7EAF8", // 淡蓝
  "#E4F0D8", // 淡绿
  "#F8E8D8", // 杏色
  "#F5E0EC", // 藕粉
] as const;

/** 快捷入口等稍暖一点的彩色 */
export const accentPastels = ["#FFE8D6", "#E8E4F8", "#D7EAF8"] as const;

/** 卡片轻阴影 */
export const cardShadow = {
  shadowColor: "#C47A3A",
  shadowOpacity: 0.1,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;
