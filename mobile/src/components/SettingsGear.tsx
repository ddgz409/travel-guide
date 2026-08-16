import React from "react";
import { View } from "react-native";
import { colors } from "../theme";

type Props = {
  size?: number;
  color?: string;
  holeColor?: string;
};

export function SettingsGear({
  size = 22,
  color = colors.ink,
  holeColor = "#fff",
}: Props) {
  const toothW = size * 0.28;
  const ring = size * 0.7;
  const hole = size * 0.26;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="设置"
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      {[0, 60, 120].map((deg) => (
        <View
          key={deg}
          style={{
            position: "absolute",
            width: toothW,
            height: size,
            borderRadius: toothW / 2,
            backgroundColor: color,
            transform: [{ rotate: `${deg}deg` }],
          }}
        />
      ))}
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: hole,
            height: hole,
            borderRadius: hole / 2,
            backgroundColor: holeColor,
          }}
        />
      </View>
    </View>
  );
}
