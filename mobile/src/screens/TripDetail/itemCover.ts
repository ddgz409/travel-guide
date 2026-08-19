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

export function itemCoverFor(item: Item, destination: string): Cover {
  const style = TYPE_STYLE[item.type] || { emoji: "📍", bg: "#eef2f7" };
  return style;
}
