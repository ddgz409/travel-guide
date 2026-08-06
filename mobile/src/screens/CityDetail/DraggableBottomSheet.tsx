import React, { useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { styles } from "./styles";

const SNAP_FRACTIONS = [0.34, 0.5, 0.78] as const;

type Props = {
  bottomInset: number;
  children: React.ReactNode;
};

function nearestSnap(current: number, snaps: number[], velocityY: number): number {
  "worklet";
  if (velocityY < -700) {
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i] > current + 8) return snaps[i];
    }
    return snaps[snaps.length - 1];
  }
  if (velocityY > 700) {
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i] < current - 8) return snaps[i];
    }
    return snaps[0];
  }
  let best = snaps[0];
  let min = Math.abs(current - snaps[0]);
  for (let i = 1; i < snaps.length; i++) {
    const d = Math.abs(current - snaps[i]);
    if (d < min) {
      min = d;
      best = snaps[i];
    }
  }
  return best;
}

export function DraggableBottomSheet({ bottomInset, children }: Props) {
  const { height: screenH } = useWindowDimensions();
  const snapHeights = useMemo(
    () => SNAP_FRACTIONS.map((f) => Math.round(screenH * f)),
    [screenH],
  );

  const sheetHeight = useSharedValue(snapHeights[1]);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    sheetHeight.value = snapHeights[1];
  }, [snapHeights, sheetHeight]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStart.value = sheetHeight.value;
        })
        .onUpdate((e) => {
          const min = snapHeights[0];
          const max = snapHeights[snapHeights.length - 1];
          const next = dragStart.value - e.translationY;
          sheetHeight.value = Math.max(min, Math.min(max, next));
        })
        .onEnd((e) => {
          const target = nearestSnap(sheetHeight.value, snapHeights, e.velocityY);
          sheetHeight.value = withSpring(target, { damping: 22, stiffness: 220 });
        }),
    [dragStart, sheetHeight, snapHeights],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  return (
    <GestureHandlerRootView style={styles.bottomSheetRoot}>
      <Animated.View
        style={[styles.bottomSheet, sheetStyle, { paddingBottom: bottomInset }]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.sheetDragZone}>
            <View style={styles.sheetHandle} />
          </View>
        </GestureDetector>
        <View style={styles.sheetBody}>{children}</View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}
