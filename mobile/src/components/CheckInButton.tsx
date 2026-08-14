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
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 打卡 / 取消打卡：果冻弹性 + 红色取消态 */
export function CheckInButton({ checked, busy, onPress }: Props) {
  const scale = useSharedValue(1);
  const on = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: 220 });
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
      withSpring(1.14, { damping: 5, stiffness: 420, mass: 0.45 }),
      withSpring(0.9, { damping: 7, stiffness: 380, mass: 0.45 }),
      withSpring(1, { damping: 10, stiffness: 280, mass: 0.5 }),
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
      <Animated.Text style={styles.text}>
        {checked ? "取消打卡" : "打卡"}
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
});
