import React, { useEffect, useRef } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const FADE_MS = 480;
const HOLD_MS = 720;
const START_MS = 240;
const WRITE_MS =
  START_MS +
  210 + 70 +
  230 + 60 +
  300 + 70 +
  250 + 40 +
  90 + 80 +
  280 + 60 +
  210 + 60 +
  230 + 80 +
  360;
const ART = require("../../assets/splash-calligraphy.png");
const WRITE = Easing.bezier(0.22, 0.72, 0.28, 1);

type Props = {
  ready: boolean;
  onFinished: () => void;
};

export function SplashOverlay({ ready, onFinished }: Props) {
  const { width } = useWindowDimensions();
  const artW = Math.min(width - 32, 420);
  const artH = artW * 0.42;

  const progress = useSharedValue(0);
  const brush = useSharedValue(0);
  const veil = useSharedValue(1);
  const written = useRef(false);
  const appReady = useRef(ready);
  const leaving = useRef(false);

  const leave = () => {
    if (leaving.current || !written.current || !appReady.current) return;
    leaving.current = true;
    brush.value = withTiming(0, { duration: 180 });
    veil.value = withDelay(HOLD_MS, withTiming(0, { duration: FADE_MS }));
    setTimeout(() => onFinished(), HOLD_MS + FADE_MS);
  };

  useEffect(() => {
    appReady.current = ready;
    leave();
  }, [ready]);

  useEffect(() => {
    brush.value = withTiming(1, { duration: 160 });
    progress.value = withDelay(
      START_MS,
      withSequence(
        withTiming(0.12, { duration: 210, easing: WRITE }),
        withDelay(70, withTiming(0.25, { duration: 230, easing: WRITE })),
        withDelay(60, withTiming(0.4, { duration: 300, easing: WRITE })),
        withDelay(70, withTiming(0.52, { duration: 250, easing: WRITE })),
        withDelay(40, withTiming(0.57, { duration: 90, easing: WRITE })),
        withDelay(80, withTiming(0.7, { duration: 280, easing: WRITE })),
        withDelay(60, withTiming(0.8, { duration: 210, easing: WRITE })),
        withDelay(60, withTiming(0.89, { duration: 230, easing: WRITE })),
        withDelay(80, withTiming(1, { duration: 360, easing: WRITE })),
      ),
    );

    const t = setTimeout(() => {
      written.current = true;
      leave();
    }, WRITE_MS + 40);
    return () => clearTimeout(t);
  }, [brush, progress]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
  }));

  const clipStyle = useAnimatedStyle(() => ({
    width: Math.max(0, artW * progress.value),
  }));

  const brushStyle = useAnimatedStyle(() => {
    const p = progress.value;
    let y = 0;
    if (p < 0.12) y = -10;
    else if (p < 0.25) y = 2;
    else if (p < 0.4) y = 16;
    else if (p < 0.52) y = -8;
    else if (p < 0.57) y = 0;
    else if (p < 0.7) y = 20;
    else if (p < 0.8) y = 4;
    else if (p < 0.89) y = 8;
    else y = 4 + Math.sin(p * 18) * 12;

    const show = p > 0.01 && p < 0.995 ? brush.value : 0;
    return {
      opacity: show,
      transform: [
        { translateX: artW * p - 5 },
        { translateY: artH * 0.42 + y },
        { rotate: `${-18 + y * 0.8}deg` },
        { scale: 0.85 + show * 0.2 },
      ],
    };
  });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.stage, veilStyle]}>
        <View style={{ width: artW, height: artH }}>
          <Animated.View style={[styles.clip, clipStyle]}>
            <Image
              source={ART}
              resizeMode="contain"
              style={{ width: artW, height: artH }}
            />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.tip, brushStyle]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  clip: {
    height: "100%",
    overflow: "hidden",
  },
  tip: {
    position: "absolute",
    width: 11,
    height: 18,
    borderRadius: 8,
    backgroundColor: "#111",
    left: 0,
    top: 0,
  },
});
