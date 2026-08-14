import React, { useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "./styles";

const SNAP_FRACTIONS = [0.34, 0.5, 0.78] as const;
/** 全屏吸附时距顶部的留白（逻辑像素） */
const FULL_TOP_GAP = 8;
/** 约 1mm 的触控/判定增量（逻辑像素） */
const DRAG_MM = 4;
const PAN_ACTIVE_OFFSET_Y = 8 + DRAG_MM;
const SNAP_VELOCITY_DELTA = 8 + DRAG_MM;

type Props = {
  bottomInset: number;
  children: React.ReactNode;
  /** 固定在抽屉最底部（如协作者横条，可独立收起） */
  footer?: React.ReactNode;
};

function nearestSnap(current: number, snaps: number[], velocityY: number): number {
  "worklet";
  if (velocityY < -700) {
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i] > current + SNAP_VELOCITY_DELTA) return snaps[i];
    }
    return snaps[snaps.length - 1];
  }
  if (velocityY > 700) {
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i] < current - SNAP_VELOCITY_DELTA) return snaps[i];
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

export function DraggableBottomSheet({
  bottomInset,
  children,
  footer,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const snapHeights = useMemo(() => {
    const maxHeight = Math.round(screenH - insets.top - FULL_TOP_GAP);
    const fractional = SNAP_FRACTIONS.map((f) =>
      Math.min(Math.round(screenH * f), maxHeight),
    );
    return [...fractional, maxHeight]
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .sort((a, b) => a - b);
  }, [screenH, insets.top]);

  const sheetHeight = useSharedValue(snapHeights[1] ?? snapHeights[0] ?? 0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    sheetHeight.value = snapHeights[1] ?? snapHeights[0] ?? 0;
  }, [snapHeights, sheetHeight]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-PAN_ACTIVE_OFFSET_Y, PAN_ACTIVE_OFFSET_Y])
        .hitSlop({ top: 12, bottom: 12, left: 0, right: 0 })
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
          <View
            style={styles.sheetDragZone}
            hitSlop={{ top: DRAG_MM, bottom: DRAG_MM, left: 0, right: 0 }}
          >
            <View style={styles.sheetHandle} />
          </View>
        </GestureDetector>
        <View style={styles.sheetBody}>{children}</View>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </Animated.View>
    </GestureHandlerRootView>
  );
}
