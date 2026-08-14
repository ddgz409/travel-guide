import React, { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme";

type Props = {
  checked: boolean;
  busy?: boolean;
  onPress: () => void;
  /** 四列底栏时使用更短文案 */
  compact?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 打卡 / 取消打卡：果冻弹性 + 红色取消态 */
export function CheckInButton({ checked, busy, onPress, compact }: Props) {
  const scale = useSharedValue(1);
  const on = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: 180 });
  }, [checked, on]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      on.value,
      [0, 1],
      [colors.brand, "#E53935"],
    ),
    borderColor: interpolateColor(on.value, [0, 1], [colors.brand, "#E53935"]),
  }));

  function bounce() {
    scale.value = withSequence(
      withTiming(1.07, { duration: 95 }),
      withSpring(1, { damping: 14, stiffness: 480, mass: 0.32 }),
    );
  }

  return (
    <AnimatedPressable
      disabled={busy}
      onPress={() => {
        bounce();
        onPress();
      }}
      style={[styles.btn, animStyle, busy && { opacity: 0.6 }]}
    >
      <Animated.Text style={[styles.text, compact && styles.textCompact]}>
        {checked ? (compact ? "已打卡" : "取消打卡") : "打卡"}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    borderRadius: 34,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 14, fontWeight: "800", color: "#fff" },
  textCompact: { fontSize: 12 },
});
