import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, cardShadow } from "../../theme";

type Props = {
  city: string;
};

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
        <Text style={styles.pulseEmoji}>🗺</Text>
      </Animated.View>
    </View>
  );
}

function ShimmerCard({ delay }: { delay: number }) {
  const shimmer = useSharedValue(0.35);
  useEffect(() => {
    shimmer.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
  }, [delay, shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <View style={styles.skeletonCard}>
      <Animated.View style={[styles.skeletonThumb, shimmerStyle]} />
      <View style={styles.skeletonBody}>
        <Animated.View style={[styles.skeletonLine, styles.skeletonLineLg, shimmerStyle]} />
        <Animated.View style={[styles.skeletonLine, styles.skeletonLineSm, shimmerStyle]} />
      </View>
    </View>
  );
}

export function CityInfoLoadingView({ city }: Props) {
  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.hero}>
        <PulseRing />
        <Text style={styles.heroTitle}>正在打开 {city}</Text>
        <Text style={styles.heroSub}>加载热门景点与美食…</Text>
      </Animated.View>
      <View style={styles.skeletonWrap}>
        <ShimmerCard delay={0} />
        <ShimmerCard delay={120} />
        <ShimmerCard delay={240} />
      </View>
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
    borderRadius: 48, borderCurve: "continuous",
    backgroundColor: colors.brand,
  },
  pulseIcon: {
    width: 64,
    height: 64,
    borderRadius: 40, borderCurve: "continuous",
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
    marginBottom: 6,
  },
  heroSub: { fontSize: 14, color: colors.muted },
  skeletonWrap: { gap: 10 },
  skeletonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24, borderCurve: "continuous",
    padding: 12,
    ...cardShadow,
  },
  skeletonThumb: {
    width: 52,
    height: 52,
    borderRadius: 20, borderCurve: "continuous",
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  skeletonBody: { flex: 1, gap: 8 },
  skeletonLine: {
    height: 10,
    borderRadius: 16, borderCurve: "continuous",
    backgroundColor: "#e5e7eb",
  },
  skeletonLineLg: { width: "72%" },
  skeletonLineSm: { width: "42%" },
});
