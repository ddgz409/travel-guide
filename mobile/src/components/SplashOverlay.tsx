import React, { useEffect, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HOLD_MS = 2400;
const FADE_MS = 480;
/** 与 splash-screen2 天空色一致，cover 裁切瞬间若露边也不显白 */
export const SPLASH_BG = "#4D90BB";
const ART = require("../../assets/splash-screen2.png");

type Props = {
  ready: boolean;
  onFinished: () => void;
};

export function SplashOverlay({ ready, onFinished }: Props) {
  const shown = useSharedValue(0);
  const veil = useSharedValue(1);
  const appReady = useRef(ready);
  const held = useRef(false);
  const leaving = useRef(false);

  const leave = () => {
    if (leaving.current || !held.current || !appReady.current) return;
    leaving.current = true;
    veil.value = withTiming(0, { duration: FADE_MS });
    setTimeout(() => onFinished(), FADE_MS);
  };

  useEffect(() => {
    appReady.current = ready;
    leave();
  }, [ready]);

  useEffect(() => {
    shown.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    const t = setTimeout(() => {
      held.current = true;
      leave();
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [shown]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
  }));

  const artStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.stage, veilStyle]}>
        <Animated.View style={[styles.artWrap, artStyle]}>
          <Image source={ART} resizeMode="cover" style={styles.art} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    overflow: "hidden",
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    overflow: "hidden",
  },
  artWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
