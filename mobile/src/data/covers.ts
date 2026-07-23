/** 行程封面图按城市名匹配 */

import type { ImageSourcePropType } from "react-native";

export const COVER_BY_CITY: Array<{ key: string; img: ImageSourcePropType }> = [
  { key: "北京", img: require("../../assets/covers/beijing_anime.png") },
  { key: "上海", img: require("../../assets/covers/shanghai_anime.png") },
  { key: "杭州", img: require("../../assets/covers/hangzhou_anime.png") },
  { key: "成都", img: require("../../assets/covers/chengdu.jpg") },
  { key: "大理", img: require("../../assets/covers/dali_anime.png") },
  { key: "西安", img: require("../../assets/covers/xian.jpg") },
  { key: "厦门", img: require("../../assets/covers/xiamen.jpg") },
  { key: "三亚", img: require("../../assets/covers/sanya_anime.png") },
  { key: "洛阳", img: require("../../assets/covers/luoyang.jpg") },
  { key: "泉州", img: require("../../assets/covers/quanzhou.jpg") },
  { key: "西湖", img: require("../../assets/covers/hangzhou_anime.png") },
];

export const FALLBACK_COVER: ImageSourcePropType = require(
  "../../assets/covers/hangzhou_anime.png",
);

export function coverFor(destination: string): ImageSourcePropType {
  const d = destination || "";
  for (const c of COVER_BY_CITY) {
    if (d.includes(c.key)) return c.img;
  }
  return FALLBACK_COVER;
}
