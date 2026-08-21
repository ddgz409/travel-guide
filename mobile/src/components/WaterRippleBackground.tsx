/**
 * 全局极淡蓝背景 + 动态水波纹（光晕缓漂、双环荡开，稀疏不密）。
 */
import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme";

type RippleProps = {
  cx: number;
  cy: number;
  size: number;
  delayMs: number;
  periodMs: number;
  stroke: string;
  /** 双环时第二圈延迟 */
  echoDelayMs?: number;
};

function RippleRing({
  cx,
  cy,
  size,
  delayMs,
  periodMs,
  stroke,
  echoDelayMs = 0,
  borderWidth = 1,
  maxOpacity = 0.22,
}: RippleProps & { borderWidth?: number; maxOpacity?: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const expandMs = Math.round(periodMs * 0.78);
    const pauseMs = Math.max(periodMs - expandMs, 400);
    progress.value = withDelay(
      delayMs + echoDelayMs,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: expandMs, easing: Easing.out(Easing.sin) }),
          withTiming(1, { duration: pauseMs }),
        ),
        -1,
        false,
      ),
    );
  }, [delayMs, echoDelayMs, periodMs, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const scale = 0.12 + p * 1.05;
    const opacity = (1 - p * p) * maxOpacity;
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: stroke,
          borderWidth,
        },
        style,
      ]}
    />
  );
}

type GlowProps = {
  left: number;
  top: number;
  size: number;
  color: string;
  durationMs: number;
  delayMs?: number;
  driftX: number;
  driftY: number;
};

function DriftingGlow({
  left,
  top,
  size,
  color,
  durationMs,
  delayMs = 0,
  driftX,
  driftY,
}: GlowProps) {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: durationMs, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [delayMs, durationMs, phase]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [0, driftX]) },
      { translateY: interpolate(phase.value, [0, 1], [0, driftY]) },
      { scale: interpolate(phase.value, [0, 0.5, 1], [1, 1.08, 1]) },
    ],
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.72, 1, 0.72]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        { left, top, width: size, height: size, backgroundColor: color },
        style,
      ]}
    />
  );
}

export function WaterRippleBackground() {
  const { width, height } = useWindowDimensions();
  const span = Math.min(width, height);

  const ripples: RippleProps[] = [
    {
      cx: width * 0.74,
      cy: height * 0.58,
      size: span * 0.95,
      delayMs: 0,
      periodMs: 5200,
      stroke: "rgba(179, 229, 252, 0.38)",
      echoDelayMs: 680,
    },
    {
      cx: width * 0.28,
      cy: height * 0.34,
      size: span * 0.82,
      delayMs: 1600,
      periodMs: 5600,
      stroke: "rgba(191, 233, 255, 0.32)",
      echoDelayMs: 720,
    },
    {
      cx: width * 0.5,
      cy: height * 0.78,
      size: span * 0.88,
      delayMs: 3000,
      periodMs: 5800,
      stroke: "rgba(204, 238, 255, 0.28)",
      echoDelayMs: 760,
    },
    {
      cx: width * 0.62,
      cy: height * 0.22,
      size: span * 0.7,
      delayMs: 4200,
      periodMs: 6200,
      stroke: "rgba(186, 230, 253, 0.26)",
      echoDelayMs: 800,
    },
  ];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <DriftingGlow
        left={width * 0.04}
        top={height * 0.04}
        size={span * 0.78}
        color="rgba(255, 255, 255, 0.72)"
        durationMs={14000}
        driftX={22}
        driftY={16}
      />
      <DriftingGlow
        left={width * 0.42}
        top={height * 0.52}
        size={span * 0.55}
        color="rgba(227, 242, 253, 0.35)"
        durationMs={11000}
        delayMs={2000}
        driftX={-18}
        driftY={-12}
      />
      <DriftingGlow
        left={width * 0.58}
        top={height * 0.12}
        size={span * 0.48}
        color="rgba(240, 249, 255, 0.55)"
        durationMs={9500}
        delayMs={1200}
        driftX={14}
        driftY={20}
      />
      {ripples.map((r, i) => (
        <React.Fragment key={i}>
          <RippleRing {...r} maxOpacity={0.2} borderWidth={1.1} />
          <RippleRing {...r} maxOpacity={0.1} borderWidth={0.75} echoDelayMs={(r.echoDelayMs ?? 0) + 900} />
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  glow: {
    position: "absolute",
    borderRadius: 9999,
  },
  ring: {
    position: "absolute",
  },
});
