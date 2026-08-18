import React from "react";
import { View } from "react-native";
import { colors } from "../theme";

type Props = {
  size?: number;
  color?: string;
  stroke?: number;
};

/** 全屏地图：四角展开，与定位按钮同尺寸居中对齐 */
export function MapExpandIcon({
  size = 18,
  color = colors.ink,
  stroke = 2,
}: Props) {
  const arm = Math.round(size * 0.38);

  const corner = (pos: "tl" | "tr" | "bl" | "br") => {
    const base = {
      position: "absolute" as const,
      width: arm,
      height: arm,
      borderColor: color,
    };
    switch (pos) {
      case "tl":
        return { ...base, top: 0, left: 0, borderTopWidth: stroke, borderLeftWidth: stroke };
      case "tr":
        return { ...base, top: 0, right: 0, borderTopWidth: stroke, borderRightWidth: stroke };
      case "bl":
        return { ...base, bottom: 0, left: 0, borderBottomWidth: stroke, borderLeftWidth: stroke };
      case "br":
        return { ...base, bottom: 0, right: 0, borderBottomWidth: stroke, borderRightWidth: stroke };
    }
  };

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="全屏"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={[corner("tl"), { borderTopLeftRadius: 2 }]} />
      <View style={[corner("tr"), { borderTopRightRadius: 2 }]} />
      <View style={[corner("bl"), { borderBottomLeftRadius: 2 }]} />
      <View style={[corner("br"), { borderBottomRightRadius: 2 }]} />
    </View>
  );
}
