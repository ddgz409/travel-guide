import React, { useEffect } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, cardShadow } from "../../theme";

const PHASES = [
  { id: "search", label: "联网搜索" },
  { id: "fallback", label: "本地 POI" },
  { id: "location", label: "补全坐标" },
  { id: "images", label: "真实图片" },
] as const;

type Props = {
  city: string;
  message: string;
  phase: string;
  preview: string;
  previewScrollRef: React.RefObject<ScrollView | null>;
};

function TypingDots() {
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    const pulse = (v: typeof d1, delay: number) => {
      v.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
            withTiming(0.3, { duration: 360, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
    };
    pulse(d1, 0);
    pulse(d2, 160);
    pulse(d3, 320);
  }, [d1, d2, d3]);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, s1]} />
      <Animated.View style={[styles.dot, s2]} />
      <Animated.View style={[styles.dot, s3]} />
    </View>
  );
}

function PulseRing() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.45);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.55, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(0.45, { duration: 0 }),
      ),
      -1,
      false,
    );
    iconScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [iconScale, opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ringStyle]} />
      <Animated.View style={[styles.pulseIcon, iconStyle]}>
        <Text style={styles.pulseEmoji}>🔍</Text>
      </Animated.View>
    </View>
  );
}

function BlinkCursor() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 480 }),
        withTiming(1, { duration: 480 }),
      ),
      -1,
      true,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.Text style={[styles.streamCursor, style]}>▍</Animated.Text>
  );
}

function SkeletonCards() {
  const shimmer = useSharedValue(0.35);
  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.skeletonWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <Animated.View style={[styles.skeletonThumb, shimmerStyle]} />
          <View style={styles.skeletonBody}>
            <Animated.View style={[styles.skeletonLine, styles.skeletonLineLg, shimmerStyle]} />
            <Animated.View style={[styles.skeletonLine, styles.skeletonLineSm, shimmerStyle]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export function CityInfoLoadingView({
  city,
  message,
  phase,
  preview,
  previewScrollRef,
}: Props) {
  const phaseIdx = Math.max(
    0,
    PHASES.findIndex((p) => p.id === phase),
  );

  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.hero}>
        <PulseRing />
        <Text style={styles.heroTitle}>探索 {city}</Text>
        <View style={styles.messageRow}>
          <Text style={styles.messageText} numberOfLines={2}>
            {message || `正在搜索 ${city} 真实信息…`}
          </Text>
          <TypingDots />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(420)} style={styles.phaseRow}>
        {PHASES.map((p, i) => {
          const done = phaseIdx > i;
          const active = phaseIdx === i || (phaseIdx < 0 && i === 0);
          return (
            <View key={p.id} style={styles.phaseItem}>
              <View
                style={[
                  styles.phaseDot,
                  done && styles.phaseDotDone,
                  active && styles.phaseDotActive,
                ]}
              />
              <Text
                style={[
                  styles.phaseLabel,
                  (done || active) && styles.phaseLabelOn,
                ]}
                numberOfLines={1}
              >
                {p.label}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      {preview ? (
        <Animated.View entering={FadeIn.duration(320)} style={styles.streamBox}>
          <Text style={styles.streamLabel}>AI 检索预览</Text>
          <ScrollView
            ref={previewScrollRef}
            style={styles.streamScroll}
            contentContainerStyle={styles.streamContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.streamText}>{preview}</Text>
            <BlinkCursor />
          </ScrollView>
        </Animated.View>
      ) : (
        <SkeletonCards />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  hero: { alignItems: "center", marginBottom: 28 },
  pulseWrap: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  pulseRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand,
  },
  pulseIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  pulseEmoji: { fontSize: 28 },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 10,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 8,
  },
  messageText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: "88%",
  },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.brand,
  },
  phaseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  phaseItem: { flex: 1, alignItems: "center", minWidth: 0 },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#d1d5db",
    marginBottom: 6,
  },
  phaseDotDone: { backgroundColor: colors.brand },
  phaseDotActive: {
    backgroundColor: colors.brand,
    transform: [{ scale: 1.25 }],
  },
  phaseLabel: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  phaseLabelOn: { color: colors.ink },
  streamBox: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  streamLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  streamScroll: { maxHeight: 160 },
  streamContent: { paddingHorizontal: 14, paddingBottom: 14 },
  streamText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  streamCursor: { fontSize: 13, color: colors.brand, marginTop: 4 },
  skeletonWrap: { gap: 10 },
  skeletonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    padding: 12,
    ...cardShadow,
  },
  skeletonThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  skeletonBody: { flex: 1, gap: 8 },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e5e7eb",
  },
  skeletonLineLg: { width: "72%" },
  skeletonLineSm: { width: "42%" },
});
