import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { cardShadow, colors } from "../../theme";

const SPRING = { damping: 24, stiffness: 220 };

type Props = {
  children: React.ReactNode;
  initialRatio?: number;
  minRatio?: number;
  maxRatio?: number;
};

export function TripDetailSheet({
  children,
  initialRatio = 0.42,
  minRatio = 0.12,
  maxRatio = 0.72,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const minTop = screenH * minRatio;
  const maxTop = screenH * maxRatio;
  const defaultTop = screenH * initialRatio;

  const sheetTop = useSharedValue(defaultTop);
  const dragStart = useSharedValue(defaultTop);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragStart.value = sheetTop.value;
        })
        .onUpdate((e) => {
          const next = dragStart.value + e.translationY;
          sheetTop.value = Math.max(minTop, Math.min(maxTop, next));
        })
        .onEnd((e) => {
          const mid = (minTop + maxTop) / 2;
          const target =
            e.velocityY > 650
              ? maxTop
              : e.velocityY < -650
                ? minTop
                : sheetTop.value > mid
                  ? maxTop
                  : minTop;
          sheetTop.value = withSpring(target, SPRING);
        }),
    [maxTop, minTop, dragStart, sheetTop],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetTop.value,
  }));

  return (
    <Animated.View style={[styles.sheet, sheetStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>
      </GestureDetector>
      <View style={styles.sheetBody}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34, borderCurve: "continuous",
    ...cardShadow,
    shadowOffset: { width: 0, height: -2 },
    overflow: "hidden",
  },
  grabberWrap: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: "center",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 12, borderCurve: "continuous",
    backgroundColor: colors.line,
  },
  sheetBody: {
    flex: 1,
  },
});
