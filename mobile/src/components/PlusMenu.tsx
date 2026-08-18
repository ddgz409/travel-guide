/** + 按钮弹出菜单：两颗淡蓝肥皂泡球体，以 + 号为圆心，
 *  顺时针自下而上像果冻般滑出。球体皮肤用预渲染的 bubble.png
 *  （边缘辉光 / 内发光 / 焦散 / 高光已烘焙），叠加运行时 BlurView
 *  形成通透玻璃质感。打开时 + 旋转 45° 成 ×，轻蒙层点按即关闭。 */

import React, { useEffect } from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, cardShadow } from "../theme";

/** 预渲染肥皂泡素材：半透明低饱和淡蓝，中心通透 */
const BUBBLE_IMG = require("../../assets/bubble.png") as ImageSourcePropType;

type Props = {
  visible: boolean;
  onClose: () => void;
};

/* -- 布局参数（可调）-------------------------- */
const D = 132; // 球体直径
const R = 170; // 球心到 + 圆心的距离
/** 顺时针角度：0=正上方(12点)，90=右，180=正下方，270=左。
 *  起点 180(下)，顺时针扫向左、再向上，故两球落在左上象限。 */
const START_PHI = 180;
const QUICK_PHI = 285; // 快速模式：偏左、略上
const AI_PHI = 340; // AI 智能生成行程：偏上、略左
const AI_DELAY = 120; // AI 球比快速球晚出场，形成“从下到上”的依次滑出
const EXIT_MS = 220; // 退场动画时长后真正关闭
const HALO = 1.16; // 让辉光光晕溢出球体边缘一点

const SPRING_IN = { damping: 9, stiffness: 260, mass: 0.7, overshootClipping: 0 };
const SPRING_OUT = { damping: 15, stiffness: 320, mass: 0.5 };
const ROT_SPRING = { damping: 14, stiffness: 240, mass: 0.6 };

type Item = {
  id: "quick" | "custom";
  icon: string;
  title: string;
  phi: number;
};

const ITEMS: Item[] = [
  { id: "custom", icon: "🤖", title: "AI智能\n生成行程", phi: AI_PHI },
  { id: "quick", icon: "⚡", title: "快速模式", phi: QUICK_PHI },
];

const deg2rad = (d: number) => (d * Math.PI) / 180;

type BubbleProps = {
  item: Item;
  cx: number;
  cy: number;
  progress: SharedValue<number>;
  onPress: () => void;
};

function Bubble({ item, cx, cy, progress, onPress }: BubbleProps) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(progress.value, 0);
    const phi = START_PHI + (item.phi - START_PHI) * p; // 顺时针推进角度
    const r = R * p; // 半径从 0 张开 -> 从 + 圆心滑出
    const rad = deg2rad(phi);
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);
    return {
      transform: [
        { translateX: x - D / 2 },
        { translateY: y - D / 2 },
        { scale: p },
      ],
      opacity: Math.min(p * 2.2, 1),
    };
  });

  return (
    <Animated.View style={[styles.bubble, style]} pointerEvents="box-none">
      <Pressable style={styles.bubbleHit} onPress={onPress} hitSlop={0}>
        <View style={styles.bubbleSkin} pointerEvents="none">
          <Image
            source={BUBBLE_IMG}
            style={styles.bubbleImg}
            resizeMode="contain"
          />
        </View>
        <View style={styles.bubbleText} pointerEvents="none">
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.title}>{item.title}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function PlusMenu({ visible, onClose }: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // + 号圆心（对齐 CustomTabBar 的 fab：右下角 52 圆钮）
  const cx = screenW - 42; // screenW - 水平 padding16 - 半径26
  const cy = screenH - Math.max(insets.bottom, 12) - 26; // 距底 padding + 半高

  // 每颗球一个 0->1 的进度，驱动半径/角度/缩放/不透明
  const pQuick = useSharedValue(0);
  const pAI = useSharedValue(0);
  const plusRot = useSharedValue(0); // 0=＋，45=×
  const scrim = useSharedValue(0);
  const closing = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      // 关闭后复位，供下次打开
      pQuick.value = 0;
      pAI.value = 0;
      plusRot.value = 0;
      scrim.value = 0;
      closing.value = 0;
      return;
    }
    // 入场：快速球先出场，AI 球顺时针继续向上晚一点出场 -> 果冻滑出
    pQuick.value = withSpring(1, SPRING_IN);
    pAI.value = withDelay(AI_DELAY, withSpring(1, SPRING_IN));
    plusRot.value = withSpring(45, ROT_SPRING);
    scrim.value = withTiming(1, { duration: 160 });
  }, [visible]);

  /** 取消关闭（× / 蒙层）：退场动画后真正 unmount */
  function handleClose() {
    if (closing.value === 1) return;
    closing.value = 1;
    pQuick.value = withSpring(0, SPRING_OUT);
    pAI.value = withSpring(0, SPRING_OUT);
    plusRot.value = withSpring(0, ROT_SPRING);
    scrim.value = withTiming(0, { duration: 180 });
    setTimeout(onClose, EXIT_MS);
  }

  /** 选中某颗球：轻弹反馈后收起并跳转 */
  function go(id: "quick" | "custom") {
    if (closing.value === 1) return;
    closing.value = 1;
    const tapped = id === "custom" ? pAI : pQuick;
    const other = id === "custom" ? pQuick : pAI;
    tapped.value = withSequence(
      withTiming(1.12, { duration: 90 }),
      withTiming(0, { duration: 130 }),
    );
    other.value = withSpring(0, SPRING_OUT);
    plusRot.value = withSpring(0, ROT_SPRING);
    scrim.value = withTiming(0, { duration: 160 });
    setTimeout(() => {
      onClose();
      if (id === "custom") {
        (navigation as any).navigate("Generate", { mode: "custom" });
      } else {
        (navigation as any).navigate("Generate", { mode: "quick" });
      }
    }, 200);
  }

  const xStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx - 26 },
      { translateY: cy - 26 },
      { rotate: `${plusRot.value}deg` },
    ],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* 轻蒙层：点按取消 */}
        <Pressable style={styles.scrimHit} onPress={handleClose}>
          <Animated.View style={[styles.scrimTint, scrimStyle]} />
        </Pressable>

        {/* 两颗肥皂泡 */}
        {ITEMS.map((item) => (
          <Bubble
            key={item.id}
            item={item}
            cx={cx}
            cy={cy}
            progress={item.id === "custom" ? pAI : pQuick}
            onPress={() => go(item.id)}
          />
        ))}

        {/* + 转成 × 的关闭钮，盖在原 fab 位置 */}
        <Animated.View style={[styles.fabWrap, xStyle]} pointerEvents="box-none">
          <Pressable style={styles.fab} onPress={handleClose}>
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrimHit: {
    ...StyleSheet.absoluteFill,
  },
  scrimTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,18,28,0.16)",
  },
  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    width: D,
    height: D,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleHit: {
    width: D,
    height: D,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleSkin: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleImg: {
    width: D * HALO,
    height: D * HALO,
  },
  bubbleText: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 28,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2b4a63",
    textAlign: "center",
    lineHeight: 18,
  },
  fabWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 52,
    height: 52,
  },
  fab: {
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
