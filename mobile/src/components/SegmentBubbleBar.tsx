import React, { useEffect, useRef } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, cardShadow } from "../theme";

export type SegmentOption = {
  id: string;
  label: string;
};

type Props = {
  options: SegmentOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

type ItemLayout = { x: number; y: number; width: number; height: number };

/** 白胶囊 + 浅蓝气泡指示（同底部「计划 / 探索 / 我的」） */
export function SegmentBubbleBar({
  options,
  selectedId,
  onSelect,
  disabled = false,
}: Props) {
  const layouts = useRef<Record<string, ItemLayout>>({});

  const blobX = useSharedValue(0);
  const blobY = useSharedValue(0);
  const blobW = useSharedValue(0);
  const blobH = useSharedValue(40);
  const squash = useSharedValue(1);
  const stretch = useSharedValue(1);
  const ready = useSharedValue(0);

  function slideTo(next: ItemLayout) {
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
    const L = layouts.current[selectedId];
    if (!L || ready.value === 0) return;
    slideTo(L);
  }, [selectedId]);

  function onItemLayout(id: string, e: LayoutChangeEvent) {
    const { x, y, width, height } = e.nativeEvent.layout;
    const next = { x, y, width, height: height || 40 };
    layouts.current[id] = next;
    if (id !== selectedId) return;
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
    <View style={styles.shell}>
      <Animated.View pointerEvents="none" style={[styles.blob, blobStyle]} />
      {options.map((opt) => {
        const on = selectedId === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={styles.hit}
            disabled={disabled}
            onLayout={(e) => onItemLayout(opt.id, e)}
            onPress={() => onSelect(opt.id)}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
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
  hit: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    zIndex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  labelOn: {
    color: colors.brandHot,
  },
});
