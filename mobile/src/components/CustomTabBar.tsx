/** 大白胶囊 + 一颗浅蓝小气泡跟着当前页滑动；右侧加号 */

import React, { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, cardShadow } from "../theme";
import { PlusMenu } from "./PlusMenu";
import type { MainTab } from "../navigation/MainTabContext";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
};

const TABS: { id: MainTab; label: string }[] = [
  { id: "Trips", label: "计划" },
  { id: "Explore", label: "探索" },
  { id: "Me", label: "我的" },
];

type TabLayout = { x: number; y: number; width: number; height: number };

/** 底栏主体高度（不含安全区），给页面内容/悬浮按钮留空 */
export const TAB_BAR_BODY = 72;

export function CustomTabBar({ activeTab, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const [plusOpen, setPlusOpen] = useState(false);
  const layouts = useRef<Partial<Record<MainTab, TabLayout>>>({});

  const blobX = useSharedValue(0);
  const blobY = useSharedValue(0);
  const blobW = useSharedValue(0);
  const blobH = useSharedValue(40);
  const squash = useSharedValue(1);
  const stretch = useSharedValue(1);
  const ready = useSharedValue(0);

  function slideTo(next: TabLayout) {
    const dist = Math.abs(next.x - blobX.value);
    const extra = Math.min(0.42, dist / 140);
    stretch.value = withSequence(
      withTiming(1 + extra, { duration: 110 }),
      withSpring(1, { damping: 12, stiffness: 240, mass: 0.45 }),
    );
    squash.value = withSequence(
      withTiming(0.72, { duration: 90 }),
      withSpring(1, { damping: 9, stiffness: 280, mass: 0.4 }),
    );
    blobX.value = withSpring(next.x, { damping: 16, stiffness: 190, mass: 0.55 });
    blobY.value = withSpring(next.y, { damping: 16, stiffness: 190, mass: 0.55 });
    blobW.value = withSpring(next.width, { damping: 16, stiffness: 190, mass: 0.55 });
    blobH.value = withSpring(next.height, { damping: 16, stiffness: 190, mass: 0.55 });
  }

  useEffect(() => {
    const L = layouts.current[activeTab];
    if (!L || ready.value === 0) return;
    slideTo(L);
  }, [activeTab]);

  function onTabLayout(id: MainTab, e: LayoutChangeEvent) {
    const { x, y, width, height } = e.nativeEvent.layout;
    const next = { x, y, width, height: height || 40 };
    layouts.current[id] = next;
    if (id !== activeTab) return;
    if (ready.value === 0) {
      blobX.value = x;
      blobY.value = y;
      blobW.value = width;
      blobH.value = next.height;
      ready.value = 1;
      return;
    }
    slideTo(next);
  }

  const blobStyle = useAnimatedStyle(() => ({
    opacity: ready.value,
    width: blobW.value,
    height: blobH.value,
    transform: [
      { translateX: blobX.value },
      { translateY: blobY.value },
      { scaleX: stretch.value },
      { scaleY: squash.value },
    ],
  }));

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View style={styles.shell}>
          <Animated.View pointerEvents="none" style={[styles.blob, blobStyle]} />
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                style={styles.tabHit}
                onLayout={(e) => onTabLayout(t.id, e)}
                onPress={() => onTabChange(t.id)}
              >
                <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={styles.fab} onPress={() => setPlusOpen(true)}>
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </Pressable>
      </View>
      <PlusMenu visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "transparent",
    gap: 10,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 5,
    backgroundColor: "#fff",
    borderRadius: 30,
    borderCurve: "continuous",
    overflow: "visible",
    ...cardShadow,
  },
  blob: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: "#E8F4FC",
    borderRadius: 22,
    borderCurve: "continuous",
  },
  tabHit: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    zIndex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  labelOn: {
    color: colors.brandHot,
  },
  fab: {
    marginLeft: "auto",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  plusH: {
    position: "absolute",
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  plusV: {
    position: "absolute",
    width: 2.5,
    height: 18,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
});
