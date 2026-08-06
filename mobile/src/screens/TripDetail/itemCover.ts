import type { Item } from "@travel-guide/shared";
import type { ImageSourcePropType } from "react-native";

type Cover = {
  source?: ImageSourcePropType;
  emoji: string;
  bg: string;
};

const TYPE_STYLE: Record<string, { emoji: string; bg: string }> = {
  attraction: { emoji: "🏛", bg: "#dcefe0" },
  meal: { emoji: "🍜", bg: "#ffe8cc" },
  hotel: { emoji: "🛏", bg: "#dbeafe" },
  transport: { emoji: "🚌", bg: "#ede9fe" },
};

const CITY_COVERS: Record<string, ImageSourcePropType> = {
  北京: require("../../../assets/covers/beijing_hero.jpg"),
  上海: require("../../../assets/covers/shanghai_bund.jpg"),
  杭州: require("../../../assets/covers/hangzhou_hero.jpg"),
  成都: require("../../../assets/covers/chengdu.jpg"),
  西安: require("../../../assets/covers/xian.jpg"),
  三亚: require("../../../assets/covers/sanya.jpg"),
  大理: require("../../../assets/covers/dali.jpg"),
  厦门: require("../../../assets/covers/xiamen.jpg"),
};

export function itemCoverFor(item: Item, destination: string): Cover {
  const style = TYPE_STYLE[item.type] || { emoji: "📍", bg: "#eef2f7" };
  for (const [city, src] of Object.entries(CITY_COVERS)) {
    if (destination.includes(city) && item.type === "attraction") {
      return { source: src, emoji: style.emoji, bg: style.bg };
    }
  }
  return style;
}
