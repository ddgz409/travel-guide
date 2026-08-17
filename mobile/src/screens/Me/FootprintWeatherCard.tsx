import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { radii } from "../../theme";
import type { FootprintListKind } from "../../utils/footprintStats";

type Props = {
  kind: FootprintListKind;
  title: string;
  sub?: string;
  province?: string;
  time?: string;
  tint?: number;
};

export function FootprintWeatherCard({
  kind,
  title,
  sub,
  province,
  time,
  tint = 0,
}: Props) {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 5200 + tint * 400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [shift, tint]);

  const waveA = useAnimatedStyle(() => ({
    transform: [
      { translateX: -18 + shift.value * 28 },
      { translateY: -8 + shift.value * 10 },
    ],
  }));

  const waveB = useAnimatedStyle(() => ({
    transform: [
      { translateX: 22 - shift.value * 24 },
      { translateY: 12 - shift.value * 8 },
    ],
  }));

  const waveC = useAnimatedStyle(() => ({
    transform: [
      { translateX: -8 + shift.value * 16 },
      { translateY: 6 - shift.value * 14 },
    ],
  }));

  const palette = PALETTES[tint % PALETTES.length];

  return (
    <View style={[styles.card, { backgroundColor: palette.base }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.wave, styles.waveA, { backgroundColor: palette.light }, waveA]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.wave, styles.waveB, { backgroundColor: palette.mid }, waveB]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.wave, styles.waveC, { backgroundColor: palette.deep }, waveC]}
      />
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.topLeft} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[styles.bottomLeft, kind === "country" && styles.english]}
            numberOfLines={1}
          >
            {kind === "city" ? province : sub}
          </Text>
        </View>
        <Text style={styles.time}>{time}</Text>
      </View>
    </View>
  );
}

const PALETTES = [
  { base: "#B9D9F5", light: "rgba(232,244,252,0.72)", mid: "rgba(156,204,236,0.42)", deep: "rgba(120,184,228,0.28)" },
  { base: "#C5E3F7", light: "rgba(236,247,255,0.7)", mid: "rgba(164,210,240,0.4)", deep: "rgba(130,190,230,0.26)" },
  { base: "#D6EAFB", light: "rgba(245,251,255,0.75)", mid: "rgba(170,214,242,0.38)", deep: "rgba(140,196,232,0.24)" },
];

const styles = StyleSheet.create({
  card: {
    height: 96,
    ...radii.xl,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  wave: {
    position: "absolute",
    borderRadius: 999,
  },
  waveA: {
    width: 220,
    height: 140,
    left: -40,
    top: -50,
  },
  waveB: {
    width: 200,
    height: 130,
    right: -50,
    bottom: -60,
  },
  waveC: {
    width: 180,
    height: 110,
    left: 80,
    top: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  left: { flex: 1, minWidth: 0, justifyContent: "space-between", height: 64 },
  topLeft: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A3A55",
  },
  bottomLeft: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A6A82",
  },
  english: {
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  time: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#1A3A55",
  },
});
