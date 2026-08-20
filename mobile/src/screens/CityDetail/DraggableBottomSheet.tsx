import React, { useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "./styles";
import { WaterRippleBackground } from "../../components/WaterRippleBackground";

const SNAP_FRACTIONS = [0.38, 0.52, 0.78] as const;
/** 全屏吸附时距顶部的留白（逻辑像素） */
const FULL_TOP_GAP = 8;
/** 约 1mm 的触控/判定增量（逻辑像素） */
const DRAG_MM = 4;
const PAN_ACTIVE_OFFSET_Y = 8 + DRAG_MM;
const SNAP_VELOCITY_DELTA = 8 + DRAG_MM;

type Props = {
  bottomInset: number;
  /** 仅给内部列表留出底栏高度；抽屉本身铺到屏幕底，底栏独立浮在内容上 */
  bottomOffset?: number;
  /** page：与「我的」同款浅灰底，胶囊浮在页面上；card：城市详情白底 */
  surface?: "card" | "page";
  /** 探索页：下拉收起底栏气泡，上拉弹出 */
  tabBarReveal?: SharedValue<number> | null;
  /** 全屏吸附时抽屉顶部距屏幕顶部的留白（逻辑像素）。
   *  默认 insets.top + FULL_TOP_GAP；有页面顶部浮层（返回键/标题）时传入该浮层高度，
   *  保证抽屉顶到最高时也不会盖住浮层、拖动小横条不会被浮层遮挡。 */
  topOffset?: number;
  children: React.ReactNode;
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

function revealFromHeight(height: number, min: number, shown: number): number {
  "worklet";
  const span = Math.max(1, shown - min);
  const t = (height - min) / span;
  return Math.max(0, Math.min(1, t));
}

export function DraggableBottomSheet({
  bottomInset,
  bottomOffset = 0,
  surface = "card",
  tabBarReveal,
  topOffset,
  children,
  footer,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const snapHeights = useMemo(() => {
    const clearance = topOffset ?? insets.top + FULL_TOP_GAP;
    const maxHeight = Math.max(
      120,
      Math.round(screenH - clearance),
    );
    const fractional = SNAP_FRACTIONS.map((f) =>
      Math.min(Math.round(screenH * f), maxHeight),
    );
    return [...fractional, maxHeight]
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .sort((a, b) => a - b);
  }, [screenH, insets.top, topOffset]);

  const sheetHeight = useSharedValue(snapHeights[1] ?? snapHeights[0] ?? 0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    sheetHeight.value = snapHeights[1] ?? snapHeights[0] ?? 0;
    if (tabBarReveal) tabBarReveal.value = 1;
  }, [snapHeights, sheetHeight, tabBarReveal]);

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
          const shown = snapHeights[1] ?? min;
          const next = Math.max(min, Math.min(max, dragStart.value - e.translationY));
          sheetHeight.value = next;
          if (tabBarReveal) {
            tabBarReveal.value = revealFromHeight(next, min, shown);
          }
        })
        .onEnd((e) => {
          const min = snapHeights[0];
          const target = nearestSnap(sheetHeight.value, snapHeights, e.velocityY);
          sheetHeight.value = withSpring(target, { damping: 22, stiffness: 220 });
          if (tabBarReveal) {
            tabBarReveal.value = withSpring(target <= min + 2 ? 0 : 1, {
              damping: 22,
              stiffness: 220,
            });
          }
        }),
    [dragStart, sheetHeight, snapHeights, tabBarReveal],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  return (
    <View style={styles.bottomSheetRoot} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.bottomSheet,
          surface === "page" ? styles.bottomSheetPage : null,
          sheetStyle,
          { paddingBottom: bottomInset },
        ]}
      >
        {surface === "page" ? (
          <View style={styles.sheetRippleLayer} pointerEvents="none">
            <WaterRippleBackground />
          </View>
        ) : null}
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
    </View>
  );
}
