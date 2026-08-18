import React from "react";
import { View } from "react-native";

type Props = {
  size?: number;
  color?: string;
  stroke?: number;
};

/** 地图定位：圆环 + 中心点 + 四向刻度 */
export function MapLocateIcon({
  size = 18,
  color = "#1a66ff",
  stroke = 2,
}: Props) {
  const ring = Math.round(size * 0.68);
  const dot = Math.max(4, Math.round(size * 0.24));
  const tick = Math.max(3, Math.round(size * 0.16));
  const half = size / 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="定位"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          left: half - stroke / 2,
          width: stroke,
          height: tick,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: half - stroke / 2,
          width: stroke,
          height: tick,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          top: half - stroke / 2,
          width: tick,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          top: half - stroke / 2,
          width: tick,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
