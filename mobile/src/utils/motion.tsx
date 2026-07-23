import React, { useEffect } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

export const enterUp = (delay = 0, distance = 18) =>
  FadeInUp.delay(delay)
    .duration(520)
    .easing(EASE_OUT)
    .withInitialValues({ opacity: 0, transform: [{ translateY: distance }] });

export const enterDown = (delay = 0) =>
  FadeInDown.delay(delay).duration(480).easing(EASE_OUT);

export const enterFade = (delay = 0) =>
  FadeIn.delay(delay).duration(420).easing(EASE_OUT);

export const exitFade = FadeOut.duration(180);

type PressScaleProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
};

/** 轻按缩放，手感更接近原生 */
export function PressScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  scaleTo = 0.97,
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

type FadeSlideProps = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export function FadeSlideIn({ children, delay = 0, style }: FadeSlideProps) {
  return (
    <Animated.View entering={enterUp(delay)} style={style}>
      {children}
    </Animated.View>
  );
}

/** 内容切换时淡出旧块、淡入新块（路线方案 / 日期切换） */
export function FadeSwitch({
  switchKey,
  children,
  style,
  durationIn = 380,
  durationOut = 220,
}: {
  switchKey: string | number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  durationIn?: number;
  durationOut?: number;
}) {
  return (
    <Animated.View
      key={String(switchKey)}
      entering={FadeIn.duration(durationIn).easing(EASE_OUT)}
      exiting={FadeOut.duration(durationOut).easing(EASE_OUT)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Hero 交叉淡入：当前图 opacity 1，其它 0，切换时 timing */
export function CrossfadeImage({
  active,
  children,
  style,
}: {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 700,
      easing: EASE_OUT,
    });
  }, [active, progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1.06, 1]) },
    ],
  }));

  return (
    <Animated.View style={[style, animStyle]} pointerEvents={active ? "auto" : "none"}>
      {children}
    </Animated.View>
  );
}

export function AnimatedDot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 16 : 6);
  const opacity = useSharedValue(active ? 1 : 0.35);

  useEffect(() => {
    w.value = withSpring(active ? 16 : 6, { damping: 16, stiffness: 220 });
    opacity.value = withTiming(active ? 1 : 0.35, { duration: 280 });
  }, [active, opacity, w]);

  const style = useAnimatedStyle(() => ({
    width: w.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          height: 6,
          borderRadius: 3,
          backgroundColor: "#ff6d00",
          marginRight: 6,
        },
        style,
      ]}
    />
  );
}
